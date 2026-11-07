# Knowledge ownership

## One owner per resource

| Resource | Maintained source | Installed location | Update owner |
| --- | --- | --- | --- |
| Shared policy | User's `~/.agents/SYSTEM.md` | Same file | User; never replaced during an upgrade |
| Shared guides | `guides/` supplies new-home defaults | `~/.agents/guides/` | User owns existing files; installer only fills missing defaults |
| Common skill defaults | `skills/` supplies reviewed defaults | `~/.agents/skills/` | User owns existing files; explicit reviewed synchronization only |
| Active curated Pi skills | `pi-skills/` and `manifests/curated-skills.json` | `~/.pi/agent/skills/` | Verified harness release |
| Archived curated skills | `archive/pi-skills/` and historical archive manifests | None; source Git only, excluded from new releases | Explicit reviewed source restoration |
| External common skills, such as Herdr | Their own reviewed source | `~/.agents/skills/` | Their external installer |
| Prompt commands | `prompts/` | `~/.pi/agent/prompts/` | Verified harness release |
| Approved learned skills | Reviewed private proposals | `~/.pi/agent/skills/learned/` | Human approval through Learning |
| Episodic memory | Current session evidence | Session-scoped memory storage | Observational memory |

Repository defaults do not make the repository authoritative over existing private policy.
The installer preserves unknown edits and reports conflicts instead of silently replacing them.

## The Skills CLI lock is not the harness inventory

`~/.agents/.skill-lock.json` belongs to the external Skills CLI.
It records that installer's provenance, not every skill available to Pi.
Common skills copied from this harness do not need fabricated CLI provenance entries.
When explicitly adopting an external skill as a maintained local adaptation, preserve its provenance and remove its CLI update registration with a backup.
This prevents an external bulk update from replacing the local adaptation.
The curated manifest records a different, explicit ownership boundary.

Before removing an obsolete CLI entry, confirm its skill directory is absent and preserve the original lock.
Do not infer absence from a stale model context or an unavailable command.
Do not delete a present skill merely because another installer does not list it.

Use the harness inventory and installed directories to explain current availability.
Do not introduce another editable version registry.
A skill description cached in a running Pi session can outlive its file; restart Pi after a release change.
The nine active curated names are listed in the [README](../README.md). Retired skills
retain exact bytes, assets, licenses and provenance in the [recovery archive](../archive/README.md).
Do not register that archive as a skill path or treat its historical manifest as active inventory.

## Keep knowledge classes separate

- Policy defines authority and constraints.
- Project instructions describe verified project facts and commands.
- Guides and skills describe procedures with explicit prerequisites and effects.
- Memory records events with provenance; it never grants permission.
- Learning proposes reusable procedures. Human review is required before promotion.

Use the shared guide index to select relevant material. Keep prompts as thin entries to the same procedures.
A link to optional project documentation is not a dependency on an uninstalled framework.
Popularity, download counts, and a successful loader check do not establish instruction quality or safety.

## Verification

`npm run doctor` (also `npm run health`) checks release integrity, verification, installed compatibility, and pending configuration.
The standalone installed compatibility command has a narrower scope:

```sh
node ~/.pi/agent/scripts/verify-compatibility.mjs
```

It does not authenticate providers or certify interactive workflows.
Run the skill validator against source before release preparation; its checks cover local references and known obsolete dependencies.
Review the instructions themselves for authority, effects, and correctness. A structural validator cannot prove those properties.
