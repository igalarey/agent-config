# Third-party notices

The original code and documentation in this repository are available under the root
[MIT license](LICENSE). That license does not replace the licenses or notices of
third-party material and dependencies.

## find-skills

`skills/find-skills/SKILL.md` is adapted from
[Vercel Labs skills](https://github.com/vercel-labs/skills), reviewed at commit
`1682051d48c34f5eb135e6475c1a965dce05e820` (`skills/find-skills/SKILL.md`).
Copyright (c) 2026 Vercel, Inc.; MIT. The complete notice is retained inside the skill
so it is also present in installed copies. Local changes limit discovery/installation
suggestions to explicit user requests; this is not a byte-identical upstream snapshot.

## tintinweb packages

`vendor/pi-tasks/` and `vendor/pi-supervisor/` contain MIT-licensed source snapshots
from [tintinweb/pi-tasks](https://github.com/tintinweb/pi-tasks) and
[tintinweb/pi-supervisor](https://github.com/tintinweb/pi-supervisor). Exact revisions
are recorded in `manifests/tintinweb.json`. Their original LICENSE files are retained.
Media, GitHub workflows and contributor-only instructions are excluded from the snapshots.
`vendor/pi-tasks/` has one local change: `src/auto-clear.ts` starts the auto-clear countdown
for completed tasks it did not see complete, such as tasks carried over by a restart or
resume. Upstream `29180d7` keeps those tasks until the next `TaskCreate`.
`test/auto-clear.test.ts` adds tests for it. `vendor/pi-supervisor/` has local Pi 0.87.1
compatibility changes:

- `package.json` declares the Pi packages as exact 0.87.1 development dependencies, and
  the lock is regenerated. Without this, npm installs the unpinned Pi peer dependency, an
  outdated Pi copy with known vulnerabilities, into the runtime package.
- `src/model-client.ts` streams through `ctx.modelRegistry.streamSimple()`. Pi 0.87 removed
  the `modelRegistry` option of `createAgentSession()`.
- `src/ui/model-list.ts` replaces `ModelSelectorComponent` in the model picker and settings
  panel. In Pi 0.87 that component needs a `ModelRuntime`, which extensions cannot reach.
- `test/model-client.test.ts` adds tests for the streaming call.
- `README.md` describes the new picker.

[tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) is fetched at the
recipe's exact commit. Its MIT license is included in each prepared release.
`manifests/subagents-notifications.json` records local Pi 0.87.1 delivery changes and test-fixture compatibility edits.
The upstream notice is MIT, copyright (c) 2026 tintinweb.
`vendor/pi-tasks/LICENSE` also retains that complete notice for the patch text in this repository.
See [completion delivery](docs/notification-delivery.md) for behavior and verification.
RTK is no longer distributed or installed.

## Native npm packages

[nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) 2.33.0,
[nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) 0.29.0 and
[CaptCanadaMan/pi-ollama](https://github.com/CaptCanadaMan/pi-ollama) 0.1.7 are installed
unmodified from npm, with their upstream MIT notices. `native/package-lock.json` fixes
versions and integrity hashes, including transitive dependencies and their own licenses.
The local MCP wrapper and web-fetch implementation have been retired. No MCP server
configuration or credentials are bundled. The Bigpowers npm package is no longer installed.

## Curated Bigpowers skills

The original 14 curated skill directories came from the local Bigpowers 2.88.6 deployment.
`diagnose-root` now contains a Hermes-derived adaptation instead of its original content. The source package is [danielvm-git/bigpowers](https://github.com/danielvm-git/bigpowers)
and is distributed under MIT. `pi-skills/LICENSE.bigpowers` retains the complete upstream
license text; `manifests/curated-skills.json` records the npm integrity and SHA-256 hash
for every retained asset. Except for the declared adaptation, the copies match the package's
canonical `skills/` files, including references, scripts and fixtures. They do not use the generated `.pi/skills/`
variants. No Bigpowers hooks, prompt templates or extension are installed.

## Hermes-derived methods

The adapted `diagnose-root`, `grounded-citations`, `simplify-code`, `spike`, and `ast-grep`
skills derive from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
commit `47676981f55de91231fdeef2f0eec47e7c209e78`.
`pi-skills/LICENSE.hermes` retains the MIT notice, copyright (c) 2025 Nous Research.
`manifests/curated-skills.json` records exact source paths, hashes, and local changes.
These are method adaptations for Pi, not unmodified Hermes skills or a Hermes runtime.

Hermes attributes systematic-debugging to [obra/superpowers](https://github.com/obra/superpowers).
Its spike skill credits the GSD /gsd-spike workflow, MIT copyright (c) 2025 Lex Christopherson.
The ast-grep skill credits Yeongyu Kim, whose separate MIT notice remains in `pi-skills/ast-grep/LICENSE`.
The learning extension is a local implementation informed by Hermes review prompts,
ownership guards, and staged approvals. It does not copy the Python agent fork or memory store.
See [the source review and exclusions](docs/hermes-adoption.md).

## Other release sources and dependencies

Subagents and observational memory are obtained from the separate source repositories
linked in the README. They retain their respective MIT notices and upstream attribution;
the bootstrap pins their commits rather than incorporating mutable working directories.
Pi, TypeBox, Playwright and other npm dependencies retain their own licenses in their
packages. Installing a release does not relicense those dependencies.

`pi-ask-user-question`, `pi-browser`, `pdf-reader`,
`youtube-transcript` and `analyze-sessions` are local implementations. They do not copy
code from the unlicensed external configuration repository considered during design.
