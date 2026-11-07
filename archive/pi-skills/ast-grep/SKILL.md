---
name: ast-grep
description: Search code by syntax-tree structure and preview narrowly scoped codemods with an existing ast-grep CLI. Use for structural call, function, or import patterns, not plain text search or semantic type analysis.
license: MIT
compatibility: An existing ast-grep CLI is optional. No installer or helper is bundled.
---

# Structural Search with ast-grep

Adapted from the Hermes optional skill by Yeongyu Kim. See LICENSE for the original MIT notice.

## Choose the appropriate search

Use structural search for syntax shapes such as calls, functions, or imports.
Use ordinary search for strings, comments, paths, and regular expressions.
For symbol identity and type relationships, inspect the language tooling instead. An AST match is not semantic proof.

Check that `ast-grep` is available and inspect its help for the installed version.
On Linux, do not assume that `sg` is ast-grep. That name can identify an unrelated system command.
If the CLI is absent, use the existing search tools and report the structural-search limitation.
Do not install a binary automatically.

## Search before rewriting

Patterns are code, not regular expressions. `$NAME` captures one node. `$$$ARGS` captures multiple nodes in supported positions.
Choose the correct language, including TSX instead of TypeScript where JSX requires it.
Quote patterns with single quotes so the shell does not expand the metavariables.

```sh
ast-grep run --pattern 'console.log($MSG)' --lang ts --json=compact src/
```

Test the pattern against a small known matching example and a nonmatching example.
If the result is unexpectedly empty, inspect the parsed pattern and language before widening the search.
Keep the scan within the requested repository and directories. Exclude generated code and dependencies.

## Preview a codemod

A search request does not authorize a rewrite.
If the user requests a codemod, inspect the repository state and confirm the scope from that request.
Preview replacements without an apply flag.

```sh
ast-grep run --pattern 'console.log($MSG)' --rewrite 'logger.info($MSG)' --lang ts --json=compact src/
```

Inspect the actual matches, proposed replacements, affected files, and known exclusions.
Preserve compatibility boundaries and public contracts.
Do not combine JSON output and `--update-all` as proof of a write. Use a separate apply pass after preview.

```sh
ast-grep run --pattern 'console.log($MSG)' --rewrite 'logger.info($MSG)' --lang ts --update-all src/
```

Inspect the resulting diff and run the relevant existing checks.
Report the number of affected files and actual results. Do not infer semantic equivalence from successful AST matching.
Use exact targeted edits instead if the transformation has exceptions that the pattern cannot safely express.
