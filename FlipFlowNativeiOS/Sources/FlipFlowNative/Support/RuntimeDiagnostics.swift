import SwiftUI
import UIKit

enum RuntimeDiagnostics {
  static func colorDesc(_ c: UIColor?) -> String {
    guard let c else { return "nil" }
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    if c.getRed(&r, green: &g, blue: &b, alpha: &a) {
      return String(format: "rgba(%.2f,%.2f,%.2f,%.2f)", r, g, b, a)
    }
    return String(describing: c)
  }

  static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })
  }

  private static func findTabBarControllerViaResponder(in window: UIWindow?) -> UITabBarController? {
    guard let window else { return nil }

    func firstTabBar(in view: UIView) -> UITabBar? {
      if let tb = view as? UITabBar { return tb }
      for sub in view.subviews {
        if let found = firstTabBar(in: sub) { return found }
      }
      return nil
    }

    guard let tabBar = firstTabBar(in: window) else { return nil }
    var responder: UIResponder? = tabBar
    while let r = responder {
      if let t = r as? UITabBarController { return t }
      responder = r.next
    }
    return nil
  }

  static func findTabBarController(from vc: UIViewController?) -> UITabBarController? {
    guard let vc else { return nil }
    if let t = vc as? UITabBarController { return t }
    if let n = vc as? UINavigationController { return findTabBarController(from: n.visibleViewController) }
    for child in vc.children {
      if let t = findTabBarController(from: child) { return t }
    }
    if let p = vc.presentedViewController {
      if let t = findTabBarController(from: p) { return t }
    }
    return nil
  }

  private static func presentedChain(from vc: UIViewController?) -> [UIViewController] {
    guard let vc else { return [] }
    var chain: [UIViewController] = [vc]
    var current: UIViewController? = vc
    var guardCount = 0
    while let presented = current?.presentedViewController, guardCount < 16 {
      chain.append(presented)
      current = presented
      guardCount += 1
    }
    return chain
  }

  private static func chainDesc(_ chain: [UIViewController]) -> String {
    guard !chain.isEmpty else { return "nil" }
    return chain.map { String(describing: type(of: $0)) }.joined(separator: " > ")
  }

  static func summary(session: AuthSession) -> String {
    let w = keyWindow()
    let root = w?.rootViewController
    let isSignedOut: Bool = {
      if case .signedOut = session { return true }
      return false
    }()

    let screen = UIScreen.main.bounds.size
    let win = w?.bounds.size ?? .zero

    let winBg = w?.backgroundColor
    if isSignedOut {
      // Keep signed-out diagnostics cheap to avoid impacting login UI responsiveness.
      let sessionDesc = "signedOut"
      return [
        "session=\(sessionDesc)",
        "screen=\(Int(screen.width))x\(Int(screen.height))",
        "window=\(Int(win.width))x\(Int(win.height))",
        "winBG=\(colorDesc(winBg))",
        "rootVC=\(root.map { String(describing: type(of: $0)) } ?? "nil")",
        "rootBG=\(colorDesc(root?.view.backgroundColor))",
      ].joined(separator: " | ")
    }

    let tab = findTabBarController(from: root) ?? findTabBarControllerViaResponder(in: w)
    let selectedVc = tab?.selectedViewController

    // SwiftUI sheets sometimes present from the root hosting controller, not the selected tab host.
    // Capture both chains so we can see where the presentation actually happens.
    let rootChain = presentedChain(from: root)
    let selectedChain = presentedChain(from: selectedVc)

    // Choose the deeper chain as "top", but keep both for debugging.
    let topChain = (selectedChain.count > rootChain.count) ? selectedChain : rootChain
    let top = topChain.last

    let tabBg = tab?.view.backgroundColor
    let tabBarBg = tab?.tabBar.backgroundColor
    let tabBarStdBg = tab?.tabBar.standardAppearance.backgroundColor
    let tabBarOpaque = tab?.tabBar.standardAppearance.backgroundColor != nil
    let selectedBg = selectedVc?.view.backgroundColor
    let selectedOpaque = selectedVc?.view.isOpaque
    let topBg = top?.view.backgroundColor

    let sessionDesc: String = {
      switch session {
      case .signedOut: return "signedOut"
      case .firebase(let userId): return "firebase(\(userId.prefix(6))…)"
      case .sitePassword(let userId): return "sitePassword(\(userId.prefix(6))…)"
      }
    }()

    return [
      "session=\(sessionDesc)",
      "screen=\(Int(screen.width))x\(Int(screen.height))",
      "window=\(Int(win.width))x\(Int(win.height))",
      "winBG=\(colorDesc(winBg))",
      "rootVC=\(root.map { String(describing: type(of: $0)) } ?? "nil")",
      "rootBG=\(colorDesc(root?.view.backgroundColor))",
      "topVC=\(top.map { String(describing: type(of: $0)) } ?? "nil")",
      "topBG=\(colorDesc(topBg))",
      "rootChain=\(chainDesc(rootChain))",
      "selChain=\(chainDesc(selectedChain))",
      "tabVC=\(tab.map { String(describing: type(of: $0)) } ?? "nil")",
      "tabBG=\(colorDesc(tabBg))",
      "selVC=\(selectedVc.map { String(describing: type(of: $0)) } ?? "nil")",
      "selBG=\(colorDesc(selectedBg))",
      "selOpaque=\(selectedOpaque.map(String.init(describing:)) ?? "nil")",
      "tabBarBG=\(colorDesc(tabBarBg))",
      "tabBarStdBG=\(colorDesc(tabBarStdBg))",
      "tabBarStdOpaque=\(tabBarOpaque)",
    ].joined(separator: " | ")
  }
}

