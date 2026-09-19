# Pi harness: authority map

## Authority chain

The canonical inputs are this repository's manifests, vendored source, native npm lock,
and configuration source. A release is built only from pinned commits, verified, and then
sealed. The installer projects that selected release into the user's Pi configuration.
Managed files under `~/.pi/agent` and its npm prefix are deployed outputs.
They are not a second source of version pins. Private settings and unrelated local
resources remain user-controlled.

`harness-manifest.json` is a generated compatibility inventory for the active release. It
records facts derived from the verified `release.json`, the release's native package and
lock metadata, and the curated-skill manifest. The verifier regenerates those facts before
comparing them. The inventory is audit evidence, not an independent set of manual pins.

## Responsibilities

| Area | Authority | Derived or consuming layer |
|---|---|---|
| Release identity and source commits | Verified and sealed `release.json` | Installer state selects one release; inventory repeats its identity for audit. |
| Local package versions and entrypoints | Release package metadata and source inventory | Pi settings point to the selected release paths. |
| Native npm versions and integrity | `native/package.json` and `native/package-lock.json` in the release | The verified native prefix is copied to `~/.pi/agent/npm`; inventory records installed metadata. |
| Curated skills | `manifests/curated-skills.json` plus `pi-skills/` in the release | Installer projects them to `~/.pi/agent/skills`. They do not depend on an installed Bigpowers package. |
| Other managed resources | Release source and installer managed hashes | Pi loads projected prompts, extensions and themes according to settings and Pi's loader rules. |
| Session, context and native tool lifecycle | Pi core | Extensions add capabilities without taking ownership of Pi's lifecycle. |
| Tasks and task state | `@tintinweb/pi-tasks` | `carbon-tasks` adapts registration and presentation; the original package entrypoint is suppressed to prevent duplicate activation. |
| Agent delegation | `@tintinweb/pi-subagents` | Tasks may describe work; the supervisor may advise but does not execute it. |
| Conversation memory | `observational-memory` | Pi remains responsible for context and compaction lifecycle. |
| User questions | `pi-ask-user-question` | The main agent decides when user input is required. |
| Public browsing and web research | `pi-browser` and `pi-web-access` | Their existing public-network and provider boundaries remain unchanged. |
| MCP tools | `pi-mcp-adapter` | MCP server configuration and permissions remain separate and user-controlled. |
| Local Ollama provider | `pi-ollama` | Pi remains responsible for inference lifecycle. |
| TUI presentation | Carbon UI and the Carbon theme | Presentation does not own task, agent, memory or session data. |

## Compatibility verification

Run the projected verifier without network access:

```sh
node ~/.pi/agent/scripts/verify-compatibility.mjs
```

It checks the active installer state and settings against the selected release, regenerates
the expected inventory, verifies exact npm pins and lock metadata, checks local package
identity and entrypoints, verifies release source and managed resource hashes, confirms Bigpowers is absent,
confirms task entrypoint suppression, and compares the installed Pi version. It does not
read authentication, sessions, model data, memories or private MCP configuration.

A failure means the deployed state has drifted or the selected release is inconsistent.
Prepare and verify a new release for intended version changes. Do not edit the generated
inventory or a sealed release to make the check pass.

## Security boundary

Versioning these skills independently of Bigpowers does not grant new permissions. Skills
are instructions and local assets; tool access, network policy, credentials and user
authorization continue to be controlled by Pi, the active agent profile and the shared
policy in `~/.agents/SYSTEM.md`. The installer preserves that shared policy and does not
replace it with this document.
