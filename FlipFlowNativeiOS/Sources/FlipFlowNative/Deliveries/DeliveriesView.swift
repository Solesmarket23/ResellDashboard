import SwiftUI

struct DeliveriesView: View {
  @EnvironmentObject private var auth: AuthViewModel

  var body: some View {
    switch auth.session {
    case .signedOut:
      NeonScreen {
        VStack {
          Spacer()
          NeonCard {
            Text("Please sign in to view Deliveries.")
              .foregroundStyle(.white)
          }
          .padding(.horizontal, 16)
          Spacer()
        }
      }
    case .firebase(let uid), .sitePassword(let uid):
      DeliveriesHostView(userId: uid)
    }
  }
}

private struct DeliveriesHostView: View {
  @StateObject private var vm: DeliveriesViewModel

  init(userId: String) {
    _vm = StateObject(wrappedValue: DeliveriesViewModel(repo: ApiDeliveriesRepository(), userIdProvider: { userId }))
  }

  var body: some View {
    DeliveriesScreen(vm: vm)
      // `.task` can be flaky on-device when views are recreated quickly.
      // Use `onAppear` to guarantee the first fetch happens.
      .onAppear {
        if vm.deliveries.isEmpty, vm.isLoading == false {
          Task { await vm.refresh(twoPhase: true) }
        }
      }
  }
}

private struct DeliveriesScreen: View {
  @EnvironmentObject private var auth: AuthViewModel
  @ObservedObject var vm: DeliveriesViewModel

  @State private var selected: DeliveryItem?
  @State private var bannerDismiss: DispatchWorkItem?

  var body: some View {
    NeonScreen {
      NavigationStack {
        content
          .navigationTitle("Deliveries")
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
              Menu {
                Picker("Status", selection: $vm.statusFilter) {
                  ForEach(DeliveryStatusFilter.allCases) { s in
                    Text(s.label).tag(s)
                  }
                }
                Picker("Carrier", selection: $vm.carrierFilter) {
                  ForEach(DeliveryCarrierFilter.allCases) { c in
                    Text(c.label).tag(c)
                  }
                }
                Toggle("Include archived", isOn: $vm.includeArchived)
                  .onChange(of: vm.includeArchived) { _ in
                    Task { await vm.refresh(twoPhase: true) }
                  }

                Divider()

                Button {
                  Task { await vm.refresh(twoPhase: true) }
                } label: {
                  Label("Refresh", systemImage: "arrow.clockwise")
                }

                Divider()

                Button(role: .destructive) {
                  auth.signOut()
                } label: {
                  Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
              } label: {
                Image(systemName: "line.3.horizontal.decrease.circle")
                  .foregroundStyle(.white)
              }
            }
          }
      }
    }
    .overlay(alignment: .top) {
      if let message = vm.errorMessage, !message.isEmpty {
        DeliveriesBanner(kind: .error, message: message) {
          bannerDismiss?.cancel()
          bannerDismiss = nil
          withAnimation(.easeInOut(duration: 0.18)) { vm.errorMessage = nil }
        }
        .padding(.top, 10)
        .padding(.horizontal, 14)
        .transition(.move(edge: .top).combined(with: .opacity))
        .onAppear {
          bannerDismiss?.cancel()
          let work = DispatchWorkItem {
            Task { @MainActor in
              withAnimation(.easeInOut(duration: 0.18)) {
                if vm.errorMessage == message { vm.errorMessage = nil }
              }
            }
          }
          bannerDismiss = work
          DispatchQueue.main.asyncAfter(deadline: .now() + 2.4, execute: work)
        }
      }
    }
    .animation(.easeInOut(duration: 0.18), value: vm.errorMessage)
    .sheet(item: $selected) { item in
      DeliveryDetailView(item: item)
    }
  }

  private var content: some View {
    VStack(spacing: 10) {
      header
        .padding(.horizontal, 16)
        .padding(.top, 10)

      ScrollView {
        LazyVStack(spacing: 12) {
          if vm.isLoading && vm.deliveries.isEmpty {
            ForEach(0..<6, id: \.self) { _ in
              NeonCard {
                VStack(alignment: .leading, spacing: 10) {
                  RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.08)).frame(height: 14)
                  RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)).frame(height: 12)
                  RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)).frame(height: 12)
                }
              }
              .redacted(reason: .placeholder)
              .padding(.horizontal, 16)
            }
          } else if vm.filteredDeliveries.isEmpty {
            NeonCard {
              VStack(spacing: 8) {
                Image(systemName: "shippingbox")
                  .font(.system(size: 28, weight: .semibold))
                  .foregroundStyle(NeonTheme.accentCyan.opacity(0.85))
                Text("No deliveries found")
                  .font(.headline.weight(.semibold))
                  .foregroundStyle(.white)
                Text("Try changing filters or refreshing.")
                  .font(.subheadline)
                  .foregroundStyle(NeonTheme.textSecondary)
              }
              .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
          } else {
            ForEach(vm.filteredDeliveries) { item in
              DeliveryRow(item: item)
                .contentShape(Rectangle())
                .onTapGesture { selected = item }
                .padding(.horizontal, 16)
            }
          }
        }
        .padding(.vertical, 10)
      }
      .refreshable {
        await vm.refresh(twoPhase: true)
      }
    }
    .searchable(text: $vm.searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search tracking, product…")
  }

  private var header: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 4) {
        Text("\(vm.filteredDeliveries.count) package\(vm.filteredDeliveries.count == 1 ? "" : "s")")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
        Text(statusLine)
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary)
      }

      Spacer()

      if vm.isHydrating {
        HStack(spacing: 8) {
          ProgressView()
            .scaleEffect(0.85)
          Text("Updating…")
            .font(.caption.weight(.semibold))
            .foregroundStyle(NeonTheme.textSecondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      }
    }
  }

  private var statusLine: String {
    let pieces: [String] = [
      "Status: \(vm.statusFilter.label)",
      "Carrier: \(vm.carrierFilter.label)",
    ]
    return pieces.joined(separator: " • ")
  }
}

