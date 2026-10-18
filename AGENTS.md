# agent-config

Portable Pi configuration. Node 22.23.2, Pi 1.3.0, dependency-free ESM installer scripts.

- New base: tintinweb pi-subagents, pi-tasks, pi-supervisor; observational-memory;
  local questions, browser and subscription usage. Native npm: pi-mcp-adapter 2.33.0,
  pi-web-access 0.29.0, pi-ollama 0.1.7 and pi-claude-bridge 0.8.0. Eleven packages:
  seven base plus four native.
- `manifests/active-release.json` pins exact harness/subagents/memory commits. Tasks and
  supervisor are vendored source snapshots; revisions/licenses in `manifests/tintinweb.json`
  and THIRD_PARTY_NOTICES.md. Do not patch upstream source casually. The pinned memory
  commit's lock already includes the two @emnapi optional peers; no lock patch is needed.
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
  checksums are validated. Never modify a release; inactive releases may be deleted.
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
  TaskExecute/result delivery, local child tool scopes, Sol high and Astra low request
  serialization, supervisor startup, and shared-process child execution. Do not replace this with mocks.
  Policy comes from profile content, not hook presence. Historical Luna priority checks remain.
- `agents/` provides Explore/general-purpose (Sol high) and Plan/deep-implementation/
  deep-review (Astra low). All append inherited instructions, use explicit local tool lists,
  disable extensions, skills and nesting, and set turn defaults. Read-only roles never receive Bash.
- Keep `agents/luna-fast.mjs` unchanged and inactive for historical resource compatibility.
  Historical Luna profiles load its explicit home-relative path. The hook requests priority
  only for Codex Luna, with no tools, I/O or logging. Never discover it globally or change
  memory/parent models.
- Child scope regressions must exclude MCP/browser/web/task/supervisor tools, including
  browser_fill. Bash is not a network sandbox. Model/turn defaults can be overridden by
  the parent; do not describe them as hard quotas or assert server-granted priority.
- Do not restore the legacy global registry bridges. The new runtime uses SDK sessions in
  process and native extension/tool scoping. MCP loads directly from npm, with no wrapper.
  MCP configs can spawn/network on startup. Merge only footer defaults; preserve servers.
- `manifests/subagents-notifications.json` applies exact hash-gated delivery changes to
  the pinned source during candidate preparation, never to a source cache or sealed release.
  Actionable boundaries require Pi 0.87.1; upstream development types remain 0.84.2.
  The SDK regression covers consumed, unread, grouped, idle and shutdown cases.
  Existing mock fixtures need session startup and `isIdle`; do not weaken the production
  check to fit an incomplete mock. See `docs/notification-delivery.md`.
- Subagent concurrency uses separate pools: six background and two foreground agents.
  Nested delegation remains disabled; child MCP permissions and model defaults are unchanged.
- Worktree automation is disabled because upstream commits with --no-verify. Use manual Git
  worktrees with hooks. Use tasks to track multi-stage work. Run workflows only on an explicit
  user request and start supervision only with explicit user authorization for that outcome.
  Tasks use session-global storage; auto-cascade is off. Supervisor steering is advisory and
  cannot authorize destructive/remote operations for the user.
- Native packages use config/pi.settings.json npm entries and native/package*.json locks.
  Add them with `npm run add-native`, never with `pi install`; then `npm run pin-recipe`.
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
  hashes are in `manifests/curated-skills.json`. Its `source` retains Bigpowers provenance;
  `adaptations` pins Hermes-derived methods by commit, source hash and change notes.
  Keep all applicable MIT notices and required assets. Project skills only to
  `~/.pi/agent/skills` to avoid duplicate registrations. See `docs/hermes-adoption.md`.
- Reviewed learning is a native extension, not another memory provider. It stages
  evidence-backed procedures and requires interactive human approval for owned learned
  skills. Never version its pending records or approved private skills, modify SYSTEM.md,
  replace curated/user skills through it, or describe its gate as an OS sandbox.
- `harness-manifest.json` is generated audit data, not a version authority. Update source
  and prepare a verified release instead of editing deployed pins. Compatibility checks
  use `scripts/harness-compatibility.mjs`. Keep its source digest aligned with
  `releases.mjs:manifestDigest`. Known legacy adoption uses exact hashes only.
  See `docs/harness-compatibility.md` for the installed verification command.
- Web-access defaults: no cookies, curator, hosted fetch fallback or GitHub clone; PDF uses
  local unpdf. Search can reuse Codex auth and contacts providers. Keep pdf-reader for local
  rendering and youtube-transcript for actual captions. analyze-sessions is our local code.
- Browser retains public-network restrictions and never downloads Chromium,
  uses no personal profile, and needs an installed Chrome/Edge or Playwright Chromium.
  Its interactive/mouse smoke is separate from offline verification. MCP has no inherited
  browser network sandbox.
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
