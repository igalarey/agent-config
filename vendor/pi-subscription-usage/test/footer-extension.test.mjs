import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createSubscriptionFooter, formatSubscriptionMarker } from "../footer.ts";
import { createSubscriptionUsageExtension } from "../index.ts";

const codex = {
  provider: "openai-codex",
  id: "gpt-5.4",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: true,
  contextWindow: 200_000,
};
const codexMini = { ...codex, id: "gpt-5.4-mini" };

function usage(input, output, cacheRead, cacheWrite, cost) {
  return { input, output, cacheRead, cacheWrite, cost: { total: cost } };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixtureContext(mode = "tui") {
  let footerFactory;
  const notifications = [];
  const entries = [
    { type: "message", message: { role: "assistant", usage: usage(1_000, 500, 200, 100, 0.2) } },
    { type: "message", message: { role: "toolResult", usage: usage(30, 20, 0, 0, 0.01) } },
    { type: "compaction", usage: usage(10, 5, 0, 0, 0.005) },
  ];
  const ctx = {
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    cwd: "/home/me/project",
    model: codex,
    thinkingLevel: "high",
    getContextUsage: () => ({ tokens: 100_000, contextWindow: 200_000, percent: 50 }),
    sessionManager: {
      getEntries: () => entries,
      getSessionName: () => "quota-work",
    },
    ui: {
      setFooter(factory) { footerFactory = factory; },
      notify(message, level) { notifications.push({ message, level }); },
    },
  };
  return { ctx, notifications, getFooterFactory: () => footerFactory };
}

const theme = {
  fg: (_color, value) => value,
  bold: value => value,
};

test("Pi 0.85.1 loader registers the command without starting background work", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const loaded = await discoverAndLoadExtensions([fileURLToPath(new URL("../index.ts", import.meta.url))], root, root);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.ok(loaded.extensions[0].commands.has("subscription-refresh"));
});

function footerData(statuses = new Map()) {
  return {
    getGitBranch: () => "feat/quota",
    getExtensionStatuses: () => statuses,
    getAvailableProviderCount: () => 2,
    onBranchChange: () => () => {},
  };
}

test("known markers explicitly label real window percentages as used and keep token spend separate", () => {
  const marker = formatSubscriptionMarker({
    kind: "known",
    target: { key: "openai-codex", label: "Codex" },
    usage: {
      fetchedAt: 1_000,
      windows: [
        { label: "5h", usedPercent: 23, resetsAt: 7_300_000 },
        { label: "7d", usedPercent: 41 },
      ],
      tokenSpend: { usedTokens: 12_345, periodLabel: "month" },
    },
  }, 100_000);
  assert.equal(marker, "Codex · 5h 23% used (resets in 2h) · 7d 41% used · tokens 12k used/month · ↻");
  assert.match(formatSubscriptionMarker({ kind: "unavailable", target: { key: "anthropic", label: "Claude" } }, 0), /^Claude · N\/D · ↻$/);
});

test("custom footer keeps public cwd, branch, session usage, context, model/thinking, and statuses", () => {
  const { ctx } = fixtureContext();
  let refreshes = 0;
  const controller = {
    getState: () => ({
      kind: "known",
      target: { key: "openai-codex", label: "Codex" },
      usage: {
        fetchedAt: 1_000,
        windows: [
          { label: "5h", usedPercent: 23 },
          { label: "7d", usedPercent: 41 },
        ],
      },
    }),
    requestRefresh: async () => { refreshes++; return "started"; },
    dispose() {},
  };
  const component = createSubscriptionFooter({
    ctx,
    footerData: footerData(new Map([
      ["z", "  zed\nstatus  "],
      ["a", "alpha\tstatus"],
    ])),
    controller,
    tui: { requestRender() {} },
    theme,
    now: () => 2_000,
    home: "/home/me",
  });

  const lines = component.render(160);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^~[\\/]project \(feat\/quota\) • quota-work  ↑/);
  assert.match(lines[0], /↑1\.0k ↓525 R200 W100 CH15\.4% \$0\.215 50\.0%\/200k/);
  assert.match(lines[1], /^alpha status zed status +\(openai-codex\) gpt-5\.4 • high$/);
  assert.match(lines[0], /Codex · 5h 23% used · 7d 41% used · ↻$/);
  assert.equal(visibleWidth(lines[1]), 160);
  for (const line of lines) assert.ok(visibleWidth(line) <= 160);

  const refreshX = lines[0].indexOf("↻");
  assert.ok(refreshX > 0);
  assert.deepEqual(component.handleMouse({ type: "click", button: "left", x: refreshX, y: 0 }), { handled: true, render: true });
  assert.equal(refreshes, 1);
});

