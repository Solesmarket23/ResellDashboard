import UIKit
import UserNotifications
import FirebaseCore
import GoogleSignIn

final class AppDelegate: NSObject, UIApplicationDelegate {
  override init() {
    super.init()
    UNUserNotificationCenter.current().delegate = self
  }

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    #if DEBUG
    // #region agent log
    // Avoid blocking the main thread on launch with file I/O.
    DispatchQueue.global(qos: .utility).async {
      DebugLog.write(
        hypothesisId: "H1",
        runId: "pre-fix",
        location: "AppDelegate.swift:didFinishLaunching",
        message: "Launch sizing + launchscreen metadata",
        data: [
          "screenBounds": "\(UIScreen.main.bounds.size.width)x\(UIScreen.main.bounds.size.height)",
          "nativeBounds": "\(UIScreen.main.nativeBounds.size.width)x\(UIScreen.main.nativeBounds.size.height)",
          "scale": UIScreen.main.scale,
          "idiom": UIDevice.current.userInterfaceIdiom == .phone ? "phone" : (UIDevice.current.userInterfaceIdiom == .pad ? "pad" : "other"),
          "UILaunchStoryboardName": (Bundle.main.infoDictionary?["UILaunchStoryboardName"] as? String) ?? "nil",
          "hasLaunchScreenStoryboardc": Bundle.main.path(forResource: "LaunchScreen", ofType: "storyboardc") != nil,
        ]
      )
    }
    // #endregion agent log
    #endif

    // Avoid a hard crash if `GoogleService-Info.plist` isn't present yet.
    // This keeps the app runnable while you’re setting up Firebase.
    if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") {
      if let options = FirebaseOptions(contentsOfFile: path) {
        // Firebase logs a warning if the options bundleID doesn't match the app bundle id.
        // This can happen when you run a ".dev" bundle id locally with a production plist.
        // It is safe to override the options bundleID to the current app id for local builds.
        let actualBid = Bundle.main.bundleIdentifier ?? ""
        if !actualBid.isEmpty, options.bundleID != actualBid {
          #if DEBUG
          NSLog("⚠️ Firebase plist bundle id mismatch. Overriding options.bundleID from %@ to %@.", options.bundleID ?? "nil", actualBid)
          #endif
          options.bundleID = actualBid
        }
        FirebaseApp.configure(options: options)
      } else {
        let bid = Bundle.main.bundleIdentifier ?? "nil"
        let plistBid = (NSDictionary(contentsOfFile: path)?["BUNDLE_ID"] as? String) ?? "nil"
        NSLog("⚠️ Firebase not configured: GoogleService-Info.plist found but invalid (bundleId=%@, plist.BUNDLE_ID=%@).", bid, plistBid)
      }
    } else {
      let bid = Bundle.main.bundleIdentifier ?? "nil"
      NSLog("⚠️ Firebase not configured: missing GoogleService-Info.plist in app bundle (bundleId=%@).", bid)
    }
    return true
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // StockX OAuth return: flipflow://stockx-auth?success=1 → app opens; Repricing dismisses Safari and refreshes.
    if url.scheme?.lowercased() == "flipflow", url.host?.lowercased() == "stockx-auth" {
      NotificationCenter.default.post(name: .stockXAuthReturn, object: nil, userInfo: ["url": url])
      return true
    }
    return GIDSignIn.sharedInstance.handle(url)
  }
}

extension Notification.Name {
  static let stockXAuthReturn = Notification.Name("stockXAuthReturn")
}

extension AppDelegate: UNUserNotificationCenterDelegate {
  /// Show notification banner/sound even when app is in foreground (otherwise nothing appears when you tap the bell).
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge, .list])
  }
}

