import SwiftUI

@main
struct FlipFlowNativeApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  @StateObject private var auth = AuthViewModel()

  var body: some Scene {
    WindowGroup {
      ZStack {
        NeonTheme.backgroundGradient
        RadialGradient(
          colors: [NeonTheme.accentCyan.opacity(0.12), .clear],
          center: .top,
          startRadius: 0,
          endRadius: 520
        )
        ParticleBackgroundView()

        RootView()
          .environmentObject(auth)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .ignoresSafeArea()
      .preferredColorScheme(.dark)
    }
  }
}

