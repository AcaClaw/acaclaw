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

// Inline loading page shown while the gateway starts (avoids blank white flash).
private let loadingHTML = """
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;
       height:100vh;background:#0f172a;font-family:-apple-system,sans-serif;color:#94a3b8}
  .logo{font-size:2rem;font-weight:700;color:#0d9488;margin-bottom:1.5rem}
  .spinner{width:40px;height:40px;border:4px solid #1e293b;
           border-top-color:#0d9488;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin-top:1.2rem;font-size:.9rem}
</style></head><body>
<div style="text-align:center">
  <div class="logo">AcaClaw</div>
  <div class="spinner"></div>
  <p>Starting gateway…</p>
</div></body></html>
"""

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let gatewayURL = URL(string: "http://localhost:2090/")!

    func applicationDidFinishLaunching(_: Notification) {
        // Build the window immediately — never block the main thread on gateway startup.
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: .zero, configuration: config)
        // Show inline loading page right away so the window appears instantly.
        webView.loadHTMLString(loadingHTML, baseURL: nil)

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

        // Start gateway asynchronously — reload WKWebView once port 2090 is open.
        startGatewayAsync()
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

    /// Starts the gateway in the background, then loads the real URL once ready.
    private func startGatewayAsync() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            if !self.portOpen(2090) {
                let startScript = self.findStartScript()
                if !startScript.isEmpty {
                    let proc = Process()
                    proc.executableURL = URL(fileURLWithPath: "/bin/bash")
                    proc.arguments = [startScript, "--no-browser"]
                    proc.standardOutput = FileHandle.nullDevice
                    proc.standardError = FileHandle.nullDevice
                    try? proc.run()
                }
            }

            // Poll up to 30s for the gateway to come up.
            for _ in 0..<30 {
                if self.portOpen(2090) {
                    DispatchQueue.main.async {
                        self.webView.load(URLRequest(url: self.gatewayURL))
                    }
                    return
                }
                Thread.sleep(forTimeInterval: 1)
            }
            // Gateway didn't start — load the URL anyway so the browser error is shown.
            DispatchQueue.main.async {
                self.webView.load(URLRequest(url: self.gatewayURL))
            }
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
