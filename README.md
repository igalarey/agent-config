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
| Selected Bigpowers skills | `npm:bigpowers@2.88.6`, exact 14-skill allowlist; prompts/extensions disabled |
| Project-owned prompt templates | `prompts/*.md`, installed as global Pi commands |
| Codex/Claude subscription footer | `vendor/pi-subscription-usage` |

**RTK and pi-interactive-subagents are retired.** The old worker/scout/researcher
profiles, bridges and external viewer are not part of the new base.

Instructions, guides and skills are projected into `~/.agents`; prompt templates are
projected into `~/.pi/agent/prompts`. Existing shared files are preserved, especially
`SYSTEM.md`; the installer does not silently replace shared user policy. Fresh homes receive
the repository's defaults. Edit shared policy separately.

## Install

Requirements: **Node 22.23.2**, npm, Git and **Pi 0.85.1** already installed.
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
external sources at exact commits, prepares seven base packages and three native npm packages, runs offline verification,
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
conversation context. These templates are independent of the disabled Bigpowers prompts.

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
| `agents/` | Five model/tool profiles and a child-only Luna priority hook |
| `prompts/` | Four global Pi prompt templates installed by filename |
| `SYSTEM.md`, `guides/`, `skills/` | Defaults for new shared instruction/skill resources |

### Herdr (optional)

The current Herdr configuration is tracked at `config/herdr/config.toml`. It contains
only the Vesper color palette, sidebar/interface preferences, system toast delivery with
copy notifications disabled, and sounds disabled. It does not include Herdr keybindings,
commands, sockets, logs or session state.

The Pi installer does not modify `~/.config/herdr/config.toml`. To apply this optional
configuration manually, review the file and copy it to `~/.config/herdr/config.toml`, then
run:

```sh
herdr config check
herdr server reload-config
```

Astra remains the parent default. Profiles inherit instructions, not the parent's model:

| Profile | Model / reasoning | Local tools | Turn default |
| --- | --- | --- | --- |
| Explore | Luna medium, priority requested | read, grep, find, ls | 20 |
| general-purpose | Luna medium, priority requested | Above plus bash, edit, write | 30 |
| Plan | Sol high | Read/search only | 30 |
| deep-implementation | Sol high | Read/search plus bash, edit, write | 40 |
| deep-review | Sol high | Read/search only | 30 |

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
- Browser uses an existing Chrome/Edge, ephemeral context and public destinations;
  sensitive interaction requires a separate grant. It never downloads the browser.
- MCP uses the unmodified npm adapter, not our retired wrapper. Its persistent footer is
  disabled with `settings.mcpFooterStatus: "off"`; `/mcp status` remains available.
  It includes no servers or credentials. Server configurations are trusted executable
  configuration; uncached discovery can connect even in lazy mode. MCP does not inherit
  browser network restrictions. Future stdio servers should use explicit environment
  and `inheritEnv: false`.
- Subscription usage uses Pi's OAuth resolver and fixed provider endpoints. Refresh runs
  only in interactive TUI, not RPC. Offline tests do not certify authenticated quota or clicks.
- Observational memory retains the existing compaction configuration. Its observer and
  consolidator make model calls. Sessions and generated memories remain private.
- PDF/YouTube skills are retained for local page rendering and actual captions; they need
  separately installed Python/PyMuPDF/yt-dlp. `analyze-sessions` is our original local
  implementation, not a third-party skill, and only reads sessions on explicit request.
