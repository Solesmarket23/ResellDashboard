import SwiftUI
import UIKit

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
  @State private var showCustomizeStats: Bool = false

  var body: some View {
    Group {
      NeonScreen {
        NavigationStack {
        // Gradient must be inside the nav content so the HostingView that wraps this view draws it (avoids black nav content background).
        ZStack {
          NeonTheme.backgroundGradient
            .ignoresSafeArea()
          content
        }
        .navigationTitle("Deliveries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
              ToolbarItem(placement: .topBarTrailing) {
                Button {
                  vm.sendArrivingTomorrowNotification()
                } label: {
                  Label("Notify: packages arriving tomorrow", systemImage: "bell.badge")
                }
              }
              ToolbarItem(placement: .topBarTrailing) {
                Menu {
                  Button {
                    vm.sendTestNotificationToast()
                  } label: {
                    Label("Test notification (in-app toast)", systemImage: "bell.badge")
                  }

                  Button {
                    showCustomizeStats = true
                  } label: {
                    Label("Customize stats", systemImage: "slider.horizontal.3")
                  }

                  Divider()

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
    }
    .onAppear {
      DeliveriesBackgroundLogger.log()
    }
    .overlay(alignment: .top) {
      if let banner = vm.banner {
        DeliveriesBanner(kind: banner.kind, message: banner.message) {
          bannerDismiss?.cancel()
          bannerDismiss = nil
          withAnimation(.easeInOut(duration: 0.18)) { vm.banner = nil }
        }
        .padding(.top, 10)
        .padding(.horizontal, 14)
        .transition(.move(edge: .top).combined(with: .opacity))
        .onAppear {
          bannerDismiss?.cancel()
          let work = DispatchWorkItem {
            Task { @MainActor in
              withAnimation(.easeInOut(duration: 0.18)) {
                if vm.banner?.id == banner.id { vm.banner = nil }
              }
            }
          }
          bannerDismiss = work
          DispatchQueue.main.asyncAfter(deadline: .now() + 2.4, execute: work)
        }
      }
    }
    .animation(.easeInOut(duration: 0.18), value: vm.banner)
    .sheet(item: $selected) { item in
      DeliveryDetailView(item: item)
    }
    .sheet(isPresented: $showCustomizeStats) {
      CustomizeDeliveryStatsSheet(
        selection: $vm.selectedStats,
        onSave: { vm.persistSelectedStats() }
      )
    }
  }

  private var content: some View {
    VStack(spacing: 10) {
      header
        .padding(.horizontal, 16)
        .padding(.top, 10)

      ScrollView {
        LazyVStack(spacing: 12) {
          deliveryStatsGrid
            .padding(.horizontal, 16)
            .padding(.top, 4)

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
          } else if vm.displayedDeliveries.isEmpty {
            NeonCard {
              VStack(spacing: 8) {
                Image(systemName: "shippingbox")
                  .font(.system(size: 28, weight: .semibold))
                  .foregroundStyle(NeonTheme.accentCyan.opacity(0.85))
                Text("No deliveries found")
                  .font(.headline.weight(.semibold))
                  .foregroundStyle(.white)
                Text(vm.cardFilter != nil ? "Try a different card or clear the filter by tapping the card again." : "Try changing filters or refreshing.")
                  .font(.subheadline)
                  .foregroundStyle(NeonTheme.textSecondary)
                  .multilineTextAlignment(.center)
              }
              .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
          } else {
            ForEach(vm.displayedDeliveries) { item in
              DeliveryRow(item: item)
                .contentShape(Rectangle())
                .onTapGesture { selected = item }
                .padding(.horizontal, 16)
            }
          }
        }
        .padding(.vertical, 10)
      }
      .scrollContentBackground(.hidden)
      .background(Color.clear)
      .refreshable {
        await vm.refresh(twoPhase: true)
      }
    }
    .searchable(text: $vm.searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search tracking, product…")
    .background(Color.clear)
  }

  private var header: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 4) {
        Text("\(vm.displayedDeliveries.count) package\(vm.displayedDeliveries.count == 1 ? "" : "s")")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
        Text(statusLine)
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary)
      }

      Spacer()

      Button {
        showCustomizeStats = true
      } label: {
        Image(systemName: "slider.horizontal.3")
          .font(.body.weight(.medium))
          .foregroundStyle(NeonTheme.textSecondary)
          .frame(width: 44, height: 44)
          .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)

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
    var pieces: [String] = [
      "Status: \(vm.statusFilter.label)",
      "Carrier: \(vm.carrierFilter.label)",
    ]
    if let cf = vm.cardFilter {
      pieces.append("Card: \(cf.title)")
    }
    return pieces.joined(separator: " • ")
  }

  private var deliveryStatsGrid: some View {
    let cols = [GridItem(.flexible()), GridItem(.flexible())]
    return LazyVGrid(columns: cols, spacing: 10) {
      ForEach(vm.selectedStats.prefix(4)) { stat in
        let value = vm.stats[stat] ?? 0
        let isActive = vm.cardFilter == stat
        DeliveryStatCard(stat: stat, value: value, isFilterActive: isActive)
          .onTapGesture {
            vm.cardFilter = vm.cardFilter == stat ? nil : stat
          }
      }
    }
  }
}

private struct DeliveryRow: View {
  let item: DeliveryItem

  var body: some View {
    NeonCard {
      HStack(alignment: .top, spacing: 12) {
        DeliveryThumb(urlString: item.productImage)
          .frame(width: 44, height: 44)

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
  typealias Kind = DeliveriesBannerState.Kind

  let kind: Kind
  let message: String
  let onClose: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: kind == .error ? "xmark.octagon.fill" : "info.circle.fill")
        .foregroundStyle(kind == .error ? Color.red.opacity(0.95) : NeonTheme.accentCyan.opacity(0.95))
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

private struct DeliveryStatCard: View {
  let stat: DeliveryStatId
  let value: Int
  var isFilterActive: Bool = false

  var body: some View {
    NeonCard {
      ZStack(alignment: .topLeading) {
        // Centered label + number
        VStack(spacing: 4) {
          Text(stat.title)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(NeonTheme.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .multilineTextAlignment(.center)
          Text("\(value)")
            .font(.title2.weight(.bold))
            .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)

        // Icon top-left
        Image(systemName: stat.systemImage)
          .font(.caption.weight(.semibold))
          .foregroundStyle(stat.tint)
          .padding(.top, 6)
          .padding(.leading, 6)
      }
      .frame(minHeight: 52)
    }
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(isFilterActive ? stat.tint.opacity(0.7) : Color.clear, lineWidth: 2)
    )
  }
}

private struct CustomizeDeliveryStatsSheet: View {
  @Environment(\.dismiss) private var dismiss

  @Binding var selection: [DeliveryStatId]
  let onSave: () -> Void

  @State private var banner: String?

  var body: some View {
    NeonScreen {
      ZStack(alignment: .top) {
        NeonTheme.backgroundGradient.ignoresSafeArea()

        VStack(spacing: 12) {
          HStack {
            Text("Customize Dashboard Stats")
              .font(.title3.weight(.semibold))
              .foregroundStyle(.white)
            Spacer()
            Button {
              dismiss()
            } label: {
              Image(systemName: "xmark")
                .foregroundStyle(Color.white.opacity(0.85))
                .padding(10)
                .background(Color.white.opacity(0.08), in: Circle())
            }
            .buttonStyle(.plain)
          }
          .padding(.horizontal, 16)
          .padding(.top, 14)

          Text("Select up to 4 stats to display. Drag to reorder.")
            .font(.subheadline)
            .foregroundStyle(NeonTheme.textSecondary)
            .padding(.horizontal, 16)

          ScrollView {
            VStack(spacing: 12) {
              NeonCard {
                VStack(alignment: .leading, spacing: 10) {
                  Text("Available Stats")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)

                  LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(DeliveryStatId.allCases) { stat in
                      statToggle(stat)
                    }
                  }
                }
              }

              NeonCard {
                VStack(alignment: .leading, spacing: 10) {
                  Text("Dashboard Preview (\(selection.count)/4)")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)

                  ReorderList(selection: $selection)
                    .frame(maxWidth: .infinity)
                }
              }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 18)
          }

          HStack(spacing: 12) {
            Button("Cancel") { dismiss() }
              .foregroundStyle(.white.opacity(0.9))
              .padding(.vertical, 12)
              .frame(maxWidth: .infinity)
              .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            Button("Save Changes") {
              onSave()
              dismiss()
            }
            .buttonStyle(NeonPrimaryButtonStyle())
          }
          .padding(.horizontal, 16)
          .padding(.bottom, 12)
        }

        if let banner, !banner.isEmpty {
          DeliveriesBanner(kind: .error, message: banner) {
            withAnimation(.easeInOut(duration: 0.18)) { self.banner = nil }
          }
          .padding(.top, 10)
          .padding(.horizontal, 14)
          .transition(.move(edge: .top).combined(with: .opacity))
        }
      }
    }
  }

  private func statToggle(_ stat: DeliveryStatId) -> some View {
    let isSelected = selection.contains(stat)
    return Button {
      if isSelected {
        selection.removeAll { $0 == stat }
      } else {
        if selection.count >= 4 {
          banner = "Select up to 4 stats."
          return
        }
        selection.append(stat)
      }
    } label: {
      HStack(spacing: 10) {
        Image(systemName: stat.systemImage)
          .foregroundStyle(stat.tint)
        Text(stat.title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        Spacer()
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(isSelected ? NeonTheme.accentCyan : Color.white.opacity(0.25))
      }
      .padding(.vertical, 12)
      .padding(.horizontal, 12)
      .background(Color.white.opacity(isSelected ? 0.10 : 0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(isSelected ? NeonTheme.accentCyan.opacity(0.65) : NeonTheme.border.opacity(0.55), lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
  }
}

private struct ReorderList: View {
  @Binding var selection: [DeliveryStatId]
  @State private var editMode: EditMode = .active

  var body: some View {
    List {
      ForEach(selection) { stat in
        HStack(spacing: 10) {
          Image(systemName: "line.3.horizontal")
            .foregroundStyle(Color.white.opacity(0.35))
          Image(systemName: stat.systemImage)
            .foregroundStyle(stat.tint)
          Text(stat.title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
          Spacer()
        }
        .listRowBackground(Color.clear)
      }
      .onMove { src, dst in
        selection.move(fromOffsets: src, toOffset: dst)
      }
    }
    .environment(\.editMode, $editMode)
    .scrollContentBackground(.hidden)
    .listStyle(.plain)
    .frame(height: max(52, CGFloat(selection.count) * 44))
    .background(Color.clear)
  }
}

// MARK: - Neon background debugging (Xcode console)
private enum DeliveriesBackgroundLogger {
  static func log() {
    NSLog("[DeliveriesBG] DeliveriesScreen appeared — dumping view hierarchy from key window")
    DispatchQueue.main.async {
      guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
            let window = scene.windows.first(where: { $0.isKeyWindow }) else {
        NSLog("[DeliveriesBG] No key window found")
        return
      }
      logView(view: window, depth: 0, maxDepth: 14)
    }
  }

  private static func logView(view: UIView, depth: Int, maxDepth: Int) {
    if depth > maxDepth { return }
    let indent = String(repeating: "  ", count: depth)
    let name = String(describing: type(of: view))
    let bg: String
    if let c = view.backgroundColor {
      var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
      c.getRed(&r, green: &g, blue: &b, alpha: &a)
      bg = String(format: "R=%.2f G=%.2f B=%.2f A=%.2f", r, g, b, a)
    } else {
      bg = "nil"
    }
    NSLog("[DeliveriesBG] %@%@ opaque=%@ bg=%@", indent, name, view.isOpaque ? "true" : "false", bg)
    for (i, sub) in view.subviews.prefix(6).enumerated() {
      if depth < 10 || i < 3 { logView(view: sub, depth: depth + 1, maxDepth: maxDepth) }
    }
  }
}

