import SwiftUI

@main
struct FlipFlowNativeApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  @StateObject private var auth = AuthViewModel()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(auth)
    }
  }
}

