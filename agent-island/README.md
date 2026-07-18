# AgentIsland

A macOS "Dynamic Island"-style HUD: a borderless, always-on-top, non-interactive
pill pinned to the top-center of the screen. It shows, in priority order:

1. **An agent running** — spinner + label, driven by a status file.
2. **Otherwise, something playing system-wide** — equalizer icon + track title
   + artist (Apple Music, Spotify, Safari/Chrome tabs, anything that shows up
   in Control Center's Now Playing widget).
3. **Otherwise** — collapses to a small idle pill.

It never shows more than one of these at a time, and animates between states
with a spring, matching the collapse/expand feel of the real Dynamic Island.

## Building

Requires Xcode command line tools (Swift 5.9+) on macOS 13+.

```bash
cd agent-island
swift build -c release
.build/release/AgentIsland &
```

Or, if you'd rather not use SwiftPM, `swiftc` works directly against the
sources since there are no external dependencies:

```bash
swiftc Sources/AgentIsland/*.swift -o AgentIsland -framework AppKit -framework SwiftUI
./AgentIsland &
```

To install the built binary somewhere permanent (used by the LaunchAgent
below):

```bash
swift build -c release
cp .build/release/AgentIsland /usr/local/bin/AgentIsland
```

The app has no Dock icon and no menu bar item (`NSApp.setActivationPolicy(.accessory)`)
— it's a passive background process. Quit it with `killall AgentIsland` or
`launchctl unload` (see below) if you set up the LaunchAgent.

## Agent status

Agent status comes from `~/.agent_island_status.json`:

```json
{"status": "running", "label": "Running tests"}
```

- `status`: `"running"` or `"idle"` (anything else, or a missing/unreadable
  file, is treated as idle).
- `label`: free text shown next to the spinner while running.

`agent-island.sh` is a small wrapper that flips this file before and after a
command runs, so you don't have to manage it by hand:

```bash
./agent-island.sh npm test
AGENT_ISLAND_LABEL="Deploying" ./agent-island.sh ./deploy.sh
```

It restores `idle` when the wrapped command exits (success or failure) and
passes through its exit code.

## Now Playing

Now Playing info comes from the third-party
[`nowplaying-cli`](https://github.com/kirtan-shah/nowplaying-cli) tool, which
wraps Apple's private `MediaRemote.framework` — the same private framework
Control Center's Now Playing widget uses. AgentIsland deliberately does not
call that framework directly by hand (no public headers, no version
stability, real risk of breaking on every macOS point release); shelling out
to a maintained CLI is a much smaller surface to keep working.

Install it via Homebrew:

```bash
brew install nowplaying-cli
```

AgentIsland looks for it at `/opt/homebrew/bin/nowplaying-cli` and
`/usr/local/bin/nowplaying-cli` on startup (not via `PATH`, since a
LaunchAgent won't inherit your shell's `PATH`). If it's not found, AgentIsland
prints a one-time message to its log explaining how to install it and simply
never shows a Now Playing state — agent status still works normally.

When present, it's polled every ~750ms via
`nowplaying-cli get title artist playbackRate`. A `playbackRate` of `0`
(paused) is treated the same as nothing playing, so the island doesn't show a
stale track sitting on pause.

## Auto-launch at login

A LaunchAgent plist is provided at `LaunchAgent/com.clarkamax.agentisland.plist`.
It points at `/usr/local/bin/AgentIsland`, so build and install the binary
there first (see Building, above), then:

```bash
cp LaunchAgent/com.clarkamax.agentisland.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.clarkamax.agentisland.plist
```

To stop it from launching at login:

```bash
launchctl unload ~/Library/LaunchAgents/com.clarkamax.agentisland.plist
rm ~/Library/LaunchAgents/com.clarkamax.agentisland.plist
```

Logs (stdout/stderr, including the nowplaying-cli missing-tool warning) go to
`/tmp/agentisland.log`.

## Code layout

- `Models.swift` — `AgentStatus`, `NowPlayingInfo`, and `IslandContent` (the
  one type the view layer actually consumes).
- `AgentStatusMonitor.swift` — polls the status JSON file.
- `NowPlayingMonitor.swift` — polls `nowplaying-cli`, handles it being absent.
- `IslandStateMachine.swift` — combines both monitors into a single
  `IslandContent`, enforcing the priority order (agent > now-playing > idle).
- `IslandView.swift` / `EqualizerBarsView.swift` / `MarqueeText.swift` — the
  SwiftUI pill, its icon, and its scrolling-text behavior.
- `IslandRootView.swift` — anchors the pill within the fixed transparent
  window canvas.
- `main.swift` — `NSApplicationDelegate` that owns the borderless window
  (level, collection behavior, click-through, positioning) and starts the
  state machine.

Data layer and view layer don't know about each other beyond `IslandContent`;
`IslandStateMachine` is the only thing that knows both exist.
