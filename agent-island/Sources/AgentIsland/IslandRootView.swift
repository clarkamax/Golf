import SwiftUI

/// Hosts `IslandView` inside the fixed-size transparent window canvas,
/// anchored to the top-center. The pill itself grows/shrinks with its
/// content; the surrounding window never resizes or moves, so there's no
/// window-server jank competing with the SwiftUI spring animation.
struct IslandRootView: View {
    @ObservedObject var stateMachine: IslandStateMachine

    var body: some View {
        VStack {
            IslandView(content: stateMachine.content)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
    }
}
