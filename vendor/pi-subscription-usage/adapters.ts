import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  SubscriptionCooldownError,
  type SubscriptionModel,
  type SubscriptionQuotaWindow,
  type SubscriptionUsageProvider,
  type SubscriptionUsageRequest,
  type SubscriptionUsageResult,
} from "./provider.ts";

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const ANTHROPIC_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export const MAX_USAGE_BODY_BYTES = 64 * 1024;
export const REQUEST_TIMEOUT_MS = 10_000;
const ANTHROPIC_DEFAULT_COOLDOWN_MS = 10 * 60_000;
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";

type AuthRegistry = Pick<ModelRegistry, "isUsingOAuth" | "getApiKeyAndHeaders">;

export interface SubscriptionHttpRequest {
  url: string;
  method: "GET";
  headers: Readonly<Record<string, string>>;
  redirect: "manual";
  signal: AbortSignal;
}

export interface SubscriptionHttpResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: string;
}

export interface SubscriptionHttpTransport {
  request(request: SubscriptionHttpRequest): Promise<SubscriptionHttpResponse>;
}

export interface FetchSubscriptionTransportOptions {
  fetch?: typeof globalThis.fetch;
  maxBodyBytes?: number;
}

export interface ProviderAdapterOptions {
  modelRegistry: AuthRegistry;
  transport?: SubscriptionHttpTransport;
  now?: () => number;
  timeoutMs?: number;
}

export interface DefaultProviderOptions {
  transport?: SubscriptionHttpTransport;
  now?: () => number;
  timeoutMs?: number;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

async function readBoundedBody(response: Response, maxBodyBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBodyBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Subscription usage response too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function createFetchSubscriptionTransport(
  options: FetchSubscriptionTransportOptions = {},
): SubscriptionHttpTransport {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_USAGE_BODY_BYTES;
  return {
    async request(request) {
      let response: Response;
      try {
        response = await fetchFn(request.url, {
          method: request.method,
          headers: request.headers,
          redirect: "manual",
          signal: request.signal,
        });
      } catch {
        if (request.signal.aborted) throw abortError();
        throw new Error("Subscription usage request failed");
      }
      const headers = { "retry-after": response.headers.get("retry-after") ?? undefined };
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error("Subscription usage request failed");
      }
      if (response.status < 200 || response.status >= 300) {
        void response.body?.cancel().catch(() => undefined);
        return { status: response.status, headers, body: "" };
      }
      const body = await readBoundedBody(response, maxBodyBytes);
      return { status: response.status, headers, body };
    },
  };
}

function isCanonicalCodex(model: SubscriptionModel): boolean {
  return model.provider === "openai-codex"
    && model.api === "openai-codex-responses"
    && model.baseUrl.replace(/\/+$/, "") === "https://chatgpt.com/backend-api";
}

function isCanonicalAnthropic(model: SubscriptionModel): boolean {
  return model.provider === "anthropic"
    && model.api === "anthropic-messages"
    && model.baseUrl.replace(/\/+$/, "") === "https://api.anthropic.com";
}

function extractCodexAccountId(token: string): string | undefined {
  try {
    const parts = token.split(".");
    const encoded = parts[1];
    if (parts.length !== 3 || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
      return undefined;
    }
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "="));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
    const auth = asRecord(payload[OPENAI_AUTH_CLAIM]);
    const accountId = auth?.chatgpt_account_id;
    return typeof accountId === "string" && /^[\x21-\x7e]+$/.test(accountId) ? accountId : undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseJson(body: string): Record<string, unknown> {
  try {
    const value = asRecord(JSON.parse(body));
    if (value) return value;
  } catch {
    // The caller receives only the stable schema error below.
  }
  throw new Error("Invalid subscription usage response");
}

function optionalPercent(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Invalid subscription usage response");
  }
  return value;
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid subscription usage response");
  }
  return value;
}

function optionalIsoReset(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid subscription usage response");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid subscription usage response");
  return parsed;
}

function safeExternalLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.trim();
  if (!label || /[\u0000-\u001f\u007f-\u009f]/.test(label)) return undefined;
  return label;
}

