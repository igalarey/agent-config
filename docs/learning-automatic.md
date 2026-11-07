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

Limits: two reserved attempts per session, at least five minutes apart, one job, 45-second deadline, low reasoning, no retries, 2048 output tokens and 24 KiB total serialized input including review instructions and skill content. A successful local preflight precedes reservation; budget, catalog and selected-file failures defer without consuming an attempt or starting the cooldown. Reservation is persisted before transport, so provider failures and cancelled calls consume the allowance. The provider must cooperate with AbortSignal to terminate transport; cancelled/stale responses cannot stage proposals.

## Safety and limitations

Discovery uses `pi.getCommands()` skill provenance. The request includes the **complete catalog of discovered names and descriptions**, plus complete SKILL.md contents for a small relevant subset. Names/descriptions are not invented or truncated (an absent description is represented by an empty string). Before reading procedures, the preflight reserves space for instructions, the turn and the entire catalog within the serialized 24 KiB request limit.

Selection is deterministic, without another model: lowercase Unicode words of at least three characters, excluding a fixed generic-word list, are matched between names/descriptions and human text, final assistant text and verification. Candidates with any shared word are ordered by shared-word count, then discovery order. Up to three candidates are read in full with file/ancestor symlink rejection. More than three candidates, a selected file over 16 KiB, unreadable/unsafe/sensitive content, or aggregate budget overflow defers the review without charging an attempt. Procedures are never partially truncated or silently dropped to fit. Unrelated files need not be read, so a 22-skill catalog exceeding 74 KB in full content can still be reviewed.

Lexical matching can miss semantic overlap. The instruction explicitly distinguishes catalog descriptions from complete procedures and requires JSON null if any unread entry could duplicate the lesson or novelty is uncertain. This semantic check is model judgment, not a deterministic guarantee. `/learn review` remains the manual fallback for deferred or ambiguous cases.

The reviewer compares the entire catalog and selected procedures for semantic duplicates; exact name collisions against the complete catalog and content collisions against read procedures are additionally refused. Semantic novelty and correctness still require human review. Common credentials, bearer tokens, JWTs, private keys and credential URLs are detected/redacted before transport; sensitive candidate turns are skipped altogether. This is not a complete DLP system. Unknown JSON fields, oversized content, unsupported evidence references and unsafe store content are rejected. Evidence in the pending record is the original captured verification summary, not a model-written claim. The existing store ownership, stale-target and human-approval checks are unchanged.

Each job captures its own AbortController for deadline, transport and completion validation. Main execution, input, model changes, compaction, navigation and shutdown abort/invalidate the job. Generation, current session ID, current leaf, idle state and user configuration are rechecked before staging. No automatic approval occurs.

## Auxiliary usage metadata

`pi.appendEntry('learning-automatic-usage', data)` persists custom entries outside model context:

- Reservation: `{phase:'reserved', timestamp, attempt}`.
- Completion: `{phase:'finished', timestamp, outcome, provider?, model?, usage?}`.
- `usage` contains finite nonnegative `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` when reported; `cost` is the provider-reported total cost.

At most two reservations and two completions are emitted per session. No prompt, response, command, evidence, credentials or provider error text is included. Reservations are reconstructed from the current SessionManager's already-loaded custom entries, across branches; no JSONL file is searched. A stale/shutdown job does not append to the replacement branch/session: its reservation remains evidence of an attempted call, with usage unknown. These custom entries do not automatically change Pi's built-in token totals.

## Procedure routing instruction

A separate `before_agent_start` hook contributes the stable `procedure_routing` structured prompt section. It asks the coordinator to consider actually discovered procedures, read the pertinent SKILL.md, reuse relevant available prompt procedures without manual slash invocation, and pass relevant instructions to children when delegation is permitted for the current task; children do not load skills/extensions. This does not require a new human confirmation for every ordinary permitted delegation. It neither duplicates the catalog nor changes tool selection.

Child `capability_request` records are advisory: the coordinator validates `kind` (`skill|prompt|extension|delegation|budget`), `capability`, `reason`, `evidence`, `partial_result` and `requested_action`, then decides whether to provide instructions, perform an authorized operation, delegate within scope or explicitly revise the budget/summarize. The hook never expands permissions or budgets, invokes a router model, or provides a child-to-parent tool. Prompt compliance is not guaranteed; opaque forced system prompts can suppress structured sections in Pi.

## Offline verification

```sh
PI_OFFLINE=1 PI_E2E_LIVE=0 PI_RUN_LIVE_SUBAGENT_TESTS=0 node --test test/learning*.mjs
```

The automatic harness uses synthetic results and verifies a 22-skill catalog over 74 KB with a request at most 24 KiB, complete selected procedures, uncharged preflight failures, unrelated catalogs, bounded tools-free calls, cooldown/attempt limits, provenance, sensitive/invalid/provider-error refusal and stale cancellation across successive jobs. The official installed Pi 1.5.0 SDK fixture dispatches the real extension lifecycle through its runner with a synthetic model context; it verifies no extra main message or publication. It also passes the request through the installed pi-ai `normalizeContext`, checks the system prompt and empty effective tools, and checks the `SystemMessage.timestamp` required by the installed type contract. Existing SDK/store tests retain human TUI approval, ownership and stale-publication coverage. These checks do not establish live authentication, remote cancellation or semantic model quality.
