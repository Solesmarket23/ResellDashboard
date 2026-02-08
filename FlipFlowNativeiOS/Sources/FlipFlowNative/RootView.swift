import SwiftUI

struct RootView: View {
  @EnvironmentObject private var auth: AuthViewModel
  @State private var diagText: String = ""

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
    .overlay(alignment: .topLeading) {
#if DEBUG
      // #region agent log
      RuntimeDiagnosticsBanner(text: diagText)
      // #endregion agent log
#endif
    }
    .task {
      auth.start()
#if DEBUG
      // #region agent log
      diagText = RuntimeDiagnostics.summary(session: auth.session)
      // #endregion agent log
#endif
    }
    .onChange(of: auth.session) { _ in
#if DEBUG
      // #region agent log
      diagText = RuntimeDiagnostics.summary(session: auth.session)
      // #endregion agent log
#endif
    }
  }
}

