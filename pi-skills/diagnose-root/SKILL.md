---
name: diagnose-root
description: Investigate a bug through symptom-specific reproduction, boundary isolation, falsifiable hypotheses, and verification. Use when a failure has an unclear cause or repeated fixes do not work.
license: MIT
---

# Diagnose Root

Adapted from Hermes systematic-debugging. Shared and project instructions control permissions and test authoring.

## Establish the symptom

Read the complete error and the relevant source. Separate observed behavior from the expected behavior.
Find a repeatable command that detects the exact symptom, not just a crash or successful startup.
Prefer an existing test, CLI fixture, trace replay, or isolated integration check.
For intermittent failures, record the reproduction rate and the limits of the evidence.
If reproduction needs credentials or destructive actions, stop that route and report the blocker.

Do not require a new unit test for every investigation.
For a fix, prepare the necessary regression before production changes where possible.
Do not add retrospective unit tests after implementation.

## Isolate the failing boundary

Reduce the input, configuration, and callers one variable at a time. Repeat the symptom check after each reduction.
Compare the failing path with a working path in the same system.
Trace the incorrect value upstream through component boundaries.
Inspect recent changes and configuration propagation where relevant.
Use temporary diagnostics only within the authorized scope. Do not log secrets or private payloads.

## Test the explanation

State a hypothesis with a prediction and a probe that can disprove it.
Rank competing explanations by evidence and the cost of their probes. Do not invent a fixed number of hypotheses.
Change one variable at a time. Record what each probe rules out.
If the evidence does not identify the cause, report uncertainty instead of presenting a speculative fix as confirmed.
If repeated fixes expose different symptoms, reassess the shared mechanism rather than adding another workaround.

## Verify the resolution

Diagnosis alone does not authorize edits. If implementation is requested, fix the smallest demonstrated cause.
Keep unrelated refactoring out of the fix. Remove temporary diagnostics that you added.
Repeat the original symptom check and the relevant existing suites.
Report the cause, supporting evidence, exact commands and results, and unresolved limits.
Do not claim success from compilation alone.

No companion skill, bug-file convention, or mandatory diagnosis artifact is required.
