import Foundation

/// Snapshot of the agent status file (~/.agent_island_status.json).
struct AgentStatus: Equatable {
    enum State: String {
        case running
        case idle
    }

    var state: State
    var label: String

    static let idle = AgentStatus(state: .idle, label: "")
}

/// Snapshot of system-wide Now Playing info, sourced from `nowplaying-cli`.
struct NowPlayingInfo: Equatable {
    var title: String
    var artist: String
    var isPlaying: Bool

    static let none = NowPlayingInfo(title: "", artist: "", isPlaying: false)
}

/// What the island should currently render. Exactly one case is active at a
/// time — this is the single source of truth for the priority rule (agent
/// running beats now-playing beats idle), so the view layer never has to
/// re-derive priority itself.
enum IslandContent: Equatable {
    case agentRunning(label: String)
    case nowPlaying(title: String, artist: String)
    case idle
}
