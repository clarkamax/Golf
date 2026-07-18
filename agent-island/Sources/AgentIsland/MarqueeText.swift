import SwiftUI

/// A text view that scrolls horizontally, bouncing back and forth, when its
/// content is wider than the space available — used instead of truncating
/// track titles / labels with "…".
struct MarqueeText: View {
    let text: String
    var font: Font = .system(size: 12, weight: .semibold)
    var lineHeight: CGFloat = 15
    var color: Color = .white
    var pointsPerSecond: Double = 24

    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var scrolled = false

    var body: some View {
        GeometryReader { geo in
            Text(text)
                .font(font)
                .foregroundColor(color)
                .lineLimit(1)
                .fixedSize()
                .background(WidthReader())
                .offset(x: scrolled ? -overflow : 0)
                .onPreferenceChange(WidthPreferenceKey.self) { textWidth = $0 }
                .onAppear { containerWidth = geo.size.width }
                .onChange(of: geo.size.width) { containerWidth = $0 }
        }
        .frame(height: lineHeight)
        .clipped()
        .onChange(of: textWidth) { _ in restartIfNeeded() }
        .onChange(of: containerWidth) { _ in restartIfNeeded() }
        .onChange(of: text) { _ in scrolled = false; restartIfNeeded() }
    }

    private var overflow: CGFloat { max(0, textWidth - containerWidth) }

    private func restartIfNeeded() {
        scrolled = false
        guard overflow > 1 else { return }
        let duration = Double(overflow) / pointsPerSecond
        withAnimation(
            .linear(duration: duration)
                .delay(0.8)
                .repeatForever(autoreverses: true)
        ) {
            scrolled = true
        }
    }
}

private struct WidthReader: View {
    var body: some View {
        GeometryReader { geo in
            Color.clear.preference(key: WidthPreferenceKey.self, value: geo.size.width)
        }
    }
}

private struct WidthPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
