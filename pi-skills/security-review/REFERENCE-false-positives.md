# False-Positive Review

Use this reference to test a suspected finding, not to suppress a language or file type.
Trace attacker control, the trust boundary, the sink, and the effective defenses.
Separate confirmed findings from conditional risks and unresolved questions.

## Context-dependent checks

| Context | Check before classifying |
|---------|-------------------------|
| Rust and other memory-safe languages | Safe code reduces memory hazards. Inspect unsafe blocks, FFI, dependencies, logic errors, races, and resource exhaustion. |
| Prompts and agent instructions | Untrusted content can transfer authority, disclose data, or steer tools. Trace roles, tool permissions, and approval boundaries. |
| Markdown, text, notebooks, tests | Determine whether a loader, renderer, agent, CI job, or user executes or trusts the content. Extensions do not establish safety. |
| Regex | Inspect attacker control of the pattern and subject, escaping, input bounds, and worst-case matching cost. |
| Environment variables and CLI flags | Identify who sets them. Project config, CI inputs, subprocesses, and prepared repositories can cross trust boundaries. |
| Logs and URLs | URLs can contain credentials, signed query parameters, private paths, and personal data. Check redaction, readers, retention, and control characters. |
| UUIDs and other identifiers | Unpredictability does not replace ownership checks. Verify tenant and object authorization. |
| SQL | Bound values and constant query structure prevent value injection. Inspect dynamic identifiers, fragments, and SQL inside stored procedures. |
| JSON | Parsing alone is not code execution. Inspect schema, size limits, object merging, authorization, and downstream sinks. |
| SSRF | Host control is not required for every exploit. A controlled path on a privileged fixed host can expose sensitive endpoints. Check redirects and DNS behavior. |
| Framework rendering | Auto-escaping protects supported contexts, not every URL, DOM sink, template, or unsafe escape hatch. |
| Client-side authorization | Client checks are not an authorization boundary. Verify the server rejects unauthorized requests. |
| Dependencies and secrets on disk | Inspect reachability, permissions, deployment, and exposure. A separate scanner does not establish that the changed path is safe. |
| Resource exhaustion, timing, and races | Check reachability, attacker cost, concurrency, and impact. State conditions rather than excluding the category. |
| Missing hardening or audit logs | Explain a concrete consequence at a trust boundary. Do not label a generic best-practice omission as an exploit. |

## Reasons to dismiss a suspected finding

Dismiss it when evidence shows that the input cannot reach the sink, an effective defense blocks it,
or the reviewed behavior has no security consequence under the stated threat model.
Record the decisive evidence. Prior human decisions are context, not universal exemptions.

If exploitability depends on an unverified configuration, report a conditional risk with that condition.
If a consequential path remains unclear, identify the missing evidence and a bounded verification step.
Do not promote suspicion to a confirmed vulnerability or silently turn uncertainty into a clean bill of health.
