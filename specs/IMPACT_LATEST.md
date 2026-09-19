---
type: impact
context: expanded-bigpowers-skill-policy
---

# Expanded Bigpowers skill allowlist

## Target

- `config/pi.settings.json`: retain the existing three Bigpowers skills and add the 11
  reviewed skills, for an exact 14-skill allowlist.
- Keep Bigpowers `prompts: []` and `extensions: []`.
- Preserve the four project-owned English prompt templates.
- Keep Astra parent defaults, Luna medium profiles, Sol high profiles and
  observational-memory settings unchanged.
- Do not activate, prepare or mutate any sealed release.

## Dependents

- `scripts/install.mjs` merges the changed package object into user settings while
  preserving unrelated package metadata.
- `scripts/releases.mjs` will include the source config in a future candidate; prior sealed
  releases remain immutable.
- `scripts/runtime-smoke.mjs` must recognize exactly the historical three-skill policy and
  the new 14-skill policy. Any other explicit list, including a widening by one skill, fails.
- Official Pi loader evidence compares registered Bigpowers commands with the allowlist in
  the recognized release policy. Prompts and extensions remain independently forbidden.
- README, AGENTS.md and third-party notices must not describe the old count as current.

## Dependency assessment from Bigpowers 2.88.6

All 11 proposed additions are retained. None loads another skill automatically.

- `design-interface` requires three or more parallel design agents. The existing parent
  Agent harness can provide delegation, but the skill does not grant it and nesting stays off.
- `deepen-architecture` requires Git history, Explore delegation and project-local churn
  tooling. Import changes require the project's import-boundary files and checker.
- `elaborate-spec`, `grill-me`, `define-language` and `edit-document` require interactive
  confirmation and can write only their documented project artifacts. The npm artifact
  omits `docs/countable-story-format.md`, so that link is not a runtime guarantee.
- `diagnose-root` requires a confirmed bug and an existing active `specs/bugs/BUG-*.md`;
  it neither creates the bug file nor implements the fix.
- `enforce-first` requires a project F.I.R.S.T convention and runnable quality gates.
- `simple-english` requires Python 3 and a project-accessible shipped lint helper; it cannot
  certify final ASD-STE100 compliance.
- `smoke-test` requires a prior deployment, explicit live-network authority, curl, Python
  and project-local runner files. Enabling it does not enable `deploy`; the shipped runner
  also leaves its method/retry fields unenforced and miscounts status-only YAML successes.
- `validate-contracts` requires version-controlled contracts and its project-local runner.
  The shipped runner enforces key-set contracts only; schema and shape modes return `SKIP`.

The existing `align-grid`, `context7-mcp` and `security-review` prerequisites remain. Full
per-skill requirements are recorded in README.md. `extract-design` and every unlisted
planning, deployment, review and coordination skill remain excluded.

## Test coverage

- `test/native-packages.test.mjs` and `test/install.test.mjs`: exact 14-skill source and
  installed package policy with empty prompts/extensions.
- `test/install-rollback.test.mjs`: filter migration and safe rollback behavior with the new
  current policy.
- `test/verify.test.mjs`: unfiltered legacy releases, exact historical three-skill releases,
  exact current releases, unexpected registered commands and unknown allowlist widening.
- Runtime smoke: official Pi loader command inventory follows only a recognized exact policy.

## Risk: Medium

The change expands global instruction discovery and some skills can write project artifacts,
launch agents or contact live services when explicitly invoked. It adds no executable package,
automatic hook, MCP server, workflow, activation or new authority.