private struct DeliveryRow: View {
  let item: DeliveryItem

  var body: some View {
    NeonCard {
      HStack(alignment: .top, spacing: 12) {
        DeliveryThumb(urlString: item.productImage)
          .frame(width: 56, height: 56)

        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline) {
            Text(item.productName.isEmpty ? "Unknown Product" : item.productName)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.white)
              .lineLimit(2)
              .multilineTextAlignment(.leading)

            Spacer()

            DeliveryStatusBadge(status: item.status)
          }

          Text([item.productBrand, item.productSize].filter { !$0.isEmpty }.joined(separator: " • "))
            .font(.caption)
            .foregroundStyle(NeonTheme.textSecondary)
            .lineLimit(1)

          HStack(spacing: 10) {
            Label(item.carrier.isEmpty ? "—" : item.carrier, systemImage: "truck.box")
              .labelStyle(.titleAndIcon)
              .font(.caption2.weight(.semibold))
              .foregroundStyle(Color.white.opacity(0.78))

            Text(shortTracking(item.trackingNumber))
              .font(.caption2.monospaced().weight(.semibold))
              .foregroundStyle(Color.white.opacity(0.72))
              .lineLimit(1)

            Spacer()
          }
        }
      }
    }
  }

  private func shortTracking(_ raw: String) -> String {
    let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.count <= 12 { return s }
    let tail = String(s.suffix(12))
    return "…\(tail)"
  }
}

private struct DeliveriesBanner: View {
  enum Kind { case error }

  let kind: Kind
  let message: String
  let onClose: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "xmark.octagon.fill")
        .foregroundStyle(Color.red.opacity(0.95))
      Text(message)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .lineLimit(3)
      Spacer(minLength: 0)
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.caption.weight(.bold))
          .foregroundStyle(Color.white.opacity(0.85))
          .padding(8)
          .background(Color.white.opacity(0.08), in: Circle())
      }
      .buttonStyle(.plain)
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 12)
    .background(Color.black.opacity(0.90), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(NeonTheme.accentCyan.opacity(0.28), lineWidth: 1)
    )
  }
}

