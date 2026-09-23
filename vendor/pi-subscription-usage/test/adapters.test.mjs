import test from "node:test";
import assert from "node:assert/strict";
import {
  ANTHROPIC_USAGE_URL,
  CODEX_USAGE_URL,
  MAX_USAGE_BODY_BYTES,
  REQUEST_TIMEOUT_MS,
  createAnthropicUsageProvider,
  createCodexUsageProvider,
  createFetchSubscriptionTransport,
} from "../adapters.ts";
import { SubscriptionUsageController } from "../controller.ts";

const codex = {
  provider: "openai-codex",
  id: "gpt-5.4",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
};
const codexMini = { ...codex, id: "gpt-5.4-mini" };
const claude = {
  provider: "anthropic",
  id: "claude-opus-4-6",
  api: "anthropic-messages",
  baseUrl: "https://api.anthropic.com",
};

const claudeBridge = {
  provider: "claude-bridge",
  id: "claude-opus-5-5",
  api: "claude-bridge",
  baseUrl: "claude-bridge",
};

function jwt(accountId = "acct-fixture", extraPayload = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    ...extraPayload,
  })}.signature`;
}

function registry({ oauth = true, auth = { ok: true, apiKey: jwt() } } = {}) {
  const calls = [];
  return {
    calls,
    isUsingOAuth(model) { calls.push({ type: "oauth", model }); return oauth; },
    async getApiKeyAndHeaders(model) { calls.push({ type: "auth", model }); return auth; },
  };
}

function transportWith(responses) {
  const requests = [];
  return {
    requests,
    async request(request) {
      requests.push(request);
      const response = responses[Math.min(requests.length - 1, responses.length - 1)];
      return typeof response === "function" ? response(request) : response;
    },
  };
}

function scheduler() {
  const intervals = [];
  const timeouts = [];
  const make = (callback, delayMs) => ({ callback, delayMs, cleared: false, unref() {} });
  return {
    intervals,
    timeouts,
    setInterval(callback, delayMs) { const value = make(callback, delayMs); intervals.push(value); return value; },
    clearInterval(value) { value.cleared = true; },
    setTimeout(callback, delayMs) { const value = make(callback, delayMs); timeouts.push(value); return value; },
    clearTimeout(value) { value.cleared = true; },
  };
}

test("provider work has a fixed ten-second deadline", () => {
  assert.equal(REQUEST_TIMEOUT_MS, 10_000);
});

test("Codex adapter resolves rotated Pi OAuth auth and maps only documented windows", async () => {
  const rotated = jwt("account-from-rotated-token");
  const modelRegistry = registry({ auth: { ok: true, apiKey: rotated, headers: { "x-private": "never-forward" } } });
  const transport = transportWith([{
    status: 200,
    headers: {},
    body: JSON.stringify({
      rate_limit: {
        primary_window: {
          used_percent: 23,
          limit_window_seconds: 18_000,
          reset_at: 1_800_000_000,
        },
        secondary_window: {
          used_percent: 41,
          limit_window_seconds: 604_800,
          reset_after_seconds: 120,
        },
      },
      credits: { balance: 9000 },
    }),
  }]);
  const provider = createCodexUsageProvider({ modelRegistry, transport, now: () => 10_000 });
  const result = await provider.fetchUsage({ model: codex, signal: new AbortController().signal });

  assert.deepEqual(result, {
    kind: "known",
    windows: [
      { label: "5h", usedPercent: 23, resetsAt: 1_800_000_000_000 },
      { label: "7d", usedPercent: 41, resetsAt: 130_000 },
    ],
  });
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.requests[0].url, CODEX_USAGE_URL);
  assert.equal(transport.requests[0].method, "GET");
  assert.equal(transport.requests[0].redirect, "manual");
  assert.equal(transport.requests[0].headers.Authorization, `Bearer ${rotated}`);
  assert.equal(transport.requests[0].headers["ChatGPT-Account-ID"], "account-from-rotated-token");
  assert.equal("x-private" in transport.requests[0].headers, false);
});

test("Codex accepts unpadded base64url JWT payloads and rejects unsafe account IDs", async () => {
  const base64urlTokens = [jwt("safe-account", { padding: "𐀾" }), jwt("safe-account", { padding: "𐀿" })];
  assert.match(base64urlTokens[0].split(".")[1], /-/);
  assert.match(base64urlTokens[1].split(".")[1], /_/);
  assert.equal(base64urlTokens.some(token => token.split(".")[1].includes("=")), false);

  const response = {
    status: 200,
    headers: {},
    body: JSON.stringify({ rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 18_000 } } }),
  };
  for (const token of base64urlTokens) {
    const transport = transportWith([response]);
    const provider = createCodexUsageProvider({
      modelRegistry: registry({ auth: { ok: true, apiKey: token } }),
      transport,
    });
    assert.equal((await provider.fetchUsage({ model: codex, signal: new AbortController().signal })).kind, "known");
    assert.equal(transport.requests[0].headers["ChatGPT-Account-ID"], "safe-account");
  }

  const unsafeTransport = transportWith([]);
  const unsafe = createCodexUsageProvider({
    modelRegistry: registry({ auth: { ok: true, apiKey: jwt("account\r\nInjected: value") } }),
    transport: unsafeTransport,
  });
  assert.deepEqual(await unsafe.fetchUsage({ model: codex, signal: new AbortController().signal }), { kind: "unavailable" });
  assert.equal(unsafeTransport.requests.length, 0);
});

test("Codex does not infer windows without duration or percentages without values", async () => {
  const modelRegistry = registry();
  const transport = transportWith([{
    status: 200,
    headers: {},
    body: JSON.stringify({
      rate_limit: {
        primary_window: { used_percent: 23 },
        secondary_window: { limit_window_seconds: 604_800 },
      },
    }),
  }]);
  const provider = createCodexUsageProvider({ modelRegistry, transport });
  await assert.rejects(
    provider.fetchUsage({ model: codex, signal: new AbortController().signal }),
    error => error.message === "Invalid subscription usage response",
  );
});

test("Anthropic adapter maps legacy windows and uses OAuth beta Bearer headers", async () => {
  const modelRegistry = registry({ auth: { ok: true, apiKey: "rotated-anthropic-token", headers: { "x-api-key": "never" } } });
  const transport = transportWith([{
    status: 200,
    headers: {},
    body: JSON.stringify({
      five_hour: { utilization: 12.5, resets_at: "2030-01-01T00:00:00.000Z" },
      seven_day: { utilization: 44, resets_at: null },
      seven_day_sonnet: { utilization: 7, resets_at: "2030-01-02T00:00:00.000Z" },
    }),
  }]);
  const provider = createAnthropicUsageProvider({ modelRegistry, transport });
  const result = await provider.fetchUsage({ model: claude, signal: new AbortController().signal });

  assert.deepEqual(result, {
    kind: "known",
    windows: [
      { label: "5h", usedPercent: 12.5, resetsAt: Date.parse("2030-01-01T00:00:00.000Z") },
      { label: "7d", usedPercent: 44 },
      { label: "7d Sonnet", usedPercent: 7, resetsAt: Date.parse("2030-01-02T00:00:00.000Z") },
    ],
  });
  assert.deepEqual(transport.requests[0].headers, {
    Authorization: "Bearer rotated-anthropic-token",
    "anthropic-beta": "oauth-2025-04-20",
    Accept: "application/json",
  });
  assert.equal(transport.requests[0].url, ANTHROPIC_USAGE_URL);
});

test("Anthropic adapter recognizes only evidenced weekly_scoped model limits", async () => {
  const transport = transportWith([{
    status: 200,
    headers: {},
    body: JSON.stringify({
      limits: [
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 4,
          resets_at: "2030-02-01T00:00:00.000Z",
          scope: { model: { display_name: "Fable" } },
        },
        { kind: "unknown", group: "weekly", percent: 99 },
      ],
    }),
  }]);
  const provider = createAnthropicUsageProvider({ modelRegistry: registry(), transport });
  assert.deepEqual(await provider.fetchUsage({ model: claude, signal: new AbortController().signal }), {
    kind: "known",
    windows: [{
      label: "7d Fable",
      usedPercent: 4,
      resetsAt: Date.parse("2030-02-01T00:00:00.000Z"),
    }],
  });
});

test("Anthropic mixed limits preserve global and scoped windows without legacy duplicates", async () => {
  const transport = transportWith([{
    status: 200,
    headers: {},
    body: JSON.stringify({
      five_hour: { utilization: 91 },
      seven_day: { utilization: 92 },
      seven_day_fable: { utilization: 93 },
      limits: [
        { kind: "session", group: "session", percent: 11, resets_at: "2030-03-01T00:00:00.000Z" },
        { kind: "weekly_all", group: "weekly", percent: 22, resets_at: "2030-03-02T00:00:00.000Z" },
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 4,
          resets_at: "2030-03-03T00:00:00.000Z",
          scope: { model: { display_name: "Fable" } },
        },
        { kind: "daily_unknown", group: "daily", percent: 99 },
      ],
    }),
  }]);
  const provider = createAnthropicUsageProvider({ modelRegistry: registry(), transport });
  assert.deepEqual(await provider.fetchUsage({ model: claude, signal: new AbortController().signal }), {
    kind: "known",
    windows: [
      { label: "5h", usedPercent: 11, resetsAt: Date.parse("2030-03-01T00:00:00.000Z") },
      { label: "7d", usedPercent: 22, resetsAt: Date.parse("2030-03-02T00:00:00.000Z") },
      { label: "7d Fable", usedPercent: 4, resetsAt: Date.parse("2030-03-03T00:00:00.000Z") },
    ],
  });
});

test("unrecognized new limits fall back to legacy and are errors on their own", async () => {
  const withLegacy = createAnthropicUsageProvider({
    modelRegistry: registry(),
    transport: transportWith([{
      status: 200,
      headers: {},
      body: JSON.stringify({
        five_hour: { utilization: 8 },
        limits: [{ kind: "daily_unknown", group: "daily", percent: 99 }],
      }),
    }]),
  });
  assert.deepEqual(await withLegacy.fetchUsage({ model: claude, signal: new AbortController().signal }), {
    kind: "known",
    windows: [{ label: "5h", usedPercent: 8 }],
  });

  const unknownOnly = createAnthropicUsageProvider({
    modelRegistry: registry(),
    transport: transportWith([{
      status: 200,
      headers: {},
      body: JSON.stringify({ limits: [{ kind: "daily_unknown", group: "daily", percent: 99 }] }),
    }]),
  });
  await assert.rejects(
    unknownOnly.fetchUsage({ model: claude, signal: new AbortController().signal }),
    error => error.message === "Invalid subscription usage response",
  );
});

test("non-OAuth, auth refresh failure, and 401 are unavailable without credential leakage", async () => {
  const noOauthRegistry = registry({ oauth: false });
  const noOauthTransport = transportWith([{ status: 200, headers: {}, body: "{}" }]);
  const noOauth = createCodexUsageProvider({ modelRegistry: noOauthRegistry, transport: noOauthTransport });
  assert.deepEqual(await noOauth.fetchUsage({ model: codex, signal: new AbortController().signal }), { kind: "unavailable" });
  assert.equal(noOauthTransport.requests.length, 0);
  assert.equal(noOauthRegistry.calls.some(call => call.type === "auth"), false);

  const failedRegistry = registry({ auth: { ok: false, error: "raw refresh failure with token" } });
  const failedTransport = transportWith([{ status: 200, headers: {}, body: "{}" }]);
  const failed = createAnthropicUsageProvider({ modelRegistry: failedRegistry, transport: failedTransport });
  assert.deepEqual(await failed.fetchUsage({ model: claude, signal: new AbortController().signal }), { kind: "unavailable" });
  assert.equal(failedTransport.requests.length, 0);

  const unauthorized = createAnthropicUsageProvider({
    modelRegistry: registry(),
    transport: transportWith([{ status: 401, headers: {}, body: "ignored" }]),
  });
  assert.deepEqual(await unauthorized.fetchUsage({ model: claude, signal: new AbortController().signal }), { kind: "unavailable" });
});

test("Claude bridge models use Pi's canonical Anthropic OAuth, never the bridge model", async () => {
  const base = registry({ auth: { ok: true, apiKey: "anthropic-oauth-token" } });
  const modelRegistry = { ...base, getAll: () => [codex, { ...claude, baseUrl: "https://proxy.example" }, claude] };
  const transport = transportWith([{
    status: 200,
    headers: {},
    body: JSON.stringify({ limits: [{ kind: "session", group: "session", percent: 29 }] }),
  }]);
  const provider = createAnthropicUsageProvider({ modelRegistry, transport });
  assert.equal(provider.supports(claudeBridge), true);
  assert.deepEqual(await provider.fetchUsage({ model: claudeBridge, signal: new AbortController().signal }), {
    kind: "known",
    windows: [{ label: "5h", usedPercent: 29 }],
  });
  assert.deepEqual(base.calls.map(call => call.model), [claude, claude]);
  assert.equal(transport.requests[0].url, ANTHROPIC_USAGE_URL);
  assert.equal(transport.requests[0].headers.Authorization, "Bearer anthropic-oauth-token");

  const noAnthropic = registry({ oauth: false });
  const noAnthropicTransport = transportWith([]);
  const withoutLogin = createAnthropicUsageProvider({
    modelRegistry: { ...noAnthropic, getAll: () => [codex, claude] },
    transport: noAnthropicTransport,
  });
  assert.deepEqual(await withoutLogin.fetchUsage({ model: claudeBridge, signal: new AbortController().signal }), { kind: "unavailable" });
  assert.equal(noAnthropic.calls.some(call => call.type === "auth"), false);
  assert.equal(noAnthropicTransport.requests.length, 0);

  const withoutRegistryList = createAnthropicUsageProvider({ modelRegistry: registry(), transport: transportWith([]) });
  assert.deepEqual(await withoutRegistryList.fetchUsage({ model: claudeBridge, signal: new AbortController().signal }), { kind: "unavailable" });
  assert.equal(provider.supports({ ...claudeBridge, api: "anthropic-messages" }), false);
});

test("canonical model checks never send OAuth credentials to custom or proxy base URLs", async () => {
  const modelRegistry = registry();
  const transport = transportWith([{ status: 200, headers: {}, body: "{}" }]);
  const provider = createAnthropicUsageProvider({ modelRegistry, transport });
  const custom = { ...claude, baseUrl: "https://proxy.example/anthropic" };
  assert.equal(provider.supports(custom), false);
  assert.deepEqual(await provider.fetchUsage({ model: custom, signal: new AbortController().signal }), { kind: "unavailable" });
  assert.equal(modelRegistry.calls.length, 0);
  assert.equal(transport.requests.length, 0);
});

test("auth resolution is abortable even when Pi's resolver has not settled", async () => {
  const pending = new Promise(() => {});
  const modelRegistry = {
    isUsingOAuth: () => true,
    getApiKeyAndHeaders: () => pending,
  };
  const provider = createAnthropicUsageProvider({ modelRegistry, transport: transportWith([]) });
  const controller = new AbortController();
  const promise = provider.fetchUsage({ model: claude, signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, error => error.name === "AbortError");
});

test("429 cooldown blocks manual refresh and model selection until Retry-After", async () => {
  let now = 1_000;
  const modelRegistry = registry();
  const transport = transportWith([{
    status: 429,
    headers: { "retry-after": "120" },
    body: "not exposed",
  }, {
    status: 200,
    headers: {},
    body: JSON.stringify({ rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18_000 } } }),
  }]);
  const provider = createCodexUsageProvider({ modelRegistry, transport, now: () => now });
  const timers = scheduler();
  const controller = new SubscriptionUsageController({
    providers: [provider],
    now: () => now,
    scheduler: timers,
    minRefreshIntervalMs: 0,
  });
  controller.start(codex);
  await controller.whenIdle();
  assert.equal(controller.getState().kind, "error");
  assert.equal(transport.requests.length, 1);

  now += 1_000;
  assert.equal(await controller.requestRefresh(), "throttled");
  controller.setModel(codexMini);
  assert.equal(transport.requests.length, 1);
  assert.equal(timers.timeouts.at(-1).delayMs, 119_000);

  now += 119_000;
  timers.timeouts.at(-1).callback();
  await controller.whenIdle();
  assert.equal(transport.requests.length, 2);
  assert.equal(controller.getState().kind, "known");
  controller.dispose();
});

test("Anthropic 429 without useful Retry-After imposes a ten-minute cooldown", async () => {
  let now = 5_000;
  const provider = createAnthropicUsageProvider({
    modelRegistry: registry(),
    transport: transportWith([{ status: 429, headers: { "retry-after": "0" }, body: "" }]),
    now: () => now,
  });
  const timers = scheduler();
  const controller = new SubscriptionUsageController({ providers: [provider], now: () => now, scheduler: timers });
  controller.start(claude);
  await controller.whenIdle();
  now += 60_000;
  timers.intervals[0].callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.timeouts.length, 0);
  assert.equal(controller.getState().kind, "error");
  controller.setModel({ ...claude, id: "claude-sonnet-4-6" });
  assert.equal(timers.timeouts.at(-1).delayMs, 540_000);
  controller.dispose();
});

test("401 and 429 discard oversized or non-terminating bodies so status headers win", async () => {
  const provider401 = createAnthropicUsageProvider({
    modelRegistry: registry(),
    transport: createFetchSubscriptionTransport({
      fetch: async () => new Response("x".repeat(MAX_USAGE_BODY_BYTES + 1), { status: 401 }),
    }),
  });
  assert.deepEqual(await provider401.fetchUsage({ model: claude, signal: new AbortController().signal }), { kind: "unavailable" });

  let cancelled429 = false;
  const unreadable429 = {
    status: 429,
    headers: new Headers({ "retry-after": "120" }),
    body: {
      getReader() { return { read: () => new Promise(() => {}) }; },
      cancel() { cancelled429 = true; return new Promise(() => {}); },
    },
  };
  const provider429 = createCodexUsageProvider({
    modelRegistry: registry(),
    transport: createFetchSubscriptionTransport({ fetch: async () => unreadable429 }),
    now: () => 1_000,
  });
  let timeout;
  try {
    await assert.rejects(
      Promise.race([
        provider429.fetchUsage({ model: codex, signal: new AbortController().signal }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("timed out reading 429 body")), 100); }),
      ]),
      error => error.name === "SubscriptionCooldownError" && error.retryAt === 121_000,
    );
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(cancelled429, true);
});

test("fetch transport rejects redirects and bodies over the fixed bound", async () => {
  const redirectTransport = createFetchSubscriptionTransport({
    fetch: async (_url, init) => {
      assert.equal(init.redirect, "manual");
      return new Response("", { status: 302, headers: { location: "https://evil.example" } });
    },
  });
  await assert.rejects(
    redirectTransport.request({ url: CODEX_USAGE_URL, method: "GET", headers: {}, redirect: "manual", signal: new AbortController().signal }),
    error => error.message === "Subscription usage request failed",
  );

  const largeTransport = createFetchSubscriptionTransport({
    fetch: async () => new Response("x".repeat(MAX_USAGE_BODY_BYTES + 1), { status: 200 }),
  });
  await assert.rejects(
    largeTransport.request({ url: CODEX_USAGE_URL, method: "GET", headers: {}, redirect: "manual", signal: new AbortController().signal }),
    error => error.message === "Subscription usage response too large",
  );
});

test("malformed and out-of-range provider payloads fail generically", async () => {
  const malformed = createCodexUsageProvider({
    modelRegistry: registry(),
    transport: transportWith([{ status: 200, headers: {}, body: "not-json token=secret" }]),
  });
  await assert.rejects(
    malformed.fetchUsage({ model: codex, signal: new AbortController().signal }),
    error => error.message === "Invalid subscription usage response",
  );

  const invalidPercent = createAnthropicUsageProvider({
    modelRegistry: registry(),
    transport: transportWith([{ status: 200, headers: {}, body: JSON.stringify({ five_hour: { utilization: 101 } }) }]),
  });
  await assert.rejects(
    invalidPercent.fetchUsage({ model: claude, signal: new AbortController().signal }),
    error => error.message === "Invalid subscription usage response",
  );
});
