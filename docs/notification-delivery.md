# Subagent completion delivery

## Candidate source adaptation

The modern candidate uses a local source fork of upstream `50460b5df6934c4237983a504808a04ee0f8a0a0` (0.23.1).
Notification adaptation commit: `59881993d3e4a5b2000a31e37aea5ab871d09438`.
Its existing `CompletionOutbox` owns delivery. There is no second backlog or notification overlay.
The release recipe and source map must pin the reviewed fork commit before candidate preparation.
This document does not record an activation of that candidate.

The outbox builds notifications from completion snapshots, not records that a resumed agent can change.
Each queued completion receives a unique generation key.
`turn_end` and `agent_before_settle` propose entries and preserve entries from earlier handlers.
Only a matching receipt in the current session branch acknowledges delivery.
If a later handler discards the proposal, the result remains pending and cancellable.

The idle timer checks `ctx.isIdle()` immediately before sending.
Shutdown closes the outbox and group timers before aborting children.
Consumed group members count as finished, but their results do not appear in notifications.
The harness explicitly selects `defaultJoinMode: "group"` because upstream now treats `smart` as independent completion delivery.
Concurrency, models, nesting restrictions, and disabled worktree automation remain unchanged.

## Historical overlay correction

The historical subagent source is `e955e29c51b7a6cce37e1108cd2d6c57a77e151c`.
Its completion timer sends a `followUp` after 200 ms.
Pi cannot retract that queued message after a caller reads the result.
The notification can therefore arrive after the parent response and cause another model request.

The historical `manifests/subagents-notifications.json` contains the local correction for Pi 1.5.0.
The release builder also accepts the Pi 0.87.1 and 1.3.0 manifests for historical candidates.
Release preparation checks the source commit, original SHA-256, result SHA-256, and each replacement.
The installer never changes a source checkout or an activated release.
Historical releases without this manifest retain their original validation rules.

The extension keeps completed records in its own backlog.
`get_subagent_result` and RPC consumption remove records from that backlog.
The extension checks consumption again after the complete parent tool batch.
`turn_end` and `agent_before_settle` propose one notification for unread results.
The proposal preserves entries from earlier handlers.
The extension acknowledges delivery only after the notification appears in the committed session branch.

A single timer wakes an idle parent for asynchronous completions.
The timer never queues a notification while the parent is busy.
Groups still count consumed members as complete, but notifications exclude their results.
Workflow completions use the same delivery mechanism.
Shutdown closes the backlog and group timers before it aborts children.

Upstream development dependencies use Pi 0.84.2 types.
A narrow registration shim covers the actionable boundaries that those types do not declare.
The correction targets the harness-pinned Pi 1.5.0, not the entire upstream peer range.
Its source patch is unchanged from the Pi 0.87.1 correction.
The manifest also records exact compatibility edits for existing test fixtures.
These edits supply the real lifecycle and idle-state contracts.
The obsolete post-shutdown notification assertion now checks actual worker termination and no notification after shutdown.

## Repeated verification

The representative SDK scenario uses temporary homes, actual child sessions, and a scripted provider.
It does not use credentials, private sessions, or network calls.
The root command is:

```sh
node --test test/notification-runtime.test.mjs
```

The seven phases cover:

- Immediate result collection: no notification or extra model request.
- Collection 500 ms after completion: no notification or extra model request.
- A competing handler discards a proposed entry and consumes the result: no notification or extra model request.
- Unread completion during a tool batch: one notification before the next parent response.
- A group with one consumed member: only the unread member reaches the parent.
- Completion after the parent becomes idle: one automatic wake.
- Shutdown with a pending completion: no wake after shutdown.

The test also verifies that completion proposals preserve entries from an earlier handler.
It reports exact request counts and zero network calls.
The source suite covers background and foreground resume before delivery, including preservation of the earlier result snapshot.

For a development worktree with prepared dependencies, run:

```sh
PI_NOTIFICATION_SOURCE_PATH=/absolute/path/to/subagents-worktree \
  node --test test/notification-runtime.test.mjs
```

This mode copies source into a temporary fixture without applying an overlay or reading private release state.
It tests the working tree, not release integrity. Source and release overrides are mutually exclusive.

An explicit candidate command checks the candidate source without applying a fixture patch:

```sh
PI_NOTIFICATION_RELEASE_PATH="$HOME/.agent-config/releases/<release-id>" \
  node --test test/notification-runtime.test.mjs
```

Run source checks with a temporary `HOME`, `PI_CODING_AGENT_DIR`, and `TMPDIR` in a clean environment.
Set `PI_OFFLINE=1`, `PI_E2E_LIVE=0`, and `PI_RUN_LIVE_SUBAGENT_TESTS=0`.
`test/agent-runner-e2e.test.ts` creates real resource loaders without a global temporary home in its outer fixture.
Its `activeToolsFor` helper can load installed extension factories before scope filters apply.
Offline flags alone do not prevent that lookup. The isolated environment is required, not warning suppression.

The release gates still include the complete upstream suites and official CLI/RPC checks.
The SDK scenario does not establish every abort, recovery, branch-switch, or long-running group combination.

## Candidate notification verification

On 2026-11-05, the notification fork passed these checks without activation:

- Isolated `npm run check`: lint and typecheck passed, 123 test files passed, 2,537 tests passed, 7 skipped.
- Focused harness checks: 9 passed, including seven SDK phases and zero network calls.
- Resume-before-send tests preserved the first result across foreground and background resumes.
- A receipt-generation mutation failed the regression. Restoring the exact comparison passed the focused tests again.

The source suite still prints its existing Vite config-loader deprecation warning.
There were no global-resource warnings in the isolated run.
These results do not verify the separate workflow accounting, capability persistence, or final release integration changes.

## Historical verified activation

On 2026-09-30, release `h-093d44899937-s-e955e29c51b7-m-bc1eba141a47` passed verification and became active.
Its source commit is `093d44899937`.

- Root regressions: 147 passed, 3 optional skips, zero failures.
- Carbon tests: 21 passed.
- Subagent suite: 105 files passed, 2,129 tests passed, 7 optional skips.
- Release checks: all 14 package checks and all 5 runtime checks passed.
- Explicit SDK regression against the activated candidate: all six phases passed, zero network calls.
- Doctor: valid integrity and verification, zero conflicts, zero pending writes.
- Compatibility: 170 checks passed.
- Repeat bootstrap: zero configuration changes, no repeated dependency installation or verification.

Activation preserved all non-package settings, including `carbon-graphite`.
The previous release `h-5835c058e946-s-e955e29c51b7-m-bc1eba141a47` still passes integrity and verification checks.
The activation backup is `~/.agent-config/backups/672a85ff-3f03-4e06-90bc-83aeee4f4db6`.

## Current-session limit

Activation changes the files for the next extension load.
It cannot retract notifications that the old runtime already queued.
A Pi restart loads the corrected release without that old queue.