function parseRetryAfter(headers: Readonly<Record<string, string | undefined>>, now: number): number | undefined {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === "retry-after");
  const value = entry?.[1]?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds > 0 ? now + seconds * 1_000 : undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? date : undefined;
}

function codexWindow(value: unknown, now: number): SubscriptionQuotaWindow | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const duration = optionalNonNegativeNumber(record.limit_window_seconds);
  const usedPercent = optionalPercent(record.used_percent);
  if (duration === undefined || usedPercent === undefined) return undefined;
  const label = duration === 18_000 ? "5h" : duration === 604_800 ? "7d" : undefined;
  if (!label) return undefined;

  const resetAt = optionalNonNegativeNumber(record.reset_at);
  const resetAfter = optionalNonNegativeNumber(record.reset_after_seconds);
  const resetsAt = resetAt !== undefined
    ? resetAt * 1_000
    : resetAfter !== undefined
      ? now + resetAfter * 1_000
      : undefined;
  return { label, usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) };
}

export function parseCodexUsage(body: unknown, now: number): SubscriptionUsageResult {
  const root = asRecord(body);
  const rateLimit = asRecord(root?.rate_limit);
  if (!rateLimit) throw new Error("Invalid subscription usage response");
  const windows = [
    codexWindow(rateLimit.primary_window, now),
    codexWindow(rateLimit.secondary_window, now),
  ].filter((window): window is SubscriptionQuotaWindow => window !== undefined);
  if (!windows.length) throw new Error("Invalid subscription usage response");
  return { kind: "known", windows };
}

function legacyAnthropicWindow(key: string, value: unknown): SubscriptionQuotaWindow | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const usedPercent = optionalPercent(record.utilization);
  if (usedPercent === undefined) return undefined;
  const suffix = key === "five_hour"
    ? "5h"
    : key === "seven_day"
      ? "7d"
      : key.startsWith("seven_day_")
        ? safeExternalLabel(`7d ${key.slice("seven_day_".length).replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase())}`)
        : undefined;
  if (!suffix) return undefined;
  const resetsAt = optionalIsoReset(record.resets_at);
  return { label: suffix, usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) };
}

function currentAnthropicWindow(value: unknown): SubscriptionQuotaWindow | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const kind = record.kind;
  let label: string | undefined;
  if (kind === "session") label = "5h";
  if (kind === "weekly_all") label = "7d";
  if (kind === "weekly_scoped" && record.group === "weekly") {
    const modelName = safeExternalLabel(asRecord(asRecord(record.scope)?.model)?.display_name);
    if (modelName) label = `7d ${modelName}`;
  }
  if (!label) return undefined;
  const usedPercent = optionalPercent(record.percent);
  if (usedPercent === undefined) return undefined;
  const resetsAt = optionalIsoReset(record.resets_at);
  return { label, usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) };
}

export function parseAnthropicUsage(body: unknown): SubscriptionUsageResult {
  const root = asRecord(body);
  if (!root) throw new Error("Invalid subscription usage response");
  const windowsByLabel = new Map<string, SubscriptionQuotaWindow>();
  for (const key of ["five_hour", "seven_day"]) {
    const window = legacyAnthropicWindow(key, root[key]);
    if (window) windowsByLabel.set(window.label.toLowerCase(), window);
  }
  for (const key of Object.keys(root).filter(key => key.startsWith("seven_day_")).sort()) {
    const window = legacyAnthropicWindow(key, root[key]);
    if (window) windowsByLabel.set(window.label.toLowerCase(), window);
  }
  if (Array.isArray(root.limits)) {
    for (const value of root.limits) {
      const window = currentAnthropicWindow(value);
      if (window) windowsByLabel.set(window.label.toLowerCase(), window);
    }
  }
  const windows = [...windowsByLabel.values()];
  if (!windows.length) throw new Error("Invalid subscription usage response");
  return { kind: "known", windows };
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      () => {
        signal.removeEventListener("abort", onAbort);
        reject(new Error("Subscription authentication unavailable"));
      },
    );
  });
}

