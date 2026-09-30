---
name: spike
description: Build a small disposable experiment to resolve an uncertain feasibility or integration question before production work. Use for requested prototypes, proof-of-concept work, or competing approaches that need execution evidence.
license: MIT
---

# Spike

Adapted from Hermes spike, which credits GSD /gsd-spike by Lex Christopherson.

## Decide whether an experiment is necessary

If documentation or source inspection can answer the question, use those first.
If the user only requests advice, do not silently implement a prototype.
State the uncertainty, the observable success condition, and a bounded experiment.
For multiple uncertainties, investigate the risk most likely to invalidate the idea first.
Ask only if a material ambiguity, cost, permission, or irreversible decision prevents safe progress.

## Build the smallest useful experiment

Use an isolated temporary directory or the project's existing prototype convention.
Do not add a permanent directory structure without a reason.
Keep the production path and user data unchanged.
Prefer existing dependencies. Do not download binaries or install services without the required authorization.
Use synthetic fixtures instead of credentials or private data.
Choose a runnable CLI, fixture replay, minimal page, or isolated check that exposes the behavior clearly.
Include a representative failure or edge case, not just the happy path.

For comparisons, give each approach the same inputs and success conditions.
Do not invent numerical scores without a measurement method.
Parallelize independent experiments only when that reduces work or latency.
Use the existing delegation policy. Do not require a fan-out or workflow.

## Deliver a verdict

Report one of these outcomes:

- **Validated:** The experiment demonstrates the specified condition.
- **Partial:** The condition holds only under stated constraints.
- **Invalidated:** The observed result contradicts the condition.
- **Blocked:** The environment prevented the necessary observation.

Include the command, fixture, observed result, limitations, and recommendation for production.
Separate experimental evidence from assumptions about scale, security, and future integrations.
Do not promote prototype code directly to production without reviewing the real requirements.
Preserve useful evidence before removing temporary artifacts. Do not delete user-owned prototypes.
