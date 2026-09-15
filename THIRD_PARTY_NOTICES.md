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
Source, tests, package locks and user documentation are unchanged; media, GitHub workflows
and contributor-only instructions are excluded from the snapshots.

[tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) is fetched at the
recipe's exact commit. Its MIT license is included in each prepared release.
RTK is no longer distributed or installed.

## Native npm packages

[nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) 2.33.0,
[nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) 0.29.0 and
[danielvm-git/bigpowers](https://github.com/danielvm-git/bigpowers) 2.88.6 are installed
unmodified from npm, with their upstream MIT notices. `native/package-lock.json` fixes
versions and integrity hashes, including transitive dependencies and their own licenses.
The local MCP wrapper and web-fetch implementation have been retired. No MCP server
configuration or credentials are bundled. Bigpowers is unmodified; settings load only
14 named skills and disable its prompts and extension.

## Other release sources and dependencies

Subagents and observational memory are obtained from the separate source repositories
linked in the README. They retain their respective MIT notices and upstream attribution;
the bootstrap pins their commits rather than incorporating mutable working directories.
Pi, TypeBox, Playwright and other npm dependencies retain their own licenses in their
packages. Installing a release does not relicense those dependencies.

`pi-ask-user-question`, `pi-browser`, `pdf-reader`,
`youtube-transcript` and `analyze-sessions` are local implementations. They do not copy
code from the unlicensed external configuration repository considered during design.
