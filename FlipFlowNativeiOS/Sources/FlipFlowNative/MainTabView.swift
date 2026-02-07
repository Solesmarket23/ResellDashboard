import SwiftUI

struct MainTabView: View {
  var body: some View {
    TabView {
      PlaceholderTab(title: "Dashboard", subtitle: "Buttons coming next", systemImage: "chart.line.uptrend.xyaxis")
        .tabItem {
          Label("Dashboard", systemImage: "chart.line.uptrend.xyaxis")
        }

      PlaceholderTab(title: "Repricing", subtitle: "Buttons coming next", systemImage: "tag")
        .tabItem {
          Label("Repricing", systemImage: "tag")
        }

      ReceivingView()
        .tabItem {
          Label("Purchases", systemImage: "shippingbox")
        }

      PlaceholderTab(title: "Deliveries", subtitle: "Buttons coming next", systemImage: "truck.box")
        .tabItem {
          Label("Deliveries", systemImage: "truck.box")
        }
    }
  }
}

private struct PlaceholderTab: View {
  let title: String
  let subtitle: String
  let systemImage: String

  var body: some View {
    NeonScreen {
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
    }
  }
}

