import Foundation
import Combine

/// Polls `~/.agent_island_status.json` on a timer and publishes the latest
/// `AgentStatus`.
///
/// The file is written by an external shell script (`agent-island.sh`) that
/// isn't synchronized with us in any way, so a missing file, an empty file,
/// or a half-written JSON blob (read mid-write) are all expected, routine
/// conditions here — not error cases. Any of them just falls back to idle.
final class AgentStatusMonitor: ObservableObject {
    @Published private(set) var status: AgentStatus = .idle

    private let fileURL: URL
    private let pollInterval: TimeInterval
    private var timer: Timer?

    init(
        pollInterval: TimeInterval = 0.5,
        fileURL: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".agent_island_status.json")
    ) {
        self.pollInterval = pollInterval
        self.fileURL = fileURL
    }

    func start() {
        poll()
        timer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func poll() {
        guard
            let data = try? Data(contentsOf: fileURL),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            if status != .idle { status = .idle }
            return
        }

        let state = AgentStatus.State(rawValue: json["status"] as? String ?? "") ?? .idle
        let label = json["label"] as? String ?? ""
        let next = AgentStatus(state: state, label: label)
        if next != status { status = next }
    }
}
