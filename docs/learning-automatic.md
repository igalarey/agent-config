# Automatic Learning review

## Opt-in and controls

Only `getAgentDir()/settings.json` is consulted:

```json
{"learning":{"automaticReview":true}}
```

Absent, malformed, oversized (over 256 KiB), unreadable or symlinked configuration disables automatic review. Project settings and merged `pi.getSettings()` cannot enable it. The default is off. This implementation does not change settings files or activate any source release.

- `/learn status`: effective state, attempts and running job.
- `/learn cancel`: abort this review and invalidate its snapshot.
- `/learn auto off`: pause automatic review for this extension runtime, without rewriting settings. Set the user setting to false for a persistent disable. Reload clears the pause but not recorded session attempts.
- Existing `/learn review`, pending/show/approve/reject behavior remains available. Only unchanged full preview plus human confirmation in interactive TUI publishes a skill.

## Trigger and transport

Pi 1.5.0 `input` must identify an interactive, idle, image-free human input; `before_agent_start` must match that exact prompt. RPC, extension-origin, queued, expanded or transformed inputs are conservatively skipped. Only text from that live turn is retained; no historical session files, previous conversation, images or thinking are read. The final assistant text and a bounded verification summary accompany the human text.

A non-error top-level bash result must name a recognized test runner and contain positive test counts without a failing count. File reads and exit code zero alone do not qualify. Only command text (400 bytes maximum) and recognized test-summary lines (500 bytes maximum) are retained, not arbitrary terminal output. This is a candidate signal, not semantic proof: the auxiliary reviewer is instructed to return JSON null unless the intended procedure and assertions were actually verified.

On non-aborted `agent_settled`, the extension calls the current effective model via `ctx.modelRegistry.streamSimple(model, context, options).result()`. It supplies no tools, does not create an AgentSession or subagent, and does not send a main user message. Authentication remains entirely owned by the registry.

Limits: two reserved attempts per session, at least five minutes apart, one job, 45-second deadline, low reasoning, no retries, 2048 output tokens and 24 KiB total serialized input including review instructions and skill content. Reservation precedes preparation and transport, so failed, deferred and cancelled attempts consume the allowance. The provider must cooperate with AbortSignal to terminate transport; cancelled/stale responses cannot stage proposals.

## Safety and limitations

Discovery uses `pi.getCommands()` skill provenance. The current conservative implementation reads **every discovered single-file SKILL.md** with file/ancestor symlink rejection. It defers when any file cannot be safely read, contains common secret patterns, exceeds 16 KiB or the complete input exceeds the budget. Consequently large installed catalogs can prevent all automatic reviews; `/learn review` remains the manual fallback. There is no heuristic that silently drops a possibly relevant existing procedure.

The reviewer compares these procedures for semantic duplicates; exact name/content collisions are additionally refused. Semantic novelty and correctness still require human review. Common credentials, bearer tokens, JWTs, private keys and credential URLs are detected/redacted before transport; sensitive candidate turns are skipped altogether. This is not a complete DLP system. Unknown JSON fields, oversized content, unsupported evidence references and unsafe store content are rejected. Evidence in the pending record is the original captured verification summary, not a model-written claim. The existing store ownership, stale-target and human-approval checks are unchanged.

Main execution, input, model changes, compaction, navigation and shutdown abort/invalidate the job. Generation, current session ID, current leaf, idle state and user configuration are rechecked before staging. No automatic approval occurs.

## Auxiliary usage metadata

`pi.appendEntry('learning-automatic-usage', data)` persists custom entries outside model context:

- Reservation: `{phase:'reserved', timestamp, attempt}`.
- Completion: `{phase:'finished', timestamp, outcome, provider?, model?, usage?}`.
- `usage` contains finite nonnegative `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` when reported; `cost` is the provider-reported total cost.

At most two reservations and two completions are emitted per session. No prompt, response, command, evidence, credentials or provider error text is included. Reservations are reconstructed from the current SessionManager's already-loaded custom entries, across branches; no JSONL file is searched. A stale/shutdown job does not append to the replacement branch/session: its reservation remains evidence of an attempted call, with usage unknown. These custom entries do not automatically change Pi's built-in token totals.

## Procedure routing instruction

A separate `before_agent_start` hook contributes the stable `procedure_routing` structured prompt section. It asks the coordinator to consider actually discovered procedures, read the pertinent SKILL.md, reuse relevant available prompt procedures without manual slash invocation, and pass relevant instructions to authorized children that do not load skills/extensions. It neither duplicates the catalog nor changes tool selection.

Child `capability_request` records are advisory: the coordinator validates `kind` (`skill|prompt|extension|delegation|budget`), `capability`, `reason`, `evidence`, `partial_result` and `requested_action`, then decides whether to provide instructions, perform an authorized operation, delegate within scope or explicitly revise the budget/summarize. The hook never expands permissions or budgets, invokes a router model, or provides a child-to-parent tool. Prompt compliance is not guaranteed; opaque forced system prompts can suppress structured sections in Pi.

## Offline verification

```sh
PI_OFFLINE=1 PI_E2E_LIVE=0 PI_RUN_LIVE_SUBAGENT_TESTS=0 node --test test/learning*.mjs
```

The automatic harness uses synthetic results and verifies bounded tools-free calls, cooldown/attempt limits, provenance, sensitive/invalid/provider-error refusal and stale cancellation. The official installed Pi 1.5.0 SDK fixture dispatches the real extension lifecycle through its runner with a synthetic model context; it verifies no extra main message or publication. Existing SDK/store tests retain human TUI approval, ownership and stale-publication coverage. These checks do not establish live authentication, remote cancellation or semantic model quality.
