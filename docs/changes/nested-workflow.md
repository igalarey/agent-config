# Instruction inheritance, bounded delegation, and Herdr inspection

Historical record for the retired interactive-subagents runtime. Not active configuration.
Superseded by [the tintinweb base](tintinweb-base.md).

## Outcome and scope

Keep one shared instruction source, make it discoverable by parent and role-configured
children, and provide a proportional SDD/TDD workflow. Make nested delegation bounded
and observable without transferring process ownership to a terminal host.

The existing public `main` merges are complete. This change does not rewrite their
history or modify an activated release. A new candidate must pass release verification
before activation. Publishing new commits is a separate external action.

## Decisions

- A minimal global Pi context adapter points to `~/.agents/SYSTEM.md`. Role append
  prompts must not hide that adapter. Do not copy the shared rules into every role or
  replace Pi's native system prompt. Do not edit shared `SYSTEM.md` in this change.
- Migrate only known adapter text. Preserve unrelated instructions and use the existing
  backup/conflict mechanism. Unknown content is not permission to overwrite it.
- Add an on-demand task workflow guide: acceptance criteria, bounded investigation,
  proportional approved specification/design/tasks, owners and dependencies, TDD with
  explicit exceptions, integration, and evidence. Small work remains direct.
- Operational defaults: root depth zero, maximum descendant depth two, four concurrent
  descendants, and initially twelve launches per root session lineage (superseded by
  the cumulative-cap amendment below). Resume does not silently reset accounting. These count processes/launches, not money; they are not a
  sandbox against arbitrary code that bypasses the launcher.
- A persistent descendant count and expandable monitor use stable identities, not
  display names. Waiting on children is distinct from completion and from a pending
  question. Existing result delivery, cancellation, and strict tool grants remain intact.
- In Pi fullscreen mode, clicking an owned child opens or focuses one Herdr viewer tab.
  The first version is read-only. Keep Ctrl+Alt+S and a non-Herdr/regular-mode fallback.
- The parent remains the RPC owner. Never start a second Pi writer on an active child
  session or use terminal takeover. The viewer exposes bounded sanitized observable
  events, not hidden reasoning or unrelated private sessions.
- Herdr integration is optional. Use its installed CLI and explicit returned IDs,
  preserve caller workspace/cwd, and handle failures without targeting another pane.
  No binary installation or changes to the official Herdr hook are required.

## Acceptance and verification

- [x] Migration preserves foreign content, rejects ambiguous conflicts, backs up, and
      is idempotent. Official Pi loader fixtures prove adapter visibility with parent,
      child, and grandchild-style role prompts, without models or real-home writes.
- [x] Workflow guidance is discoverable without bloating global instructions or
      requiring SDD artifacts for every task.
- [x] Limits cover concurrent launches, grandchildren, resume, failure, cancellation,
      stale bookkeeping, and exhaustion without silent reset or leaked reservations.
- [x] Counts/tree remain correct while a worker is active and while waiting; identities
      and stale session generations cannot redirect operations to a different child.
- [x] Viewer tests cover duplicate clicks, create/focus failures, absent Herdr, command
      quoting on Windows, terminal-control stripping, and read-only access boundaries.
- [x] Existing source tests/typechecks and complete candidate checks pass. Mocked Herdr
      and deterministic RPC fixtures are not reported as real UI/model E2E evidence.
- [ ] A separate Herdr test-tab smoke, if available, verifies the installed command path;
      real mouse behavior is explicitly tested or left as a precise manual check.

## Work ownership

- Instruction/workflow worker: installer, migration/loader tests, guide, profile links.
- Subagents worker: runtime limits, descendant state/UI, viewer, related tests.
- Coordinator: this specification, cross-component review, documentation, integration,
  final verification, and release lifecycle. Workers use separate worktrees.

## Instruction slice evidence

