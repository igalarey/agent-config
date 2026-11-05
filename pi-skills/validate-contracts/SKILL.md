---
name: validate-contracts
phase: verify
model: sonnet
effort: standard
description: Validate data shapes or key sets across specified system boundaries. Use for requested contract checks or schema/data changes, not as an automatic deploy or migration workflow.
compatibility: Local checks use an existing runtime. Full JSON Schema validation needs an installed validator for the schema dialect; no runner is bundled.
---

# Validate Contracts

Check consistency without deploying, migrating, changing producer data, or installing dependencies.
Use reading/search and an existing local runtime or project validation command.
Live API checks require an available, permitted network tool and authorized target. Prefer synthetic or local captured data.

## Select the contract

Read the requested schema, producer, consumer, and representative data.
Project contract files and their locations are optional conventions, not prerequisites.
If the contract is absent, derive expectations from source and identify assumptions before validating.
Do not silently create a persistent contract or declare a schema stale because of its age alone.

| Mode | Assertions |
|------|------------|
| Schema | Required fields, types, nested structure, constraints, and additional properties |
| Key-set | Missing and unexpected keys, with explicit comparison direction and nesting rules |
| Shape | Every record's required fields, nullability, types, formats, and migration invariants |

See [REFERENCE.md](REFERENCE.md) for runnable local key-set comparison and schema/shape checklists.

## Run validation

1. Define the boundary, input snapshot, expected rules, and observable failure condition.
2. Use the project's existing validator when present. Inspect its actual options and dependencies first.
3. For JSON Schema, verify dialect and format support in the installed validator.
4. If only a partial manual or scripted check is possible, name its exact coverage. Do not call it full schema validation.
5. Run against the agreed data scope. Record counts and precise mismatch paths without exposing private values.

A parsed JSON object is not necessarily valid. Compare required fields and types explicitly.
Validate all relevant records, or disclose sampling and its limits.

## Resolve divergence and report

Distinguish missing keys, unexpected keys, type mismatches, nullability, and format violations.
Explain whether the producer, consumer, or contract conflicts with the intended behavior.
A validation request does not authorize a data repair or schema rewrite.
If fixes are requested, use local, scoped changes and rerun the same assertions.
Report exact commands, inputs or fixture identifiers, record counts, outcomes, and unsupported constraints.
