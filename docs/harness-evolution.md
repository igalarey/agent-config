# Release pipeline

The current base is defined in README.md and manifests/active-release.json.
Historical interactive-subagents/RTK designs are available in Git history, not active policy.

1. Commit reviewed source, config, profiles and locks in agent-config.
2. Prepare a new candidate from exact harness/subagents/memory commits. Tasks/supervisor
   are pinned vendored snapshots with their original licenses and locks.
3. Install separate development and runtime dependency trees using npm ci --ignore-scripts.
   Runtime omits development dependencies but retains optional dependencies.
4. Verify every package, then the exact installed Pi CLI with isolated homes and a scripted
   offline provider. Never use credentials or call network models in default verification.
5. Remove the development tree only after verification succeeds.
6. Plan the configuration projection and explicit legacy retirement. Abort on conflicts.
7. Activate with backups and a seal, update the public recipe, and restart Pi.

Bootstrap can fetch external source commits itself; an optional local source map still
supports development. Sources are caches, runtime releases are independent snapshots.
A sealed release cannot be reinstalled, tested in place or silently repaired. It is bound
to exact Node, OS, architecture, source/dependency inventories and verification evidence.

`--migrate-base` retires the former global agent profiles and RTK Pi hook with backups.
It leaves shared policy, private session/memory data and unrelated settings untouched.
Old sealed releases and their original historical installer can be retained for recovery;
reverse migration across different resource shapes is not promised by the new base.

Detailed migration decisions and evidence: [tintinweb-base.md](changes/tintinweb-base.md).