- Bigpowers loads exactly these 14 skills: `align-grid`, `context7-mcp`,
  `security-review`, `design-interface`, `deepen-architecture`, `elaborate-spec`,
  `grill-me`, `define-language`, `diagnose-root`, `enforce-first`, `edit-document`,
  `simple-english`, `smoke-test` and `validate-contracts`. Prompts and extensions remain
  disabled, so its Git hooks, MCP server and workflow templates do not load. The four
  project-owned English prompt templates remain separate and unchanged.

  Skills are instructions, not capability grants. A relative `scripts/...` command names
  a file in the consumer project; installing the npm package does not project that helper
  into every repository. Adopt the required project files deliberately. Do not run
  `bigpowers init` automatically: it is separate project setup and refuses an existing
  `scripts/` directory. Linked lifecycle skill names are handoff suggestions only.

  | Skill | Required before use |
  | --- | --- |
  | `align-grid` | Project copies of `grid_tokens.py` and `verify_grid.js`, Node/Python, Puppeteer Core, an installed Chrome-compatible browser and a real local font for offline optical checks. Publishing or image search needs separate network authorization. |
  | `context7-mcp` | An explicitly configured Context7 MCP server and project-local `scripts/lib/doc-fetch-cache.sh`; maximum three service calls. `bts` is only an optional fallback. |
  | `security-review` | A Git repository with a usable diff/merge base and `specs/security/`. Parallel-worktree and fixture verification additionally require the named project scripts. |
  | `design-interface` | Clear caller requirements, three parallel slots and a compatible launch tool. Its text names a generic `Task` tool; this base instead exposes parent `Agent`, so a role without delegation cannot comply. The skill grants neither delegation nor nesting. |
  | `deepen-architecture` | Git history, parent access to an Explore agent and project-local `scripts/bp-churn-rank.sh`. Import changes additionally need `specs/import-boundaries.json` and `scripts/check-import-boundaries.sh`; architecture/ADR files are optional inputs. |
  | `elaborate-spec` | Interactive user confirmation and permission to write `specs/planning-context.yaml`. The npm artifact omits its linked `docs/countable-story-format.md`; downstream skills are not enabled transitively. |
  | `grill-me` | An interactive plan and codebase access. Docs mode needs an authorized current-document fetch tool; its text names `WebFetch`, while this base exposes native web-access tools. It must stop for approval before writing specs or implementing. |
  | `define-language` | Enough domain conversation to resolve terms and permission to write `specs/UBIQUITOUS_LANGUAGE_LATEST.md`. |
  | `diagnose-root` | A confirmed reproducible bug and an existing active `specs/bugs/BUG-*.md`; the skill updates that file but does not create it or implement a fix. |
  | `enforce-first` | A project `CONVENTIONS.md` with the canonical F.I.R.S.T section plus runnable lint, typecheck, test and coverage gates. |
  | `edit-document` | An existing document, its Git history when available and interactive confirmation of the proposed section structure; edits retain the upstream 240-character paragraph rule. |
  | `simple-english` | Passage classification and the shipped reference. Its deterministic gate requires Python 3 and a project-accessible executable `skills/simple-english/scripts/ste_lint.py`; final STE approval remains with the writer. |
  | `smoke-test` | An already deployed live URL, explicit network authority, `curl`, Python 3 and project-local `scripts/run-smoke.sh` plus `scripts/lib/python-env.sh`. Single-URL mode works without YAML. In the shipped multi-check runner, `method` and `SMOKE_RETRIES` are not applied, and a status-only success is not counted without `content_signal`; do not claim those checks. |
  | `validate-contracts` | Version-controlled YAML under `specs/contracts/` and project-local `scripts/validate-contracts.sh`. The shipped runner requires Bash, Python 3 and JSON inputs, and only enforces key-set mode; schema/shape currently return `SKIP` and need separate consumer tooling. |

  `extract-design` remains excluded because it mandates a broader lifecycle handoff and
  depends on Puppeteer plus `@google/design.md` checks not guaranteed here. No other
  planning, deployment, review or coordination skill is enabled. Third-party skill
  instructions do not override shared policy or user authorization.

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
templates, the exact Bigpowers skill allowlist with no Bigpowers prompts or extension, and
the disabled MCP footer. Native npm packages are installed by
`pi install` in review, then reproduced with `npm ci --legacy-peer-deps --ignore-scripts`.
The verified npm prefix is copied intact to `~/.pi/agent/npm`; settings retain `npm:`
entries. Bootstrap backs up an unchanged managed prefix on update and refuses to overwrite
unmanaged changes. Add default packages through the source and prepare a new release.
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

The published history starts from the current harness baseline. The next commit pins its
verified release; both commits are required because the recipe references the baseline's
exact hash. Earlier Git history is retained in a private external recovery bundle, not
in published `main`. Existing clones must not merge the previous history back into this
branch; use a fresh clone and preserve any local work separately. Historical commit links
in migration notes refer to that archive.

Old sealed releases remain untouched. This migration is not a promise of automatic reverse
migration to the retired runtime; retain backups and the corresponding historical installer
and Node/Pi versions when recovery to an older base is required.

No push is performed by installation. Do not use `git push --all` or `--mirror`: development
checkouts may contain private historical refs. Push only the reviewed `main` branch.
Original code is MIT; [third-party notices](THIRD_PARTY_NOTICES.md) preserve upstream licenses.
