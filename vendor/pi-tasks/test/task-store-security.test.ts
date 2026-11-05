import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskStore } from "../src/task-store.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

let root: string;
let file: string;
beforeEach(() => { root = fs.mkdtempSync(join(tmpdir(), "tasks-security-")); file = join(root, "tasks.json"); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it("ignores a planted predictable temporary without touching its victim", () => {
  const victim = join(root, "victim");
  fs.writeFileSync(victim, "canary");
  fs.symlinkSync(victim, file + ".tmp");
  new TaskStore(file).create("safe", "fixture");
  expect(fs.readFileSync(victim, "utf8")).toBe("canary");
  expect(fs.lstatSync(file).isSymbolicLink()).toBe(false);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

it.each(["target", "parent", "lock"])("rejects a symlink %s on read or mutation", (kind) => {
  const victim = join(root, "victim");
  fs.writeFileSync(victim, '{"nextId":1,"tasks":[]}');
  if (kind === "target") fs.symlinkSync(victim, file);
  if (kind === "lock") fs.symlinkSync(victim, file + ".lock");
  if (kind === "parent") { fs.symlinkSync(root, join(root, "alias")); file = join(root, "alias", "tasks.json"); }
  expect(() => new TaskStore(file).create("unsafe", "fixture")).toThrow(/unsafe/i);
  expect(fs.readFileSync(victim, "utf8")).toBe('{"nextId":1,"tasks":[]}');
});

it("rejects writable non-sticky ancestors", () => {
  fs.mkdirSync(join(root, "public"), { mode: 0o777 });
  fs.chmodSync(join(root, "public"), 0o777);
  expect(() => new TaskStore(join(root, "public", "tasks.json")).create("x", "")).toThrow(/unsafe/i);
});

it("does not follow a target replaced after construction", () => {
  const store = new TaskStore(file);
  const victim = join(root, "victim");
  fs.writeFileSync(victim, '{"nextId":2,"tasks":[{"id":"1","subject":"secret"}]}');
  fs.symlinkSync(victim, file);
  expect(() => store.list()).toThrow(/unsafe/i);
});

it.each(["writeFileSync", "renameSync"] as const)("preserves state and cleans its temporary after failed %s", (operation) => {
  const store = new TaskStore(file);
  store.create("original", "");
  const previous = fs.readFileSync(file, "utf8");
  const original = fs[operation];
  vi.spyOn(fs, operation).mockImplementation(((...args: any[]) => {
    if (operation === "renameSync" || typeof args[0] === "number" || String(args[0]).includes(".tmp")) throw new Error("interrupted");
    return (original as any)(...args);
  }) as any);
  expect(() => store.create("lost", "")).toThrow("interrupted");
  expect(fs.readFileSync(file, "utf8")).toBe(previous);
  expect(fs.readdirSync(root)).toEqual(["tasks.json"]);
  vi.restoreAllMocks();
  fs.unlinkSync(file);
  expect(store.list().map(t => t.subject)).toEqual(["original"]);
  expect(store.create("next", "").id).toBe("2");
});
