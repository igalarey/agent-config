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

Explicit user-scope `autoCascade: true` retains automatic dependent execution. Manual `TaskExecute` remains available. An explicit `TaskStop` invalidates the run before awaiting its stop acknowledgment. Late completion cannot start dependents.

The settings menu saves each selected field under `workspaceSettings[absoluteWorkspacePath]` in `<agent-dir>/tasks-config.json`. These user-owned choices override global defaults and trusted project values for that workspace only.

Menu choices survive reload, including explicit automation choices. The menu does not grant project trust or write project configuration. Project files cannot supply `workspaceSettings` authorization.

Saving a project file does not authorize it. This is an intentional change from unconditional project overrides. The menu title identifies its user-owned workspace scope.

`session-global` remains supported. Existing workspace session files retain their previous lookup precedence. `storagePath` is not a supported Tasks setting.

## Filesystem persistence

Task and configuration writes use random exclusive temporary files, mode `0600`, file synchronization, and atomic rename. New directories use mode `0700`.

Reads and writes reject symlink ancestors, symlink targets, non-regular targets, and multiply linked targets. Ancestors must belong to the current user or root.

Group-writable and world-writable ancestors are rejected, except root-owned sticky directories such as `/tmp`. Existing files cannot permit group or world writes.

Handled write failures remove the temporary file and preserve the previous destination. Failed task mutations also restore in-memory state. Configuration saves do not provide concurrent-writer locking.

Invalid task JSON or an invalid task envelope stops reads and mutations. The store preserves the original bytes for repair instead of overwriting them. Missing files still support lazy creation.

Legacy task defaults and recoverable ID counters retain their normalization behavior. A user settings save also refuses malformed existing user configuration instead of replacing it.

This is not an operating-system sandbox. Path checks cannot prevent a malicious process with the same UID from replacing ancestors between operations. Root can bypass these protections.

A killed process can leave a private temporary file. The store does not scan or delete unknown leftovers. File synchronization does not guarantee directory-entry durability after power loss.

## Offline verification

Both security regressions and automation-boundary tests use temporary directories. The automation test loads real configuration and extension code with a simulated subagent transport, without model calls.

```sh
npm run typecheck
npm test
```
