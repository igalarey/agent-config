---
name: grill-me
model: sonnet
effort: standard
description: Stress-test a plan through focused questions and evidence. Use when the user requests a design challenge, assumption review, or "grill me", not as a mandatory interview before routine work.
---

# Grill Me

Two modes. Default is **Design**. Use **Docs** when the requested review depends on external API behavior.
Use local reading/search for facts. Docs mode optionally needs permitted research tools or documentation supplied by the user.
No separate interview skill is required. This is a read-only review, not authorization to implement or save a plan.

## Design mode (default)

Prioritize decisions that affect feasibility, scope, compatibility, safety, data, or cost.
For each material unresolved choice, explain the tension and your recommendation. Ask one focused question at a time.
Do not repeat resolved questions or force an interview about routine reversible choices. State conservative assumptions and continue where safe.

If a question can be answered by exploring the codebase, explore it instead.

### Facts vs. Decisions Boundary

Distinguish between **facts** and **decisions**:
- **Facts** — things discoverable by exploring the codebase, reading docs, or checking APIs. Do not ask the user to confirm facts; find them yourself.
- **Decisions** — trade-offs, preferences, and priorities. Ask only when the user's judgment is needed to resolve a material choice.

Never "grill yourself" — if the answer is in the code, go find it. Only ask questions where the user's judgment is needed.

## Docs mode

Ground every challenge in real documentation — no assumption about a library's behavior goes unchecked. See [REFERENCE.md](REFERENCE.md) for the full process.

Short form:
1. List every external library, third-party API, and framework behavior relied upon.
2. Read installed documentation first, or use available, permitted research tools for the official API reference.
3. Challenge each plan assumption against the real docs: correct method signature? right version? deprecated?
4. Report confirmed, corrected (with evidence), and uncertain assumptions. Propose a bounded experiment only when needed.
5. Update the plan for each confirmed discrepancy.

## Confirmation Gate

Do not enact the plan, write files, or launch another workflow unless the user requests that outcome.
A current explicit request already authorizes its stated scope. Do not demand a ritual confirmation for actions already requested.
Finish with the resolved decisions, remaining risks, and evidence limits rather than requiring every conceivable question to be answered.

