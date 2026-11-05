# Local security contract

## Project configuration

Project configuration requires explicit trust in the user configuration file, `<agent-dir>/tasks-config.json`:

```json
{
  "taskScope": "session-global",
  "autoCascade": false,
  "trustedProjects": ["/absolute/path/to/reviewed-project"]
}
```

`trustedProjects` matches exact normalized absolute workspace paths, not prefixes or child directories. Project files cannot grant trust. Trust does not follow symlink aliases.

Without trust, Tasks ignores all project settings and keeps the user settings. This includes storage scope, presentation, and automation settings. No trust file means no project overrides.

With trust, project settings override user defaults. Glyph settings merge by field. Project `autoCascade: false` can disable automation. Project settings cannot enable automation, even with trust.

Explicit user-scope `autoCascade: true` retains automatic dependent execution. Manual `TaskExecute` remains available. An interactive settings change applies to the current runtime, but saved project overrides remain subject to these rules on reload.

The settings menu saves project overrides, not user trust. Saving a project file does not authorize it. This is an intentional change from unconditional project overrides.

`session-global` remains supported. Existing workspace session files retain their previous lookup precedence. `storagePath` is not a supported Tasks setting.

## Filesystem persistence

Task and configuration writes use random exclusive temporary files, mode `0600`, file synchronization, and atomic rename. New directories use mode `0700`.

Reads and writes reject symlink ancestors, symlink targets, non-regular targets, and multiply linked targets. Ancestors must belong to the current user or root.

Group-writable and world-writable ancestors are rejected, except root-owned sticky directories such as `/tmp`. Existing files cannot permit group or world writes.

Handled write failures remove the temporary file and preserve the previous destination. Failed task mutations also restore in-memory state. Configuration saves do not provide concurrent-writer locking.

This is not an operating-system sandbox. Path checks cannot prevent a malicious process with the same UID from replacing ancestors between operations. Root can bypass these protections.

A killed process can leave a private temporary file. The store does not scan or delete unknown leftovers. File synchronization does not guarantee directory-entry durability after power loss.

## Offline verification

Both security regressions and automation-boundary tests use temporary directories. The automation test loads real configuration and extension code with a simulated subagent transport, without model calls.

```sh
npm run typecheck
npm test
```
