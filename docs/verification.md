# Verification: tintinweb base

This file supersedes the historical Windows/RTK/interactive-subagents evidence in Git history.
Target: Linux, Node 22.23.2, Pi 0.85.1. Verified and activated on 2026-09-14.

## Compact history baseline (current)

`h-fd27acfa7a6d-s-e955e29c51b7-m-c78b5148b110` is verified, sealed and active.
The root commit has exactly the same tracked tree as the previous main tip. No runtime
functionality was removed. The previous Git refs are preserved in a verified private
external bundle. The second commit updates the recipe and recovery documentation.
Fresh-home bootstrap fetched the pinned external sources, passed all fourteen package
checks and five official-runtime checks, and activated the new baseline release.
Root tests and all six local verification groups passed. Real-home activation preserved
other parent settings and private MCP content. Doctor and repeat bootstrap passed with
zero further changes. Earlier release evidence below is historical; its commits are in
the external archive, not ancestors of the compact main branch.

## Previous increased concurrency release

`h-95489bca5f1d-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.
Background concurrency is six; foreground concurrency is two. These are independent
pools, not a workflow-wide quota. Nested delegation, child MCP restrictions, model
and turn defaults are unchanged. Fresh-home bootstrap passed full release verification
and activation. Real-home activation confirmed effective limits and preserved parent
settings and private MCP content. Doctor and repeat bootstrap passed with zero further
changes. Root tests and all six local verification groups passed. Offline verification
does not measure throughput or provider quota behavior at the higher concurrency.

## Previous expanded Bigpowers skill policy

`h-5d480b1661df-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.

The working source retains the historical three skills and adds all 11 reviewed proposals:
`design-interface`, `deepen-architecture`, `elaborate-spec`, `grill-me`,
`define-language`, `diagnose-root`, `enforce-first`, `edit-document`, `simple-english`,
`smoke-test` and `validate-contracts`. There are no proposal exclusions. Bigpowers prompts
and extensions remain empty; the four project-owned English prompts, Astra parent, Luna
medium, Sol high and observational-memory settings are unchanged.

Runtime policy accepts only the exact new 14-skill list or the exact historical three-skill
list for an explicit filtered release. The unfiltered legacy branch remains available.
A regression rejects an otherwise current list widened with an unknown skill.

Local evidence: `npm test` passed 116 tests, skipped three and failed zero (119 total).
`npm run verify` passed all six local groups, including the same root result, 4 question
helper tests, 17 browser tests with one skip, 36 subscription tests, 404 task tests and 57
supervisor tests. A direct filesystem check matched all 14 configured paths and frontmatter
names against the installed unmodified Bigpowers 2.88.6 package; this is not loader evidence.

The candidate passed all fourteen package checks and five official-runtime checks,
including exact registration of the 14 skills and four manual prompts. Temporary-home
and real-home activation passed. Doctor passed, and effective settings match the source
allowlist exactly. Other parent settings and private MCP content were preserved.
Skill-specific external services and consumer-project helper scripts were not exercised;
the README records these prerequisites and limitations.

## Previous manual prompt release

`h-56c3c6b6e2a1-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.
Four English manual templates are installed: review, diagnose, compare-designs and
edit-document. The official runtime confirms all four global prompt registrations.
All fourteen package checks and five runtime checks passed. Root tests: 116 passed,
3 skipped, zero failures. Local verification passed all six groups. Temporary and real
activation passed; doctor passed. Installed prompt contents match the source, and
unrelated parent settings and private MCP content were preserved. Bigpowers filters
and model policies are unchanged. Restart Pi to load the templates.

## Previous trimmed policy release

`h-e6938db22211-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.
The candidate passed fourteen package checks and all five official-runtime checks.
Temporary-home activation and doctor passed. Real-home activation confirmed the exact
Bigpowers filters while preserving other parent settings and private MCP content.
Doctor and repeat bootstrap passed with zero further changes.
Root tests: 111 passed, 3 skipped, zero failures. Local verification: six groups passed.
The installer rollback regression covers removal of unchanged managed filters,
preservation of custom metadata and refusal of changed user filters.
The shared task-workflow guide was synchronized after checking its previous content,
with a backup; SYSTEM.md was not changed. Restart Pi to load the reduced catalog.

