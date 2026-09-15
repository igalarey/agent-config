---
name: analyze-sessions
description: Inspect private local Pi session logs for costs, models, errors, prompts, and prior conversation text. Use only when the user explicitly asks to analyze, search, or inspect their Pi sessions.
compatibility: Node.js 22 or newer; reads ~/.pi/agent/sessions by default.
---

# Analyze Pi sessions

Session logs may contain private prompts, tool output, paths, and reasoning. Read them only for the user's explicit request. Do not publish, commit, or send extracted content to third parties.

Run the helper with Node.js:

```sh
node "<skill-directory>/scripts/analyze-sessions.mjs" list --since 7d
node "<skill-directory>/scripts/analyze-sessions.mjs" cost --since 30d --by model
node "<skill-directory>/scripts/analyze-sessions.mjs" search "error text" --since 30d
node "<skill-directory>/scripts/analyze-sessions.mjs" show <session-id-prefix>
node "<skill-directory>/scripts/analyze-sessions.mjs" prompts --since 7d
```

Replace `<skill-directory>` with the directory containing this `SKILL.md`. Use `--root <directory>` only for an alternate Pi session root. Use `--include-subagents` when desired; subagents are detected by the adjacent `.loadout.json` sidecar used by this harness. `show` omits assistant reasoning unless the user explicitly requests it and `--include-thinking` is passed.

Common filters: `--since 7d`, `--provider openai-codex`, `--model gpt-6`, `--cwd agent-config`, `--limit 20`, and `--include-subagents`. Output is bounded; narrow the filters rather than dumping an entire session archive.
