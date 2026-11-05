---
name: elaborate-spec
model: opus
effort: standard
description: Refine a rough idea into a clear, detailed specification through dialogue. Does not produce code. Use when user has a vague idea, wants to think through a feature before planning, or needs to turn "I want X" into a concrete spec.
# story: e24s01
---

# Elaborate Spec

Turn a rough idea into a clear specification through focused dialogue. No code is written during this skill.
Return shared understanding and a refined problem statement in chat unless a saved specification is requested.
Use local reading/search for discoverable facts. No companion workflow or special tool is required.

> **HARD GATE** — Do NOT proceed with planning or implementation until the problem space is clearly understood. Success criteria, actors, and scope must be explicit before drafting a plan.

## Process

### 1. Listen first

Let the user describe their idea in their own words. Do not interrupt or redirect. Take notes on:
- The core problem they're trying to solve
- Who is affected (actors)
- What success looks like to them
- Any constraints they've already identified

### 2. Ask clarifying questions

Use the information already provided. Ask one focused question at a time only for material gaps or decisions that require the user's judgment.
Do not repeat answered questions or block progress on reversible wording choices. Consider these areas as relevant:

**Problem clarity**
- What is the current behavior (or lack of behavior) that prompted this?
- Who experiences this problem? How often?
- What's the cost of not solving it?

**Solution boundaries**
- What is explicitly IN scope?
- What is explicitly OUT of scope?
- Are there existing solutions (internal or external) this replaces or integrates with?

**Success criteria**
- How will you know this is done?
- What does the happy path look like end-to-end?
- What are the key failure modes to handle?

**Constraints**
- Any performance requirements?
- Any compatibility constraints (existing APIs, data formats)?
- Any non-negotiable implementation decisions already made?

### 2.5. Material ambiguity

If competing interpretations change scope, safety, data, cost, authority, or compatibility, explain the options and ask before proceeding.
For local, reversible choices, state a conservative assumption and continue.

Present the options clearly:
> "I see two ways to read this:
> 1. [Interpretation A] — my recommendation because [reason]
> 2. [Interpretation B]
> Which is closer to what you mean?"

### 3. Surface hidden assumptions

Once the user has answered the main questions, probe for assumptions:
- "You mentioned X — does that mean Y is also true?"
- "What happens when Z fails?"
- "Is this for internal users, external users, or both?"

### 4. Synthesize and confirm

Summarize the problem, main flow, constraints, failure modes, success criteria, and exclusions.
Separate agreed decisions from assumptions and unresolved questions.
Ask for confirmation only when a material decision remains, or when the user requested an approval stage.

### 5. Save only when requested

If the user asks for an artifact, use their destination or the project's existing specification format.
The following YAML is an optional example, not a required file:

```yaml
# Example planning context
feature_name: "<from step 1>"
problem_statement: "<one paragraph>"
constraints:
  - "<constraint 1>"
out_of_scope:
  - "<excluded item 1>"
key_decisions:
  - decision: "<what was decided>"
    rationale: "<why>"
```

Read an existing destination before editing it. Preserve unrelated content and prior decisions.
Ask only if a conflicting decision or intended overwrite is unresolved.

### 6. Suggest next skill

Once the spec is clear, recommend only the next step that the remaining uncertainty warrants:
- Clarify domain terms or relationships when they block the design.
- Plan implementation if the user requests planning.
- Propose a bounded experiment for unresolved feasibility.
- Compare architectures or verify library behavior against installed or retrieved documentation.

Do not automatically launch planning, delegation, or implementation. Check the summary against the original request before delivery.

