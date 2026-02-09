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
            Text("Please sign in to use Shipping.")
              .foregroundStyle(.white)
          }
          .padding(.horizontal, 16)
          Spacer()
        }
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
    List {
      NavigationLink(value: ShippingRoute.toShip) {
        Label("To Ship", systemImage: "shippingbox.fill")
          .foregroundStyle(NeonTheme.textPrimary)
      }
      .listRowBackground(NeonTheme.card.opacity(0.8))
      .listRowSeparatorTint(NeonTheme.border.opacity(0.5))

      NavigationLink(value: ShippingRoute.printLabel) {
        Label("Print shipping label", systemImage: "printer.fill")
          .foregroundStyle(NeonTheme.textPrimary)
      }
      .listRowBackground(NeonTheme.card.opacity(0.8))
      .listRowSeparatorTint(NeonTheme.border.opacity(0.5))

      NavigationLink(value: ShippingRoute.reconciliation) {
        Label("Reconciliation", systemImage: "checklist")
          .foregroundStyle(NeonTheme.textPrimary)
      }
      .listRowBackground(NeonTheme.card.opacity(0.8))
      .listRowSeparatorTint(NeonTheme.border.opacity(0.5))

      NavigationLink(value: ShippingRoute.pickVerification) {
        Label("Pick verification", systemImage: "barcode.viewfinder")
          .foregroundStyle(NeonTheme.textPrimary)
      }
      .listRowBackground(NeonTheme.card.opacity(0.8))
      .listRowSeparatorTint(NeonTheme.border.opacity(0.5))
    }
    .scrollContentBackground(.hidden)
    .listStyle(.insetGrouped)
  }
}

private enum ShippingRoute: Hashable {
  case toShip
  case printLabel
  case reconciliation
  case pickVerification
}
