import Foundation
import Combine

/// Single source of truth for what the island displays. Combines the two
/// independent data sources — agent status and now-playing — into one
/// `IslandContent`, enforcing the priority order:
///
///   1. agent running   (highest priority — never hidden by music)
///   2. now playing      (only when the agent is idle)
///   3. idle              (nothing to show)
///
/// The view layer only ever reads `content`; it has no idea these two
/// pollers exist.
final class IslandStateMachine: ObservableObject {
    @Published private(set) var content: IslandContent = .idle

    private let agentMonitor: AgentStatusMonitor
    private let nowPlayingMonitor: NowPlayingMonitor
    private var cancellable: AnyCancellable?

    init(
        agentMonitor: AgentStatusMonitor = AgentStatusMonitor(),
        nowPlayingMonitor: NowPlayingMonitor = NowPlayingMonitor()
    ) {
        self.agentMonitor = agentMonitor
        self.nowPlayingMonitor = nowPlayingMonitor

        cancellable = Publishers.CombineLatest(agentMonitor.$status, nowPlayingMonitor.$info)
            .map { agent, nowPlaying in IslandStateMachine.resolve(agent: agent, nowPlaying: nowPlaying) }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] content in self?.content = content }
    }

    func start() {
        agentMonitor.start()
        nowPlayingMonitor.start()
    }

    private static func resolve(agent: AgentStatus, nowPlaying: NowPlayingInfo) -> IslandContent {
        if agent.state == .running {
            return .agentRunning(label: agent.label)
        }
        if nowPlaying.isPlaying, !nowPlaying.title.isEmpty {
            return .nowPlaying(title: nowPlaying.title, artist: nowPlaying.artist)
        }
        return .idle
    }
}
