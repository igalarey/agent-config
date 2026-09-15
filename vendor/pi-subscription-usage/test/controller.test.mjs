import test from "node:test";
import assert from "node:assert/strict";
import {
  createTransportUsageProvider,
  resolveSubscriptionTarget,
} from "../provider.ts";
import { SubscriptionUsageController } from "../controller.ts";

const codex = { provider: "openai-codex", id: "gpt-5.4", api: "openai-codex-responses" };
const codexMini = { provider: "openai-codex", id: "gpt-5.4-mini", api: "openai-codex-responses" };
const claude = { provider: "anthropic", id: "claude-opus-4-6", api: "anthropic-messages" };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeScheduler() {
  const handles = [];
  const timeouts = [];
  const createHandle = (callback, delayMs) => ({
    callback,
    delayMs,
    unrefCalled: false,
    cleared: false,
    unref() { this.unrefCalled = true; },
  });
  return {
    handles,
    timeouts,
    setInterval(callback, intervalMs) {
      const handle = createHandle(callback, intervalMs);
      handle.intervalMs = intervalMs;
      handles.push(handle);
      return handle;
    },
    clearInterval(handle) { handle.cleared = true; },
    setTimeout(callback, delayMs) {
      const handle = createHandle(callback, delayMs);
      timeouts.push(handle);
      return handle;
    },
    clearTimeout(handle) { handle.cleared = true; },
  };
}

function providerFor(providerId, fetchUsage) {
  return {
    id: `${providerId}-usage`,
    supports: model => model.provider === providerId,
    fetchUsage,
  };
}

test("targets only the active Codex subscription or direct Anthropic provider", () => {
  assert.deepEqual(resolveSubscriptionTarget(codex), { key: "openai-codex", label: "Codex" });
  assert.deepEqual(resolveSubscriptionTarget(claude), { key: "anthropic", label: "Claude" });
  assert.equal(resolveSubscriptionTarget({ provider: "openrouter", id: "anthropic/claude", api: "openai-completions" }), undefined);
  assert.equal(resolveSubscriptionTarget(undefined), undefined);
});

test("transport-backed providers are injectable and parse normalized usage offline", async () => {
  const requests = [];
  const transport = {
    async fetch(request) {
      requests.push(request);
      return { primary: 23, secondary: 41 };
    },
  };
  const provider = createTransportUsageProvider({
    id: "fixture",
    supports: model => model.provider === "openai-codex",
    transport,
    parseResponse: raw => ({
      kind: "known",
      windows: [
        { label: "5h", usedPercent: raw.primary },
        { label: "7d", usedPercent: raw.secondary },
      ],
    }),
  });
  const result = await provider.fetchUsage({ model: codex, signal: new AbortController().signal });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, codex);
  assert.deepEqual(result, {
    kind: "known",
    windows: [
      { label: "5h", usedPercent: 23 },
      { label: "7d", usedPercent: 41 },
    ],
  });
});

test("controller starts lazily, unreferences polling, coalesces, and enforces the minimum interval", async () => {
  let now = 1_000;
  const scheduler = fakeScheduler();
  const pending = deferred();
  let calls = 0;
  const controller = new SubscriptionUsageController({
    providers: [providerFor("openai-codex", ({ signal }) => {
      calls++;
      assert.equal(signal.aborted, false);
      return pending.promise;
    })],
    now: () => now,
    scheduler,
    pollIntervalMs: 60_000,
    minRefreshIntervalMs: 15_000,
  });

  assert.equal(calls, 0);
  controller.start(codex);
  assert.equal(calls, 1);
  assert.deepEqual(controller.getState(), {
    kind: "loading",
    target: { key: "openai-codex", label: "Codex" },
  });
  assert.equal(scheduler.handles.length, 1);
  assert.equal(scheduler.handles[0].intervalMs, 60_000);
  assert.equal(scheduler.handles[0].unrefCalled, true);

  assert.equal(await controller.requestRefresh(), "coalesced");
  assert.equal(calls, 1);
  pending.resolve({ kind: "known", windows: [{ label: "5h", usedPercent: 23 }] });
  await controller.whenIdle();
  assert.equal(controller.getState().kind, "known");

  now += 1_000;
  assert.equal(await controller.requestRefresh(), "throttled");
  assert.equal(calls, 1);
  controller.dispose();
  assert.equal(scheduler.handles[0].cleared, true);
});

test("repeated model selection in one subscription coalesces in-flight work", async () => {
  const pending = deferred();
  let calls = 0;
  let signal;
  const controller = new SubscriptionUsageController({
    providers: [providerFor("openai-codex", request => {
      calls++;
      signal = request.signal;
      return pending.promise;
    })],
    scheduler: fakeScheduler(),
    minRefreshIntervalMs: 15_000,
  });

  controller.start(codex);
  controller.setModel(codexMini);
  controller.setModel(codex);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  assert.equal(controller.getState().kind, "loading");

  pending.resolve({ kind: "known", windows: [{ label: "5h", usedPercent: 23 }] });
  await controller.whenIdle();
  assert.equal(controller.getState().kind, "known");
  controller.dispose();
});

