# agent-config

Portable Pi configuration. Node 22.23.2, Pi 0.85.1, dependency-free ESM installer scripts.

- New base: tintinweb pi-subagents, pi-tasks, pi-supervisor; observational-memory;
  local questions, browser and subscription usage. Native npm: pi-mcp-adapter 2.33.0,
  pi-web-access 0.29.0 and pi-ollama 0.1.7. Ten packages: seven base plus three native.
- `manifests/active-release.json` pins exact harness/subagents/memory commits. Tasks and
  supervisor are vendored source snapshots; revisions/licenses in `manifests/tintinweb.json`
  and THIRD_PARTY_NOTICES.md. Do not patch upstream source casually. The public memory
  lock omits two @emnapi optional peers; manifests/memory-lock-additions.json applies only
  to its exact original commit/hash, without depending on an unpublished memory commit.
  The subagents panel uses the upstream `aboveEditor` placement. Do not patch the
  sealed subagents snapshot to change its position.
- `npm run bootstrap` is read-only preview. `--apply` fetches pinned sources if needed,
  prepares development and runtime trees from locks, verifies, then activates. A matching
  active release is validated but never reinstalled/retested. No Node/Pi/browser downloads.
- `--migrate-base` authorizes backed-up retirement of old global agent Markdown profiles,
  interactive-subagents registration and the Pi RTK hook. Preserve credentials, sessions,
  memories, unrelated extensions/settings and external RTK executables/configuration.
- Existing `~/.agents` files, especially SYSTEM.md, are preserved. New homes receive defaults.
  Global AGENTS.md is a minimal shared-policy adapter; do not hide foreign global context.
- Activation is conflict-aware and backed up, not a multi-file transaction. Never mutate
  sealed releases; prepare another candidate. Source, dependencies, runner and runtime
  checksums are validated. Keep old releases untouched for historical recovery.
- `npm test`: offline root regressions in temporary homes. `npm run deps -- --apply` prepares
  five local packages with npm ci --ignore-scripts. `npm run verify`: six local groups,
  not the full release. Full candidate: fourteen base package suites and five runtime checks.
  Upstream subagent tests require a Git root: disposable metadata exists only during that
  development suite, with temporary HOME outside it so non-Git fixtures remain non-Git.
  A verified candidate has no development tree; bootstrap must not demand it or reinstall.
- Verification strips credentials, proxies, MCP/browser overrides and legacy subagent policy;
  forces PI_OFFLINE=1, PI_E2E_LIVE=0 and PI_RUN_LIVE_SUBAGENT_TESTS=0. Never copy auth.json
  into fixtures. Scripted faux models are not authenticated end-to-end model tests.
- Modern runtime smoke uses installed exact Pi by official CLI/RPC and a synthetic provider:
  TaskExecute/result delivery, local child tool scopes, Luna medium priority and Sol high
  request serialization, supervisor startup, and shared-process child execution. Do not replace this with mocks.
- `agents/` provides Explore/general-purpose (Luna medium) and Plan/deep-implementation/
  deep-review (Sol high). All append inherited instructions, use explicit local tool lists,
  disable skills and nesting, and set turn defaults. Read-only roles never receive Bash.
- Luna profiles load only the explicit `~/.pi/agent/agents/luna-fast.mjs` path. Its provider
  hook requests priority only for Codex Luna, with no tools, I/O or logging. Do not put it
  in global extension discovery or change memory/parent models. Sol loads no extensions.
- Child scope regressions must exclude MCP/browser/web/task/supervisor tools, including
  browser_fill. Bash is not a network sandbox. Model/turn defaults can be overridden by
  the parent; do not describe them as hard quotas or assert server-granted priority.
- Do not restore the legacy global registry bridges. The new runtime uses SDK sessions in
  process and native extension/tool scoping. MCP loads directly from npm, with no wrapper.
  MCP configs can spawn/network on startup. Merge only footer defaults; preserve servers.
- Subagent concurrency uses separate pools: six background and two foreground agents.
  Nested delegation remains disabled; child MCP permissions and model defaults are unchanged.
- Worktree automation is disabled because upstream commits with --no-verify. Use manual Git
  worktrees with hooks. Use tasks to track multi-stage work. Run workflows only on an explicit
  user request and start supervision only with explicit user authorization for that outcome.
  Tasks use session-global storage; auto-cascade is off. Supervisor steering is advisory and
  cannot authorize destructive/remote operations for the user.
- Native packages use config/pi.settings.json npm entries and native/package*.json locks.
  Dependencies use --legacy-peer-deps like Pi, plus --ignore-scripts. Their full prefix is
  included in the release runtime digest and copied intact to ~/.pi/agent/npm on activation.
  Unexpected prefix changes cause refusal, never overwrite. Runtime smoke verifies native
  tools, Ollama commands, absence of Bigpowers resources, and MCP footer off.
  Old sealed releases remain valid; do not remove their files to remove a registration.
- Bigpowers is no longer installed. Historical release checks retain its old allowlist
  rules, but current defaults and native locks exclude it. Do not reinstall it or run
  its setup commands automatically. Native package retirement removes only unchanged
  registrations from the prior release; modified registrations produce a conflict.
- Curated skills live in `pi-skills/`, not in the native npm prefix. Their provenance and
  hashes are in `manifests/curated-skills.json`. Keep the MIT notice and required assets.
  Project them only to `~/.pi/agent/skills` to avoid duplicate registrations.
- `harness-manifest.json` is generated audit data, not a version authority. Update source
  and prepare a verified release instead of editing deployed pins. Compatibility checks
  use `scripts/harness-compatibility.mjs`. Keep its source digest aligned with
  `releases.mjs:manifestDigest`. Known legacy adoption uses exact hashes only.
  See `docs/harness-compatibility.md` for the installed verification command.
- Web-access defaults: no cookies, curator, hosted fetch fallback or GitHub clone; PDF uses
  local unpdf. Search can reuse Codex auth and contacts providers. Keep pdf-reader for local
  rendering and youtube-transcript for actual captions. analyze-sessions is our local code.
- Browser retains public-network restrictions and never downloads Chromium,
  uses no personal profile, and needs an installed Chrome/Edge. Its interactive/mouse smoke
  is separate from offline verification. MCP has no inherited browser network sandbox.
- pi-ollama discovers models at load time even with PI_OFFLINE. Verification strips
  inherited OLLAMA settings and uses a fetch-blocked port; it checks command registration,
  not inference or an authenticated Ollama server. Runtime keeps the user's Ollama settings.
- Subscription usage polls only in TUI, uses Pi OAuth APIs, and never reads auth.json itself.
  Offline checks do not establish authenticated quota or footer clicks. Memory retains its
  existing Luna-high model configuration and incurs model usage when it observes/compacts.
- Carbon UI sources live in `extensions/` and `themes/`; see `docs/carbon-ui.md`.
  `npm run test:carbon` runs rendering and execution-parity tests after vendor dependencies
  are prepared. Keep the original task entrypoint disabled when the Carbon task adapter
  is loaded; duplicate registration loses the custom rendering. Do not hardcode release
  paths in extensions or change the execution functions to alter presentation.
- Never version secrets, sessions, generated memories, caches, source maps or backups.
  Publication uses reviewed refs and noreply identity; never push --all/--mirror. Source
  checkouts may retain private historical branches. Leave external worktrees alone.
