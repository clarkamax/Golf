import AppKit
import SwiftUI

/// Owns the borderless overlay window and hosts the SwiftUI island inside
/// it. Everything here is programmatic (no storyboard/xib) because this is
/// a single floating HUD panel, not a normal document/app window.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private let stateMachine = IslandStateMachine()

    // Fixed canvas the pill animates inside; wide/tall enough for the
    // largest expanded state with room to spare.
    private let canvasSize = NSSize(width: 420, height: 60)

    func applicationDidFinishLaunching(_ notification: Notification) {
        // .accessory: no Dock icon, no Cmd-Tab entry, no menu bar item of
        // our own — this is a background HUD, not a regular application.
        NSApp.setActivationPolicy(.accessory)

        let hostingView = NSHostingView(rootView: IslandRootView(stateMachine: stateMachine))
        hostingView.frame = NSRect(origin: .zero, size: canvasSize)

        let window = NSWindow(
            contentRect: hostingView.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostingView
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false // the pill draws its own SwiftUI shadow
        window.ignoresMouseEvents = true // passive HUD: never intercepts clicks
        window.isReleasedWhenClosed = false

        // .statusBar keeps the island floating above regular app windows
        // (and above full-screen apps' windows) without fighting the real
        // menu bar for the very top strip of pixels — positionWindow() below
        // places it just under that strip rather than overlapping it.
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]

        self.window = window
        positionWindow()
        window.orderFrontRegardless() // show without activating/stealing focus

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in self?.positionWindow() }

        stateMachine.start()
    }

    /// Pins the window to the top-center of the main screen, just below the
    /// menu bar / notch. `visibleFrame` already excludes the menu bar (and
    /// Dock), so anchoring to its top edge lands us directly underneath it
    /// without needing to special-case notched vs. non-notched displays.
    private func positionWindow() {
        guard let screen = NSScreen.main, let window else { return }
        let visible = screen.visibleFrame
        let size = window.frame.size
        let origin = NSPoint(
            x: visible.midX - size.width / 2,
            y: visible.maxY - size.height - 4
        )
        window.setFrameOrigin(origin)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
