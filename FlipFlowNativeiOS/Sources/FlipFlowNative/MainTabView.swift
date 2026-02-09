import SwiftUI
import UIKit

struct MainTabView: View {
  @EnvironmentObject private var auth: AuthViewModel
  @State private var selectedTab: Int = 0
  @State private var pendingBuyboxListingId: String?

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
    TabView(selection: $selectedTab) {
      PlaceholderTab(title: "Dashboard", subtitle: "Buttons coming next", systemImage: "chart.line.uptrend.xyaxis")
        .tabItem {
          Label("Dashboard", systemImage: "chart.line.uptrend.xyaxis")
        }
        .tag(0)

      RepricingView(
        pendingBuyboxListingId: pendingBuyboxListingId,
        onClearPendingBuybox: { pendingBuyboxListingId = nil }
      )
        .tabItem {
          Label("Repricing", systemImage: "tag")
        }
        .tag(1)

      ReceivingView()
        .tabItem {
          Label("Purchases", systemImage: "shippingbox")
        }
        .tag(2)

      DeliveriesView()
        .tabItem {
          Label("Deliveries", systemImage: "truck.box")
        }
        .tag(3)

      ShippingFulfillmentView()
        .tabItem {
          Label("Ship", systemImage: "shippingbox.fill")
        }
        .tag(4)
    }
    .background(Color.clear)
    .onReceive(NotificationCenter.default.publisher(for: BuyboxPushNotification.openListing)) { notification in
      if let listingId = notification.userInfo?[BuyboxPushNotification.listingIdKey] as? String, !listingId.isEmpty {
        pendingBuyboxListingId = listingId
        selectedTab = 1
      }
    }
    .onAppear {
      registerPushTokenIfNeeded()
    }
    .onReceive(NotificationCenter.default.publisher(for: PushTokenHolder.tokenDidUpdate)) { _ in
      registerPushTokenIfNeeded()
    }
  }

  private func registerPushTokenIfNeeded() {
    guard let token = PushTokenHolder.currentFCMToken, !token.isEmpty else { return }
    Task {
      guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
      let url = URL(string: "https://www.solesmarket.com/api/notifications/push/register")!
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try? JSONEncoder().encode(PushRegisterBody(token: token, platform: "ios"))
      _ = try? await URLSession.shared.data(for: request)
    }
  }
}

private struct PushRegisterBody: Encodable {
  let token: String
  let platform: String
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

