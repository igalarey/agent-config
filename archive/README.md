# Archived curated skills

This is a source-only recovery archive, not an active skill catalog. Do not add it to
Pi's skill paths, package metadata, installer projections, or release source prefixes.
The release builder selects `pi-skills/`, not `archive/`: new candidates do not contain
this archive. Recovery material stays in Git source history; earlier sealed releases
retain their original contents and are not rewritten by this change.

## Contents and provenance

Exactly nine skills were moved byte-for-byte from `pi-skills/` to `archive/pi-skills/`:
`ast-grep`, `define-language`, `design-interface`, `grill-me`, `simplify-code`,
`align-grid`, `deepen-architecture`, `spike`, and `validate-contracts`.
All 17 skill files, including scripts, references and the ast-grep author license,
remain intact. Copies of both shared MIT notices, `LICENSE.bigpowers` and
`LICENSE.hermes`, accompany the archived material; the active catalog retains its
own necessary copies.

- `curated-skills.json` lists only the archived files, their SHA-256 hashes, and the
  location/hash/source commit of the original provenance snapshot. Its file paths
  are relative to `archive/pi-skills/`.
- `curated-skills.original.json` is an exact, complete **pre-archive** snapshot of
  `manifests/curated-skills.json` at commit
  `1b2fa277dd48a008ff9f3826ea556d5931e3be3d`. It includes **both active and archived**
  skills, original upstream paths/hashes, npm integrity and local adaptation history.
  It is historical evidence, never an installer input or current catalog.
- `../manifests/curated-skills.json` is the active-only manifest. Historical adoption
  and verification documents are retained and do not imply current availability.

## Verification and restoration

Run from the repository root, without installing or activating anything:

```sh
node --test test/curated-skills.test.mjs test/skill-validation.test.mjs
node scripts/validate-skills.mjs
node scripts/validate-skills.mjs archive/pi-skills
```

The regressions pin the original manifest hash, check the exact file sets and hashes
of both catalogs, reject unwanted assets/symlinks, compare active provenance to the
historical snapshot, restore all nine skills into a temporary directory and validate
them there. They also verify the source installation plan projects only active files.
The archived grid scripts retain their deterministic scaffold and browser-free help checks.

To restore a skill in a future explicitly authorized source change:

1. Verify the archive and select its entry from `curated-skills.json`. Copy the whole
   directory from `archive/pi-skills/<name>/` to `pi-skills/<name>/`; do not copy only
   `SKILL.md` or modify a sealed release/installed home.
2. Merge its file hashes, skill name and applicable upstream/local adaptation records
   from the historical snapshot into `manifests/curated-skills.json`. Preserve the
   shared notices and any per-skill license. Keep this archive and snapshot intact.
3. Review current prerequisites, safety and any prompt references. If content changes,
   document the new adaptation and regenerate only the restored active file hashes.
4. Update the expected active inventory and recovery regressions to reflect that
   authorized restoration; run the root suite and both validators. Commit the source
   change and use the ordinary reviewed candidate/release process separately.

Archiving does not change an already installed home or invalidate historical releases.
Only a later verified activation updates managed installed resources. Restart Pi after
that activation so an old session does not retain cached skill descriptions. Prompts
remain a separate active catalog; retirement alone does not authorize deleting them.
