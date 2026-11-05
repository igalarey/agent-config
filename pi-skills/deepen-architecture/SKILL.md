---
# story: e45s31
# story: e45s14
name: deepen-architecture
model: sonnet
effort: standard
description: Find evidence-backed opportunities to deepen shallow modules and improve testability. Use for requested architecture or refactoring exploration, not automatic module consolidation.
---

# Deepen Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

Use this skill for module-level refactoring proposals, not automatic implementation or glossary writes.
Use local reading/search and Git history when available. Delegation is optional, not a prerequisite.
No external helper, domain-model format, or project documentation layout is required.

> **HARD GATE** — Deep modules must solve a forcing function, not just be "nice abstractions." If you cannot articulate why the abstraction exists, it is premature.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

Existing project domain documentation and ADRs are optional context.
For example, a project can use `specs/tech-architecture/tech-stack.md` and `specs/adr/`, or another layout.
Use their actual terminology and decisions when present. Do not require missing companion formats.

## Process

### 1. Explore

Read existing documentation first:

- Applicable repository instructions and existing architecture/domain documentation
- Relevant ADRs, wherever the project stores them

If any of these files don't exist, proceed silently — don't flag their absence or suggest creating them upfront.

Use recent local Git history as an optional churn signal, not proof of architectural friction.
Inspect candidate modules directly with available file/search tools.
Use a permitted exploration agent only when independent investigation has a concrete benefit.
Note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow.

### 2. Module Depth score

For each candidate module, assign a **Module Depth score** (1–5, Ousterhout):

| Score | Meaning |
|-------|---------|
| 1 | Shallow — interface complexity ≈ implementation |
| 3 | Balanced |
| 5 | Deep — small interface, substantial hidden behavior |

Include the score in each candidate row. Prioritize score ≤ 2 for deepening.

### 3. Present candidates

Present a numbered list of deepening opportunities. For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve

**Use existing project vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) for the architecture.**

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly. Don't list every theoretical refactor an ADR forbids.

Recommend the strongest candidate with evidence. Ask which to explore only if choosing a candidate is necessary and the request does not already identify one.

### 4. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Keep exploration read-only unless changes or saved decisions are requested.
Propose terminology or ADR updates in chat when they have durable value. Do not create files as an interview side effect.
For dependency and test strategy, read [DEEPENING.md](DEEPENING.md).
For alternative interfaces, read [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).
Ask only about consequential unresolved trade-offs, not facts discoverable in source.

### 5. Verify the proposal

Check callers, dependency direction, public contracts, and the tests that cover the affected behavior.
If implementation is requested, honor any existing import allowlist and run the project's actual boundary checks.
No import-boundary manifest or shell helper is required by this skill.
Report the evidence behind the proposed benefit and any unverified assumptions.
A qualitative depth score is a review aid, not a measured performance result.
