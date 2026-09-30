# Selective Hermes adoption

## Scope and evidence

The source review used NousResearch/hermes-agent commit `47676981f55de91231fdeef2f0eec47e7c209e78`.
The review did not install or execute Hermes.
The checkout was read-only and separate from this repository.
No private sessions, generated memories, or credentials were inspected.

Catalog discovery found 58 bundled and 141 optional `SKILL.md` files within the three-level catalog layout.
The review covered catalog names and descriptions, then selected documents and implementation paths for detailed inspection.
This was not an exhaustive security audit of every file or a benchmark of Hermes against Pi.

The detailed skill review covered debugging, testing, simplification, spikes, grounded citations, document and video overlaps, and optional structural search.
It also examined code-wiki, pr-lens, API debugging, gitnexus-explorer, research-paper-writing, and the DuckDuckGo fallback.
The core review covered these source paths and their relevant tests:

| Area | Hermes source | Relevant behavior |
| --- | --- | --- |
| Learning review | `agent/background_review.py` | A post-turn model fork reviews conversation evidence with restricted tools and auxiliary usage accounting. |
| Memory | `agent/memory_manager.py`, `tools/memory_tool.py`, `tools/memory_tool_store.py` | Curated facts and user profile differ from Pi's observation and compaction ledger. |
| Approval | `tools/write_approval.py` | Durable writes can wait for a human review. The upstream gate defaults off. |
| Skill ownership | `tools/skill_manager_guards.py`, `tools/skill_provenance.py` | The unattended curator restricts ownership and requires reads before updates. |
| Prompt composition | `agent/system_prompt.py`, `agent/prompt_builder.py` | Stable prompt sections and tool-aware guidance limit unnecessary prompt changes. |
| Delegation | `tools/delegate_tool.py` | Fresh child context, restricted tools, and parent verification of child claims. |
| Tool scripting | `tools/code_execution_tool.py` | Allowlisted RPC, budgets, and timeouts. These controls are not an OS sandbox. |

Gateway, cron, providers, and desktop/TUI directories were identified for scope, not audited in depth.
They do not solve a demonstrated gap in this lightweight coding harness.

## Selection

| Local resource | Source | Decision |
| --- | --- | --- |
| `diagnose-root` | `skills/software-development/systematic-debugging/SKILL.md` | Replace the old companion-skill and bug-file requirements with a portable investigation method. |
| `grounded-citations` | `skills/research/grounded-citations/SKILL.md` | Add claim-to-passage discipline using existing Pi research tools. |
| `simplify-code` | `skills/software-development/simplify-code/SKILL.md` | Add four review lenses without mandatory four-agent execution. |
| `spike` | `skills/software-development/spike/SKILL.md` | Add bounded feasibility experiments without GSD state or mandatory artifact trees. |
| `ast-grep` | `optional-skills/software-development/ast-grep/SKILL.md` | Add structural-search guidance for an existing CLI, without an installer or Python wrapper. |
| `/research` | Grounded citations and evidence distinctions | Add a short, read-only research template. |
| `/learn`, `learning_propose` | Review prompts, ownership guards, and staged approval | Add a small native Pi adaptation, not a Python port. |

Adaptations retain useful methods rather than claiming byte-identical imports.
`manifests/curated-skills.json` records the exact upstream commit, source paths, original hashes, adaptation notes, and deployed file hashes.
Its `source` retains the original Bigpowers provenance. Its `adaptations` identifies the Hermes-derived additions and replacement.
The generated harness inventory includes the adaptation provenance.
The Nous Research MIT notice and the separate ast-grep author notice remain with the skills.

## Deliberate exclusions

