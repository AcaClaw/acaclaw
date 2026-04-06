// AcaClaw — lightweight native macOS window wrapper.
// Compiled at install time by scripts/install-desktop.sh.
// Uses WKWebView (Safari engine, built into macOS) to render the SPA.
//
// Why not Chromium/Edge?
//   - exec into Edge: Dock relaunch opens a regular browser window (Edge handles reopen, not us)
//   - Edge as child: two Dock icons
//   - This approach: single Dock icon, proper relaunch, no browser dependency

import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let url = URL(string: "http://localhost:2090/")!

    func applicationDidFinishLaunching(_: Notification) {
        ensureGateway()

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.load(URLRequest(url: url))

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "AcaClaw"
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Dock icon clicked while already running → bring window to front.
    func applicationShouldHandleReopen(_: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows {
            window.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    /// Close window → quit app → Dock icon disappears.
    func applicationShouldTerminateAfterLastWindowClosed(_: NSApplication) -> Bool {
        return true
    }

    // MARK: - Gateway

    private func ensureGateway() {
        // Quick check: is the gateway already listening?
        if portOpen(2090) { return }

        // Not running — start it via start.sh --no-browser
        let startScript = findStartScript()
        guard !startScript.isEmpty else { return }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [startScript, "--no-browser"]
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        try? proc.run()

        // Wait up to 30s for the gateway to come up
        for _ in 0..<30 {
            if portOpen(2090) { return }
            Thread.sleep(forTimeInterval: 1)
        }
    }

    private func portOpen(_ port: UInt16) -> Bool {
        let sock = socket(AF_INET, SOCK_STREAM, 0)
        guard sock >= 0 else { return false }
        defer { close(sock) }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result == 0
    }

    private func findStartScript() -> String {
        // Look for start.sh relative to the app bundle, then under ~/.acaclaw/
        let candidates = [
            Bundle.main.bundlePath + "/../../../scripts/start.sh",
            NSHomeDirectory() + "/.acaclaw/start.sh",
            NSHomeDirectory() + "/.openclaw/plugins/acaclaw/start.sh",
        ]
        for c in candidates {
            if FileManager.default.isExecutableFile(atPath: c) { return c }
        }
        return ""
    }
}

// --- Entry point ---
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
