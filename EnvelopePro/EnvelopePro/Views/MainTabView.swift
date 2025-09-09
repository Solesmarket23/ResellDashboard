import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authManager: AuthenticationManager
    @State private var selectedTab = 0
    @State private var showingPaydayRitual = false
    
    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                DashboardView()
                    .tabItem {
                        Label("Envelopes", systemImage: "envelope.fill")
                    }
                    .tag(0)
                
                TransactionsListView()
                    .tabItem {
                        Label("Transactions", systemImage: "list.bullet.rectangle")
                    }
                    .tag(1)
                
                AchievementsView()
                    .tabItem {
                        Label("Achievements", systemImage: "trophy.fill")
                    }
                    .tag(2)
                
                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .tag(3)
            }
            
            // Floating Payday Button
            Button(action: {
                showingPaydayRitual = true
            }) {
                ZStack {
                    Circle()
                        .fill(ThemeManager.cashGreen)
                        .frame(width: 56, height: 56)
                    
                    Image(systemName: "dollarsign.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white)
                }
                .shadow(radius: 5)
            }
            .offset(y: -30)
        }
        .fullScreenCover(isPresented: $showingPaydayRitual) {
            PaydayRitualView()
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthenticationManager())
}