- Keep observational-memory as the sole owner of conversation observations and consolidation.
- Do not add Hermes `MEMORY.md`, `USER.md`, external memory providers, or a second compaction layer.
- Do not copy the background Python review fork, prompt-cache manager, or post-turn model calls.
- Keep the existing Pi model providers, MCP adapter, public browser restrictions, and delegation runtime.
- Do not copy the Python execute-code RPC subsystem or describe tool filtering as a sandbox.
- Do not replace shared PDF reading, actual YouTube captions, or opt-in local session analysis with broader service-dependent skills.
- Do not import mandatory test rituals, four-agent fan-out, fixed hypothesis counts, GSD commands, or automatic skill installation.
- Keep the existing implementation-agent completion rules. The Hermes guidance did not reveal a concrete omission there.
- Do not add a global citation ledger. Pi's research tools already return retrievable evidence artifacts.
- Do not adopt pygount installation with `--break-system-packages` for repository inspection.
- Do not add gateway, scheduler, voice, desktop, hosted services, or marketplace synchronization.

The selected structural-search skill needs an existing ast-grep CLI.
Without that CLI, the agent uses ordinary search and reports the limitation.
Loader verification does not certify a codemod with an absent binary.

## Reviewed learning

The learning extension reviews the current conversation only when the user requests `/learn`.
It does not search historical sessions or inspect generated observational-memory files.
The model can propose a tested procedure with evidence, but it cannot approve it through this extension.
A proposal does not become an active skill before human approval.

Approval is limited to extension-owned learned skills.
It cannot replace curated skills, unrelated user skills, shared policy, or sealed release resources.
An update records the previous target hash and refuses a stale target.
Approval also checks names against Pi's currently discovered skills. It does not scan undiscovered or untrusted future resources.
New publication uses a complete hidden directory before the final rename.
Update ownership accepts the reviewed pre-publication or post-publication hash so an interrupted publication remains recoverable.
A pending approval can resume if its content was published before pending-record cleanup failed.
A process crash can still leave an empty store lock. Recovery requires stopping relevant sessions and removing that empty lock.
Human review does not make proposed instructions safe automatically.
Filesystem guards and bounded content reduce specific risks, not arbitrary prompt injection or same-user shell access.

The existing Bash and file tools still have the Pi process's permissions.
This extension's approval contract is not a sandbox around those tools.

See the README for commands and storage locations.

## Existing question hotfix and activation recovery

Activation found two pre-existing changes inside the formerly active sealed release:
`packages/pi-ask-user-question/index.ts` and `packages/pi-ask-user-question/test/ask-user-question.test.mjs`.
They add an Other/write-in answer to single and multiple selection.
The user explicitly authorized preserving this behavior and recovering activation with backups.
Both files now match the reviewed vendor source byte-for-byte.
Their tests failed before the source port, then passed with the preserved behavior.

Normal activation continues to reject an altered predecessor.
The recovery uses an explicit programmatic `recoverQuestionHotfix` option, not a general integrity override.
A private external verification view reconstructs only the two original files from their recorded Git blobs.
That view must pass the original source, dependency, verification, runtime, and activation-seal checks.
The original deployed release is never repaired or modified.

The active tree and verification view must otherwise match in every file, directory, and symlink target.
Both changed files must match the pinned successor and their private backups.
The installer repeats these checks before writes to detect changes after preview.
Unrelated drift, altered metadata, missing backups, and mismatched successor bytes cause refusal.
The former release remains preserved but invalid. Do not select it for ordinary rollback.

## Verification boundaries

Regression checks cover provenance, resource hashes, registration, and upgrade/rollback preservation.
Learning checks use synthetic procedures and temporary homes.
Fault injection covers incomplete new publication, interrupted update, and pending-record cleanup failure.
An official Pi SDK scenario exercises the registered tool, scripted human dialogs, cancellation, headless refusal, collisions, and reload discovery.
It also changes a target during confirmation to verify stale-target refusal.
The UI inputs are scripted. This is not a live human-interface or model-judgment benchmark.
Official Pi loading uses an isolated environment without copied authentication.
These checks establish program behavior, not whether a model selects the best lessons.

For a live acceptance check:

1. Complete a real task with a reusable, verified procedure.
2. Run `/learn` and inspect the proposal and its evidence.
3. Reject a weak proposal and confirm that no skill appears.
4. Approve a useful proposal through the interactive review.
5. Reload Pi and invoke the resulting learned skill in a new relevant task.
6. Compare the output against the original lesson and check that no private details escaped.

Model judgment, authenticated costs, and long-term learning quality remain outside offline evidence.
