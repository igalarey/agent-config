# Verification: tintinweb base

This file supersedes the historical Windows/RTK/interactive-subagents evidence in Git history.
Target: Linux, Node 22.23.2, Pi 1.3.0.

## Activated host TypeBox correction

Release `h-8dc01e244de8-s-e955e29c51b7-m-bc1eba141a47` is active in the real HOME.
The previous active release remains available. Activation backed up the five changed resources.

- All 14 package checks and five official runtime checks passed.
- The runtime checks reported no TypeBox packaging warnings. The expected offline Ollama diagnostic remains.
- All four TypeBox identity probes passed against the completed release.
- `doctor` passed. The repeated activation plan reported zero changes.
- The inventory resolves Web Access's directory entrypoint to `dist/index.js` and checks its hash.

The release stores its reports in `.release/dependencies.json` and `.release/verification.json`.
Model requests used synthetic providers. Authentication and interactive UI were not tested.

The npm audit still reports dependency advisories, separate from TypeBox packaging.
The old native prefix reported seven affected packages. The new prefix reports eight, including Web Access through its SDK dependency.
The added SDK consumer uses a fixed endpoint, disables redirects, and supplies no OAuth provider. This task did not apply audit fixes.

## Host TypeBox metadata and web 0.32 candidate changes

The new metadata manifest checks the exact subagents commit, Pi version, paths and source/result hashes.
Only package metadata changes. Existing notification changes remain in place.
New candidates reject the historical TypeBox warning allowlist.

Web access 0.32 registers four research tools but defers their activation in fresh sessions.
The official CLI probe calls the real `web_enable` tool through a synthetic provider.
It checks that all four tools appear on the next model request. It makes no search or fetch call.
Legacy web 0.29 still requires all four tools active at startup. Child tool scopes exclude `web_enable`.

The focused Pi 1.3.0 check passed with the published 0.32 bundle and locally linked runtime dependencies.
That focused check did not establish full candidate verification. See “Activated host TypeBox correction” for the completed release evidence.

Run the focused check with a prepared package directory:

```sh
PI_WEB_ACTIVATION_PACKAGE=/absolute/path/to/pi-web-access node --test test/web-activation.test.mjs
```

The full release smoke runs the same transition check against the candidate's native package registration.

## Pi 1.3.0 and Herdr 0.9.5 compatibility (historical evidence)

The isolated Pi 1.3.0 fixture passed these checks:

- `npm run verify`: six groups passed. Root: 152 passed, three optional skips.
- Explicit browser, instruction, learning, notification and TypeBox runtime checks: five passed, no skips.
- Carbon: 21 passed. Subagents: typecheck passed, 2,129 tests passed, seven optional skips.
- Memory: typecheck passed, 114 tests passed. Official CLI/RPC smoke: all five checks passed.
- Upgrade and rollback preserve foreign extensions without `--migrate-base`. Explicit builtin MCP inclusions cause a conflict before writes.

Pi's builtin MCP is disabled because this configuration retains `pi-mcp-adapter`.
Four pinned packages still emit TypeBox packaging warnings. The official loader probe verified shared module identity.
The smoke report retains these exact diagnostics and rejects unknown warnings.

Herdr's existing configuration passed the installed validator. Its keys match the 0.9.5 documentation.
The README describes the separate binary and integration update. Neither binary nor live sessions were changed.

The initial checks used an unsealed fixture with local dependency links.
The official candidate `h-4df8185f76e6-s-e955e29c51b7-m-bc1eba141a47` then passed all 14 package checks and five runtime checks.

Preparation, dependency installation, verification and activation succeeded in a temporary HOME.
Doctor confirmed valid integrity and verification. The repeated plan reported zero changes.
The real HOME was not activated. Authenticated model behavior and interactive browser behavior remain untested.

The candidate evidence is in `/tmp/agent-config-pi-1.3.0-candidate-{verify-new,doctor,plan-repeat}.log`.
To reproduce from the committed recipe, use a new temporary HOME and put Pi 1.3.0 on PATH:

```sh
CHECK_HOME=$(mktemp -d)
npm run bootstrap -- --home "$CHECK_HOME" --apply
npm run doctor -- --home "$CHECK_HOME"
npm run bootstrap -- --home "$CHECK_HOME"
```

Do not reinstall dependencies or rerun suites inside a sealed candidate.

## Reviewed Hermes adaptations and learning (previous activation)

`h-388f27d52cc2-s-e955e29c51b7-m-bc1eba141a47` is verified, sealed and active.
Hermes source reviewed: `47676981f55de91231fdeef2f0eec47e7c209e78`.
See [the adoption scope](hermes-adoption.md) for provenance, exclusions and safeguards.

- `npm test`: 145 passed, three optional tests skipped, zero failures.
- `npm run verify`: all six local groups passed. `npm run test:carbon`: 21 passed.
- Full candidate: all 14 package checks and five official Pi runtime checks passed.
- `node scripts/verify-compatibility.mjs`: 170 checks passed.
  Installed resources: 18 curated skills, seven local packages and four native npm packages.
