import type { Api, Model } from "@earendil-works/pi-ai";

export type SubscriptionModel = Model<Api>;

export interface SubscriptionTarget {
  key: "openai-codex" | "anthropic" | "unsupported";
  label: "Codex" | "Claude" | "Subscription";
}

export interface SubscriptionQuotaWindow {
  label: string;
  usedPercent: number;
  resetsAt?: number;
}

export interface SubscriptionTokenSpend {
  usedTokens: number;
  periodLabel?: string;
  resetsAt?: number;
}

export interface KnownSubscriptionUsage {
  kind: "known";
  windows: readonly SubscriptionQuotaWindow[];
  tokenSpend?: SubscriptionTokenSpend;
}

export interface UnavailableSubscriptionUsage {
  kind: "unavailable";
}

export type SubscriptionUsageResult = KnownSubscriptionUsage | UnavailableSubscriptionUsage;

export interface SubscriptionUsageRequest {
  model: SubscriptionModel;
  signal: AbortSignal;
}

export class SubscriptionCooldownError extends Error {
  readonly retryAt: number;

  constructor(retryAt: number) {
    super("Subscription usage is temporarily rate-limited");
    this.name = "SubscriptionCooldownError";
    this.retryAt = retryAt;
  }
}

export interface SubscriptionUsageProvider {
  readonly id: string;
  supports(model: SubscriptionModel): boolean;
  fetchUsage(request: SubscriptionUsageRequest): Promise<SubscriptionUsageResult>;
}

export interface SubscriptionUsageTransport<TRaw> {
  fetch(request: SubscriptionUsageRequest): Promise<TRaw>;
}

export interface TransportUsageProviderOptions<TRaw> {
  id: string;
  supports(model: SubscriptionModel): boolean;
  transport: SubscriptionUsageTransport<TRaw>;
  parseResponse(response: TRaw): SubscriptionUsageResult;
}

export function createTransportUsageProvider<TRaw>(
  options: TransportUsageProviderOptions<TRaw>,
): SubscriptionUsageProvider {
  return {
    id: options.id,
    supports: options.supports,
    async fetchUsage(request) {
      request.signal.throwIfAborted();
      const response = await options.transport.fetch(request);
      request.signal.throwIfAborted();
      return options.parseResponse(response);
    },
  };
}

export function resolveSubscriptionTarget(model: SubscriptionModel | undefined): SubscriptionTarget | undefined {
  if (model?.provider === "openai-codex") return { key: "openai-codex", label: "Codex" };
  if (model?.provider === "anthropic" || model?.provider === "claude-bridge") return { key: "anthropic", label: "Claude" };
  return undefined;
}

function requireFinite(value: number): void {
  if (!Number.isFinite(value)) throw new Error("Invalid subscription usage response");
}

function requireDisplayLabel(value: string): void {
  if (!value.trim() || /[\r\n\t\p{Cc}]/u.test(value)) {
    throw new Error("Invalid subscription usage response");
  }
}

export function normalizeSubscriptionUsage(result: SubscriptionUsageResult, fetchedAt: number): {
  fetchedAt: number;
  windows: readonly SubscriptionQuotaWindow[];
  tokenSpend?: SubscriptionTokenSpend;
} | undefined {
  if (result.kind === "unavailable") return undefined;
  if (result.windows.length === 0) throw new Error("Invalid subscription usage response");

  const windows = result.windows.map(window => {
    requireDisplayLabel(window.label);
    requireFinite(window.usedPercent);
    if (window.usedPercent < 0 || window.usedPercent > 100) {
      throw new Error("Invalid subscription usage response");
    }
    if (window.resetsAt !== undefined) {
      requireFinite(window.resetsAt);
      if (window.resetsAt < 0) throw new Error("Invalid subscription usage response");
    }
    return { ...window, label: window.label.trim() };
  });

  let tokenSpend: SubscriptionTokenSpend | undefined;
  if (result.tokenSpend) {
    requireFinite(result.tokenSpend.usedTokens);
    if (result.tokenSpend.usedTokens < 0) throw new Error("Invalid subscription usage response");
    if (result.tokenSpend.periodLabel !== undefined) requireDisplayLabel(result.tokenSpend.periodLabel);
    if (result.tokenSpend.resetsAt !== undefined) {
      requireFinite(result.tokenSpend.resetsAt);
      if (result.tokenSpend.resetsAt < 0) throw new Error("Invalid subscription usage response");
    }
    tokenSpend = {
      ...result.tokenSpend,
      periodLabel: result.tokenSpend.periodLabel?.trim(),
    };
  }

  return { fetchedAt, windows, ...(tokenSpend ? { tokenSpend } : {}) };
}
