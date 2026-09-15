import {
  normalizeSubscriptionUsage,
  resolveSubscriptionTarget,
  SubscriptionCooldownError,
  type SubscriptionModel,
  type SubscriptionTarget,
  type SubscriptionUsageProvider,
} from "./provider.ts";

export interface CachedSubscriptionUsage {
  fetchedAt: number;
  windows: readonly {
    label: string;
    usedPercent: number;
    resetsAt?: number;
  }[];
  tokenSpend?: {
    usedTokens: number;
    periodLabel?: string;
    resetsAt?: number;
  };
}

export type SubscriptionUsageState =
  | { kind: "loading"; target: SubscriptionTarget }
  | { kind: "known"; target: SubscriptionTarget; usage: CachedSubscriptionUsage }
  | { kind: "stale"; target: SubscriptionTarget; usage: CachedSubscriptionUsage }
  | { kind: "unavailable"; target: SubscriptionTarget }
  | { kind: "error"; target: SubscriptionTarget };

export type RefreshOutcome = "started" | "coalesced" | "throttled" | "unavailable" | "disposed";

export interface IntervalHandle {
  unref?(): void;
}

export interface SubscriptionScheduler {
  setInterval(callback: () => void, intervalMs: number): IntervalHandle;
  clearInterval(handle: IntervalHandle): void;
  setTimeout(callback: () => void, delayMs: number): IntervalHandle;
  clearTimeout(handle: IntervalHandle): void;
}

export interface SubscriptionUsageControllerOptions {
  providers?: readonly SubscriptionUsageProvider[];
  pollIntervalMs?: number;
  minRefreshIntervalMs?: number;
  now?: () => number;
  scheduler?: SubscriptionScheduler;
  onChange?: (state: SubscriptionUsageState) => void;
}

const UNSUPPORTED_TARGET: SubscriptionTarget = { key: "unsupported", label: "Subscription" };

