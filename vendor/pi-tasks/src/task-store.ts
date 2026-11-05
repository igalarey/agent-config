/**
 * task-store.ts — File-backed task store with CRUD, dependency management, and file locking.
 *
 * Session-scoped (default): in-memory Map — no disk I/O.
 * Shared (PI_TASK_LIST_ID set): ~/.pi/tasks/<listId>.json with file locking.
 */

import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { sortTasks, type TaskSortOrder } from "./task-sort.js";
import type { Task, TaskStatus, TaskStoreData } from "./types.js";

const TASKS_DIR = join(homedir(), ".pi", "tasks");
const LOCK_RETRY_MS = 50;
const LOCK_MAX_RETRIES = 100; // 5s max

function checkPath(file: string, createParents = false): void {
  const parent = dirname(resolve(file));
  const ancestors: string[] = [];
  for (let path = parent; ; path = dirname(path)) {
    ancestors.unshift(path);
    if (path === dirname(path)) break;
  }
  for (const path of ancestors) {
    let stat;
    try { stat = lstatSync(path); } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      if (!createParents) return;
      try { mkdirSync(path, { mode: 0o700 }); } catch (error: any) {
        if (error.code !== "EEXIST") throw error;
      }
      stat = lstatSync(path);
    }
    const uid = process.getuid?.();
    // Root-owned sticky temp directories prevent other users from replacing our entries.
    const stickyRoot = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
    if (!stat.isDirectory() || (uid !== undefined && stat.uid !== uid && stat.uid !== 0) ||
        ((stat.mode & 0o022) !== 0 && !stickyRoot)) throw new Error(`Unsafe task directory: ${path}`);
  }
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())) throw new Error(`Unsafe task file: ${file}`);
  } catch (error: any) { if (error.code !== "ENOENT") throw error; }
}

export function writeSafeTaskFile(file: string, contents: string): void {
  checkPath(file, true);
  const tmpPath = file + `.${randomUUID()}.tmp`;
  const fd = openSync(tmpPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    try {
      writeFileSync(fd, contents);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    checkPath(file);
    renameSync(tmpPath, file);
  } finally {
    try { unlinkSync(tmpPath); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
  }
}

export function readSafeTaskFile(file: string): string {
  checkPath(file);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())) throw new Error(`Unsafe task file: ${file}`);
    return readFileSync(fd, "utf-8");
  } finally { closeSync(fd); }
}

/**
 * Simple file-based locking. Returns the token written into the lock file, which
 * must be handed back to `releaseLock`.
 *
 * The token is `<pid>:<uuid>`: the PID prefix is what the staleness check below
 * parses, and the UUID suffix makes it unique so a holder can tell its own lock
 * from a successor's. Both halves matter — see `releaseLock`.
 */
