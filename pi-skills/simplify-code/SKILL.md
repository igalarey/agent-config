---
name: simplify-code
description: Review or simplify a specified diff for reuse, complexity, unnecessary work, and fixes at the wrong layer. Use only when the user requests simplification or cleanup, not after every edit.
license: MIT
---

# Simplify Code

Adapted from Hermes simplify-code. Preserve behavior and project conventions.

## Establish scope

Inspect the repository state before edits. Use the diff, commit, or files that the user named.
Include staged and unstaged changes where the requested scope requires both.
If no scope is given, inspect recent changes from the current task. Do not expand to the whole repository.
If there are no changes to inspect, say so.
If the user requests review only, do not edit files.

## Inspect four lenses

Work inline by default. Use delegation only if it has a concrete benefit.
Do not launch a workflow unless the user explicitly requests orchestration.
If a read-only child needs the diff, supply it because that role has no Bash.

- **Reuse:** Find existing helpers before proposing an abstraction. Name the actual duplicate and its location.
- **Complexity:** Look for redundant state, repeated branches, unnecessary indirection, and interfaces that expose implementation details.
- **Efficiency:** Look for repeated I/O, unbounded state, missing cleanup, and unnecessary startup work. Require evidence for performance claims.
- **Layer:** Trace special cases to their underlying mechanism. Respect compatibility shims, security boundaries, and vendored-code isolation.

For each candidate, state the location, concrete maintenance or execution cost, suggested change, and behavior risk.
Discard style-only changes and speculative improvements.
Check dynamic consumers before removing an apparently unused export.
Read surrounding code and relevant history if the purpose of a boundary is unclear.
Do not treat an empty catch, wrapper, or special case as proof that removal is safe.

## Apply only justified changes

If cleanup is requested, make the smallest changes within that scope.
Do not rename public contracts or redesign shared infrastructure as incidental cleanup.
Report correctness bugs separately from simplification findings.
If a deeper change needs a separate task, explain the benefit and leave it out of the cleanup.
Run the relevant existing checks and inspect the resulting diff.
Obey the shared test-authoring policy. Do not add unit tests after implementation as a cleanup ritual.
Report what changed, what remained unchanged, the checks actually run, and any blockers.
