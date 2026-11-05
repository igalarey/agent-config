---
name: context7-mcp
model: haiku
effort: light
description: Retrieve version-specific library documentation with an already configured Context7 MCP server. Use when a framework or API question needs current documentation, not for every library mention.
compatibility: Context7 MCP access is optional. No server installer or cache helper is bundled.
---

# Context7 MCP

Use documentation for the actual library and version, not an assumed API from training data.
Network queries send the library name and question to a third party. Do not include secrets or private source.
Do not install or configure an MCP server as a side effect of a documentation question.

## Check availability

Inspect the tools exposed in the current session.
If an MCP gateway is available, use its discovery and description functions to locate Context7's library resolution and documentation query tools.
Use the advertised tool names and argument schema. Do not assume a particular namespace or MCP adapter version.

If Context7 is absent or inaccessible, report `CONTEXT7_UNAVAILABLE` with the reason.
Use installed documentation or official documentation through available research tools when authorized.
If those sources are unavailable, state what remains unverified. Do not silently substitute a training-data answer.
No original-repository cache script or CLI is required.

## Bounded retrieval

Use at most three Context7 calls per question, including resolution and retries:

1. Resolve the library using its name and the specific question.
2. Select the best match and query its docs. Prefer a version-specific ID when one exists.
3. If needed, refine the query once. Stop on quota or rate-limit errors instead of retrying blindly.

After an error or an inconclusive result, state the reason and available fallback.
Ask for a documentation excerpt only when the missing evidence blocks the answer.

## Answer and verify

Cite the retrieved documentation, library, and version where available.
Distinguish the documented API from local code behavior and your deductions.
Check that the cited passage supports the answer. State version gaps and incomplete coverage.
Success means relevant documentation was retrieved and inspected, not merely that a server registered.