test("adaptive layout preserves both quota windows, branch, and refresh at 80 and 120 columns", () => {
  const { ctx } = fixtureContext();
  ctx.cwd = "/home/me/a-very-long-workspace-name/with/many/nested/directories/project";
  ctx.sessionManager.getSessionName = () => undefined;
  let refreshes = 0;
  const component = createSubscriptionFooter({
    ctx,
    footerData: footerData(),
    controller: {
      getState: () => ({
        kind: "known",
        target: { key: "openai-codex", label: "Codex" },
        usage: {
          fetchedAt: 1_000,
          windows: [
            { label: "5h", usedPercent: 23, resetsAt: 7_300_000 },
            { label: "7d", usedPercent: 41, resetsAt: 700_000_000 },
          ],
        },
      }),
      requestRefresh: async () => { refreshes++; return "started"; },
      dispose() {},
    },
    tui: { requestRender() {} },
    theme,
    now: () => 100_000,
    home: "/home/me",
  });

  for (const width of [80, 120]) {
    const [line, model] = component.render(width);
    assert.ok(visibleWidth(line) <= width);
    assert.match(line, /\(feat\/quota\)/);
    assert.match(line, /50\.0%\/200k/);
    assert.match(model, /gpt-5\.4 • high$/);
    assert.match(line, /5h 23% used/);
    assert.match(line, /7d 41% used/);
    assert.equal(visibleWidth(line), width);
    const refreshIndex = line.indexOf("↻");
    assert.ok(refreshIndex >= 0);
    const refreshX = visibleWidth(line.slice(0, refreshIndex));
    assert.deepEqual(component.handleMouse({ type: "click", button: "left", x: refreshX, y: 0 }), { handled: true, render: true });
  }
  assert.equal(refreshes, 2);
});