That release lowered Explore/general-purpose from Luna xhigh to Luna medium while retaining
the Luna-only priority hook. Sol remained high; Astra and observational-memory settings
were unchanged. Bigpowers was narrowed to `align-grid`, `context7-mcp` and
`security-review`, with prompts and extensions disabled. Current runtime assertions still
accept this exact historical contract, while releases that omit filters continue through
their unfiltered legacy validation branch.

`extract-design` is excluded because its instructions require the broader `grill-me` and
state/spec lifecycle and rely on validation dependencies not guaranteed there. Those three
skills retained only task-local prerequisites; textual references did not load more
Bigpowers skills. Authenticated model latency and server-granted priority remained unverified.

## Previous subagent policy release

`h-f23dffdb6c68-s-e955e29c51b7-m-c78b5148b110` remains sealed for recovery.

- Explore/general-purpose default to Codex Luna xhigh with priority requested by the
  child-only provider hook. Plan/deep-implementation/deep-review default to Sol high.
- All five profiles ran through the official Pi CLI in isolated homes. The real Codex
  serializer used synthetic credentials and a capture-only fetch, not an external request:
  Luna emitted reasoning.effort=xhigh and service_tier=priority; Sol emitted high and no tier.
  Removing priority in a disposable negative control caused the expected runtime failure.
- Read-only children expose four built-in tools; implementation children expose seven.
  No child MCP, browser, web, task, supervisor or nested-delegation tools were present.
- Full candidate: 14 package suites and five runtime checks passed. Root: 112 tests,
  109 passed, zero failed, three skipped. Local verification: all six groups passed.
- Temporary and real activation, doctor and repeat apply passed. Nine real-home writes
  updated profiles, subagent defaults, package paths and state. Parent settings (excluding
  package paths) and the full private MCP file were compared before/after and unchanged.
- The profile resource-set change requires `--migrate-base` when upgrading the prior
  release. Existing managed profiles are backed up; no unknown profiles were present.

No authenticated model benchmark was run. Priority acceptance, latency and subscription
consumption remain unverified. Model/reasoning/turn values are defaults, not immutable
limits. Background and foreground pools have separate limits (3 and 1); workflow
concurrency remains a separate upstream setting. Restart Pi to refresh the profile catalog.

## Previous native npm release

`h-7a5f6f8455a6-s-e955e29c51b7-m-c78b5148b110` was the previous active release.

- Native defaults: pi-mcp-adapter 2.33.0, pi-web-access 0.29.0, bigpowers 2.88.6.
  The first two are upstream extensions; bigpowers loads skills/prompts only.
- All 14 base package suites and five runtime checks passed. The full native dependency
  tree is included in the runtime digest, not fetched implicitly during verification.
- The official Pi CLI proves native tools load, local web_fetch and bigpowers_skill do
  not load, bigpowers skills/prompts exist, the MCP footer is empty, and child scopes work.
- A separate isolated official SDK loader resolved the actual installed `npm:` entries:
  six tools, 82 skills (81 bigpowers plus one adapter skill), 81 prompts, zero diagnostics.
  No project initialization or bigpowers Git hooks were run.
- A cold bootstrap in another empty temporary home fetched pinned sources, installed
  locked dependencies, verified and activated successfully without a source map.
- Temporary and real-home activation/repeat apply passed. Doctor has no conflicts or
  pending writes. Real migration applied six changes, including the verified npm prefix.
- Existing MCP configuration was compared before/after excluding only mcpFooterStatus;
  all other fields were preserved. It is not included in this repository or test fixtures.
- Local verification: six groups; root 109 tests, 106 passing, three skipped, zero failures.
  Native integrity, prefix backups, preflight races, preserved metadata/server configuration
  and refusal to overwrite unmanaged prefix changes have dedicated regressions.
- PDF rendering/caption skills and local opt-in analyze-sessions are retained. Native web
  defaults disable cookies, hosted fetch fallbacks, curator and GitHub cloning; PDF is local.

Search providers, external MCP authentication and YouTube understanding were not invoked.
Restart Pi after activation. Executor centralization is a separate final configuration task.

## Previous tintinweb-only release

`h-73c610eefc61-s-e955e29c51b7-m-c78b5148b110` was the previous active release and is
preserved immutably for recovery. Evidence below describes that earlier generation.

