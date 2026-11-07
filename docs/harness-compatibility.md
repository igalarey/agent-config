# Harness compatibility

## Sources and installed files

The repository defines the configuration. Its release recipe pins source commits.
The native lockfile fixes npm dependencies. A verified release contains the selected
sources and dependencies. The installer projects those files into the user home.

`harness-manifest.json` is a generated inventory, not a second set of version pins.
The installer derives it from the selected release. The compatibility check compares
it with the active release, installer state and deployed files.

The authority map is `config/HARNESS-AUTHORITY.md`. The installer projects it to
`~/.pi/agent/HARNESS-AUTHORITY.md`. Component responsibilities do not change:
Pi owns session execution, the task package owns task state, and Carbon changes presentation.

## Curated skills

`pi-skills/` contains nine active curated skills and their required assets.
The [source-only archive](../archive/README.md) preserves the nine retired skills,
licenses and historical provenance without discovery or installation. The release
builder excludes `archive/`; historical sealed releases keep their original catalogs.
Their history includes Bigpowers selections and Hermes-derived adaptations, not those runtimes.
The installer projects them to `~/.pi/agent/skills/`. It does not create duplicate
copies in `~/.agents/skills/` or reinstall the Bigpowers npm package.

`manifests/curated-skills.json` records the source, npm integrity and file hashes.
`pi-skills/LICENSE.bigpowers` retains the upstream MIT license.
The skills do not enable Bigpowers hooks, prompts or its MCP server.

Skills provide instructions, not extra tool permissions. Some instructions need
project files or external services. The installer does not create those project
files, install browsers or authorize network calls.

## Local verification

Run the installed check without model calls:

```sh
node ~/.pi/agent/scripts/verify-compatibility.mjs
```

The check reports missing, changed or incompatible resources. The release checks
also load the curated skills through the official Pi CLI in an isolated home.
Those checks verify registration, not every external workflow described by a skill.
Use the skill validator and review procedure content before preparing a release.
See [knowledge ownership](knowledge-ownership.md) for the distinct common, curated, external, and learned skill inventories.

For release seals, local runtime dependency integrity, compatibility, and pending configuration together, run:

```sh
npm run health
```

This is an alias for `npm run doctor`. The standalone compatibility verifier does not replace this full check.
Neither check certifies authentication, live models, or human UI approvals.

## Updates and migration

Update the source configuration and release recipe, not the generated inventory.
Run the bootstrap preview. Review the plan before applying it.

```sh
npm run bootstrap
npm run bootstrap -- --apply
```

The installer adopts identical local skill files. It recognizes the exact legacy
compatibility files from the earlier manual setup. Unknown edits cause a conflict
instead of an overwrite. Existing private settings, sessions and credentials remain
outside this migration.

After activation, run the installed compatibility check. Restart Pi to load the
new resources. A successful repeat bootstrap reports no planned changes.
