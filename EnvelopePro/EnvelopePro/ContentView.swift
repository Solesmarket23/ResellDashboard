import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthenticationManager
    @State private var showOnboarding = false
    
    var body: some View {
        Group {
            if authManager.isAuthenticated {
                if authManager.hasCompletedOnboarding {
                    MainTabView()
                } else {
                    OnboardingFlowView()
                }
            } else {
                WelcomeView()
            }
        }
        .onAppear {
            checkFirstLaunch()
        }
    }
    
    private func checkFirstLaunch() {
        let hasLaunchedBefore = UserDefaults.standard.bool(forKey: "hasLaunchedBefore")
        if !hasLaunchedBefore {
            UserDefaults.standard.set(true, forKey: "hasLaunchedBefore")
            showOnboarding = true
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthenticationManager())
}