test("same-provider model selection honors the minimum interval and keeps known data while waiting", async () => {
  let now = 1_000;
  let calls = 0;
  const scheduler = fakeScheduler();
  const controller = new SubscriptionUsageController({
    providers: [providerFor("openai-codex", async () => {
      calls++;
      return { kind: "known", windows: [{ label: "5h", usedPercent: calls * 10 }] };
    })],
    now: () => now,
    scheduler,
    minRefreshIntervalMs: 15_000,
  });

  controller.start(codex);
  await controller.whenIdle();
  assert.equal(controller.getState().kind, "known");
  assert.equal(controller.getState().usage.windows[0].usedPercent, 10);

  now += 1_000;
  controller.setModel(codexMini);
  controller.setModel(codex);
  assert.equal(calls, 1);
  assert.equal(controller.getState().kind, "known");
  assert.equal(controller.getState().usage.windows[0].usedPercent, 10);
  assert.equal(scheduler.timeouts.length, 1);
  assert.equal(scheduler.timeouts[0].delayMs, 14_000);
  assert.equal(scheduler.timeouts[0].unrefCalled, true);

  now += 14_000;
  scheduler.timeouts[0].callback();
  await controller.whenIdle();
  assert.equal(calls, 2);
  assert.equal(controller.getState().usage.windows[0].usedPercent, 20);
  controller.dispose();
});

test("the approximately 60-second poll performs an automatic refresh", async () => {
  let now = 1_000;
  let calls = 0;
  const scheduler = fakeScheduler();
  const controller = new SubscriptionUsageController({
    providers: [providerFor("openai-codex", async () => {
      calls++;
      return { kind: "known", windows: [{ label: "5h", usedPercent: calls }] };
    })],
    now: () => now,
    scheduler,
    pollIntervalMs: 60_000,
    minRefreshIntervalMs: 15_000,
  });
  controller.start(codex);
  await controller.whenIdle();
  assert.equal(calls, 1);

  now += 60_000;
  scheduler.handles[0].callback();
  await controller.whenIdle();
  assert.equal(calls, 2);
  assert.equal(controller.getState().usage.windows[0].usedPercent, 2);
  controller.dispose();
});

test("model switches abort obsolete work and late responses cannot overwrite current state", async () => {
  let now = 5_000;
  const codexPending = deferred();
  const claudePending = deferred();
  let codexSignal;
  const controller = new SubscriptionUsageController({
    providers: [
      providerFor("openai-codex", request => { codexSignal = request.signal; return codexPending.promise; }),
      providerFor("anthropic", () => claudePending.promise),
    ],
    now: () => now,
    scheduler: fakeScheduler(),
    minRefreshIntervalMs: 0,
  });

  controller.start(codex);
  controller.setModel(claude);
  assert.equal(codexSignal.aborted, true);
  assert.equal(controller.getState().target.label, "Claude");

  codexPending.resolve({ kind: "known", windows: [{ label: "5h", usedPercent: 99 }] });
  claudePending.resolve({ kind: "known", windows: [{ label: "5h", usedPercent: 12 }] });
  await controller.whenIdle();
  assert.equal(controller.getState().kind, "known");
  assert.equal(controller.getState().usage.windows[0].usedPercent, 12);
  controller.dispose();
});

test("failed refresh keeps prior real data as stale without exposing raw errors", async () => {
  let now = 10_000;
  let fail = false;
  const states = [];
  const controller = new SubscriptionUsageController({
    providers: [providerFor("openai-codex", async () => {
      if (fail) throw new Error("secret token and raw provider body");
      return { kind: "known", windows: [{ label: "7d", usedPercent: 41 }] };
    })],
    now: () => now,
    scheduler: fakeScheduler(),
    minRefreshIntervalMs: 0,
    onChange: state => states.push(state),
  });

  controller.start(codex);
  await controller.whenIdle();
  fail = true;
  now += 60_000;
  assert.equal(await controller.requestRefresh(), "started");
  assert.deepEqual(controller.getState(), {
    kind: "stale",
    target: { key: "openai-codex", label: "Codex" },
    usage: {
      fetchedAt: 10_000,
      windows: [{ label: "7d", usedPercent: 41 }],
    },
  });
  assert.equal(JSON.stringify(states).includes("secret token"), false);
  controller.dispose();
});

test("invalid percentages become a generic error instead of invented quota", async () => {
  const controller = new SubscriptionUsageController({
    providers: [providerFor("openai-codex", async () => ({
      kind: "known",
      windows: [{ label: "5h", usedPercent: 120 }],
    }))],
    scheduler: fakeScheduler(),
  });
  controller.start(codex);
  await controller.whenIdle();
  assert.deepEqual(controller.getState(), {
    kind: "error",
    target: { key: "openai-codex", label: "Codex" },
  });
  controller.dispose();
});
