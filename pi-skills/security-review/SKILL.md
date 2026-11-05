---
name: security-review
model: sonnet
effort: standard
description: Trace security risks across a specified diff or code path. Use for requested security reviews, vulnerability scans, or threat models, not every routine code review.
---

# Security Review

Inspect the requested scope and trace input control across trust boundaries.
Use file reading/search and local Git commands when Git context exists.
No external review scripts, framework, or report directory are required.
The default is read-only. A review does not authorize fixes, report files, network probes, or dependency installation.

## Resolve scope

Inspect repository state and the diff, commit, or files named by the user.
For branch comparisons, verify the intended local base before using a merge-base. Do not assume `origin/HEAD` exists or fetch it automatically.
Without Git context, review the named files and state that diff attribution is unavailable.
If several reviewers need mutable state, follow the project's worktree policy. A read-only scan does not need a worktree helper.

## Trace and assess

1. Identify languages, framework versions, authorization, and deployment assumptions from source and configuration.
2. State attacker capabilities, protected assets, trust boundaries, and material unknowns.
3. Trace untrusted input to sensitive operations across files. Inspect sanitization and authorization on the effective execution path.
4. Evaluate each candidate with [false-positive review](REFERENCE-false-positives.md) and [confidence guidance](REFERENCE-confidence-rubric.md).
5. Report confirmed findings, conditional risks, and consequential coverage gaps separately.

Review SQLi, XSS, SSRF, command injection, auth bypass, unsafe deserialization, path traversal,
IDOR, crypto, secrets, template and NoSQL injection where relevant.
Include prompt injection, operational Markdown, environment/CLI inputs, resource exhaustion, races, and unsafe/FFI code when the threat model reaches them.
No language, file extension, or input channel is automatically exempt.

Use [category guidance](REFERENCE-vuln-categories.md) as leads, not a substitute for a data-flow trace.
An unknown defense is not proof of a vulnerability. An untested path is not proof of safety.

## SQL classification

| Query construction | Assessment |
|--------------------|------------|
| Constant query structure | No value-injection path shown by this construction alone |
| Query with bound values | Check dynamic identifiers/fragments and driver semantics |
| Attacker-controlled interpolation | Trace whether input changes SQL structure and whether a defense blocks it |
| ORM or stored procedure | Inspect generated SQL and dynamic SQL inside the procedure |

HTTP, file, CLI, and environment input can be trusted or untrusted depending on who controls it.
Hardcoded SQL can still have authorization or data-loss defects unrelated to injection.

## Fixtures and guidance changes

The bundled fixtures illustrate specific boundaries. They are not a scanner or an executable test suite.
Read each positive/negative pair and explain the differing control before using it as review evidence.
Do not execute deliberately vulnerable fixtures against real services.

| Rule | CWE | Positive fixture | Negative fixture |
|------|-----|------------------|------------------|
| SQL injection | CWE-89 | `fixtures/CWE-89-sqli-positive.py` | `fixtures/CWE-89-sqli-negative.py` |
| DOM XSS | CWE-79 | `fixtures/CWE-79-xss-positive.js` | `fixtures/CWE-79-xss-negative.js` |
| Missing tenant scoping | CWE-639 | `fixtures/CWE-639-idor-positive.go` | `fixtures/CWE-639-idor-negative.go` |
| Fail-open verification | CWE-754 | `fixtures/CWE-fail-open-verify-positive.sh` | `fixtures/CWE-fail-open-verify-negative.sh` |

For new detection guidance, map to a suitable CWE when available and add a minimal positive/negative pair before changing a detector.
Run an actual detector only if the project supplies one, and report its command and limitations.

## Report

For each finding, give **file:line — severity — category**, then:

- Evidence status: reproduced, static, or conditional.
- Input control, preconditions, trust boundary, and concrete impact.
- Effective defenses checked and any missing evidence.
- A fix directed at the demonstrated mechanism.

Keep confidence separate from severity. Do not suppress material uncertainty with a numeric cutoff.
If there are no confirmed findings, say so without claiming the code is secure.
List reviewed scope, checks actually run, blocked checks, and unresolved threat-model assumptions.
Write an artifact only when requested, using the project's existing convention if one exists.
