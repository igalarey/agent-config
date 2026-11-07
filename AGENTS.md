# agent-config

Portable Pi configuration with dependency-free ESM installer scripts.
Read `~/.agents/SYSTEM.md` and the applicable shared guides before work.

## Authority and scope

- `manifests/active-release.json` pins source commits. `manifests/packages.json` defines the host contract.
  `native/package-lock.json` fixes native dependencies. Do not duplicate version pins in instructions.
- Source, verified release, and installed projection are distinct layers. Edit source and prepare a candidate.
  Never patch a sealed release or treat generated `harness-manifest.json` as version authority.
- Pi owns session execution. Tasks is retired. Carbon changes presentation, not execution.
  Subagents has one runtime. Memory is historical evidence, not policy or permission.
  See `config/HARNESS-AUTHORITY.md` and `docs/harness-compatibility.md`.
- Existing shared policy, credentials, sessions, memories, unrelated settings, and user extensions are preserved.
  Never version private state, generated memories, caches, backups, or secrets.
- OpenRig is not this repository's default coordinator. Use its procedures only when the user explicitly selects an active OpenRig context.
  Do not infer that context from stale onboarding text or a missing skill registration.

## Development and releases

- `npm test` runs offline root regressions in temporary homes.
  `npm run verify` checks local package groups, not the complete candidate.
- `npm run deps -- --apply` prepares local development dependencies with `npm ci --ignore-scripts`.
  `npm run test:carbon` checks rendering and execution parity after dependencies are available.
- `npm run bootstrap` is read-only preview. `--apply` prepares and verifies a candidate before activation.
  It does not download Node, Pi, or a browser. A valid matching active release is not reinstalled or retested.
- Use `npm run add-native -- <package>@<exact-version>` for native packages, not `pi install`.
  Use `npm run pin-recipe` after coherent source commits. Native installs use `--legacy-peer-deps --ignore-scripts`.
- Activation is conflict-aware and backed up, not a multi-file transaction.
  Unexpected source or dependency changes cause refusal. Keep a verified rollback release.
- Full candidate verification checks package suites and the official host runtime.
  New gates must be mandatory for new candidates without invalidating historical sealed releases.
  Bind verification to source, dependencies, host, and runner hashes.
- `npm run doctor` is the complete installed health check: release integrity, verification, compatibility, and pending configuration.
  `npm run health` is its alias. The installed `verify-compatibility.mjs` checks inventory and compatibility only.
- Tests strip credentials, proxies, MCP/browser overrides, and legacy subagent policy.
  Use temporary HOME and `PI_CODING_AGENT_DIR` before importing extension code.
  Keep `PI_OFFLINE=1`, `PI_E2E_LIVE=0`, and `PI_RUN_LIVE_SUBAGENT_TESTS=0` during offline verification.
  Never copy authentication into fixtures. Synthetic providers do not establish authenticated behavior.
- Upstream suites can require disposable Git metadata. Keep their temporary HOME outside that Git root.
  Remove development trees only after successful candidate verification. Never reinstall a sealed runtime.

## Runtime boundaries

- Profiles in `agents/` define models, tool scopes, and turn defaults. Do not change parent or memory models as a side effect.
  Read-only roles have no Bash. Extensions, skills, and nested delegation remain disabled for these child profiles.
- Verify child tool scopes against actual registration, including deferred MCP tools and codemode.
  Tool lists and worktrees are not OS sandboxes. Model defaults are not hard spending quotas.
- Background and foreground pools are independent. Workflow concurrency is separate.
  Workflows and Supervisor require explicit user requests. Supervisor advice cannot authorize actions or declare incomplete work finished.
- Worktree automation remains disabled because upstream can commit with `--no-verify`.
  Use manual worktrees with hooks. Do not restore retired registry bridges or interactive-subagents.
- Completion delivery must remain retractable until committed. Preserve consumption, idle, grouping, shutdown, and branch-acknowledgment guarantees.
  Maintain a single delivery mechanism. See `docs/notification-delivery.md`.
- Release overlays require exact commit, original/result hashes, unique replacements, and non-overlap checks.
  Do not apply old overlays blindly to a new upstream revision.
- Tasks is absent from new candidates. Preserve private task data and configuration during retirement and rollback.
  Project configuration cannot grant itself trust or enable automation.
  Supervisor messages are advisory. Memory must not compact an uncovered prefix or trust worker exit status as a consolidation receipt.
- Native MCP can start processes and contact servers. Preserve private server configuration.
  Executor approvals belong to the human. Browser's public-network restrictions do not automatically apply to MCP.
- Browser uses an installed browser, no personal profile, and no automatic browser download.
  Web defaults avoid cookies, curator, hosted fallback, and GitHub cloning. Do not infer permission for publication from a skill.
- Ollama can discover models during extension loading. Offline checks must block or redirect discovery and warm-up.
  Subscription checks do not establish live quota behavior. Keep configured providers unchanged unless the task requires a migration.
- Keep `agents/luna-fast.mjs` inactive and unchanged for historical compatibility.
  Its hook requests priority only for Codex Luna and performs no I/O. Do not claim server-granted priority.

## Knowledge and UI

- Curated skills live in `pi-skills/` and project only to `~/.pi/agent/skills`.
  `manifests/curated-skills.json` records provenance, adaptations, hashes, and required assets. Retain applicable licenses.
- Common skills live in `skills/` and project to `~/.agents/skills`.
  External skills have a separate installer owner. Do not fabricate provenance or duplicate registrations.
- Skills are procedures, not permissions. Keep dependencies explicit and optional where appropriate.
  Prompts are thin entries to the same procedures. Do not restore Bigpowers to satisfy stale links.
- Learning stages evidence-backed proposals for interactive review. It never edits SYSTEM or replaces user/curated skills automatically.
  Approved private skills and pending records stay out of Git.
- Carbon lives in `extensions/` and `themes/`. New candidates contain neither Tasks nor its Carbon adapter.
  Keep historical owner/adapter checks intact. Verify task absence and active Carbon built-ins through the official SDK.
  Check actual candidate composition, not just isolated renderers. See `docs/carbon-ui.md`.
- Update operational docs when behavior changes. Label historical verification as historical.
  Local commits and integration are allowed. Push, publication, and remote history changes require an explicit user request.
