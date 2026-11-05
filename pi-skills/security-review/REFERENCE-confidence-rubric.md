# Confidence and Severity

Confidence measures evidence. Severity measures impact. Score them separately.
A high-confidence finding is not automatically HIGH severity.

## Evidence status

| Status | Evidence | Reporting |
|--------|----------|-----------|
| Reproduced | A safe fixture demonstrates the boundary failure | Give the command, observed result, and limits. |
| Static finding | Source tracing establishes input control, sink, and missing defense | Give exact locations and necessary preconditions. Do not claim execution. |
| Conditional risk | A credible path depends on an unverified condition | Name that condition and how to check it. |
| Unresolved question | Input control, reachability, defense, or impact remains unclear | State what is unknown and the next bounded probe. |
| Dismissed | Evidence blocks the suspected path | Record the effective defense or scope limitation. |

## Optional confidence score

Use a number only when the review format needs one:

- **9–10:** Reproduced or complete source trace, with explicit preconditions and no material unknowns.
- **8:** Strong source evidence, with limited uncertainty stated in the finding.
- **7:** Plausible path with an important unresolved condition. Label it conditional, not confirmed.
- **Less than 7:** Insufficient evidence for a finding. Retain consequential open questions in the coverage section.

Do not use a confidence cutoff to erase material uncertainty from a threat model.
Dependencies, configuration assumptions, and untested paths belong in the limitations even when they are not confirmed findings.

## Severity

| Severity | Impact under the stated preconditions |
|----------|--------------------------------------|
| CRITICAL | Broad remote compromise or large-scale sensitive data loss |
| HIGH | Significant privilege, integrity, or confidentiality boundary failure |
| MEDIUM | Limited impact or restrictive attack conditions |
| LOW | Small blast radius or a specific defense-in-depth weakness |

Explain attacker access, affected data, required privileges, and effective mitigations.
Do not copy an advisory's severity onto the application without checking its use of the dependency.

## Quality check

For each finding, verify:

1. The evidence supports the claimed input control and trust boundary.
2. The exploit scenario uses stated, credible preconditions.
3. The recommendation addresses the demonstrated mechanism.
4. Severity follows impact, not certainty or category alone.
5. The report distinguishes observed behavior, source analysis, and assumptions.
