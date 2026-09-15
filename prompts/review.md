---
description: Review changes using read-only diff evidence
argument-hint: "[diff, commit, or scope]"
---
Review ${ARGUMENTS:-the changes in the current context}.

Use read-only inspection of the relevant diff and supporting code or tests. Do not edit files or change repository state.

Report only findings that are demonstrated by the diff and repository evidence. Do not report speculative risks. For each finding, give its severity, the file and line, the observed evidence, and the concrete impact. If there are no evidence-backed findings, say so and note any checks you could not perform.
