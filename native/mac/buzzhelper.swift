// Buzz Party macOS helper: posts key events and moves/focuses windows.
// One command per stdin line, one reply line on stdout.
//   down <keycode> | up <keycode>       -> ok
//   focus <pid>                         -> ok | fail
//   place <pid> <x> <y> <w> <h>         -> ok | fail
//   fullscreen                          -> ok   (Option+Return, PCSX2's hotkey)
//   trust <0|1>                         -> yes | no  (1 = show the system prompt)
import AppKit
import ApplicationServices

let source = CGEventSource(stateID: .hidSystemState)
let optionKey: CGKeyCode = 0x3A
let returnKey: CGKeyCode = 0x24

func key(_ code: CGKeyCode, _ down: Bool, flags: CGEventFlags = []) {
    guard let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { return }
    e.flags = flags
    e.post(tap: .cghidEventTap)
}

func firstWindow(_ pid: pid_t) -> AXUIElement? {
    let app = AXUIElementCreateApplication(pid)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
          let windows = value as? [AXUIElement], let w = windows.first else { return nil }
    return w
}

func focus(_ pid: pid_t) -> Bool {
    guard let app = NSRunningApplication(processIdentifier: pid) else { return false }
    let ax = AXUIElementCreateApplication(pid)
    AXUIElementSetAttributeValue(ax, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    if let w = firstWindow(pid) { AXUIElementPerformAction(w, kAXRaiseAction as CFString) }
    return app.activate(options: [.activateAllWindows])
}

func place(_ pid: pid_t, _ x: Double, _ y: Double, _ w: Double, _ h: Double) -> Bool {
    guard let win = firstWindow(pid) else { return false }
    var point = CGPoint(x: x, y: y)
    var size = CGSize(width: w, height: h)
    guard let p = AXValueCreate(.cgPoint, &point), let s = AXValueCreate(.cgSize, &size) else { return false }
    let a = AXUIElementSetAttributeValue(win, kAXPositionAttribute as CFString, p)
    let b = AXUIElementSetAttributeValue(win, kAXSizeAttribute as CFString, s)
    return a == .success && b == .success
}

func reply(_ s: String) {
    print(s)
    fflush(stdout)
}

while let line = readLine() {
    let parts = line.split(separator: " ").map(String.init)
    guard let cmd = parts.first else { continue }
    let n = parts.dropFirst().compactMap { Double($0) }
    switch cmd {
    case "down" where n.count == 1: key(CGKeyCode(n[0]), true); reply("ok")
    case "up" where n.count == 1: key(CGKeyCode(n[0]), false); reply("ok")
    case "focus" where n.count == 1: reply(focus(pid_t(n[0])) ? "ok" : "fail")
    case "place" where n.count == 5: reply(place(pid_t(n[0]), n[1], n[2], n[3], n[4]) ? "ok" : "fail")
    case "fullscreen":
        key(optionKey, true, flags: .maskAlternate)
        key(returnKey, true, flags: .maskAlternate)
        key(returnKey, false, flags: .maskAlternate)
        key(optionKey, false)
        reply("ok")
    case "trust" where n.count == 1:
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: n[0] == 1] as CFDictionary
        reply(AXIsProcessTrustedWithOptions(opts) ? "yes" : "no")
    default: reply("error")
    }
}