const defaultScheduler: SubscriptionScheduler = {
  setInterval(callback, intervalMs) {
    return setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

type ActiveRequest = {
  generation: number;
  key: string;
  abortController: AbortController;
  promise: Promise<void>;
};

type DeferredRefresh = {
  generation: number;
  key: string;
  handle: IntervalHandle;
};

export class SubscriptionUsageController {
  private readonly providers: readonly SubscriptionUsageProvider[];
  private readonly pollIntervalMs: number;
  private readonly minRefreshIntervalMs: number;
  private readonly now: () => number;
  private readonly scheduler: SubscriptionScheduler;
  private readonly onChange?: (state: SubscriptionUsageState) => void;
  private readonly cache = new Map<string, CachedSubscriptionUsage>();
  private readonly lastAttempt = new Map<string, number>();
  private readonly cooldownUntil = new Map<string, number>();
  private state: SubscriptionUsageState = { kind: "unavailable", target: UNSUPPORTED_TARGET };
  private model: SubscriptionModel | undefined;
  private provider: SubscriptionUsageProvider | undefined;
  private requestKey: string | undefined;
  private generation = 0;
  private started = false;
  private disposed = false;
  private timer: IntervalHandle | undefined;
  private activeRequest: ActiveRequest | undefined;
  private deferredRefresh: DeferredRefresh | undefined;

  constructor(options: SubscriptionUsageControllerOptions = {}) {
    this.providers = options.providers ?? [];
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.minRefreshIntervalMs = options.minRefreshIntervalMs ?? 15_000;
    this.now = options.now ?? Date.now;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onChange = options.onChange;
    if (this.pollIntervalMs <= 0 || this.minRefreshIntervalMs < 0) {
      throw new Error("Subscription refresh intervals must be positive");
    }
  }

  getState(): SubscriptionUsageState {
    return this.state;
  }

  start(model: SubscriptionModel | undefined): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.timer = this.scheduler.setInterval(() => {
      void this.requestRefresh();
    }, this.pollIntervalMs);
    this.timer.unref?.();
    this.setModel(model);
  }

  setModel(model: SubscriptionModel | undefined): void {
    if (this.disposed) return;

    const target = resolveSubscriptionTarget(model);
    let provider: SubscriptionUsageProvider | undefined;
    if (target && model) {
      try {
        provider = this.providers.find(candidate => candidate.supports(model));
      } catch {
        this.replaceSelection(model, undefined, undefined);
        this.publish({ kind: "error", target });
        return;
      }
    }

    if (!target || !model || !provider) {
      this.replaceSelection(model, undefined, undefined);
      this.publish({ kind: "unavailable", target: target ?? UNSUPPORTED_TARGET });
      return;
    }

    const key = `${provider.id}:${target.key}`;
    if (key === this.requestKey) {
      this.model = model;
      this.provider = provider;
      if (!this.activeRequest && !this.deferredRefresh && this.started) {
        this.scheduleModelRefresh();
      }
      return;
    }

    this.replaceSelection(model, provider, key);
    const cached = this.cache.get(key);
    this.publish(cached
      ? { kind: "stale", target, usage: cached }
      : { kind: "loading", target });
    if (this.started) this.scheduleModelRefresh();
  }

  async requestRefresh(): Promise<RefreshOutcome> {
    if (this.disposed) return "disposed";
    if (!this.provider || !this.model || !this.requestKey) return "unavailable";
    if (this.activeRequest?.key === this.requestKey) return "coalesced";

    const cooldownUntil = this.cooldownUntil.get(this.requestKey);
    if (cooldownUntil !== undefined) {
      if (this.now() < cooldownUntil) return "throttled";
      this.cooldownUntil.delete(this.requestKey);
    }
    const attemptedAt = this.lastAttempt.get(this.requestKey);
    if (attemptedAt !== undefined && this.now() - attemptedAt < this.minRefreshIntervalMs) {
      return "throttled";
    }

    if (this.deferredRefresh?.key === this.requestKey) this.cancelDeferredRefresh();
    await this.beginRefresh();
    return "started";
  }

  async whenIdle(): Promise<void> {
    while (this.activeRequest) {
      const active = this.activeRequest;
      await active.promise;
      if (this.activeRequest === active) return;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.abortActiveRequest();
    this.cancelDeferredRefresh();
    if (this.timer) this.scheduler.clearInterval(this.timer);
    this.timer = undefined;
  }

  private publish(state: SubscriptionUsageState): void {
    this.state = state;
    try {
      this.onChange?.(state);
    } catch {
      // Rendering notifications are best-effort and must not break refresh cleanup.
    }
  }

  private replaceSelection(
    model: SubscriptionModel | undefined,
    provider: SubscriptionUsageProvider | undefined,
    key: string | undefined,
  ): void {
    this.generation++;
    this.abortActiveRequest();
    this.cancelDeferredRefresh();
    this.model = model;
    this.provider = provider;
    this.requestKey = key;
  }

  private abortActiveRequest(): void {
    this.activeRequest?.abortController.abort();
    this.activeRequest = undefined;
  }

  private cancelDeferredRefresh(): void {
    if (!this.deferredRefresh) return;
    this.scheduler.clearTimeout(this.deferredRefresh.handle);
    this.deferredRefresh = undefined;
  }

  private scheduleModelRefresh(): void {
    const key = this.requestKey;
    if (!key || this.disposed || this.activeRequest?.key === key || this.deferredRefresh?.key === key) return;
    const attemptedAt = this.lastAttempt.get(key);
    const minimumRemaining = attemptedAt === undefined
      ? 0
      : this.minRefreshIntervalMs - (this.now() - attemptedAt);
    const cooldownRemaining = (this.cooldownUntil.get(key) ?? 0) - this.now();
    const remaining = Math.max(minimumRemaining, cooldownRemaining);
    if (remaining <= 0) {
      void this.beginRefresh();
      return;
    }

    const generation = this.generation;
    const handle = this.scheduler.setTimeout(() => {
      const deferred = this.deferredRefresh;
      if (!deferred || deferred.handle !== handle) return;
      this.deferredRefresh = undefined;
      if (this.disposed || generation !== this.generation || key !== this.requestKey) return;
      void this.requestRefresh();
    }, remaining);
    handle.unref?.();
    this.deferredRefresh = { generation, key, handle };
  }

  private beginRefresh(): Promise<void> {
    const provider = this.provider;
    const model = this.model;
    const key = this.requestKey;
    if (!provider || !model || !key || this.disposed) return Promise.resolve();
    if (this.activeRequest?.key === key) return this.activeRequest.promise;

    const generation = this.generation;
    const target = resolveSubscriptionTarget(model) ?? UNSUPPORTED_TARGET;
    const abortController = new AbortController();
    this.lastAttempt.set(key, this.now());

    const active: ActiveRequest = {
      generation,
      key,
      abortController,
      promise: Promise.resolve(),
    };
    this.activeRequest = active;
    active.promise = (async () => {
      try {
        const result = await provider.fetchUsage({ model, signal: abortController.signal });
        if (abortController.signal.aborted || this.disposed || generation !== this.generation) return;
        const normalized = normalizeSubscriptionUsage(result, this.now());
        this.cooldownUntil.delete(key);
        if (!normalized) {
          this.publish({ kind: "unavailable", target });
          return;
        }
        this.cache.set(key, normalized);
        this.publish({ kind: "known", target, usage: normalized });
      } catch (error) {
        if (abortController.signal.aborted || this.disposed || generation !== this.generation) return;
        if (error instanceof SubscriptionCooldownError && error.retryAt > this.now()) {
          this.cooldownUntil.set(key, error.retryAt);
        }
        const cached = this.cache.get(key);
        this.publish(cached
          ? { kind: "stale", target, usage: cached }
          : { kind: "error", target });
      } finally {
        if (this.activeRequest === active) this.activeRequest = undefined;
      }
    })();
    return active.promise;
  }
}