async function withDeadline<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal.aborted) throw abortError();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  parentSignal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onAbort);
  }
}

async function resolveOAuthToken(
  modelRegistry: AuthRegistry,
  model: SubscriptionModel,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!modelRegistry.isUsingOAuth(model)) return undefined;
  const auth = await abortable(modelRegistry.getApiKeyAndHeaders(model), signal);
  return auth.ok && typeof auth.apiKey === "string" && auth.apiKey.length > 0
    ? auth.apiKey
    : undefined;
}

function providerRequest(
  options: ProviderAdapterOptions,
  supports: (model: SubscriptionModel) => boolean,
  run: (
    token: string,
    request: SubscriptionUsageRequest,
    signal: AbortSignal,
    transport: SubscriptionHttpTransport,
    now: () => number,
  ) => Promise<SubscriptionUsageResult>,
): SubscriptionUsageProvider {
  const transport = options.transport ?? createFetchSubscriptionTransport();
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return {
    id: run.name,
    supports,
    async fetchUsage(request) {
      if (!supports(request.model)) return { kind: "unavailable" };
      return withDeadline(request.signal, timeoutMs, async signal => {
        const token = await resolveOAuthToken(options.modelRegistry, request.model, signal);
        if (!token) return { kind: "unavailable" };
        return run(token, request, signal, transport, now);
      });
    },
  };
}

async function fetchCodexUsage(
  token: string,
  _request: SubscriptionUsageRequest,
  signal: AbortSignal,
  transport: SubscriptionHttpTransport,
  now: () => number,
): Promise<SubscriptionUsageResult> {
  const accountId = extractCodexAccountId(token);
  if (!accountId) return { kind: "unavailable" };
  const response = await transport.request({
    url: CODEX_USAGE_URL,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "ChatGPT-Account-ID": accountId,
      Accept: "application/json",
    },
    redirect: "manual",
    signal,
  });
  if (response.status === 401 || response.status === 403) return { kind: "unavailable" };
  if (response.status === 429) {
    const retryAt = parseRetryAfter(response.headers, now());
    if (retryAt !== undefined) throw new SubscriptionCooldownError(retryAt);
    throw new Error("Subscription usage request failed");
  }
  if (response.status < 200 || response.status >= 300) throw new Error("Subscription usage request failed");
  return parseCodexUsage(parseJson(response.body), now());
}

async function fetchAnthropicUsage(
  token: string,
  _request: SubscriptionUsageRequest,
  signal: AbortSignal,
  transport: SubscriptionHttpTransport,
  now: () => number,
): Promise<SubscriptionUsageResult> {
  const response = await transport.request({
    url: ANTHROPIC_USAGE_URL,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      Accept: "application/json",
    },
    redirect: "manual",
    signal,
  });
  if (response.status === 401 || response.status === 403) return { kind: "unavailable" };
  if (response.status === 429) {
    const retryAt = parseRetryAfter(response.headers, now()) ?? now() + ANTHROPIC_DEFAULT_COOLDOWN_MS;
    throw new SubscriptionCooldownError(retryAt);
  }
  if (response.status < 200 || response.status >= 300) throw new Error("Subscription usage request failed");
  return parseAnthropicUsage(parseJson(response.body));
}

export function createCodexUsageProvider(options: ProviderAdapterOptions): SubscriptionUsageProvider {
  return providerRequest(options, isCanonicalCodex, fetchCodexUsage);
}

export function createAnthropicUsageProvider(options: ProviderAdapterOptions): SubscriptionUsageProvider {
  return providerRequest(options, isCanonicalAnthropic, fetchAnthropicUsage);
}

export function createDefaultSubscriptionProviders(
  modelRegistry: AuthRegistry,
  options: DefaultProviderOptions = {},
): readonly SubscriptionUsageProvider[] {
  return [
    createCodexUsageProvider({ modelRegistry, ...options }),
    createAnthropicUsageProvider({ modelRegistry, ...options }),
  ];
}
