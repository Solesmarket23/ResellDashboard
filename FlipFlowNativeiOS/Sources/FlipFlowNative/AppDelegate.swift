import UIKit
import FirebaseCore
import GoogleSignIn

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    #if DEBUG
    // #region agent log
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
    // #endregion agent log
    #endif

    // Avoid a hard crash if `GoogleService-Info.plist` isn't present yet.
    // This keeps the app runnable while you’re setting up Firebase.
    if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
       let options = FirebaseOptions(contentsOfFile: path) {
      FirebaseApp.configure(options: options)
    } else {
      NSLog("⚠️ Firebase not configured: missing GoogleService-Info.plist in app bundle.")
    }
    return true
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return GIDSignIn.sharedInstance.handle(url)
  }
}

