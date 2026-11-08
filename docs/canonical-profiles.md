# Canonical specialist profiles

## Source status

This is a source-only profile and policy adaptation. No installation, release pin, activation, or project-worker change is included.
Canonical launch/resume and research bridge integration remain separate from source policy and discovery verification.

## Provenance and license

The seven profiles are adapted from MIT-licensed `nicobailon/pi-subagents` at:

`52e68e9ef0e563d5c97b28519f9999f1b5fbbbea`

The complete referenced files were read before adaptation:

- `agents/scout.md`
- `agents/worker.md`
- `agents/reviewer.md`
- `agents/oracle.md`
- `agents/researcher.md`
- `agents/evidence-auditor.md`
- `agents/delegate.md`
- `LICENSE`

Pinned source: https://github.com/nicobailon/pi-subagents/tree/52e68e9ef0e563d5c97b28519f9999f1b5fbbbea/agents

The full upstream MIT notice is retained in `agents/LICENSE.nicobailon` and projects beside installed profiles.
No upstream runtime, installer, package, or workflow engine is included.

## Profile policy

| Role | Model | Thinking | Turns | Personal skill catalog |
| --- | --- | --- | --- | --- |
| scout | openai/gpt-6.1-sol | low | 20 | diagnose-root |
| worker | openai/gpt-6.1-sol | high | 30 | diagnose-root, enforce-first, edit-document, simple-english |
| reviewer | openai/gpt-6.1-sol | high | 30 | security-review, enforce-first |
| oracle | openai/gpt-6.1-sol | high | 30 | elaborate-spec |
| researcher | openai/gpt-6.1-sol | medium | 30 | grounded-citations |
| evidence-auditor | openai/gpt-6.1-sol | high | 30 | grounded-citations |
| delegate | inherited | inherited | 20 | diagnose-root, enforce-first, edit-document, simple-english |

All seven use `auto-exit: true`, `allowed_subagents: none`, `prompt_mode: append`, and `session-mode: standalone`.
Delegate omits model and thinking fields to inherit them; it introduces no mandatory default reads.
Fresh task context does not copy full parent conversations.

Every profile explicitly lists `read, grep, find, ls`.
Only worker and delegate additionally list `bash, edit, write`.
Only researcher and evidence-auditor additionally list `web_search, fetch_content, get_search_content, source_check`.
Native `ask_question` and completion controls remain runtime-provided, not fabricated profile tools.
No profile grants Context7, MCP, browser tools, or nested delegation.

## Scoped extensions and personal procedures

All seven profiles use `extensions: scoped`, not boolean extension enablement.
This new-runtime-only enum requires explicit nonempty tools and approved extension bindings; it never grants ambient discovery.
Basic roles have no declared extension-backed tools. Research roles can use only their four declared research tools.
Older parsers reject this enum before launch instead of ignoring the new catalog policy.
The earlier native source rejected these profiles with `Invalid extensions in delegate`; that failure was retained until scoped support arrived.
Historically, the scoped-capable native revision passed metadata checks while the host fixture launched the five legacy profiles.
The current official host gate launches all eight scoped specialists under real PTYs, including local UI verifier.
Delegate inherits an explicitly selected synthetic Sol-medium parent in this offline fixture; installed parent defaults are unchanged.

`skill_catalog` selects reviewed personal procedures without auto-bootstrap or mandatory invocation.
No canonical profile sets `skills: false`; its existing semantics are unchanged.
Catalog availability grants neither tools nor permission, and procedure metadata does not override profile models or scope.
Missing personal procedures or approved backing providers remain capability failures, not invitations to install substitutes.

## Optional local UI specialization

`ui-verifier` is locally authored, not one of the upstream seven.
It uses Sol medium, 20 turns, scoped extensions, read-only built-ins, and the five public browser tools.
Its personal catalog contains `smoke-test` and `grounded-citations`; invocation requires a user-authorized verification task.
No Bash, writing, filling, desktop control, sensitive remote actions, or delegation is granted.
Project coordinator target changes remain separately managed.

## Adaptations

- Native frontmatter replaces upstream `systemPromptMode`, `inheritSkills`, and `defaultContext` fields.
- Append prompts preserve inherited project/shared instructions; supplied decisions do not override those instructions.
- `ask_question` replaces `contact_supervisor`; missing coordination returns an explicit blocker.
- Supplied diffs and source inspection replace `watchdog_diff`; reviewers never claim unavailable commit evidence.
- Scout loses Bash and writing privileges and returns file/line evidence directly.
- Worker retains single-writer execution, narrow approved direction, material-decision escalation, and checks/risks handoff.
- Reviewer remains read-only and reports concrete target-related findings, not speculative defects.
- Oracle preserves supplied decisions and constraints without forked conversation copying or becoming another decision authority.
- Researcher loses file-writing privileges and keeps original-source research, explicit uncertainty, and bounded follow-up.
- Evidence-auditor independently inspects consequential claims rather than treating URLs or source_check output as proof.
- The research bridge gathers search evidence; profiles do not promise unsupported automatic verdicts or passage hashes.
- Upstream output files, progress-file conventions, automatic curator access, aliases, and restart workflows are not imported.

## Managed policy and compatibility

`config/subagents.json` now sets depth 2, six global concurrent descendants, and two concurrent children per parent.
All specialist profiles still forbid delegation. These limits support separately managed coordinators, not new child permissions.
Personal/global profile discovery remains required; bundled and project profile discovery remain disabled.

The five retired profiles are retained byte-identically only under `test/fixtures/legacy-profiles`:
`Explore`, `general-purpose`, `Plan`, `deep-implementation`, and `deep-review`.
They are excluded from new source packaging and installation. Their historical model/tool fixtures and the inactive Luna hook remain unchanged.
No `project-worker` profile is added; its coordinator-owned symlink remains outside this source owner's projection.

The installer already refuses conflicting private canonical-name files without overwriting them.
Regression fixtures verify exact five-profile removal and inverse rollback, private-profile preservation, project-worker symlink preservation, backups, and idempotence.
Historical tintinweb migration fixtures exclude these new profiles and retain their original retirement assertions.

The loader gate validates exact canonical names, models, tools, catalogs, turn limits, scope enum, and delegation policy.
The distributed MIT notice identifies new canonical candidates; historical releases without it retain historical policy checks.
A manifest declaring that notice requires the new gate even if the file is missing.
Effective runtime configuration is compared structurally, not by JSON property order.

## Verification boundary

Run source policy, historical-fixture, and installer regressions:

```sh
node --test test/canonical-profiles.test.mjs test/subagent-policy.test.mjs test/interactive-install.test.mjs
```

Run the complete offline source suite:

```sh
npm test
```

Regression-first failures covered missing profiles, missing loader validation, installer coexistence, and rejection of non-scoped canonical policy.
These checks do not establish canonical child launches, nested bindings, live provider behavior, or full rollout completion.
