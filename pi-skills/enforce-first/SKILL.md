---
name: enforce-first
model: haiku
effort: standard
description: Evaluate a specified test suite with the F.I.R.S.T rubric. Use for requested test-quality reviews or while authoring tests, not as an automatic all-project gate.
---

# Enforce FIRST

Use file reading/search and the project's existing test commands.
No companion skill or convention file is required.
If the project has test policy, read it and apply its stricter requirements.
A review is read-only unless the user requests improvements.

## Rubric

| Criterion | Check | Typical correction |
|-----------|-------|--------------------|
| **Fast** | Is runtime proportionate, with avoidable waits or remote calls removed? | Use local fixtures or controlled clocks where they preserve the behavior under test. |
| **Independent** | Can tests run alone, in another order, and concurrently without state leaks? | Isolate storage and clean up processes and fixtures. |
| **Repeatable** | Are inputs, time, randomness, and external dependencies controlled? | Use reproducible seeds, fixed inputs, and explicit environment requirements. |
| **Self-Validating** | Do assertions fail automatically for the relevant incorrect behavior? | Assert observable results and error paths, not just successful startup. |
| **Timely** | Did the regression fail before the implementation, or is the limitation documented? | Prepare the necessary regression before production edits. Do not add retrospective unit tests. |

Timely is an authoring-history property, not something source inspection alone can prove.
Mark it unknown when history or execution evidence is unavailable.
Do not replace representative integration tests with mocks merely to reduce runtime.

## Apply the rubric

1. Identify the requested files and behavior under test.
2. Read fixtures, setup, teardown, and assertions.
3. Run relevant existing checks when local permissions permit.
4. Report pass, fail, or unknown for each criterion, with concrete file-level evidence.
5. If fixes are requested, change only the demonstrated problems and rerun affected checks.

Quick mode covers Fast, Independent, and Self-Validating only.
Label omitted criteria as not reviewed rather than passed.
Run the project's applicable lint, typecheck, test, and coverage gates. Do not invent commands or disable gates to get green.
Report exact commands, observed results, and checks blocked by the environment.
