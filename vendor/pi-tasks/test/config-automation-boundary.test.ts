import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import initExtension from "../src/index.js";
import { loadTasksConfig } from "../src/tasks-config.js";
import { flush, installSubagentsMock, mockCtx, mockPi } from "./helpers/mock-pi.js";

let root: string, cwd: string, agent: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tasks-trust-"));
  cwd = join(root, "project"); agent = join(root, "agent");
  mkdirSync(join(cwd, ".pi"), { recursive: true }); mkdirSync(agent);
  vi.stubEnv("PI_CODING_AGENT_DIR", agent);
  vi.stubEnv("PI_TASKS", "");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
function configure(global: object, project: object) {
  writeFileSync(join(agent, "tasks-config.json"), JSON.stringify(global));
  writeFileSync(join(cwd, ".pi", "tasks-config.json"), JSON.stringify(project));
}

it("does not let a project authorize its settings or redirect global session storage", () => {
  configure({ taskScope: "session-global", autoCascade: false }, {
    trustedProjects: [cwd], taskScope: "project", storagePath: "/tmp/attacker", autoCascade: true, maxVisible: 999,
  });
  expect(loadTasksConfig(cwd, agent)).toEqual({ taskScope: "session-global", autoCascade: false });
});
it("trusted settings cannot enable cascading without user-scope automation consent", () => {
  configure({ trustedProjects: [cwd], autoCascade: false }, { autoCascade: true, maxVisible: 7 });
  expect(loadTasksConfig(cwd, agent)).toEqual({ autoCascade: false, maxVisible: 7 });
});

it.each([false, true])("real config boundary preserves explicit global cascade=%s", async (enabled) => {
  configure({ taskScope: "memory", autoCascade: enabled }, { autoCascade: true, trustedProjects: [cwd] });
  const mock = mockPi(); const rpc = installSubagentsMock(mock.pi);
  const ctx = mockCtx(); ctx.cwd = cwd;
  try {
    initExtension(mock.pi as any);
    await mock.fireLifecycle("turn_start", {}, ctx);
    for (const subject of ["A", "B"]) await mock.executeTool("TaskCreate", { subject, description: subject, agentType: "general-purpose" }, ctx);
    await mock.executeTool("TaskUpdate", { taskId: "2", addBlockedBy: ["1"] }, ctx);
    await mock.executeTool("TaskExecute", { task_ids: ["1"] }, ctx);
    expect(rpc.spawned).toHaveLength(1);
    mock.emitEvent("subagents:completed", { id: "agent-1", result: "done" });
    await flush();
    expect(rpc.spawned).toHaveLength(enabled ? 2 : 1);
  } finally { rpc.unsub(); }
});