- `npm run doctor`: valid integrity and compatibility, zero conflicts and pending writes.
- `npm run bootstrap -- --apply` repeated after activation: zero changes.
  Dependencies and verification stages were skipped for the matching valid active release.

Learning-store fault injection and isolated official SDK scenarios cover proposal,
full-content preview, approval, cancellation, rejection, reload, naming collisions,
stale targets, interrupted publication and competing approvals.
Scripted dialogs and offline providers do not establish live model learning quality.
No observational-memory code or model configuration was replaced.

The preceding active release contained an earlier question-tool write-in hotfix in two
source files. Normal activation rejected its failed integrity check. With explicit user
approval, those exact files and metadata were backed up.
A private pristine verification view restored only the original recorded Git blobs and passed all original integrity gates.
The bounded recovery required all remaining predecessor bytes and symlink targets to match.
The hotfix bytes had to match both backup and verified successor.
The original release remains untouched and invalid. It is not a normal rollback target.

Recovery evidence and modified-source backups remain at
`~/.agent-config/backups/hermes-question-recovery-8655d862-cfac-49d8-aaf0-c72136911eeb`.
The first activation backup is
`~/.agent-config/backups/0c131080-1692-40c5-8ff9-1c67a24ca103`.
Final non-package settings are structurally identical to the pre-activation backup,
including the user's `carbon-graphite` theme. The source default retains that choice.
Protected policy and private MCP/web configuration were not changed.
Credential files, prior session logs and generated memory were not inspected or copied.

Restart Pi to load the new prompt, skills and `/learn` commands.

## Previous Carbon Graphite theme (2026-09-24)

`h-acc1ae48d05f-s-e955e29c51b7-m-bc1eba141a47` was verified, sealed and active.

- Added selectable `carbon-graphite` with a gray accent (`#b3b7b5`) and `#131413`
  page/message backgrounds. Pi themes do not control the terminal emulator's base background.
  The saved theme remains `carbon-violet` until selected in `/settings`.
- Pi theme validation/render tests: 21 passed. Root: 136 passed; local verification:
  all six groups passed. Candidate: 14 package checks and five official-runtime checks passed;
  compatibility reports 152 checks, doctor is OK and repeat bootstrap planned zero changes.
  The previous release was deleted.

## Tasks widget auto-clear and order (2026-09-23)

`h-4ee9a22a674b-s-e955e29c51b7-m-bc1eba141a47` was verified, sealed and activated.

- Completed tasks carried over by a restart or resume now start their auto-clear
  countdown at the next turn; before, they stayed until the next `TaskCreate`.
- `config/tasks-config.json` clears each completed task four turns after completion
  (`on_task_complete`) and lists in-progress, then open, then completed tasks (`active`).
- Tasks: typecheck and 408 tests; 150 installed compatibility checks and doctor passed;
  repeat bootstrap planned 0 changes. The previous release was deleted.

## Supervisor Pi 0.87 compatibility and memory LF (2026-09-23)

`h-5bf5b25acace-s-e955e29c51b7-m-bc1eba141a47` was verified, sealed and activated.

- The supervisor declares Pi as an exact 0.87.1 development dependency. Its runtime
  `node_modules` dropped from 255 MB, with a Pi 0.78 copy and five high advisories, to
  `typebox` only; `npm audit --omit=dev` reports 0 vulnerabilities.
- Type-checking against Pi 0.87.1 exposed two API breaks, now fixed: model calls use
  `ctx.modelRegistry.streamSimple()`, and the model picker uses a public searchable list.
- Memory is pinned to `bc1eba1`, whose lock already contains the two optional peers, so
  `manifests/memory-lock-additions.json` was removed.
- All package suites (supervisor: typecheck and 59 tests), five official-runtime checks,
  150 installed compatibility checks and doctor passed; repeat bootstrap planned 0 changes.
  The previous release was deleted.

## Claude usage for bridge models (2026-09-23)

`h-ac39a7be47d0-s-e955e29c51b7-m-c78b5148b110` was verified, sealed and activated. The usage footer
now shows Claude quota for `claude-bridge` models through Pi's Anthropic OAuth. A live
read-only request returned the 5h and 7d windows. The candidate passed all package suites
and the five official-runtime checks, then 150 installed compatibility checks and doctor.
The previous release was deleted.

## Pi 0.87.1, gpt-6 and Claude bridge (2026-09-23)

`h-e349fa4d7425-s-e955e29c51b7-m-c78b5148b110` was verified, sealed and activated. It replaced
`h-1de789cdd3c2-…`, an out-of-band copy of the 0.85.1 release relabelled as 0.87.1 whose id
did not match its commits and whose runtime checks never ran. Pi 0.87 passes tool
declarations in transcript system messages; the faux runtime provider now reads them.

