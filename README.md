# agent-config

Reproducible global configuration and installer for [Pi](https://pi.dev).
This repository is the installation entry point. Native npm packages use Pi's normal
package manager and settings syntax, with locked dependencies for reproducible bootstrap.
Do not register a second copy of the same package.

## Base

| Package | Source |
| --- | --- |
| Subagents (`Agent`, `/agents`, workflows) | [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) |
| Tasks (`TaskCreate`, `TaskExecute`, `/tasks`) | [tintinweb/pi-tasks](https://github.com/tintinweb/pi-tasks) |
| Supervisor (`start_supervision`, `/supervise`) | [tintinweb/pi-supervisor](https://github.com/tintinweb/pi-supervisor) |
| Observational memory (`/om`) | [igalarey/pi-observational-memory](https://github.com/igalarey/pi-observational-memory) |
| User questions | `vendor/pi-ask-user-question` |
| Web search and fetch | `npm:pi-web-access@0.29.0` |
| Public browser | `vendor/pi-browser` |
| MCP gateway | `npm:pi-mcp-adapter@2.33.0`, nicobailon upstream directly |
| Project-owned prompt templates | `prompts/*.md`, installed as global Pi commands |
| Codex/Claude subscription footer | `vendor/pi-subscription-usage` |
| Native Ollama provider | `npm:pi-ollama@0.1.7` |
| Claude provider bridge | `npm:pi-claude-bridge@0.8.0` |
| Carbon UI and theme | `extensions/`, `themes/`; [configuration](docs/carbon-ui.md) |
| Curated local skills | `pi-skills/`, copied from Bigpowers 2.88.6 with its MIT license |

**RTK and pi-interactive-subagents are retired.** The old worker/scout/researcher
profiles, bridges and external viewer are not part of the new base.

Shared instructions, guides and skills are projected into `~/.agents`. Curated skills
from `pi-skills/` go to `~/.pi/agent/skills`. Prompt templates go to `~/.pi/agent/prompts`.
Existing shared files are preserved, especially
`SYSTEM.md`; the installer does not silently replace shared user policy. Fresh homes receive
the repository's defaults. Edit shared policy separately.

## Install

Requirements: **Node 22.23.2**, npm, Git and **Pi 0.87.1** already installed.
The release seal binds exact Node, OS and architecture. This revision is verified on
Linux; another platform must prepare and verify its own candidate. Bootstrap does not
install Node/Pi, authenticate providers, or download Chrome, RTK or Python executables.

```sh
git clone https://github.com/igalarey/agent-config.git
cd agent-config
npm run bootstrap
npm run bootstrap -- --apply
npm run doctor
```

Preview writes nothing and performs no dependency installation. Apply fetches the two
external sources at exact commits, prepares seven base packages and four native npm packages, runs offline verification,
and activates only after success. Tasks and supervisor are reviewed source snapshots
inside this repository; their revisions are in `manifests/tintinweb.json`.
`manifests/active-release.json` pins the harness, subagents and memory commits.
`manifests/memory-lock-additions.json` repairs two missing optional development entries
in the public memory lock, guarded by the original commit and SHA-256; memory code is unchanged.

No extra development clones are needed. Sources are cached under
`~/.agent-config/sources`; verified runtime packages live in `~/.agent-config/releases`.
A matching active release is validated, not reinstalled or retested. Development dependencies
are removed only after candidate verification, never from an activated release.

### Migrate an existing installation

```sh
npm run bootstrap -- --migrate-base
npm run bootstrap -- --migrate-base --apply
npm run doctor
```

`--migrate-base` explicitly retires the old package registration, the Pi RTK hook and
old global `.pi/agent/agents/*.md` profiles other than the three new base profiles.
It backs up exact originals before replacement/removal. It does not delete sessions,
memories, credentials, unrelated extensions, or a shared RTK executable/configuration.
Backups are private under `~/.agent-config/backups`.

Unrelated settings and package-object metadata are preserved. Duplicate package entries,
modified managed resources, ambiguous instruction adapters, destination changes and
symlinks cause refusal rather than a force overwrite. Multi-file application has preflight
checks and backups, but is not a filesystem transaction.

Restart Pi completely after activation. Existing sessions can retain old tool definitions;
start a new session for the new base. Authenticate using `/login` if necessary.

### Prompt templates

Pi discovers these project-owned global commands from `~/.pi/agent/prompts`:

- `/review [diff, commit, or scope]` reviews a diff with read-only, evidence-backed findings.
- `/diagnose [problem or failing behavior]` investigates safely without editing unless requested.
- `/compare-designs [design question or component]` compares two or three alternatives without implementing them.
- `/edit-document <document> [editing instructions]` edits the requested document while preserving intent and facts.

Arguments are optional where shown. With no argument, each command uses the current
conversation context. These templates are maintained in this repository.

## Configuration

| File | Purpose |
| --- | --- |
| `config/pi.settings.json` | Parent model/thinking and observational-memory settings |
| `config/subagents.json` | Global tintinweb subagent defaults |
| `config/tasks-config.json` | Global task defaults; session state outside repositories |
| `config/SUPERVISOR.md` | Advisory supervisor policy, not human authorization |
| `config/mcp.json` | MCP footer off; existing server definitions are preserved |
| `config/web-search.json` | Direct fetch, local PDF extraction, no browser cookies or curator |
| `config/herdr/config.toml` | Optional tracked Herdr theme and interface configuration |
| `native/package*.json` | Exact npm defaults and transitive dependency lock |
| `manifests/curated-skills.json`, `pi-skills/` | Curated skills, provenance, assets and hashes |
| `config/HARNESS-AUTHORITY.md` | Component responsibilities and configuration authority |
| `scripts/verify-compatibility.mjs` | Check the generated inventory against the active release |
| `agents/` | Five model/tool profiles and a child-only Luna priority hook |
| `prompts/` | Four global Pi prompt templates installed by filename |
| `SYSTEM.md`, `guides/`, `skills/` | Defaults for new shared instruction/skill resources |

### Herdr (optional)

The current Herdr configuration is tracked at `config/herdr/config.toml`. It contains
the Vesper theme, the `herdr-radar` managed sidebar and tab-bar blocks, interface
preferences, system toast delivery with copy notifications disabled, and sounds disabled.
The Radar blocks require the `hhdebb.herdr-radar` plugin; they do not include Herdr
keybindings, sockets, logs or session state. The Agents panel defaults to active-first,
grouped by recent activity; `prefix+a` switches between active-first and the flat recent
view, and `prefix+comma` opens Radar settings. The tab-bar command contains this user's
absolute Herdr state path, so run Radar's configure action again after copying the file
to a different home directory.

The Pi installer does not modify `~/.config/herdr/config.toml`. To apply this optional
configuration manually, review the file and copy it to `~/.config/herdr/config.toml`, then
install/enable `hhdebb.herdr-radar` and run:

```sh
herdr config check
herdr server reload-config
```

Astra remains the parent default. Profiles inherit instructions, not the parent's model:

| Profile | Model / reasoning | Local tools | Turn default |
| --- | --- | --- | --- |
| Explore | `gpt-6-luna` medium, priority requested | read, grep, find, ls | 20 |
| general-purpose | `gpt-6-luna` medium, priority requested | Above plus bash, edit, write | 30 |
| Plan | `gpt-6-sol` high | Read/search only | 30 |
| deep-implementation | `gpt-6-sol` high | Read/search plus bash, edit, write | 40 |
| deep-review | `gpt-6-sol` high | Read/search only | 30 |

All profiles use the `openai-codex` provider. The parent default is `gpt-6-astra`.
Read-only profiles cannot run `git diff`; include the diff in a review prompt.

Luna profiles load only `agents/luna-fast.mjs`, using an explicit home-relative path.
It registers no tools and requests `service_tier: priority` through Pi's provider-payload
hook only for Codex Luna. Sol profiles load no extensions. Priority is a request, not a
latency or entitlement guarantee; local token-price estimates are not subscription usage.
`high` is supported: missing standard levels in thinkingLevelMap use default mappings.

Children do not load MCP, browser, web, task, supervisor or memory tools. Skill discovery
is off, but inherited parent instructions can still contain skill descriptions. Fresh
conversation context is the upstream default; send only the task's necessary context.
External operations and decisions belong to the parent. Bash remains capable of external
access: these tool scopes and prompt instructions are not an OS sandbox.

Nesting is disabled globally (`maxSubagentDepth: 1`). The background pool is limited to
six agents and the foreground pool to two, independently. Model, thinking and turn
values are defaults that upstream invocation options can override, not hard spending caps.
The agents widget shows foreground and background agents with their model and estimated
cost (`widgetMode: all`, `showModel`, `showCost`); `fleetView` is off.

`config/subagents.json` is installed as the global `~/.pi/agent/subagents.json`.
A `.pi/subagents.json` file in a project, including `~/.pi/subagents.json` when Pi
starts in the home directory, applies only to that project.

Upstream worktree automation is disabled because it creates preservation commits with
`--no-verify`. Use ordinary Git worktrees with hooks instead. Background concurrency,
workflow concurrency and nested depth are different upstream limits, not the old lineage
budget. Agent mentions, workflows and supervision can incur additional model usage;
model availability and account quota require your own authentication.

Tasks use `session-global` storage and do not auto-cascade. Use them to track local
multi-stage work. Workflows run only when the user explicitly requests one. Supervisor is
installed but not started automatically; start it only with explicit user authorization for
the current outcome. Its instructions prohibit supplying user approvals or certifying
incomplete required work. These are model instructions, not a runtime permission boundary.
Only the user can stop active supervision through `/supervise stop`.

## Retained tools and privacy

- Pi-web-access replaces the local web-fetch implementation and adds search. Defaults
  disable browser-cookie access, hosted fetch fallbacks, GitHub cloning and the curator;
  PDF extraction uses local unpdf. Search still contacts a search provider and may use
  Codex authentication. YouTube understanding has different provider/cost requirements
  from actual caption extraction. These defaults are not an OS sandbox.
- Browser uses an existing Chrome/Edge or Playwright Chromium, an ephemeral context and
  public destinations; sensitive interaction requires a separate grant. It never downloads
  the browser.
- MCP uses the unmodified npm adapter, not our retired wrapper. Its persistent footer is
  disabled with `settings.mcpFooterStatus: "off"`; `/mcp status` remains available.
  It includes no servers or credentials. Server configurations are trusted executable
  configuration; uncached discovery can connect even in lazy mode. MCP does not inherit
  browser network restrictions. Future stdio servers should use explicit environment
  and `inheritEnv: false`.
- Subscription usage uses Pi's OAuth resolver and fixed provider endpoints. Refresh runs
  only in interactive TUI, not RPC. Offline tests do not certify authenticated quota or clicks.
  Codex models show ChatGPT quota. Direct `anthropic` and `claude-bridge` models show
  Claude quota. Bridge models use Pi's Anthropic OAuth, so they need `/login anthropic`
  in Pi with the same Claude account that Claude Code uses.
- Observational memory retains the existing compaction configuration. Its observer and
  consolidator make model calls with `gpt-6-luna`, high reasoning. Sessions and generated memories remain private.
- PDF/YouTube skills are retained for local page rendering and actual captions; they need
  separately installed Python/PyMuPDF/yt-dlp. `analyze-sessions` is our original local
  implementation, not a third-party skill, and only reads sessions on explicit request.
- Bigpowers is not installed. Its 14 selected skills are versioned as local copies,
  with their assets and MIT license. PDF, YouTube and session-analysis skills remain
  available. Historical release checks preserve compatibility with old releases.
- The installer generates `~/.pi/agent/harness-manifest.json` from the selected release.
  It is an audit inventory, not another source of version pins. See
  [harness compatibility](docs/harness-compatibility.md) for verification and migration.

## Development and releases

```sh
npm test                     # offline root regressions
npm run deps                 # preview local package dependency preparation
npm run deps -- --apply      # npm ci --ignore-scripts in local packages
npm run verify               # root + five local package groups; no live models/browser
```

The complete candidate additionally verifies subagents and memory (14 base package suites)
and five runtime checks using the official Pi CLI: loader/RPC, memory status, synthetic
TaskExecute/result delivery, child extension scope, read-only scope and in-process child
execution. It starts supervisor with a scripted offline provider, not a real account.
The same official loader checks native MCP/web tools, the four project-owned prompt
templates, Ollama command registration, absence of Bigpowers resources, and the disabled
MCP footer. Ollama discovery uses a blocked port in these checks; no inference is tested.
Native npm packages have exact versions in `native/package.json`. The release reproduces
them from `native/package-lock.json` with `npm ci --ignore-scripts --omit=dev --legacy-peer-deps`.
The verified npm prefix is copied intact to `~/.pi/agent/npm`; settings retain `npm:`
entries. Bootstrap backs up an unchanged managed prefix on update and refuses to overwrite
unmanaged changes. Add default packages through the source and prepare a new release:

```sh
npm run add-native -- <package>[@exact-version]   # pin version, lock and settings entry
npm test && git commit -am "feat(config): add <package>"
npm run pin-recipe                                # recipe -> current harness commit
git commit -am "chore(release): pin <package> release"
npm run bootstrap -- --source-map sources.local.json --apply
```

Never install a native package with `pi install` directly: the unpinned registration and
changed npm prefix make `verify-compatibility.mjs` fail and block later activations.
See [verification evidence](docs/verification.md).

For source development, an optional unversioned source map can override the cache:

```json
{"harness":".","subagents":"../pi-subagents","memory":"../pi-observational-memory"}
```

Pass `--source-map sources.local.json`. Paths resolve relative to that file. Repositories
must contain all pinned commits. See `npm run release -- --help` for candidate preparation
from exact commits, then `deps`, `verify`, `plan` and `apply` with `--release <id>`.
Commit source changes before preparing, update the recipe after verification, and publish
only reviewed commits. Do not update Pi or floating package branches blindly.

The published history starts from the current harness baseline. Each release pin commit
follows the harness commit that its recipe references by exact hash, so both are required. Earlier Git history is retained in a private external recovery bundle, not
in published `main`. Existing clones must not merge the previous history back into this
branch; use a fresh clone and preserve any local work separately. Historical commit links
in migration notes refer to that archive.

Sealed releases are never modified. Releases other than the active one may be deleted
to reclaim disk space; recovery then requires rebuilding the old commit. This migration is not a promise of automatic reverse
migration to the retired runtime; retain backups and the corresponding historical installer
and Node/Pi versions when recovery to an older base is required.

No push is performed by installation. Do not use `git push --all` or `--mirror`: development
checkouts may contain private historical refs. Push only the reviewed `main` branch.
Original code is MIT; [third-party notices](THIRD_PARTY_NOTICES.md) preserve upstream licenses.
