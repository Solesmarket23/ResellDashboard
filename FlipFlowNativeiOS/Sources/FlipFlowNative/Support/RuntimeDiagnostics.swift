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

  static func summary(session: AuthSession) -> String {
    let w = keyWindow()
    let root = w?.rootViewController
    let tab = findTabBarController(from: root)

    let screen = UIScreen.main.bounds.size
    let win = w?.bounds.size ?? .zero

    let tabBg = tab?.view.backgroundColor
    let tabBarBg = tab?.tabBar.backgroundColor
    let tabBarStdBg = tab?.tabBar.standardAppearance.backgroundColor
    let tabBarOpaque = tab?.tabBar.standardAppearance.backgroundColor != nil

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
      "rootVC=\(root.map { String(describing: type(of: $0)) } ?? "nil")",
      "rootBG=\(colorDesc(root?.view.backgroundColor))",
      "tabVC=\(tab.map { String(describing: type(of: $0)) } ?? "nil")",
      "tabBG=\(colorDesc(tabBg))",
      "tabBarBG=\(colorDesc(tabBarBg))",
      "tabBarStdBG=\(colorDesc(tabBarStdBg))",
      "tabBarStdOpaque=\(tabBarOpaque)",
    ].joined(separator: " | ")
  }
}

struct RuntimeDiagnosticsBanner: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .medium, design: .monospaced))
      .foregroundStyle(.white.opacity(0.92))
      .lineLimit(3)
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(Color.white.opacity(0.15), lineWidth: 1)
      )
      .padding(.top, 6)
      .padding(.horizontal, 10)
      .allowsHitTesting(false)
  }
}