test("footer strips terminal controls from every externally sourced field", () => {
  const { ctx } = fixtureContext();
  ctx.cwd = "/tmp/project\u001b]8;;https://evil.example\u0007linked\u001b]8;;\u0007";
  ctx.model = { ...codex, id: "gpt\u001b[2J-5.4" };
  ctx.sessionManager.getSessionName = () => "session\u001b]0;owned\u0007\bname";
  const component = createSubscriptionFooter({
    ctx,
    footerData: {
      ...footerData(new Map([["unsafe", "status\u001b[31mred\u001b[0m\u001b]0;title\u0007"]])),
      getGitBranch: () => "branch\u001b[2J\u0007name",
    },
    controller: {
      getState: () => ({
        kind: "known",
        target: { key: "openai-codex", label: "Codex" },
        usage: { fetchedAt: 1_000, windows: [{ label: "5h\u001b]0;quota\u0007", usedPercent: 23 }] },
      }),
      requestRefresh: async () => "started",
      dispose() {},
    },
    tui: { requestRender() {} },
    theme,
    now: () => 2_000,
    home: "/home/me",
  });

  const rendered = component.render(200).join("");
  assert.equal(/[\u0000-\u001f\u007f-\u009f]/.test(rendered), false);
  assert.doesNotMatch(rendered, /\]0;|\[2J|\[31m/);
  assert.match(rendered, /linked/);
  assert.match(rendered, /statusred/);
});

test("quota stays above the model safely at narrow widths", () => {
  const { ctx } = fixtureContext();
  let refreshes = 0;
  const component = createSubscriptionFooter({
    ctx, footerData: footerData(new Map([["om", "O ▕████░░░░▏ C ▕░░░░░░░░▏ X ▕░░░░░░░░▏ $0.133 中文"]])),
    controller: {
      getState: () => ({ kind: "loading", target: { key: "openai-codex", label: "Codex" } }),
      requestRefresh: async () => { refreshes++; return "started"; },
    }, tui: { requestRender() {} }, theme, now: () => 0,
  });
  for (const width of [1, 2, 5, 20, 40, 80, 120]) {
    const lines = component.render(width);
    assert.equal(lines.length, 2);
    for (const line of lines) assert.ok(visibleWidth(line) <= width);
    assert.equal(visibleWidth(lines[1]), width);
    assert.equal(component.handleMouse({ type: "click", button: "left", x: width - 1, y: 1 }), undefined);
    if (lines[0].endsWith("↻")) {
      assert.ok(component.handleMouse({ type: "click", button: "left", x: width - 1, y: 0 })?.handled);
    }
  }
  assert.ok(refreshes > 0);
});

test("agent summary is hidden without removing memory or unrelated statuses", () => {
  const { ctx } = fixtureContext();
  const statuses = new Map([["om", "MEMORY"], ["subagents", "AGENT_SUMMARY"], ["other", "OTHER_STATUS"]]);
  const component = createSubscriptionFooter({
    ctx, footerData: footerData(statuses),
    controller: { getState: () => ({ kind: "loading", target: { key: "openai-codex", label: "Codex" } }) },
    tui: { requestRender() {} }, theme, now: () => 0,
  });
  const rendered = component.render(160).join("\n");
  assert.ok(!rendered.includes("AGENT_SUMMARY"));
  assert.ok(rendered.includes("MEMORY"));
  assert.ok(rendered.includes("OTHER_STATUS"));
  assert.equal(statuses.get("subagents"), "AGENT_SUMMARY");
});

test("memory status uses the theme dim color after sanitization", () => {
  const { ctx } = fixtureContext();
  const component = createSubscriptionFooter({
    ctx,
    footerData: footerData(new Map([["om", "O ▕░░▏ C ▕░░▏ X ▕░░▏ $0.133\u001b[2J"]])),
    controller: { getState: () => ({ kind: "loading", target: { key: "openai-codex", label: "Codex" } }) },
    tui: { requestRender() {} },
    theme: { ...theme, fg: (color, text) => color === "dim" ? `\u001b[38;2;145;134;159m${text}\u001b[39m` : text },
    now: () => 0,
  });
  const line = component.render(120)[1];
  assert.ok(line.startsWith("\u001b[38;2;145;134;159m"));
  assert.match(line, /\$0\.133/);
  assert.ok(!line.includes("\u001b[2J"));
  assert.ok(visibleWidth(line) <= 120);
});

test("refresh click is inactive when truncation hides the button", () => {
  const { ctx } = fixtureContext();
  let refreshes = 0;
  const component = createSubscriptionFooter({
    ctx,
    footerData: footerData(),
    controller: {
      getState: () => ({ kind: "loading", target: { key: "openai-codex", label: "Codex" } }),
      requestRefresh: async () => { refreshes++; return "started"; },
      dispose() {},
    },
    tui: { requestRender() {} },
    theme,
    now: () => 0,
  });
  const [line] = component.render(1);
  assert.ok(visibleWidth(line) <= 1);
  assert.equal(component.handleMouse({ type: "click", button: "left", x: 0, y: 0 }), undefined);
  assert.equal(refreshes, 0);
});

test("extension performs no provider work in RPC and starts TUI work only when setFooter factory is invoked", async () => {
  const handlers = new Map();
  const commands = new Map();
  let calls = 0;
  const extension = createSubscriptionUsageExtension({
    providers: [{
      id: "fixture",
      supports: model => model.provider === "openai-codex",
      async fetchUsage() {
        calls++;
        return { kind: "known", windows: [{ label: "5h", usedPercent: 23 }] };
      },
    }],
    pollIntervalMs: 60_000,
  });
  extension({
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, command) { commands.set(name, command); },
  });

  const rpc = fixtureContext("rpc");
  await handlers.get("session_start")({}, rpc.ctx);
  assert.equal(rpc.getFooterFactory(), undefined);
  await commands.get("subscription-refresh").handler("", rpc.ctx);
  assert.equal(calls, 0);

  const tuiFixture = fixtureContext("tui");
  await handlers.get("session_start")({}, tuiFixture.ctx);
  const factory = tuiFixture.getFooterFactory();
  assert.equal(typeof factory, "function");
  assert.equal(calls, 0);

  const component = factory({ requestRender() {} }, theme, footerData());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  component.dispose();
});