- All 18 candidate package suites and five official-host runtime checks passed.
- Temporary-home activation, doctor and repeat apply passed.
- A separate cold bootstrap, without a source map or prepared release, fetched exact public
  source commits, installed from locks, verified all suites and activated successfully.
- Real-home migration applied 29 changes. Doctor reports valid integrity/verification,
  nine distinct packages, zero conflicts and zero pending writes. Repeat bootstrap and
  final plan produce no changes; no dependency/test command reruns in the sealed release.
- Final local verification: all eight groups pass. Root: 103 tests, 100 passed, three
  skipped, zero failures. Optional/live checks remain explicitly outside this evidence.
- The old source checkout, viewer worktree and installed interactive-subagents clone were
  moved to a private archive. Non-dependency source file hashes were compared before/after;
  the archived Git worktree pointer was repaired. Original WIP and Git refs are retained.
- Configuration backup: `~/.agent-config/backups/fbc3be4d-5e6c-44b3-b3c7-9707e8959ff9`.
  Old checkouts: `~/.local/state/pi-cleanup/base-migration-20260914-184310`.
  Shared SYSTEM.md, credentials, sessions and memory data were not replaced.

## Failures reproduced and resolved

1. The public memory lock omitted two optional @emnapi peers. `npm ci` failed before
   verification; an exact-commit/SHA-256-guarded lock addition now makes it reproducible
   without requiring an unpublished memory commit. Memory implementation is unchanged.
2. Upstream environment tests require a Git repository but an exported development
   snapshot has none. Verification creates/removes disposable Git metadata around that
   suite. Its temporary HOME sits outside that Git root so the non-Git fixture stays non-Git.
3. Bootstrap rejected a verified, unactivated candidate after development-tree removal.
   It now validates the completed verification instead of requiring that removed tree;
   a regression test reproduces the failure and passes after the fix.
4. Git URL aliases for memory/scoped tintinweb packages now migrate without duplicate
   registrations, preserving object metadata; a dedicated regression covers both forms.

## Historical source checks (previous generation)

- `npm run verify`: all eight local groups pass: root and seven packages.
- Upstream pi-subagents at e955e29c51b7a6cce37e1108cd2d6c57a77e151c:
  typecheck passes; 2129 tests pass, 7 skipped, across 105 files, with live tests disabled.
- pi-tasks at 29180d72498bdd77d5601dc77a9093d25da42102:
  typecheck passes; 404 tests across 19 files pass.
- pi-supervisor at 63dff13346afa39fe4e6f22001d2a5b7ee60ba8a:
  typecheck passes; 57 tests across five files pass.
- Combined provisional runtime smoke: all five checks pass against installed Pi 0.85.1.
  The official CLI/RPC loads all nine packages. TaskExecute launches a real SDK child
  driven by a scripted provider, TaskOutput returns its result, and an Explore child
  has only read/grep/find/ls. The general-purpose child receives explicit MCP/web/browser/
  question tools without tasks/supervisor or sensitive fill. Children report one process.
  Supervisor starts using the scripted offline provider. Memory status runs without a model.

The child-scope regression initially failed because upstream resurfaced browser_fill;
adding `disallowed_tools: browser_fill` to the profile makes it pass. This is distinct
from runtime browser permissions, which still gate sensitive execution.

Upstream development locks use their own SDK versions. Their tests alone do not prove
compatibility with installed Pi; the official-host combined smoke covers that interface.

## Limits

No authenticated model inference, quota refresh, external MCP service, browser download,
real navigation, fullscreen click or interactive supervisor session was used in these checks.
A synthetic provider verifies program flow, not model judgment or compliance with prompts.
Supervisor policy is advisory, not an authorization sandbox.

After a full Pi restart, manual smoke:

1. `/agents` lists general-purpose, Explore and Plan; no old worker/scout/researcher tools.
2. `/tasks` opens its menu; create/execute a small explicitly requested task if desired.
3. `/supervise status` works. Start a user-chosen goal and stop with `/supervise stop`.
4. `/om:status` retains memory configuration; `/subscription-refresh` shows the account's
   actual result, which may be unsupported/error rather than guessed quota.
5. `/browser` reports availability; use installed Chrome/Edge for a separately approved
   public navigation smoke. MCP service configuration remains private and explicit.

`npm run doctor` validates the active release and pending managed configuration. It does
not authenticate or certify these manual checks. Never retest or reinstall a sealed runtime.
