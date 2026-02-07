import UIKit

extension UIApplication {
  func topMostViewController(base: UIViewController? = nil) -> UIViewController? {
    let baseVC: UIViewController? = {
      if let base { return base }
      guard let scene = connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return nil }
      return scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    }()

    if let nav = baseVC as? UINavigationController {
      return topMostViewController(base: nav.visibleViewController)
    }
    if let tab = baseVC as? UITabBarController, let selected = tab.selectedViewController {
      return topMostViewController(base: selected)
    }
    if let presented = baseVC?.presentedViewController {
      return topMostViewController(base: presented)
    }
    return baseVC
  }
}

