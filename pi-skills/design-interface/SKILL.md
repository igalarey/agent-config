---
name: design-interface
model: opus
effort: standard
description: Compare meaningfully different interface designs for a module or API. Use when the user requests alternative interfaces, module shapes, or "design it twice", not automatic implementation or delegation.
---

# Design Interface

Based on "Design It Twice" from "A Philosophy of Software Design": your first idea is unlikely to be the best. Generate multiple radically different designs, then compare.

> **HARD GATE** — Multiple design options must be explored. Do NOT settle on first idea. Compare trade-offs (UX, complexity, extensibility, performance) before committing.

## Workflow

### 1. Gather Requirements

Before designing, understand:

- [ ] What problem does this module solve?
- [ ] Who are the callers? (other modules, external users, tests)
- [ ] What are the key operations?
- [ ] Any constraints? (performance, compatibility, existing patterns)
- [ ] What should be hidden inside vs exposed?

Use the requirements already given and inspect relevant local source. Ask only when a material missing constraint blocks the comparison.
This is a read-only design exercise. No extra tools or companion skills are required.

### 2. Generate Designs

Develop two or three meaningfully different alternatives inline by default.
Use an available delegation tool only when independent exploration has a concrete benefit and the current permissions allow it.
No fixed agent count or workflow is required. Give each alternative a different constraint:

```
Brief for each alternative or optional delegate:

Design an interface for: [module description]

Requirements: [gathered requirements]

Constraints for this design: [assign a different constraint to each agent]
- Agent 1: "Minimize method count - aim for 1-3 methods max"
- Agent 2: "Maximize flexibility - support many use cases"
- Agent 3: "Optimize for the most common case"
- Agent 4: "Take inspiration from [specific paradigm/library]"

Output format:
1. Interface signature (types/methods)
2. Usage example (how caller uses it)
3. What this design hides internally
4. Trade-offs of this approach
```

### 3. Present Designs

Show each design with:

1. **Interface signature** — types, methods, params
2. **Usage examples** — how callers actually use it in practice
3. **What it hides** — complexity kept internal

Present designs sequentially so user can absorb each approach before comparison.

### 4. Compare Designs

After showing all designs, compare them on:

- **Interface simplicity**: fewer methods, simpler params
- **General-purpose vs specialized**: flexibility vs focus
- **Implementation efficiency**: does shape allow efficient internals?
- **Depth**: small interface hiding significant complexity (good) vs large interface with thin implementation (bad)
- **Ease of correct use** vs **ease of misuse**

Discuss trade-offs in prose, not tables. Highlight where designs diverge most.

### 5. Synthesize

Recommend the strongest alternative with a concise rationale. Propose a hybrid only when its benefits are concrete.
Identify any consequential decision that still needs user input.
Do not implement an alternative or write a persistent plan unless requested.
Check each example against the known caller requirements and state any unverified performance assumptions.

## Evaluation Criteria

From "A Philosophy of Software Design":

**Interface simplicity**: Fewer methods, simpler params = easier to learn and use correctly.

**General-purpose**: Can handle future use cases without changes. But beware over-generalization.

**Implementation efficiency**: Does interface shape allow efficient implementation? Or force awkward internals?

**Depth**: Small interface hiding significant complexity = deep module (good). Large interface with thin implementation = shallow module (avoid).

## Anti-Patterns

- Don't let sub-agents produce similar designs — enforce radical difference
- Don't skip comparison — the value is in contrast
- Don't implement — this is purely about interface shape
- Include implementation and migration cost as trade-offs, without letting familiarity eliminate a useful alternative

