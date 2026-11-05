---
name: define-language
model: sonnet
effort: standard
description: Propose a domain glossary with canonical terms, relationships, and ambiguities. Use when the user requests terminology work or a glossary, not merely when DDD or a domain model is mentioned.
---

# Define Language

Extract domain terminology from the current conversation into a consistent glossary.
Return the proposal in chat by default. No special tools or companion interview skill are required.
Use local reading/search when project evidence is needed. Do not create or overwrite files unless the user requests a saved glossary.
A request to explain DDD is not a request to formalize every domain term.

## Process

1. **Scan the conversation** for domain-relevant nouns, verbs, and concepts
2. **Identify problems**:
   - Same word used for different concepts (ambiguity)
   - Different words used for the same concept (synonyms)
   - Vague or overloaded terms
3. **Propose a canonical glossary** with opinionated term choices
4. **Present the glossary** using the format below. Distinguish agreed terms from proposed terms and unresolved ambiguities.
5. **Save only if requested**, using the named destination or the project's existing glossary convention. Read any existing file before merging changes.

## Output Format

Use this structure in chat or in an explicitly requested artifact:

```md
# Ubiquitous Language

## Order lifecycle

| Term        | Definition                                              | Aliases to avoid      |
| ----------- | ------------------------------------------------------- | --------------------- |
| **Order**   | A customer's request to purchase one or more items      | Purchase, transaction |
| **Invoice** | A request for payment sent to a customer after delivery | Bill, payment request |

## People

| Term         | Definition                                  | Aliases to avoid       |
| ------------ | ------------------------------------------- | ---------------------- |
| **Customer** | A person or organization that places orders | Client, buyer, account |
| **User**     | An authentication identity in the system    | Login, account         |

## Relationships

- An **Invoice** belongs to exactly one **Customer**
- An **Order** produces one or more **Invoices**

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is only generated once a **Fulfillment** is confirmed."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User** — these are distinct concepts.
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others as aliases to avoid.
- **Flag conflicts explicitly.** If a term is used ambiguously, call it out in "Flagged ambiguities" with a clear recommendation.
- **Only include terms relevant for domain experts.** Skip names of modules or classes unless they have domain meaning.
- **Keep definitions tight.** One sentence max. Define what it IS, not what it does.
- **Show relationships.** Use bold term names and express cardinality where obvious.
- **Group terms into multiple tables** when natural clusters emerge. One table is fine if terms are cohesive.
- **Write an example dialogue.** 3–5 exchanges between a dev and domain expert showing terms used precisely.

## Re-running

When invoked again in the same conversation:

1. Read the previous chat proposal or the saved glossary when an update to that artifact is requested
2. Incorporate any new terms from subsequent discussion
3. Update definitions if understanding has evolved
4. Re-flag any new ambiguities
5. Update the example dialogue when it helps verify the new terms

Check that definitions and cardinalities follow conversation or project evidence. Mark unknown relationships instead of inventing them.

