# Subagent completion delivery

## Cause and correction

The pinned subagent source is `e955e29c51b7a6cce37e1108cd2d6c57a77e151c`.
Its completion timer sends a `followUp` after 200 ms.
Pi cannot retract that queued message after a caller reads the result.
The notification can therefore arrive after the parent response and cause another model request.

`manifests/subagents-notifications.json` contains the local correction for Pi 0.87.1.
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
The correction supports the harness-pinned Pi 0.87.1, not the entire upstream peer range.
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

The six phases cover:

- Immediate result collection: no notification or extra model request.
- Collection 500 ms after completion: no notification or extra model request.
- Unread completion during a tool batch: one notification before the next parent response.
- A group with one consumed member: only the unread member reaches the parent.
- Completion after the parent becomes idle: one automatic wake.
- Shutdown with a pending completion: no wake after shutdown.

The test reports exact request counts and zero network calls.
An explicit candidate command checks the candidate source without applying a fixture patch:

```sh
PI_NOTIFICATION_RELEASE_PATH="$HOME/.agent-config/releases/<release-id>" \
  node --test test/notification-runtime.test.mjs
```

The release gates still include the complete upstream suites and official CLI/RPC checks.
The SDK scenario does not establish every abort, recovery, branch-switch, or long-running group combination.

## Current-session limit

Activation changes the files for the next extension load.
It cannot retract notifications that the old runtime already queued.
A Pi restart loads the corrected release without that old queue.
