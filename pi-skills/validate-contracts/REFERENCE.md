# Contract Validation Reference

No original-repository runner or global CLI is required.
The examples use project inputs, not files bundled with this skill.

## Local key-set comparison

With Python 3 already installed, run this example against two local JSON objects.
Arguments are reference file, target file, and comparison mode.
`subset` means every reference key must exist in the target. `exact` also rejects extra target keys.
This example compares top-level keys only.

```sh
python3 - reference.json target.json subset <<'PY'
import json
import sys

reference_file, target_file, mode = sys.argv[1:]
if mode not in {"subset", "exact"}:
    raise SystemExit("mode must be subset or exact")
with open(reference_file, encoding="utf-8") as stream:
    reference = json.load(stream)
with open(target_file, encoding="utf-8") as stream:
    target = json.load(stream)
if not isinstance(reference, dict) or not isinstance(target, dict):
    raise SystemExit("both inputs must be JSON objects")
missing = sorted(reference.keys() - target.keys())
unexpected = sorted(target.keys() - reference.keys())
print(json.dumps({"missing": missing, "unexpected": unexpected}))
raise SystemExit(1 if missing or (mode == "exact" and unexpected) else 0)
PY
```

For nested objects, define whether arrays use indices, wildcards, or element identifiers before comparing paths.
Do not flatten dotted keys without an escaping convention.

## JSON Schema

Use the project's installed validator and its documented CLI or API.
No JSON Schema engine is bundled. Do not download one automatically.
Before reporting full validation, verify:

- The validator supports the schema's declared dialect.
- The schema itself is valid.
- Required fields, nested properties, and `additionalProperties` behave as intended.
- Format assertions are enabled where the contract requires them.
- Local references resolve. Remote references do not trigger unauthorized network access.
- Positive and negative fixtures exercise the relevant constraints.

A manual field check does not implement arbitrary JSON Schema.
If no validator is available, report the supported subset and the remaining blocker.

## Shape and migration data

For each record, check required fields, nullability, types, and domain invariants.
Distinguish booleans from numbers when the runtime treats booleans as integers.
Check numeric ranges, date/time offsets, identifier preservation, duplicates, and expected row counts where relevant.
Treat missing, null, and empty values separately.
Do not coerce a bad value merely to make the validation pass.

Report record counts, mismatch paths, and failure totals. Redact sensitive values.
A small sample cannot establish that a complete migration is valid.
Keep captured production data private and do not send it to third-party validators.
