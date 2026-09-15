---
description: Diagnose a problem safely without changing files
argument-hint: "[problem or failing behavior]"
---
Diagnose ${ARGUMENTS:-the problem described in the current context}.

Adapt the depth of the investigation to the problem. Reproduce the behavior when safe, isolate the smallest failing boundary, form hypotheses from observed evidence, and verify the most likely explanation. Distinguish facts from hypotheses and state any limitation that prevents verification.

Prefer read-only, local checks. Preserve user data and avoid destructive or external actions. Do not edit files or create mandatory diagnosis artifacts unless the user explicitly requests an implementation or a written artifact.
