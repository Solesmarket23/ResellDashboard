import SwiftUI

struct RootView: View {
  @EnvironmentObject private var auth: AuthViewModel

  var body: some View {
    Group {
      switch auth.session {
      case .signedOut:
        SignInView()
      case .firebase:
        MainTabView()
      case .sitePassword:
        MainTabView()
      }
    }
    .task {
      auth.start()
    }
  }
}

