# Selective research child tools

## Status

Source infrastructure only. No profiles, release pins, installed settings, or active releases changed.
Browser integration remains separate.

The bridge uses `globalThis[Symbol.for('pi.subagents.tool-extension-registry')].registerToolExtension(name, absoluteFile)`.
It neither imports the subagent runtime nor initializes a parent web provider.

## Loading and packaging

`extensions/research-tools/index.ts` registers backing paths during initialization and again on `session_start`.
This handles a registry initialized later during extension loading, before session startup.
An absent registry leaves the bridge inert.

Pi auto-discovers only `index.ts` in this directory. The runtime explicitly loads `provider.ts` for selected child tools.
The SDK regression checks auto-discovery and both registry load orders.

Existing release inventory includes the `extensions/` prefix. Existing installer projection includes all three implementation files.
The regression checks installer planning without applying it. No packaging manifest change is needed.

The provider resolves candidate `native/node_modules/pi-web-access` or projected personal `npm/node_modules/pi-web-access`.
A present candidate contract takes precedence; missing candidate dependencies never fall back to another installation.
Package identity, exact prefix dependency version, and `pi.extensions: ["./dist"]` must match before import.
The wrapper uses `dist/index.js`; TypeScript loading preserves Pi's host-module aliases.

## Saved scope

The provider requires absolute `PI_SUBAGENT_SESSION` and `PI_CODING_AGENT_DIR`, plus `PI_SUBAGENT_AGENT`.
It reads `${PI_SUBAGENT_SESSION}.loadout.json`, bounded to 64 KiB.
Saved `agent` and `agentDir` must exactly match the environment.
`toolAllowlist` must be an explicit, nonempty comma-separated list without duplicates, whitespace, or wildcards.

Only its intersection with these names registers:

- `web_search`
- `fetch_content`
- `get_search_content`
- `source_check`

Other saved built-ins grant nothing through this wrapper. The wrapper never reads edited profiles.
Scope is revalidated before forwarded hooks, registration, activation, persistence, and execution.
A running instance cannot expand beyond its initial research scope.
Native frozen binding propagation remains a separate prerequisite for nested restricted coordinators; this work does not verify that integration.

## Effective personal policy

Preflight runs before upstream import/initialization, before forwarded lifecycle hooks, and before every execution.
It never writes configuration or changes environment variables.

The accepted base configuration is `config/web-search.json`.
Only `workflow`, `toolActivation`, `allowBrowserCookies`, `githubClone`, `pdf`, `fetchRouting`,
`searchProvider`, `braveApiKey`, and `searxngBaseUrl` are accepted keys.
Unknown configuration fails closed rather than silently inheriting unreviewed behavior.

Cookie access, authentication profiles, cloning, hosted fetch fallback, curator workflows, proxy overrides,
custom tool names, executable credential sources, and SSRF exemptions are rejected.
Cookie/proxy environment overrides and provider endpoint overrides are rejected.
Effective configuration or Brave credential changes require restarting the child because upstream caches some settings.
Errors identify the unavailable capability without printing policy contents or credential values.

Explicit personal `searchProvider: "brave"` or `"searxng"` remains supported.
SearXNG requires a configured public HTTP(S) endpoint; Brave requires its separately configured provider credential.

With the managed defaults unchanged, search and source checking select OpenAI only when `ctx.model.provider === 'openai'`.
The selected model and resolved authentication must use `https://api.openai.com/v1`, optionally ending with `/`.
Missing native model/auth, custom endpoints, standalone `OPENAI_API_KEY`, and OpenAI endpoint environment overrides fail closed.
Neither Codex nor gateway models are considered. Caller model/provider overrides remain unavailable.

Only native OpenAI search execution receives the current model and a four-method registry facade.
`getAll()` and `getAvailable()` return only that exact model object, without reading the full inventory.
`getApiKeyAndHeaders(model)` accepts only that identity and returns its validated, per-execution native authentication snapshot.
Native authentication resolves before upstream execution, preventing upstream error handling from selecting standalone credentials.
`isUsingOAuth(model)` delegates only for that same identity.
Scope and effective policy are rechecked after asynchronous authentication resolves.

UI, commands, shortcuts, MCP registration, and ambient tool-execution APIs remain unavailable.

## Tool restrictions

Search accepts up to four queries and ten results per query. Single query strings remain literal, including JSON-shaped strings.
Provider and model overrides are unavailable. Workflow is always `none`; automatic content fetching is disabled.
Source checking gathers search evidence without fetching discovered pages automatically.

Fetch accepts up to four public HTTP(S) URLs, using `readable` or `raw` mode.
Local paths, credentials in URLs, literal IP addresses, recognized video/image paths, YouTube, and GitHub URLs are refused.
The pinned upstream remains responsible for DNS and redirect SSRF checks.
Stored retrieval accepts bounded indices, offsets, search text, and page sizes.
Unsupported fields are rejected both by the exposed schema and execution validation.

The facade filters immediate and delayed registration and activation. `web_enable` never registers.
Upstream activation preserves already-active non-research tools appearing in the exact saved allowlist, including native coordination controls.
It cannot enable inactive non-research tools, even when their names appear in that allowlist.
Selected registered research tools remain filtered separately.
Upstream hooks receive a noninteractive context without SDK model credentials or ambient tool discovery.

## Verification

Run the synthetic SDK regression:

```sh
node --test test/research-tools.test.mjs
```

Run pinned upstream execution with mocked transport and DNS:

```sh
PI_RESEARCH_UPSTREAM_PACKAGE="$HOME/.pi/agent/npm/node_modules/pi-web-access" node --test test/research-tools.test.mjs
```

The latter executes all four pinned tools through the official SDK with synthetic web responses.
It also executes native OpenAI search and source checking against a mocked Responses endpoint using unchanged managed configuration.
Assertions verify exact active-model identity, request model, endpoint, control preservation, and denied authentication fallbacks.
Fixtures use isolated HOME and agent directories, synthetic authentication, blocked sockets, and blocked child processes.
No personal credentials, live provider requests, dependency installations, or desktop operations are involved.

Initial regression failed because the implementation was absent, then passed after implementation.
A later regression caught upstream expansion of JSON-shaped query strings; canonical query arrays fixed it.
Review regressions reproduced native control removal and missing managed-default search support before their fixes.

## Limits

This is a harness scope boundary, not an OS sandbox or protection against a same-user process forging environment or sidecars.
Preflight cannot guarantee immutability against concurrent hostile filesystem writes or changes during an upstream operation.
Already-running calls are not cancelled when scope changes; subsequent calls and hooks revalidate it.
Private configuration is read locally for validation, never copied into fixtures or modified.

Offline synthetic evidence does not establish authenticated provider behavior, quota behavior, native child launching, nested propagation, or candidate activation.
Forwarded hooks fail closed after unsafe policy changes, including shutdown; upstream cleanup may then be skipped until process exit.
