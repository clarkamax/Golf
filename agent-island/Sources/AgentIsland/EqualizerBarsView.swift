import SwiftUI

/// A tiny 3-bar animated equalizer used as the "now playing" icon. Each bar
/// runs its own easeInOut loop at a slightly different duration so they
/// drift out of phase, reading as "live audio" rather than a static icon.
struct EqualizerBarsView: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            EqualizerBar(minHeight: 4, maxHeight: 13, duration: 0.42)
            EqualizerBar(minHeight: 6, maxHeight: 9, duration: 0.31)
            EqualizerBar(minHeight: 4, maxHeight: 15, duration: 0.55)
        }
    }
}

private struct EqualizerBar: View {
    let minHeight: CGFloat
    let maxHeight: CGFloat
    let duration: Double

    @State private var grown = false

    var body: some View {
        Capsule()
            .fill(Color.white)
            .frame(width: 3, height: grown ? maxHeight : minHeight)
            .onAppear {
                withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) {
                    grown = true
                }
            }
    }
}
