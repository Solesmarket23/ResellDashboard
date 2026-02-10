import SwiftUI

/// Shipping fulfillment hub: To Ship, Print Label, Reconciliation, Pick Verification.
struct ShippingFulfillmentView: View {
  @EnvironmentObject private var auth: AuthViewModel

  var body: some View {
    switch auth.session {
    case .signedOut:
      NeonScreen {
        VStack {
          Spacer()
          NeonCard {
            VStack(spacing: 12) {
              Image(systemName: "shippingbox.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(NeonTheme.accentCyan)
              Text("Ship")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
              Text("Sign in to print labels, mark shipped, and reconcile.")
                .font(.subheadline)
                .foregroundStyle(NeonTheme.textSecondary)
                .multilineTextAlignment(.center)
            }
          }
          .padding(.horizontal, 16)
          Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    case .firebase(let uid), .sitePassword(let uid):
      ShippingHostView(userId: uid)
    }
  }
}

private struct ShippingHostView: View {
  let userId: String

  var body: some View {
    NeonScreen {
      NavigationStack {
        ZStack {
          NeonTheme.backgroundGradient
            .ignoresSafeArea()
          listContent
        }
        .navigationTitle("Ship")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationDestination(for: ShippingRoute.self) { route in
          switch route {
          case .toShip:
            ToShipView(userId: userId)
          case .printLabel:
            PrintLabelView(userId: userId)
          case .reconciliation:
            ReconciliationView(userId: userId)
          case .pickVerification:
            PickVerificationView(userId: userId)
          }
        }
      }
    }
  }

  private var listContent: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Print labels, mark shipped, reconcile.")
          .font(.subheadline)
          .foregroundStyle(NeonTheme.textSecondary)
          .padding(.horizontal, 4)
          .padding(.top, 4)

        ShippingOptionCard(
          route: .toShip,
          icon: "shippingbox.fill",
          title: "To Ship",
          subtitle: "Pending orders (SKU/size), print labels, marked shipped"
        )
        ShippingOptionCard(
          route: .printLabel,
          icon: "printer.fill",
          title: "Print shipping label",
          subtitle: "StockX Standard/Direct labels"
        )
        ShippingOptionCard(
          route: .reconciliation,
          icon: "checklist",
          title: "Reconciliation",
          subtitle: "Scan tracking at EOD, find missing"
        )
        ShippingOptionCard(
          route: .pickVerification,
          icon: "barcode.viewfinder",
          title: "Pick verification",
          subtitle: "Scan to confirm SKU or style ID"
        )
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
    }
    .scrollContentBackground(.hidden)
    .background(Color.clear)
  }
}

private struct ShippingOptionCard: View {
  let route: ShippingRoute
  let icon: String
  let title: String
  let subtitle: String

  var body: some View {
    NavigationLink(value: route) {
      NeonCard {
        HStack(alignment: .center, spacing: 14) {
          Image(systemName: icon)
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(NeonTheme.accentCyan)
            .frame(width: 36, height: 36, alignment: .center)
          VStack(alignment: .leading, spacing: 2) {
            Text(title)
              .font(.headline.weight(.semibold))
              .foregroundStyle(NeonTheme.textPrimary)
            Text(subtitle)
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          }
          Spacer(minLength: 8)
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
  }
}

private enum ShippingRoute: Hashable {
  case toShip
  case printLabel
  case reconciliation
  case pickVerification
}