function acquireLock(lockPath: string): string {
  checkPath(lockPath, true);
  const token = `${process.pid}:${randomUUID()}`;

  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      // O_EXCL: fail if file exists
      checkPath(lockPath);
      writeFileSync(lockPath, token, { flag: "wx", mode: 0o600 });
      return token;
    } catch (e: any) {
      if (e.code === "EEXIST") {
        // Check for stale lock (process no longer running)
        try {
          const pid = parseInt(readSafeTaskFile(lockPath), 10);
          // A lock naming a dead process is stale. So is one with no readable PID,
          // but only after a couple of polls: the file is created before the PID is
          // written to it, so a live acquirer can look unparseable for a moment —
          // one that crashed in that window looks that way forever.
          if (pid > 0 ? !isProcessRunning(pid) : i >= 2) {
            unlinkSync(lockPath);
            continue;
          }
        } catch { /* ignore read errors */ }
        // Wait and retry
        const start = Date.now();
        while (Date.now() - start < LOCK_RETRY_MS) { /* busy wait */ }
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to acquire lock: ${lockPath}`);
}

/**
 * Release a lock, but only if we still hold it. A lock can be reclaimed out from
 * under a live holder — `isProcessRunning` answers from the local process table,
 * so a session in another PID namespace (container, or a list shared over NFS)
 * can read our PID as dead. Without the token check we would then delete the
 * successor's lock and two sessions would write the file at once.
 */
function releaseLock(lockPath: string, token: string): void {
  try {
    if (readSafeTaskFile(lockPath) === token) unlinkSync(lockPath);
  } catch { /* ignore — already gone */ }
}

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Fill defaults for tasks persisted by older versions. Task files written
 * before the blocking feature have no `blockedBy`/`blocks`/`metadata`, so
 * consumers that read those fields unguarded (e.g. `task.blockedBy.length`)
 * would throw. Normalizing at the load boundary lets every consumer trust the
 * shape. Also guards against wrong types in hand-edited files.
 */
function normalizeTask(t: Task): Task {
  const now = Date.now();
  return {
    ...t,
    metadata: t.metadata && typeof t.metadata === "object" && !Array.isArray(t.metadata) ? t.metadata : {},
    blocks: Array.isArray(t.blocks) ? t.blocks : [],
    blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy : [],
    createdAt: typeof t.createdAt === "number" ? t.createdAt : now,
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : now,
  };
}

export class TaskStore {
  private filePath: string | undefined;
  private lockPath: string | undefined;

  // In-memory state (always kept in sync)
  private nextId = 1;
  private tasks = new Map<string, Task>();

  constructor(listIdOrPath?: string) {
    if (!listIdOrPath) return;
    const isAbsPath = isAbsolute(listIdOrPath);
    const filePath = isAbsPath ? listIdOrPath : join(TASKS_DIR, `${listIdOrPath}.json`);
    // Directory is created lazily on the first write (acquireLock/save both
    // mkdir it), so a session that never persists a task leaves no .pi/tasks/.
    this.filePath = filePath;
    this.lockPath = filePath + ".lock";
    this.load();
  }

  /**
   * Read store from disk (file-backed mode only).
   *
   * `normalizeTask` hardens each record; this hardens the envelope around them.
   * A truncated write, a bad merge or a hand edit can leave a file that parses
   * but has no `tasks` array or no usable `nextId`, and both used to corrupt the
   * store: the missing array threw mid-load and left it wiped, and the missing
   * counter produced the task ID "NaN", then IDs restarting at "0" and colliding
   * with live tasks. An invalid envelope or JSON fails closed before any mutation.
   */
  private load(): void {
    if (!this.filePath) return;
    checkPath(this.filePath);
    if (!existsSync(this.filePath)) return;
    const contents = readSafeTaskFile(this.filePath);
    try {
      const data: unknown = JSON.parse(contents);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid envelope");
      const { nextId, tasks } = data as Partial<TaskStoreData>;
      if (!Array.isArray(tasks)) throw new Error("Missing task array");

      // Build the replacement before touching the live state, so a bad record
      // can't leave the store half-loaded.
      const loaded = new Map<string, Task>();
      let maxId = 0;
      for (const t of tasks) {
        if (!t || typeof t !== "object" || typeof t.id !== "string") continue;
        loaded.set(t.id, normalizeTask(t));
        const numericId = Number(t.id);
        if (Number.isFinite(numericId) && numericId > maxId) maxId = numericId;
      }
      this.tasks = loaded;
      // Every future task ID comes from this counter, so it has to clear the IDs
      // already in use — whether the file omitted it or recorded a stale one.
      this.nextId = typeof nextId === "number" && Number.isInteger(nextId) && nextId > maxId ? nextId : maxId + 1;
    } catch {
      throw new Error(`Invalid task store: ${this.filePath}. Restore or repair the file before continuing.`);
    }
  }

  /** Write store to disk atomically (file-backed mode only). */
  private save(): void {
    if (!this.filePath) return;
    const data: TaskStoreData = {
      nextId: this.nextId,
      tasks: Array.from(this.tasks.values()),
    };
    writeSafeTaskFile(this.filePath, JSON.stringify(data, null, 2));
  }

  /** Execute a mutation with file locking (if file-backed). */
  private withLock<T>(fn: () => T): T {
    if (!this.lockPath) return fn();
    const token = acquireLock(this.lockPath);
    try {
      this.load(); // Re-read latest state
      const previousTasks = structuredClone(this.tasks);
      const previousNextId = this.nextId;
      try {
        const result = fn();
        this.save();
        return result;
      } catch (error) {
        this.tasks = previousTasks;
        this.nextId = previousNextId;
        throw error;
      }
    } finally {
      releaseLock(this.lockPath, token);
    }
  }

  create(subject: string, description: string, activeForm?: string, metadata?: Record<string, any>): Task {
    return this.withLock(() => {
      const now = Date.now();
      const task: Task = {
        id: String(this.nextId++),
        subject,
        description,
        status: "pending",
        activeForm,
        owner: undefined,
        metadata: metadata ?? {},
        blocks: [],
        blockedBy: [],
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.set(task.id, task);
      return task;
    });
  }

  get(id: string): Task | undefined {
    if (this.filePath) this.load();
    return this.tasks.get(id);
  }

  /** List all tasks, sorted by the given order (defaults to ID ascending). */
  list(sortOrder: TaskSortOrder = "id"): Task[] {
    if (this.filePath) this.load();
    return sortTasks(Array.from(this.tasks.values()), sortOrder);
  }

  update(id: string, fields: {
    status?: TaskStatus | "deleted";
    subject?: string;
    description?: string;
    activeForm?: string;
    owner?: string;
    metadata?: Record<string, any>;
    addBlocks?: string[];
    addBlockedBy?: string[];
  }): { task: Task | undefined; changedFields: string[]; warnings: string[] } {
    return this.withLock(() => {
      const task = this.tasks.get(id);
      if (!task) return { task: undefined, changedFields: [], warnings: [] };

      const changedFields: string[] = [];
      const warnings: string[] = [];

      // Handle deletion
      if (fields.status === "deleted") {
        this.tasks.delete(id);
        // Clean up dependency edges pointing to this task
        for (const t of this.tasks.values()) {
          t.blocks = t.blocks.filter(bid => bid !== id);
          t.blockedBy = t.blockedBy.filter(bid => bid !== id);
        }
        return { task: undefined, changedFields: ["deleted"], warnings: [] };
      }

      if (fields.status !== undefined) {
        task.status = fields.status;
        changedFields.push("status");
      }
      if (fields.subject !== undefined) {
        task.subject = fields.subject;
        changedFields.push("subject");
      }
      if (fields.description !== undefined) {
        task.description = fields.description;
        changedFields.push("description");
      }
      if (fields.activeForm !== undefined) {
        task.activeForm = fields.activeForm;
        changedFields.push("activeForm");
      }
      if (fields.owner !== undefined) {
        task.owner = fields.owner;
        changedFields.push("owner");
      }

      // Metadata: shallow merge, null deletes keys
      if (fields.metadata !== undefined) {
        for (const [key, value] of Object.entries(fields.metadata)) {
          if (value === null) {
            delete task.metadata[key];
          } else {
            task.metadata[key] = value;
          }
        }
        changedFields.push("metadata");
      }

      // Bidirectional dependency edges
      if (fields.addBlocks && fields.addBlocks.length > 0) {
        for (const targetId of fields.addBlocks) {
          if (!task.blocks.includes(targetId)) {
            task.blocks.push(targetId);
          }
          const target = this.tasks.get(targetId);
          if (target && !target.blockedBy.includes(id)) {
            target.blockedBy.push(id);
            target.updatedAt = Date.now();
          }
          // Warnings for problematic edges
          if (targetId === id) {
            warnings.push(`#${id} blocks itself`);
          } else if (!target) {
            warnings.push(`#${targetId} does not exist`);
          } else if (target.blocks.includes(id)) {
            warnings.push(`cycle: #${id} and #${targetId} block each other`);
          }
        }
        changedFields.push("blocks");
      }

      if (fields.addBlockedBy && fields.addBlockedBy.length > 0) {
        for (const targetId of fields.addBlockedBy) {
          if (!task.blockedBy.includes(targetId)) {
            task.blockedBy.push(targetId);
          }
          const target = this.tasks.get(targetId);
          if (target && !target.blocks.includes(id)) {
            target.blocks.push(id);
            target.updatedAt = Date.now();
          }
          // Warnings for problematic edges
          if (targetId === id) {
            warnings.push(`#${id} blocks itself`);
          } else if (!target) {
            warnings.push(`#${targetId} does not exist`);
          } else if (task.blocks.includes(targetId)) {
            warnings.push(`cycle: #${id} and #${targetId} block each other`);
          }
        }
        changedFields.push("blockedBy");
      }

      task.updatedAt = Date.now();
      return { task, changedFields, warnings };
    });
  }

  /** Delete a task by ID. Returns true if deleted. */
  delete(id: string): boolean {
    return this.withLock(() => {
      if (!this.tasks.has(id)) return false;
      this.tasks.delete(id);
      // Clean up dependency edges
      for (const t of this.tasks.values()) {
        t.blocks = t.blocks.filter(bid => bid !== id);
        t.blockedBy = t.blockedBy.filter(bid => bid !== id);
      }
      return true;
    });
  }

  /** Remove all tasks. */
  clearAll(): number {
    return this.withLock(() => {
      const count = this.tasks.size;
      this.tasks.clear();
      return count;
    });
  }

  /** Capture full store state — used to carry tasks into a forked session. */
  snapshot(): TaskStoreData {
    if (this.filePath) this.load();
    return { nextId: this.nextId, tasks: Array.from(this.tasks.values()) };
  }

  /** Seed an empty store from a snapshot. No-op if the store already has tasks,
   *  so re-pointing to an already-seeded fork file never duplicates. */
  seed(data: TaskStoreData): void {
    if (this.tasks.size > 0) return;
    this.withLock(() => {
      this.nextId = data.nextId;
      this.tasks.clear();
      for (const t of data.tasks) this.tasks.set(t.id, t);
    });
  }

  /** Delete the backing file (if file-backed and empty). */
  deleteFileIfEmpty(): boolean {
    if (!this.filePath || this.tasks.size > 0) return false;
    try { unlinkSync(this.filePath); } catch { /* ignore */ }
    return true;
  }

  /** Remove all completed tasks. */
  clearCompleted(): number {
    return this.withLock(() => {
      let count = 0;
      for (const [id, task] of this.tasks) {
        if (task.status === "completed") {
          this.tasks.delete(id);
          count++;
        }
      }
      // Clean up dependency edges for deleted tasks
      if (count > 0) {
        const validIds = new Set(this.tasks.keys());
        for (const t of this.tasks.values()) {
          t.blocks = t.blocks.filter(bid => validIds.has(bid));
          t.blockedBy = t.blockedBy.filter(bid => validIds.has(bid));
        }
      }
      return count;
    });
  }
}
