import UIKit
import FirebaseCore
import GoogleSignIn

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
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