Verification passed on 2026-09-23:

- 136 root regression tests, with three optional tests skipped; six local package groups.
- All candidate package suites and all five official-runtime checks against Pi 0.87.1.
- Real-home activation, then 150 installed compatibility checks and a successful doctor run.
- Repeat bootstrap with zero planned configuration changes.

Installer state was repaired before activation (backup in
`~/.agent-config/backups/manual-20260923-state-repair`): the previous release was set to the
genuine `h-b033e405918c-…`, and tracking of agents, subagents, tasks and supervisor files was
restored from the pre-0.87.1 rollback state. Inactive releases were then deleted.

## Consolidated harness inventory (2026-09-19)

`h-d80df52749b2-s-e955e29c51b7-m-c78b5148b110` was verified, sealed and active.
It retained Carbon, the above-editor agents panel, the filtered footer and the three
native npm packages. Bigpowers remains absent.

The repository now contains the 14 curated skills, their assets, MIT license and
provenance hashes. Their files match the original package's canonical `skills/` tree.
The installer generates the inventory from the selected release instead of manual pins.
The authority map and compatibility command are versioned and deployed together.

Verification passed:

- 133 root regression tests, with three optional tests skipped.
- All six local package verification groups.
- All fourteen candidate package checks and five official-runtime checks.
- All 20 Carbon tests and 39 subscription footer tests.
- Official Pi registration of all 14 curated skills from isolated local directories.
- Fresh-home activation followed by 144 installed compatibility checks.
- Real-home migration followed by the same 144 checks and a successful doctor run.
- Repeat bootstrap in both homes, with zero planned configuration changes.

Regression cases cover stale inventories, altered agent-panel and footer sources,
changed native dependencies, duplicate package versions and symlinked parent directories.
They also cover changed predecessor files, unrelated resources and rollback protections.

Real-home activation applied seven configuration changes. Existing non-package settings
remained structurally identical. The shared `SYSTEM.md` remained byte-identical.
The installer backup remains available for recovery. Temporary verification homes and
source checkouts were removed. Historical sealed releases remain untouched.

These checks used no authenticated model calls. They do not verify screenshots,
quota refresh, live Ollama inference or external workflows described by individual skills.
Restart Pi to load the new resource definitions.

## Previous agent panel placement

`h-2bedd6f443a0-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.
That historical release placed the agents panel in the native below-editor slot, above
the footer. Subscription Usage no longer renders the `subagents` summary; memory and
other statuses remain. The current release restores the upstream above-editor slot.

All fourteen package checks and five official-runtime checks passed. Root regressions
passed 121 tests with three skipped; the footer suite passed 39 tests, and the Carbon
suite passed 20 tests. The first candidate was not activated because a second upstream
RPC test still asserted the old position. The final candidate includes that test update.
These checks do not constitute a screenshot review or an authenticated model test.

## Previous Carbon UI and native package reconciliation

`h-c992a2b264e8-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.
The release passed all fourteen package checks and five official-runtime checks.
Root regressions passed 120 tests with three optional tests skipped. The separate
Carbon suite passed 20 tests, and subscription footer tests passed 38 tests.

Carbon sources and theme are now versioned and projected by the installer. The task
adapter resolves its owner from global settings without a fixed release path. The
editor is transparent, tool cards retain native execution, startup resources are
visible, and the two-row footer puts subscription usage above the model on the right.
Memory indicators use the theme color without the Carbon idle/waiting prefix.

The user approved pinning the existing pi-ollama 0.1.7 installation and removing
Bigpowers. Native dependencies now contain MCP 2.33.0, web access 0.29.0 and Ollama
0.1.7. Before activation, file comparisons confirmed that the live prefix differed
only by npm metadata and stale dependencies from the previous release. The verified
prefix replaced it without changing Ollama source files or private configuration.

Ollama discovers models during extension loading despite PI_OFFLINE. Isolated checks
use a fetch-blocked port and accept only its exact expected discovery notice. They
verify command registration, not inference. Real-home TUI startup, a local shell
command, resource summaries, unique task registration and clean exit also passed.
Doctor passed. No authenticated model request was used for these UI checks.

Temporary demos, screenshots, copied local test scripts, intermediate unactivated
candidates and this work's backups were removed after the maintained tests and
configuration were committed. Pre-existing historical releases and unrelated private
data were preserved. Optional portable Ghostty launcher sources are versioned under
`config/launchers`; bootstrap does not install those desktop files automatically.

## Previous compact history baseline

`h-fd27acfa7a6d-s-e955e29c51b7-m-c78b5148b110` remains verified and sealed.
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
5. `/browser` reports availability; use installed Chrome/Edge or Playwright Chromium for a
   separately approved public navigation smoke. MCP service configuration remains private
   and explicit.

`npm run doctor` validates the active release and pending managed configuration. It does
not authenticate or certify these manual checks. Never retest or reinstall a sealed runtime.
