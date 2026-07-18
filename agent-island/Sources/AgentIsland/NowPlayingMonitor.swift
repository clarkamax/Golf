import Foundation
import Combine

/// Polls system-wide Now Playing info by shelling out to the third-party
/// `nowplaying-cli` tool (https://github.com/kirtan-shah/nowplaying-cli).
///
/// Why shell out instead of talking to MediaRemote.framework directly:
/// MediaRemote is a private Apple framework with no public headers, no
/// stability guarantees across OS versions, and (for a signed/notarized app)
/// real App Review risk. `nowplaying-cli` already does that fragile work and
/// tracks framework changes upstream — we treat it as an optional external
/// dependency and degrade to agent-status-only mode when it's missing,
/// rather than hand-rolling private-API bindings here.
final class NowPlayingMonitor: ObservableObject {
    @Published private(set) var info: NowPlayingInfo = .none
    @Published private(set) var isToolAvailable: Bool

    private let pollInterval: TimeInterval
    private let cliPath: String?
    private var timer: Timer?

    init(pollInterval: TimeInterval = 0.75) {
        self.pollInterval = pollInterval
        let path = NowPlayingMonitor.locateCLI()
        self.cliPath = path
        self.isToolAvailable = path != nil
    }

    func start() {
        guard cliPath != nil else {
            warnMissingTool()
            return
        }
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private static func locateCLI() -> String? {
        // Homebrew installs to different prefixes on Apple Silicon vs Intel;
        // check both rather than relying on PATH (we may not inherit a
        // login shell's PATH when launched as a LaunchAgent).
        let candidates = [
            "/opt/homebrew/bin/nowplaying-cli",
            "/usr/local/bin/nowplaying-cli",
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private func warnMissingTool() {
        print("""
        [AgentIsland] nowplaying-cli not found — Now Playing display disabled, \
        falling back to agent-status-only mode.
        Install it with: brew install nowplaying-cli
        (https://github.com/kirtan-shah/nowplaying-cli)
        """)
    }

    private func poll() {
        guard let cliPath else { return }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: cliPath)
        process.arguments = ["get", "title", "artist", "playbackRate"]

        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = Pipe() // discard stderr noise

        do {
            try process.run()
        } catch {
            // Binary vanished mid-session (e.g. uninstalled) — degrade quietly
            // rather than crashing or spamming the log every poll.
            info = .none
            return
        }
        process.waitUntilExit()

        let data = stdout.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8) else {
            info = .none
            return
        }

        let lines = output.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        guard lines.count >= 3 else {
            info = .none
            return
        }

        let title = lines[0] == "null" ? "" : lines[0]
        let artist = lines[1] == "null" ? "" : lines[1]
        let playbackRate = Double(lines[2]) ?? 0

        // Treat "paused" the same as "nothing playing": we don't want to
        // show a stale track that isn't actually audible right now.
        if title.isEmpty || playbackRate <= 0 {
            info = .none
        } else {
            info = NowPlayingInfo(title: title, artist: artist, isPlaying: true)
        }
    }
}
