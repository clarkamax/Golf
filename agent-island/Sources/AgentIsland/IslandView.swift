import SwiftUI

/// The pill itself. Purely a function of `IslandContent` — it has no idea
/// where that content came from (status file vs. nowplaying-cli), which is
/// what keeps the state-machine/view split clean.
struct IslandView: View {
    let content: IslandContent

    private var isExpanded: Bool {
        if case .idle = content { return false }
        return true
    }

    var body: some View {
        HStack(spacing: 8) {
            iconView
                .frame(width: 18, height: 18)
                .padding(.leading, isExpanded ? 12 : 0)

            if isExpanded {
                textStack
                    .padding(.trailing, 14)
            }
        }
        .frame(width: isExpanded ? 260 : 120, height: isExpanded ? 40 : 32, alignment: .leading)
        .background(Capsule().fill(Color.black))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.45), radius: 10, y: 3)
        // One spring drives every transition — collapse/expand, icon swap,
        // and content swap all animate through this same value change.
        .animation(.spring(response: 0.45, dampingFraction: 0.78), value: content)
    }

    @ViewBuilder
    private var iconView: some View {
        switch content {
        case .agentRunning:
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(0.55)
        case .nowPlaying:
            EqualizerBarsView()
        case .idle:
            EmptyView()
        }
    }

    @ViewBuilder
    private var textStack: some View {
        switch content {
        case .agentRunning(let label):
            MarqueeText(text: label.isEmpty ? "Agent running…" : label)
                .frame(maxWidth: .infinity, alignment: .leading)

        case .nowPlaying(let title, let artist):
            VStack(alignment: .leading, spacing: 2) {
                MarqueeText(text: title, font: .system(size: 12, weight: .semibold), lineHeight: 15)
                if !artist.isEmpty {
                    MarqueeText(
                        text: artist,
                        font: .system(size: 10, weight: .regular),
                        lineHeight: 12,
                        color: .white.opacity(0.6)
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        case .idle:
            EmptyView()
        }
    }
}
