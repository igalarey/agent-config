# pi-subscription-usage

Harness-owned optional extension package for Pi 0.87.1. It adds subscription usage beside the cwd/git marker in a compact custom footer and registers `/subscription-refresh` as a data-only refresh fallback.

## Behavior

- Selects **Codex** only for canonical direct `openai-codex` models and **Claude** only for canonical direct `anthropic` models.
- Requires Pi to report OAuth for the active model. API-key auth, unsupported models, and custom/proxy base URLs return `N/D` without an HTTP request.
- Renders provider-reported windows explicitly as used quota:

  ```text
  ~/src/project (main)  Codex · 5h 23% used · 7d 41% used · ↻
  ```

- Shows reset countdowns only when the response supplies a valid reset. At constrained widths, reset countdowns and the session name are dropped before either quota percentage or `↻`; cwd is truncated while preserving the branch when it fits.
- Shows token spend as a separate `tokens … used` field; it never derives a quota percentage from token or credit values.
- Supports `loading`, `known`, `stale`, `unavailable`, and `error` states without rendering raw provider errors.
- Refreshes approximately every 60 seconds. Requests are memory-cached, coalesced, subject to a 15-second minimum interval, aborted on provider/model-family switch or disposal, and protected from late-result races. Repeated model selection within one subscription shares in-flight work and schedules at most one `unref()`'d refresh after the minimum interval.
- Honors valid `Retry-After` cooldowns. Anthropic 429 responses without a useful delay impose a ten-minute cooldown. Polling, manual refresh, and model selection cannot bypass cooldowns, and adapters do not retry within one refresh cycle.
- The `↻` marker is clickable in fullscreen TUI mouse mode. Regular terminal mode does not expose footer mouse input, so `/subscription-refresh` is the fallback. Refresh never calls `ctx.reload()` or restarts Pi.
- Strips ANSI, OSC, APC, cursor, and C0/C1 controls from cwd, branch, session name, model/provider text, quota labels, and extension statuses before rendering. Status colors are intentionally discarded because there is no safe public helper that preserves styling while rejecting terminal control payloads selectively.

## Authentication and safety boundary

The extension calls `setFooter()` only when `ctx.mode === "tui"`. Default provider objects, controller timers, OAuth resolution, and HTTP transport are created or started only when the real TUI invokes that footer factory. RPC has `hasUI === true`, but is excluded by the exact mode check; JSON and print modes are excluded as well.

Adapters use only Pi 0.87.1's public `ModelRegistry` methods:

```ts
ctx.modelRegistry.isUsingOAuth(model)
await ctx.modelRegistry.getApiKeyAndHeaders(model)
```

`getApiKeyAndHeaders()` may refresh an OAuth token near expiry and persist the rotated credential through Pi's own credential store. The extension does not read `auth.json`, inspect session files, or reimplement refresh/persistence. Pi's method has no abort-signal parameter; the extension bounds its own wait and prevents any later auth result from starting HTTP after abort, while Pi's already-started resolver may still finish and persist its rotation.

Only the resolved `apiKey` access token is used. Registry-provided headers and base URLs are never forwarded. Credentials are sent solely to fixed first-party endpoints after canonical provider/API/base-URL checks:

- Codex: `GET https://chatgpt.com/backend-api/wham/usage`
- Anthropic: `GET https://api.anthropic.com/api/oauth/usage`

Every operation has a 10-second deadline. HTTP uses `redirect: "manual"`, rejects 3xx, discards non-2xx bodies before interpreting status headers, and bounds successful response bodies to 64 KiB. The package never prints tokens/account IDs, logs raw responses/errors, uses cookies, or makes background model calls. No authenticated/live test is included or was run.

### Codex adapter

The access-token JWT is decoded using the same three-part payload approach as installed Pi 0.87.1. `ChatGPT-Account-ID` comes only from `https://api.openai.com/auth.chatgpt_account_id`. Requests send Bearer auth, account ID, and JSON accept headers; custom auth headers are ignored.

The parser accepts only `rate_limit.primary_window` and `secondary_window` entries with both finite `used_percent` and a recognized `limit_window_seconds` (`18000` → `5h`, `604800` → `7d`). It accepts `reset_at` Unix seconds or `reset_after_seconds`; missing reset is omitted. Missing duration never implies a window, missing percentage never implies zero, and credits are not quota percentages.

First-party schema/endpoint references are pinned to OpenAI Codex commit `2cbbf0c9b542a36a1c3284b5e804917635b6f666`:

- `codex-rs/backend-client/src/client/rate_limit_resets.rs`
- `codex-rs/backend-client/src/types.rs`

The internal endpoint is unstable. Codex may require additional headers not established by the pinned evidence; failures degrade safely rather than guessing headers, cookies, or alternate endpoints.

### Anthropic adapter

Requests send `Authorization: Bearer`, `anthropic-beta: oauth-2025-04-20`, and `Accept: application/json`; they never send `x-api-key`.

The parser supports legacy `five_hour`, `seven_day`, and `seven_day_*` buckets with finite `utilization` and optional ISO `resets_at`. It also supports the observed new `limits[]` kinds `session`, `weekly_all`, and `weekly_scoped`; scoped entries additionally require `group: "weekly"` and `scope.model.display_name`. Current limits override same-label legacy duplicates while preserving global and scoped windows together. Unknown entries are ignored. A 2xx body without recognized fields is a schema error.

The OAuth usage endpoint and new schema are internal and undocumented. New-schema evidence is non-official and was reviewed from `anthony-hopkins/claude-usage-widget/app/src/main/sources/oauthUsage.ts`; no behavior beyond that evidence is inferred.

## Adapter contract

`SubscriptionModel` is the public `Model<Api>` type. A provider implements:

```ts
interface SubscriptionUsageProvider {
  readonly id: string;
  supports(model: SubscriptionModel): boolean;
  fetchUsage(request: {
    model: SubscriptionModel;
    signal: AbortSignal;
  }): Promise<
    | {
        kind: "known";
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
    | { kind: "unavailable" }
  >;
}
```

Every percentage must be finite and within `[0, 100]`; invalid values are rejected, never clamped. `SubscriptionHttpTransport`, `createFetchSubscriptionTransport()`, `createCodexUsageProvider()`, `createAnthropicUsageProvider()`, `createDefaultSubscriptionProviders()`, and `createSubscriptionUsageExtension()` are exported. Tests inject registry auth, transport, time, and scheduling. `providerFactory(modelRegistry)` is available when a wrapper needs registry-bound custom providers; the built-in default factory is invoked only inside the TUI footer factory.

## Public-footer compatibility

Pi's public `setFooter()` API replaces the built-in footer; it does not expose a decorator for the native component. The exported native `FooterComponent` requires an `AgentSession`, which extensions do not receive. This package rebuilds documented fields using only public `ExtensionContext` and `ReadonlyFooterDataProvider` APIs. It preserves cwd/branch/session name, aggregate usage/cost/cache rate, context usage, active provider/model/thinking, extension statuses, width handling, and branch rerendering.

Public extension APIs do not expose the built-in footer's auto-compaction marker, experimental-feature marker, or authoritative `$… (sub)` suffix, so those native-only details are not reproduced. A later extension that calls `setFooter()` also replaces this footer (and vice versa); there is no public footer composition API.

## Development

```sh
npm run typecheck
npm test
```

Tests are offline. They do not read real credentials, access the home configuration, or make authenticated/live requests.
