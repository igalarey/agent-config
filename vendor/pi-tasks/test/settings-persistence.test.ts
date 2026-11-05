import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { loadTasksConfig } from "../src/tasks-config.js";
import { openSettingsMenu } from "../src/ui/settings-menu.js";

vi.mock("@earendil-works/pi-coding-agent", async original => ({
  ...await original<typeof import("@earendil-works/pi-coding-agent")>(), getSettingsListTheme: () => ({}),
}));
const captured = vi.hoisted(() => ({ change: undefined as undefined | ((id: string, value: string) => void) }));
vi.mock("@earendil-works/pi-tui", async original => {
  const actual = await original<typeof import("@earendil-works/pi-tui")>();
  return { ...actual, SettingsList: class extends actual.Container {
    constructor(_items: unknown, _count: number, _theme: unknown, change: (id: string, value: string) => void) {
      super(); captured.change = change;
    }
  } };
});
let root: string | undefined;
afterEach(() => { vi.unstubAllEnvs(); if (root) rmSync(root, { recursive: true, force: true }); });

it.each([false, true])("persists explicit menu choices in user scope with project trust=%s", async trusted => {
  root = mkdtempSync(join(tmpdir(), "tasks-menu-"));
  const agent = join(root, "agent"), cwd = join(root, "project");
  mkdirSync(agent); mkdirSync(join(cwd, ".pi"), { recursive: true });
  vi.stubEnv("PI_CODING_AGENT_DIR", agent);
  const globalPath = join(agent, "tasks-config.json"), projectPath = join(cwd, ".pi", "tasks-config.json");
  writeFileSync(globalPath, JSON.stringify({ taskScope: "session-global", autoCascade: false, ...(trusted ? { trustedProjects: [cwd] } : {}) }));
  const projectBytes = JSON.stringify({ autoCascade: false, maxVisible: 2 });
  writeFileSync(projectPath, projectBytes);
  const cfg = loadTasksConfig(cwd, agent);
  const ui = { custom: async (factory: any) => {
    factory({}, { bold: (text: string) => text, fg: (_color: string, text: string) => text }, {}, () => {});
    captured.change!("autoCascade", "on");
    captured.change!("maxVisible", "17");
    return undefined as any;
  } };
  await openSettingsMenu(ui, cfg, async () => {}, 2, cwd);
  expect(loadTasksConfig(cwd, agent)).toMatchObject({ autoCascade: true, maxVisible: 17, taskScope: "session-global" });
  expect(readFileSync(projectPath, "utf8")).toBe(projectBytes);
  const saved = JSON.parse(readFileSync(globalPath, "utf8"));
  expect(saved.trustedProjects).toEqual(trusted ? [cwd] : undefined);
  expect(loadTasksConfig(join(root, "other"), agent)).toMatchObject({ autoCascade: false, taskScope: "session-global" });
});
