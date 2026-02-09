import SwiftUI
import UIKit

struct MainTabView: View {
  @EnvironmentObject private var auth: AuthViewModel

  init() {
    // Make the tab bar + nav bars transparent so the Neon app background shows through.
    let tabAppearance = UITabBarAppearance()
    tabAppearance.configureWithTransparentBackground()
    tabAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
    tabAppearance.backgroundColor = UIColor.clear

    UITabBar.appearance().standardAppearance = tabAppearance
    UITabBar.appearance().isTranslucent = true
    UITabBar.appearance().backgroundColor = .clear
    if #available(iOS 15.0, *) {
      UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }

    let navAppearance = UINavigationBarAppearance()
    navAppearance.configureWithTransparentBackground()
    navAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
    navAppearance.backgroundColor = UIColor.clear

    UINavigationBar.appearance().standardAppearance = navAppearance
    UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
    UINavigationBar.appearance().compactAppearance = navAppearance
  }

  var body: some View {
    TabView {
      PlaceholderTab(title: "Dashboard", subtitle: "Buttons coming next", systemImage: "chart.line.uptrend.xyaxis")
        .tabItem {
          Label("Dashboard", systemImage: "chart.line.uptrend.xyaxis")
        }

      RepricingView()
        .tabItem {
          Label("Repricing", systemImage: "tag")
        }

      ReceivingView()
        .tabItem {
          Label("Purchases", systemImage: "shippingbox")
        }

      DeliveriesView()
        .tabItem {
          Label("Deliveries", systemImage: "truck.box")
        }
    }
    .background(Color.clear)
  }
}

private struct PlaceholderTab: View {
  @EnvironmentObject private var auth: AuthViewModel

  let title: String
  let subtitle: String
  let systemImage: String

  var body: some View {
    NeonScreen {
      ZStack(alignment: .topTrailing) {
        VStack(spacing: 14) {
          Spacer()
          NeonCard {
            VStack(spacing: 10) {
              Image(systemName: systemImage)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(NeonTheme.accentCyan)
              Text(title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
              Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(NeonTheme.textSecondary)
            }
          }
          .padding(.horizontal, 16)
          Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.clear)

        Button("Sign out") { auth.signOut() }
          .foregroundStyle(.white)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          .padding(.top, 10)
          .padding(.trailing, 12)
      }
    }
  }
}

