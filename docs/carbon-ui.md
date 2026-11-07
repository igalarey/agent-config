# Carbon UI

Carbon UI is an optional Pi presentation layer projected to `~/.pi/agent` by the
installer. It includes:

- the `carbon-violet` and `carbon-graphite` themes;
- a transparent editor with two columns of horizontal padding;
- compact, background-free cards for built-in tools.

New candidates contain neither `@tintinweb/pi-tasks` nor the `carbon-tasks` adapter.
The installer removes the previous managed package registration and unchanged adapter file.
Private task data and custom task configuration remain untouched. Git retains the retired sources for recovery.

The composition gate loads Carbon through the official SDK and runs its session-start handler.
It requires seven decorated built-ins and no Tasks tools or `/tasks` command.
Historical releases retain the owner/adapter gate, including execution parity and duplicate-registration rejection.

The default settings select `carbon-graphite`, use editor padding `2` and output
padding `1`, hide expanded thinking blocks, keep startup messages enabled, and
collapse the changelog. `carbon-graphite` uses a gray accent
and `#131413` page/message backgrounds. Select it in `/settings`; the terminal's
base background remains controlled by the terminal emulator.

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

The agents panel uses the upstream `aboveEditor` slot. It appears before the editor
and observational-memory worker indicators. Agent
execution, controls and widget contents remain unchanged.

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
