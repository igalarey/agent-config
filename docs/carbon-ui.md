# Carbon UI

Carbon UI is an optional Pi presentation layer projected to `~/.pi/agent` by the
installer. It includes:

- the `carbon-violet` theme;
- a transparent editor with two columns of horizontal padding;
- compact, background-free cards for built-in and task tools;
- a wrapper around the vendored `@tintinweb/pi-tasks` extension.

The task wrapper does not copy task behavior. At load time it reads the global Pi
settings directory through Pi's public `getAgentDir()` API, locates the configured
`@tintinweb/pi-tasks` source, imports its `src/index.ts` factory, and decorates only
`registerTool`. When this wrapper is present, the installer sets `extensions: []`
on the original package entry so Pi does not register the task tools twice.

The default settings select `carbon-violet`, use editor padding `2` and output
padding `1`, hide expanded thinking blocks, keep startup messages enabled, and
collapse the changelog.

Run the focused regression suite with:

```sh
npm run test:carbon
```

Prepare the vendor dependencies before running these rendering tests. The normal
offline installer and release regressions remain available through `npm test`.

The subscription footer uses two rows. The first shows the project, branch and
context on the left, with subscription usage on the right. The second shows memory
indicators on the left and the current model on the right. The refresh button
remains clickable. Memory indicators use the theme's dim color. The agent summary
is hidden from this footer; other extension statuses remain visible.

The agents panel sits below the editor and above the footer. Release preparation
applies `manifests/subagents-ui.json` to the pinned subagents source and its placement
tests. The overlay checks the source commit and original file hashes before changing
only the placement. Agent execution, controls and widget contents remain unchanged.

## Optional Linux launcher

The launcher needs Ghostty, Pi and JetBrainsMono Nerd Font Mono already installed.
It does not change the default terminal profile. Both executables must be on PATH.
To install the versioned launcher and desktop entry, run from this repository:

```sh
install -Dm755 config/launchers/pi-carbon "$HOME/.local/bin/pi-carbon"
install -Dm644 config/launchers/pi-carbon.desktop "$HOME/.local/share/applications/pi-carbon.desktop"
```

The desktop session must include `~/.local/bin` in PATH. The Pi bootstrap does not
install these optional Linux desktop files.