Integrated the instruction worker's two commits and added a coordinator regression for
an entire legacy template quoted inside fenced documentation. That regression failed
before narrowing removal to a standalone unmarked template. Strict migration/official
loader tests pass 41/41; the five local verification groups pass (root: 93 passed, two
opt-in skips). This is source verification, not activation or complete release evidence.

## Descendant slice review evidence

Integrated `208022a`, `b1f1d4f`, `11caebb`, and `9128881` into subagents `main` by
fast-forward. Coordinator fix `097fbb8` migrates missing process-instance fields in early
version-one ledgers to unknown owners without resetting usage or dropping leases;
malformed explicit fields still fail closed. Its regression failed before the fix.
The final integrated source passes typecheck, 228 unit tests, 17 integration tests,
and five Pi compatibility smoke tests. The live-model lifecycle suite remains opt-in,
not part of that evidence. The review findings are addressed; these results are not
candidate verification, activation, or native mouse evidence.
The harness verifier now strips the external `PI_SUBAGENTS_CONFIG` override, including
mixed-case variants, so a user's runtime policy cannot contaminate offline checks.
Both regression cases failed before the filter fix; all ten verifier tests then passed.

The real Herdr smoke is blocked: `herdr pane current --current` returned
`protocol_mismatch` (client protocol 22, running server protocol 20). The server was not
stopped because doing so terminates its pane processes. After a user-controlled Herdr
restart, verify one temporary viewer tab opens in the caller workspace/cwd, repeated
clicks focus that same tab, completion/staleness is visible, and Ctrl+Alt+S remains
usable. Real fullscreen mouse dispatch and the new tab's configured shell remain to be
checked; command-quoting fixture tests alone do not establish either.

## Candidate preparation corrections

A fresh dependency install exposed two missing optional WASM peer records in the memory
lock. Memory `28538c7` adds only those records; temporary clean `npm ci`, typecheck and
114 tests passed. No memory behavior or sealed release was changed.

The first fully verified candidate then exposed the installer's strict resource-shape
guard: adding `guides/task-workflow.md` prevented upgrading an existing release. The
coordinator added a named exception for that guide only, with unchanged settings keys.
Foreign files and edited managed files still block update/rollback; rollback backs up
and removes only the hash-matching managed guide. The regression failed before the fix;
targeted migration/retirement/conflict tests and all five local verification groups pass.
Other resource-shape changes remain blocked.

## Activation evidence

Final candidate `h-fe3816218c1e-s-097fbb89c09b-m-28538c725547` passed fourteen package
suites and five runtime checks, plus the installed Pi 0.85.1 official RPC smoke with zero
model invocations. It was activated with backups after a conflict-free eight-operation
plan. Doctor then reported valid integrity/verification, zero conflicts and zero pending
writes. Prior sealed releases were not modified or retested. The active recipe now pins
these three exact commits; publishing them remains a separate action. The real Herdr
smoke above is still blocked and is not inferred from offline tests.

## Cumulative-cap amendment

The user requested removing only the cumulative twelve-launch cap. Current sources
use `maxLaunchesPerLineage: null` for unlimited cumulative launches, retain explicit
finite configurations, and keep depth two and four concurrent descendants. Existing
root ledgers adopt the configured policy without clearing counts, identities, or leases;
children still cannot loosen that policy. Bounded metadata storage remains a resource
constraint, not a cumulative process-launch budget. The widget reports launches used
and `unlimited` rather than a numeric denominator.

Candidate `h-fc33cb3be4f8-s-4b3ced87f4a2-m-28538c725547` passed sixteen package
suites, five runtime checks and the installed-host RPC smoke, then was activated
locally with backups. Previous sealed installations were not edited.
Herdr CLI connectivity was subsequently restored and the viewer shell variable is now
present; actual viewer clicks and keyboard forwarding remain separately unverified.

## Deliberately deferred

Interactive viewer messaging/cancellation, terminal takeover, new MCP servers,
monetary hard caps, and redesigning the memory engine are not part of the initial
read-only viewer. They require their own ownership and authorization design.