test("default adapters never resolve credentials in RPC and stay lazy until the TUI footer exists", async () => {
  const handlers = new Map();
  const commands = new Map();
  const authCalls = [];
  createSubscriptionUsageExtension()({
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, command) { commands.set(name, command); },
  });
  const modelRegistry = {
    isUsingOAuth(model) { authCalls.push({ type: "oauth", model }); return false; },
    async getApiKeyAndHeaders(model) { authCalls.push({ type: "auth", model }); return { ok: false, error: "unused" }; },
  };

  const rpc = fixtureContext("rpc");
  rpc.ctx.modelRegistry = modelRegistry;
  await handlers.get("session_start")({}, rpc.ctx);
  await commands.get("subscription-refresh").handler("", rpc.ctx);
  assert.deepEqual(authCalls, []);

  const tuiFixture = fixtureContext("tui");
  tuiFixture.ctx.modelRegistry = modelRegistry;
  await handlers.get("session_start")({}, tuiFixture.ctx);
  assert.deepEqual(authCalls, []);
  const component = tuiFixture.getFooterFactory()({ requestRender() {} }, theme, footerData());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(authCalls.filter(call => call.type === "oauth").length, 1);
  assert.equal(authCalls.some(call => call.type === "auth"), false);
  component.dispose();
});

test("refresh command reports stale data as a failed update", async () => {
  const handlers = new Map();
  const commands = new Map();
  let calls = 0;
  createSubscriptionUsageExtension({
    providers: [{
      id: "fixture",
      supports: model => model.provider === "openai-codex",
      async fetchUsage() {
        calls++;
        if (calls === 1) return { kind: "known", windows: [{ label: "5h", usedPercent: 10 }] };
        throw new Error("raw provider failure");
      },
    }],
    minRefreshIntervalMs: 0,
  })({
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, command) { commands.set(name, command); },
  });
  const fixture = fixtureContext("tui");
  await handlers.get("session_start")({}, fixture.ctx);
  const component = fixture.getFooterFactory()({ requestRender() {} }, theme, footerData());
  await new Promise(resolve => setImmediate(resolve));

  await commands.get("subscription-refresh").handler("", fixture.ctx);
  assert.deepEqual(fixture.notifications, [{
    message: "Subscription refresh failed; showing previous data.",
    level: "warning",
  }]);
  component.dispose();
});

test("refresh command ignores completion after its runtime is disposed", async () => {
  const handlers = new Map();
  const commands = new Map();
  const pending = deferred();
  let calls = 0;
  const extension = createSubscriptionUsageExtension({
    providers: [{
      id: "fixture",
      supports: model => model.provider === "openai-codex",
      async fetchUsage() {
        calls++;
        if (calls === 1) return { kind: "known", windows: [{ label: "5h", usedPercent: 10 }] };
        return pending.promise;
      },
    }],
    minRefreshIntervalMs: 0,
  });
  extension({
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, command) { commands.set(name, command); },
  });
  const fixture = fixtureContext("tui");
  await handlers.get("session_start")({}, fixture.ctx);
  const component = fixture.getFooterFactory()({ requestRender() {} }, theme, footerData());
  await new Promise(resolve => setImmediate(resolve));

  const commandPromise = commands.get("subscription-refresh").handler("", fixture.ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  component.dispose();
  pending.resolve({ kind: "known", windows: [{ label: "5h", usedPercent: 20 }] });
  await commandPromise;
  assert.deepEqual(fixture.notifications, []);
});

test("refresh command ignores completion after model generation changes", async () => {
  const handlers = new Map();
  const commands = new Map();
  const pending = deferred();
  let calls = 0;
  const extension = createSubscriptionUsageExtension({
    providers: [{
      id: "fixture",
      supports: model => model.provider === "openai-codex",
      async fetchUsage() {
        calls++;
        if (calls === 1 || calls > 2) return { kind: "known", windows: [{ label: "5h", usedPercent: 10 }] };
        return pending.promise;
      },
    }],
    minRefreshIntervalMs: 0,
  });
  extension({
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, command) { commands.set(name, command); },
  });
  const fixture = fixtureContext("tui");
  await handlers.get("session_start")({}, fixture.ctx);
  const component = fixture.getFooterFactory()({ requestRender() {} }, theme, footerData());
  await new Promise(resolve => setImmediate(resolve));

  const commandPromise = commands.get("subscription-refresh").handler("", fixture.ctx);
  await new Promise(resolve => setImmediate(resolve));
  await handlers.get("model_select")({ model: codexMini });
  pending.resolve({ kind: "known", windows: [{ label: "5h", usedPercent: 20 }] });
  await commandPromise;
  assert.deepEqual(fixture.notifications, []);
  component.dispose();
});
