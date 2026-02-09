import SwiftUI

struct RepricingView: View {
  @EnvironmentObject private var auth: AuthViewModel
  var pendingBuyboxListingId: String? = nil
  var onClearPendingBuybox: () -> Void = {}

  var body: some View {
    switch auth.session {
    case .signedOut:
      NeonScreen {
        repricingSignedOutContent
      }
    case .firebase, .sitePassword:
      RepricingHostView(
        getIDToken: { forceRefresh in try await auth.getApiBearerToken(forcingRefresh: forceRefresh) },
        pendingBuyboxListingId: pendingBuyboxListingId,
        onClearPendingBuybox: onClearPendingBuybox
      )
    }
  }

  private var repricingSignedOutContent: some View {
    VStack {
      Spacer()
      NeonCard {
        VStack(spacing: 12) {
          Image(systemName: "tag")
            .font(.system(size: 34, weight: .semibold))
            .foregroundStyle(NeonTheme.accentCyan)
          Text("StockX Repricing")
            .font(.title2.weight(.semibold))
            .foregroundStyle(.white)
          Text("Sign in to view and manage your StockX listings.")
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
}

private struct RepricingHostView: View {
  @StateObject private var vm: RepricingViewModel
  @EnvironmentObject private var auth: AuthViewModel
  var pendingBuyboxListingId: String?
  var onClearPendingBuybox: () -> Void

  init(getIDToken: @escaping (Bool) async throws -> String?, pendingBuyboxListingId: String? = nil, onClearPendingBuybox: @escaping () -> Void = {}) {
    _vm = StateObject(wrappedValue: RepricingViewModel(repo: ApiRepricingRepository(), getIDToken: getIDToken))
    self.pendingBuyboxListingId = pendingBuyboxListingId
    self.onClearPendingBuybox = onClearPendingBuybox
  }

  var body: some View {
    RepricingScreen(vm: vm, pendingBuyboxListingId: pendingBuyboxListingId, onClearPendingBuybox: onClearPendingBuybox)
      .onAppear {
        print("[Repricing] Screen appeared (listings=\(vm.listings.count), isLoading=\(vm.isLoading)).")
        if vm.listings.isEmpty, !vm.isLoading, vm.errorMessage == nil {
          Task { await vm.refresh() }
        }
      }
  }
}

private enum RepricingSort: String, CaseIterable {
  case priceDesc = "Price (high → low)"
  case priceAsc = "Price (low → high)"
  case nameAsc = "Name (A → Z)"
  case nameDesc = "Name (Z → A)"
  case newestToOldest = "Newest to oldest"
}

private struct RepricingScreen: View {
  @EnvironmentObject private var auth: AuthViewModel
  @ObservedObject var vm: RepricingViewModel
  var pendingBuyboxListingId: String?
  var onClearPendingBuybox: () -> Void

  @State private var showWebSheet: Bool = false
  @State private var webSheetURL: URL = URL(string: "https://www.solesmarket.com/dashboard?section=stockx-repricing")!
  @State private var isConnectingStockX: Bool = false
  @State private var connectError: String?
  @State private var isRefreshingFromButton: Bool = false
  @State private var searchText: String = ""
  @State private var sortOption: RepricingSort = .priceDesc
  @State private var showSortMenu: Bool = false
  @State private var expandedListingId: String?
  @State private var isSelectionMode: Bool = false
  @State private var selectedListingIds: Set<String> = []
  @State private var batchRule: String = "keep_current"
  @State private var showBatchRuleMenu: Bool = false
  @State private var batchMinText: String = ""
  @State private var batchMaxText: String = ""
  @State private var isApplyingBatch: Bool = false
  @State private var batchError: String?
  @State private var toastMessage: String?
  @State private var selectedSizeFilters: Set<String> = []
  @State private var filterNotWinningBuyboxOnly: Bool = false

  private var isRefreshInProgress: Bool { vm.isLoading || isRefreshingFromButton }

  /// Common sizes for horizontal filter (shoes + clothing).
  private static let commonSizeFilters: [String] = [
    "All",
    "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5",
    "10", "10.5", "11", "11.5", "12", "12.5", "13", "14",
    "S", "M", "L", "XL", "XXL",
  ]

  private func normalizedSize(_ size: String) -> String {
    size.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private func listingMatchesSizeFilter(_ size: String, selectedSizes: Set<String>) -> Bool {
    if selectedSizes.isEmpty { return true }
    let a = normalizedSize(size)
    if a.isEmpty { return false }
    return selectedSizes.contains { normalizedSize($0) == a }
  }

  private func isNotWinningBuybox(_ listing: RepricingListing) -> Bool {
    guard let ask = listing.lowestAsk, ask > 0 else { return false }
    return listing.currentPrice > ask
  }

  /// Simulates the "you're not winning the buybox" push so you can test the open-to-listing flow.
  private func sendTestBuyboxNotification() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    let listingId: String
    let productName: String
    if let first = vm.listings.first {
      listingId = first.listingId
      productName = first.productName
    } else {
      listingId = "test-buybox"
      productName = "Test listing"
    }
    NotificationCenter.default.post(
      name: BuyboxPushNotification.openListing,
      object: nil,
      userInfo: [
        BuyboxPushNotification.listingIdKey: listingId,
        BuyboxPushNotification.productNameKey: productName,
      ]
    )
    if listingId == "test-buybox" {
      toastMessage = "No listings to expand (load listings first)"
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        toastMessage = nil
      }
      return
    }
    // Defer expand so it runs after the menu dismisses; otherwise the state update can be lost.
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 350_000_000) // 0.35s
      expandedListingId = listingId
      toastMessage = "Opened first listing"
      try? await Task.sleep(nanoseconds: 1_500_000_000)
      toastMessage = nil
    }
  }

  private var filteredAndSortedListings: [RepricingListing] {
    let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    var base = q.isEmpty ? vm.listings : vm.listings.filter {
      $0.productName.lowercased().contains(q) || $0.size.lowercased().contains(q)
    }
    if !selectedSizeFilters.isEmpty {
      base = base.filter { listingMatchesSizeFilter($0.size, selectedSizes: selectedSizeFilters) }
    }
    if filterNotWinningBuyboxOnly {
      base = base.filter { isNotWinningBuybox($0) }
    }
    switch sortOption {
    case .priceDesc: return base.sorted { $0.currentPrice > $1.currentPrice }
    case .priceAsc: return base.sorted { $0.currentPrice < $1.currentPrice }
    case .nameAsc: return base.sorted { $0.productName.localizedCompare($1.productName) == .orderedAscending }
    case .nameDesc: return base.sorted { $0.productName.localizedCompare($1.productName) == .orderedDescending }
    case .newestToOldest: return base.sorted { $0.fetchedIndex < $1.fetchedIndex }
    }
  }

  var body: some View {
    NeonScreen {
      NavigationStack {
        ZStack {
          NeonTheme.backgroundGradient
            .ignoresSafeArea()
          content
        }
        .navigationTitle("Repricing")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarItems(trailing:
          HStack(spacing: 12) {
            Button {
              UIImpactFeedbackGenerator(style: .light).impactOccurred()
              isRefreshingFromButton = true
              Task {
                await vm.refresh(forceRefresh: true)
                await MainActor.run { isRefreshingFromButton = false }
              }
            } label: {
              Label("Refresh listings", systemImage: "arrow.clockwise")
            }
            .disabled(isRefreshInProgress)
            Menu {
              Button {
                webSheetURL = URL(string: "https://www.solesmarket.com/dashboard?section=stockx-repricing")!
                showWebSheet = true
              } label: {
                Label("Open repricing in browser", systemImage: "safari")
              }
              Button {
                sendTestBuyboxNotification()
              } label: {
                Label("Test buybox notification", systemImage: "bell.badge")
              }
              Button(role: .destructive) {
                auth.signOut()
              } label: {
                Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
              }
            } label: {
              Image(systemName: "ellipsis.circle")
            }
          }
        )
        .sheet(isPresented: $showWebSheet) {
          SafariView(url: webSheetURL)
            .onDisappear {
              print("[Repricing] Safari sheet dismissed (user returned to app). Tap Refresh to load listings.")
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .stockXAuthReturn)) { _ in
          print("[Repricing] StockX auth return: dismissing Safari and refreshing listings.")
          showWebSheet = false
          Task { await vm.refresh(forceRefresh: true) }
        }
        .onChange(of: pendingBuyboxListingId) { newId in
          if let id = newId, !id.isEmpty {
            expandedListingId = id
            onClearPendingBuybox()
          }
        }
        .onAppear {
          if let id = pendingBuyboxListingId, !id.isEmpty {
            expandedListingId = id
            onClearPendingBuybox()
          }
        }
        .task {
          while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 5 * 60 * 1_000_000_000)
            if Task.isCancelled { break }
            await vm.refresh(forceRefresh: false)
          }
        }
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        headerSection
        if let err = vm.errorMessage, !err.isEmpty {
          NeonCard {
            HStack(spacing: 10) {
              Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
              Text(err)
                .font(.subheadline)
                .foregroundStyle(NeonTheme.textSecondary)
            }
          }
        }
        if vm.needsStockXAuth {
          stockXConnectCard
        } else if vm.isLoading && vm.listings.isEmpty {
          loadingCard
        } else if vm.listings.isEmpty {
          emptyCard
        } else {
          statsAndListSection
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
    .refreshable {
      await vm.refresh(forceRefresh: true)
    }
    .overlay(alignment: .bottom) {
      if let msg = toastMessage {
        toastView(message: msg)
      }
    }
  }

  private var headerSection: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Text("StockX Repricing")
          .font(.title2.weight(.bold))
          .foregroundStyle(
            LinearGradient(
              colors: [NeonTheme.accentCyan, NeonTheme.accentEmerald],
              startPoint: .leading,
              endPoint: .trailing
            )
          )
        if vm.isLoading {
          ProgressView()
            .tint(NeonTheme.accentCyan)
            .scaleEffect(0.9)
        }
      }
      Text("Set rules and min/max per listing. Refresh to pull latest market data.")
        .font(.subheadline)
        .foregroundStyle(NeonTheme.textSecondary)
      Text("For batch rules and full market data, use the web dashboard.")
        .font(.caption)
        .foregroundStyle(NeonTheme.accentCyan.opacity(0.9))
    }
    .padding(.top, 8)
  }

  private var stockXConnectCard: some View {
    NeonCard {
      VStack(spacing: 14) {
        Image(systemName: "link.badge.plus")
          .font(.system(size: 32, weight: .medium))
          .foregroundStyle(NeonTheme.accentCyan)
        Text("StockX not connected")
          .font(.headline)
          .foregroundStyle(.white)
        Text("Tap the button below to connect in Safari. When you're done, you'll return to the app and your listings will load.")
          .font(.subheadline)
          .foregroundStyle(NeonTheme.textSecondary)
          .multilineTextAlignment(.center)
        if let err = connectError {
          Text(err)
            .font(.caption)
            .foregroundStyle(.orange)
            .multilineTextAlignment(.center)
        }
        Button {
          connectStockXInBrowser()
        } label: {
          HStack(spacing: 8) {
            if isConnectingStockX {
              ProgressView()
                .tint(.white)
                .scaleEffect(0.9)
            }
            Label(isConnectingStockX ? "Opening…" : "Connect StockX in browser", systemImage: "safari")
              .font(.subheadline.weight(.semibold))
              .frame(maxWidth: .infinity)
          }
        }
        .buttonStyle(.borderedProminent)
        .tint(NeonTheme.accentCyan)
        .disabled(isConnectingStockX)
        Button {
          webSheetURL = URL(string: "https://www.solesmarket.com/dashboard?section=stockx-repricing")!
          showWebSheet = true
        } label: {
          Label("Open repricing dashboard", systemImage: "globe")
            .font(.subheadline)
        }
        .buttonStyle(.bordered)
        .tint(NeonTheme.textSecondary)
      }
      .padding(4)
    }
  }

  private func connectStockXInBrowser() {
    print("[Repricing] Connect StockX in browser tapped.")
    connectError = nil
    isConnectingStockX = true
    Task {
      do {
        let url = try await vm.getStockXAuthURL()
        await MainActor.run {
          isConnectingStockX = false
          webSheetURL = url
          showWebSheet = true
          print("[Repricing] Opening Safari sheet with URL host: \(url.host ?? "?")")
        }
      } catch {
        await MainActor.run {
          isConnectingStockX = false
          print("[Repricing] Connect failed: \((error as NSError).localizedDescription)")
          let msg = (error as NSError).localizedDescription
          if case .sitePassword = auth.session, (msg.contains("Sign in with Google") || msg.contains("No API token")) {
            connectError = "Sign out (⋯ menu), then sign in again with your site password. If you already did that, the server may not be sending a token—in Vercel set SITE_SESSION_SECRET and redeploy."
          } else {
            connectError = msg
          }
        }
      }
    }
  }

  private var loadingCard: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Loading listings…")
        .font(.subheadline)
        .foregroundStyle(NeonTheme.textSecondary)
      .padding(.bottom, 8)
      ForEach(0..<6, id: \.self) { _ in
        skeletonRow
      }
    }
  }

  private var skeletonRow: some View {
    NeonCard {
      HStack(spacing: 12) {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(Color.white.opacity(0.08))
          .frame(width: 56, height: 56)
        VStack(alignment: .leading, spacing: 6) {
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(Color.white.opacity(0.1))
            .frame(height: 14)
            .frame(maxWidth: .infinity)
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(Color.white.opacity(0.06))
            .frame(width: 80, height: 10)
        }
        Spacer()
        RoundedRectangle(cornerRadius: 4, style: .continuous)
          .fill(Color.white.opacity(0.1))
          .frame(width: 44, height: 14)
      }
      .padding(4)
    }
  }

  private var emptyCard: some View {
    NeonCard {
      VStack(spacing: 12) {
        Image(systemName: "tray")
          .font(.system(size: 36, weight: .medium))
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
        Text("No listings")
          .font(.headline)
          .foregroundStyle(.white)
        Text("Refresh to load your StockX listings, or add listings on StockX first.")
          .font(.subheadline)
          .foregroundStyle(NeonTheme.textSecondary)
          .multilineTextAlignment(.center)
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          isRefreshingFromButton = true
          Task {
            await vm.refresh(forceRefresh: true)
            await MainActor.run { isRefreshingFromButton = false }
          }
        } label: {
          HStack(spacing: 8) {
            if isRefreshInProgress {
              ProgressView()
                .tint(.white)
                .scaleEffect(0.9)
            } else {
              Image(systemName: "arrow.clockwise")
            }
            Text(isRefreshInProgress ? "Refreshing…" : "Refresh")
              .font(.subheadline.weight(.semibold))
          }
        }
        .buttonStyle(.borderedProminent)
        .tint(NeonTheme.accentCyan)
        .disabled(isRefreshInProgress)
      }
      .padding(4)
    }
  }

  private var statsAndListSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          withAnimation(.easeInOut(duration: 0.2)) {
            isSelectionMode.toggle()
            if !isSelectionMode { selectedListingIds.removeAll() }
          }
        } label: {
          Text(isSelectionMode ? "Cancel" : "Select")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(NeonTheme.accentCyan)
        }
        Spacer()
        Image(systemName: "square.stack.3d.up.fill")
          .foregroundStyle(NeonTheme.accentCyan)
        let total = vm.totalCount ?? vm.listings.count
        let showing = filteredAndSortedListings.count
        Text(total > 0 ? (showing == total ? "\(total) listing\(total == 1 ? "" : "s")" : "\(showing) of \(total) listings") : "")
          .font(.subheadline.weight(.medium))
          .foregroundStyle(NeonTheme.textSecondary)
      }
      if let last = vm.lastMarketDataFetchedAt {
        let minAgo = max(0, Int(-last.timeIntervalSinceNow / 60))
        Text("Market: \(minAgo == 0 ? "just now" : "\(minAgo) min ago")")
          .font(.caption2)
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.85))
      }
      if isSelectionMode && !selectedListingIds.isEmpty {
        batchApplyBar
      }
      sizeFilterSection
      notWinningBuyboxFilter
      searchAndSortBar
      if showSortMenu {
        sortMenuInlineContent
      }
      LazyVStack(spacing: 10) {
        ForEach(filteredAndSortedListings) { listing in
          RepricingRowView(
            listing: listing,
            isExpanded: expandedListingId == listing.listingId,
            isSelectionMode: isSelectionMode,
            isSelected: selectedListingIds.contains(listing.listingId),
            onTap: {
              if isSelectionMode {
                withAnimation(.easeInOut(duration: 0.2)) {
                  if selectedListingIds.contains(listing.listingId) { selectedListingIds.remove(listing.listingId) }
                  else { selectedListingIds.insert(listing.listingId) }
                }
              } else {
                withAnimation(.easeInOut(duration: 0.25)) {
                  expandedListingId = expandedListingId == listing.listingId ? nil : listing.listingId
                }
              }
            },
            vm: vm,
            onSaveSuccess: {
              toastMessage = "Saved"
              Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                await MainActor.run {
                  toastMessage = nil
                  expandedListingId = nil
                }
              }
            }
          )
        }
      }
    }
  }

  private var batchApplyBar: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Text("Apply to \(selectedListingIds.count) selected")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer()
      }
      HStack(spacing: 10) {
        batchRuleDropdown
        TextField("Min $", text: $batchMinText)
          .keyboardType(.decimalPad)
          .frame(width: 72)
          .neonTextFieldStyle()
        TextField("Max $", text: $batchMaxText)
          .keyboardType(.decimalPad)
          .frame(width: 72)
          .neonTextFieldStyle()
      }
      if let err = batchError {
        Text(err)
          .font(.caption)
          .foregroundStyle(.red)
      }
      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task { await applyBatch() }
      } label: {
        HStack {
          if isApplyingBatch {
            ProgressView().tint(.white)
          } else {
            Image(systemName: "checkmark.circle.fill")
            Text("Apply to \(selectedListingIds.count) listings")
              .font(.subheadline.weight(.semibold))
          }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
      }
      .buttonStyle(.borderedProminent)
      .tint(NeonTheme.accentCyan)
      .disabled(isApplyingBatch)
    }
    .padding(12)
    .background(NeonTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(NeonTheme.border, lineWidth: 1)
    )
  }

  private var sizeFilterSection: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(Self.commonSizeFilters, id: \.self) { size in
          let isAll = size == "All"
          let isSelected = isAll ? selectedSizeFilters.isEmpty : selectedSizeFilters.contains(size)
          Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.easeInOut(duration: 0.2)) {
              if isAll {
                selectedSizeFilters.removeAll()
              } else {
                if selectedSizeFilters.contains(size) {
                  selectedSizeFilters.remove(size)
                } else {
                  selectedSizeFilters.insert(size)
                }
              }
            }
          } label: {
            Text(size)
              .font(.subheadline.weight(.medium))
              .foregroundStyle(isSelected ? .black : NeonTheme.textSecondary)
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(
                isSelected ? NeonTheme.accentCyan : Color.white.opacity(0.08),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
              )
              .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                  .stroke(isSelected ? Color.clear : NeonTheme.border.opacity(0.5), lineWidth: 1)
              )
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.vertical, 4)
    }
  }

  private var notWinningBuyboxFilter: some View {
    Button {
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
      withAnimation(.easeInOut(duration: 0.2)) {
        filterNotWinningBuyboxOnly.toggle()
      }
    } label: {
      HStack(spacing: 6) {
        Image(systemName: filterNotWinningBuyboxOnly ? "checkmark.circle.fill" : "circle")
          .font(.subheadline)
        Text("Not winning buybox")
          .font(.subheadline.weight(.medium))
      }
      .foregroundStyle(filterNotWinningBuyboxOnly ? NeonTheme.accentCyan : NeonTheme.textSecondary)
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(
        Color.white.opacity(filterNotWinningBuyboxOnly ? 0.12 : 0.06),
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(NeonTheme.border.opacity(0.5), lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
  }

  private var batchRuleDropdown: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeInOut(duration: 0.2)) {
          showBatchRuleMenu.toggle()
        }
      } label: {
        HStack(spacing: 6) {
          Text(batchRuleLabel)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(NeonTheme.textPrimary)
          Image(systemName: "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(NeonTheme.accentCyan)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(NeonTheme.border.opacity(0.5), lineWidth: 1)
        )
      }
      .buttonStyle(.plain)
      if showBatchRuleMenu {
        neonRuleMenu(selection: $batchRule) {
          showBatchRuleMenu = false
        }
      }
    }
  }

  private var batchRuleLabel: String {
    switch batchRule {
    case "reset_then_beat_lowest": return "Two-step (Legacy)"
    case "manual": return "Manual"
    case "keep_current": return "Repricing Off"
    default: return "Repricing Off"
    }
  }

  private func neonRuleMenu(selection: Binding<String>, onDismiss: @escaping () -> Void) -> some View {
    let options: [(value: String, label: String)] = [
      ("reset_then_beat_lowest", "Two-step (Legacy)"),
      ("manual", "Manual"),
      ("keep_current", "Repricing Off"),
    ]
    return VStack(alignment: .leading, spacing: 0) {
      ForEach(options, id: \.value) { opt in
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          selection.wrappedValue = opt.value
          onDismiss()
        } label: {
          HStack {
            Text(opt.label)
              .font(.subheadline)
              .foregroundStyle(NeonTheme.textPrimary)
            Spacer(minLength: 12)
            if selection.wrappedValue == opt.value {
              Image(systemName: "checkmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NeonTheme.accentCyan)
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 12)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        if opt.value != options.last?.value {
          Divider()
            .background(NeonTheme.border.opacity(0.5))
            .padding(.horizontal, 8)
        }
      }
    }
    .padding(4)
    .background(NeonTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(NeonTheme.border, lineWidth: 1)
    )
  }

  private func applyBatch() async {
    batchError = nil
    let minVal = parseBound(batchMinText)
    let maxVal = parseBound(batchMaxText)
    if batchRule == "manual" && (minVal == nil || minVal ?? 0 <= 0) {
      batchError = "Min price required for Manual"
      return
    }
    if let a = minVal, let b = maxVal, a >= b {
      batchError = "Min must be less than Max"
      return
    }
    isApplyingBatch = true
    defer { isApplyingBatch = false }
    do {
      try await vm.applyRuleToListings(
        listingIds: Array(selectedListingIds),
        strategyType: batchRule,
        minPrice: minVal,
        maxPrice: maxVal
      )
      toastMessage = "Applied to \(selectedListingIds.count) listings"
      selectedListingIds.removeAll()
      isSelectionMode = false
      Task {
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        await MainActor.run { toastMessage = nil }
      }
    } catch {
      batchError = error.localizedDescription
    }
  }

  private func parseBound(_ s: String) -> Double? {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty, let n = Double(t), n > 0 else { return nil }
    return n
  }

  private func toastView(message: String) -> some View {
    Text(message)
      .font(.subheadline.weight(.medium))
      .foregroundStyle(.white)
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .background(NeonTheme.accentCyan.opacity(0.9), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .padding(.bottom, 32)
  }

  private var searchAndSortBar: some View {
    HStack(spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(NeonTheme.textSecondary)
        TextField("Search by name or size", text: $searchText)
          .textFieldStyle(.plain)
          .foregroundStyle(.white)
          .autocorrectionDisabled()
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 12)
      .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(NeonTheme.border.opacity(0.5), lineWidth: 1)
      )
      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeInOut(duration: 0.2)) {
          showSortMenu.toggle()
        }
      } label: {
        HStack(spacing: 6) {
          Image(systemName: "arrow.up.arrow.down.circle")
          Text(sortOption.rawValue)
            .font(.caption.weight(.medium))
            .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .foregroundStyle(NeonTheme.accentCyan)
    }
  }

  /// Inline neon dropdown (no full-screen popover).
  private var sortMenuInlineContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(RepricingSort.allCases, id: \.rawValue) { option in
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          sortOption = option
          showSortMenu = false
        } label: {
          HStack {
            Text(option.rawValue)
              .font(.subheadline)
              .foregroundStyle(NeonTheme.textPrimary)
            Spacer(minLength: 12)
            if sortOption == option {
              Image(systemName: "checkmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NeonTheme.accentCyan)
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 12)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        if option != RepricingSort.allCases.last {
          Divider()
            .background(NeonTheme.border.opacity(0.5))
            .padding(.horizontal, 8)
        }
      }
    }
    .padding(4)
    .background(NeonTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(NeonTheme.border, lineWidth: 1)
    )
  }
}

// MARK: - Row with rule pill, optional expand + inline form, selection
private struct RepricingRowView: View {
  let listing: RepricingListing
  let isExpanded: Bool
  let isSelectionMode: Bool
  let isSelected: Bool
  let onTap: () -> Void
  @ObservedObject var vm: RepricingViewModel
  var onSaveSuccess: () -> Void

  @State private var selectedRule: String
  @State private var minText: String
  @State private var maxText: String
  @State private var isSaving: Bool = false
  @State private var saveError: String?
  @State private var showSavedFeedback: Bool = false
  @State private var showRuleMenu: Bool = false

  init(listing: RepricingListing, isExpanded: Bool, isSelectionMode: Bool, isSelected: Bool, onTap: @escaping () -> Void, vm: RepricingViewModel, onSaveSuccess: @escaping () -> Void) {
    self.listing = listing
    self.isExpanded = isExpanded
    self.isSelectionMode = isSelectionMode
    self.isSelected = isSelected
    self.onTap = onTap
    self.vm = vm
    self.onSaveSuccess = onSaveSuccess
    _selectedRule = State(initialValue: listing.pricingStrategyType ?? "keep_current")
    _minText = State(initialValue: Self.formatBound(listing.minPrice))
    _maxText = State(initialValue: Self.formatBound(listing.maxPrice))
  }

  private static func formatBound(_ v: Double?) -> String {
    guard let v = v, v > 0 else { return "" }
    return v >= 1 ? "\(Int(v))" : String(format: "%.2f", v)
  }

  private var ruleOptions: [(value: String, label: String)] {
    [
      ("reset_then_beat_lowest", "Two-step (Legacy)"),
      ("manual", "Manual"),
      ("keep_current", "Repricing Off"),
    ]
  }

  var body: some View {
    NeonCard {
      VStack(alignment: .leading, spacing: 0) {
        rowContent
        if isExpanded {
          expandedForm
        }
      }
      .padding(4)
    }
    .contentShape(Rectangle())
    .onTapGesture {
      onTap()
    }
    .onChange(of: listing.listingId) { _ in
      selectedRule = listing.pricingStrategyType ?? "keep_current"
      minText = Self.formatBound(listing.minPrice)
      maxText = Self.formatBound(listing.maxPrice)
    }
    .onChange(of: isExpanded) { expanded in
      if expanded {
        selectedRule = listing.pricingStrategyType ?? "keep_current"
        minText = Self.formatBound(listing.minPrice)
        maxText = Self.formatBound(listing.maxPrice)
        saveError = nil
      }
    }
  }

  private var rowContent: some View {
    HStack(spacing: 12) {
      if isSelectionMode {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 22))
          .foregroundStyle(isSelected ? NeonTheme.accentCyan : NeonTheme.textSecondary.opacity(0.7))
      }
      RepricingThumb(urlString: listing.imageUrl, productName: listing.productName)
      VStack(alignment: .leading, spacing: 4) {
        Text(listing.productName)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(.white)
          .lineLimit(2)
        ruleBadge
        sizePill
        if let detail = ruleDetailLabel, !detail.isEmpty {
          Text(detail)
            .font(.caption2)
            .foregroundStyle(NeonTheme.accentCyan.opacity(0.85))
        }
        if let status = listing.status, !status.isEmpty {
          Text(status)
            .font(.caption2)
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
        }
      }
      Spacer(minLength: 8)
      if let size = listing.groupSize, size > 1 {
        VStack(alignment: .trailing, spacing: 2) {
          groupRolePill
          Text("\(size) units")
            .font(.caption2)
            .foregroundStyle(NeonTheme.textSecondary)
        }
      }
      myPriceAndMarketBlock
    }
    .padding(.trailing, 16)
    .frame(minHeight: 44)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(listing.productName), size \(listing.size), \(ruleBadgeLabel), \(groupRoleAccessibilityLabel), price \(formatPrice(listing.currentPrice))")
    .accessibilityHint(isSelectionMode ? "Double tap to select" : "Double tap to edit pricing rule")
  }

  private var ruleBadge: some View {
    Text(ruleBadgeLabel)
      .font(.caption2.weight(.semibold))
      .foregroundStyle(NeonTheme.accentCyan)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(NeonTheme.accentCyan.opacity(0.15), in: Capsule())
  }

  /// Primary (lowest price in group) or Grouped (same product+size, follows primary) — shown when groupSize > 1.
  private var groupRolePill: some View {
    Group {
      if listing.isGroupLeader == true {
        HStack(spacing: 5) {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 10))
          Text("Lowest")
            .font(.caption2.weight(.medium))
        }
        .foregroundStyle(NeonTheme.accentCyan)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(NeonTheme.accentCyan.opacity(0.12), in: Capsule())
      } else {
        HStack(spacing: 5) {
          Image(systemName: "square.stack.fill")
            .font(.system(size: 9))
          Text("Grouped")
            .font(.caption2.weight(.medium))
        }
        .foregroundStyle(NeonTheme.textSecondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(NeonTheme.textSecondary.opacity(0.08), in: Capsule())
      }
    }
  }

  /// My Price (teal) and Market (gray) with optional Flex — matches web.
  private var myPriceAndMarketBlock: some View {
    VStack(alignment: .trailing, spacing: 4) {
      HStack(spacing: 12) {
        VStack(alignment: .trailing, spacing: 2) {
          HStack(spacing: 4) {
            Image(systemName: "dollarsign")
              .font(.system(size: 9, weight: .semibold))
            Text("MY PRICE")
              .font(.system(size: 9, weight: .semibold))
              .lineLimit(1)
              .fixedSize(horizontal: true, vertical: false)
          }
          .foregroundStyle(NeonTheme.accentCyan)
          Text(formatPrice(listing.currentPrice))
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(NeonTheme.accentCyan)
        }
        VStack(alignment: .trailing, spacing: 2) {
          HStack(spacing: 4) {
            Image(systemName: "chart.line.downtrend.xyaxis")
              .font(.system(size: 9, weight: .semibold))
            Text("MARKET")
              .font(.system(size: 9, weight: .semibold))
              .lineLimit(1)
              .fixedSize(horizontal: true, vertical: false)
          }
          .foregroundStyle(NeonTheme.textSecondary)
          Text(marketPriceLabel)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(NeonTheme.textSecondary)
        }
      }
      Text("Flex: $\(flexPriceLabel)")
        .font(.caption2)
        .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
    }
  }

  private var marketPriceLabel: String {
    guard let ask = listing.lowestAsk, ask > 0 else { return "—" }
    return formatPrice(ask)
  }

  private var flexPriceLabel: String {
    guard let flex = listing.flexLowestAsk, flex > 0 else { return "-" }
    return flex >= 1 ? "\(Int(flex))" : String(format: "%.2f", flex)
  }

  private var groupRoleAccessibilityLabel: String {
    guard let size = listing.groupSize, size > 1 else { return "" }
    if listing.isGroupLeader == true { return "Lowest price in group, \(size) units" }
    return "Grouped, \(size) units"
  }

  /// Size in a pill matching web purchases/deliveries (Neon: bg-white/5, border, rounded).
  /// Kept on one line and not truncated via fixedSize + lineLimit(1).
  private var sizePill: some View {
    Text(sizePillLabel)
      .font(.caption.weight(.semibold))
      .foregroundStyle(NeonTheme.textSecondary)
      .lineLimit(1)
      .fixedSize(horizontal: true, vertical: false)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .stroke(NeonTheme.border.opacity(0.4), lineWidth: 1)
      )
  }

  private var sizePillLabel: String {
    let s = listing.size.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.isEmpty { return "Size: —" }
    return "Size: \(s)"
  }

  private var ruleBadgeLabel: String {
    let t = listing.pricingStrategyType ?? "keep_current"
    switch t {
    case "reset_then_beat_lowest": return "Two-step"
    case "manual": return "Manual"
    case "keep_current": return "Off"
    case "queue_focus": return "Queue"
    case "peek_focus": return "Peek"
    default: return t
    }
  }

  private var ruleDetailLabel: String? {
    let type = listing.pricingStrategyType ?? "keep_current"
    if type == "keep_current" { return nil }
    var parts: [String] = []
    if let min = listing.minPrice, min > 0 { parts.append("Min $\(Int(min))") }
    if let max = listing.maxPrice, max > 0 { parts.append("Max $\(Int(max))") }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  private var rowRuleDropdown: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeInOut(duration: 0.2)) {
          showRuleMenu.toggle()
        }
      } label: {
        HStack(spacing: 6) {
          Text(selectedRuleLabel)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(NeonTheme.textPrimary)
          Image(systemName: "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(NeonTheme.accentCyan)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(NeonTheme.border.opacity(0.5), lineWidth: 1)
        )
      }
      .buttonStyle(.plain)
      if showRuleMenu {
        rowRuleMenuContent
      }
    }
  }

  private var selectedRuleLabel: String {
    ruleOptions.first(where: { $0.value == selectedRule })?.label ?? "Repricing Off"
  }

  private var rowRuleMenuContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(ruleOptions, id: \.value) { opt in
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          selectedRule = opt.value
          showRuleMenu = false
        } label: {
          HStack {
            Text(opt.label)
              .font(.subheadline)
              .foregroundStyle(NeonTheme.textPrimary)
            Spacer(minLength: 12)
            if selectedRule == opt.value {
              Image(systemName: "checkmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NeonTheme.accentCyan)
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 12)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        if opt.value != ruleOptions.last?.value {
          Divider()
            .background(NeonTheme.border.opacity(0.5))
            .padding(.horizontal, 8)
        }
      }
    }
    .padding(4)
    .background(NeonTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(NeonTheme.border, lineWidth: 1)
    )
  }

  private var expandedForm: some View {
    VStack(alignment: .leading, spacing: 12) {
      Divider().background(NeonTheme.border.opacity(0.5)).padding(.vertical, 4)
      if showSavedFeedback {
        HStack(spacing: 6) {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(NeonTheme.accentEmerald)
          Text("Saved")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(NeonTheme.accentEmerald)
        }
      } else {
        VStack(alignment: .leading, spacing: 8) {
          Text("Pricing rule")
            .font(.caption.weight(.semibold))
            .foregroundStyle(NeonTheme.textSecondary)
          rowRuleDropdown
            .accessibilityLabel("Pricing rule")
        }
        HStack(spacing: 12) {
          VStack(alignment: .leading, spacing: 4) {
            Text("Min $")
              .font(.caption.weight(.semibold))
              .foregroundStyle(NeonTheme.textSecondary)
            TextField("Optional", text: $minText)
              .keyboardType(.decimalPad)
              .neonTextFieldStyle()
              .accessibilityLabel("Minimum price in dollars")
          }
          VStack(alignment: .leading, spacing: 4) {
            Text("Max $")
              .font(.caption.weight(.semibold))
              .foregroundStyle(NeonTheme.textSecondary)
            TextField("Optional", text: $maxText)
              .keyboardType(.decimalPad)
              .neonTextFieldStyle()
              .accessibilityLabel("Maximum price in dollars")
          }
        }
        if let err = saveError {
          Text(err)
            .font(.caption)
            .foregroundStyle(.red)
        }
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          Task { await save() }
        } label: {
          HStack {
            if isSaving {
              ProgressView().tint(.white)
            } else {
              Image(systemName: "checkmark.circle.fill")
              Text("Save rule & bounds")
                .font(.subheadline.weight(.semibold))
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 10)
        }
        .buttonStyle(.borderedProminent)
        .tint(NeonTheme.accentCyan)
        .disabled(isSaving)
      }
    }
    .padding(.top, 4)
  }

  private func save() async {
    saveError = nil
    let minVal = parseBound(minText)
    let maxVal = parseBound(maxText)
    if selectedRule == "manual" && (minVal == nil || minVal ?? 0 <= 0) {
      saveError = "Min price required for Manual"
      return
    }
    if let a = minVal, let b = maxVal, a >= b {
      saveError = "Min must be less than Max"
      return
    }
    isSaving = true
    defer { isSaving = false }
    do {
      try await vm.saveSettings(
        listingId: listing.listingId,
        productId: listing.productId,
        variantId: listing.variantId,
        strategyType: selectedRule,
        minPrice: minVal,
        maxPrice: maxVal
      )
      showSavedFeedback = true
      onSaveSuccess()
      try? await Task.sleep(nanoseconds: 1_200_000_000)
      await MainActor.run { showSavedFeedback = false }
    } catch {
      saveError = error.localizedDescription
    }
  }

  private func parseBound(_ s: String) -> Double? {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty, let n = Double(t), n > 0 else { return nil }
    return n
  }

  private func formatPrice(_ value: Double) -> String {
    value >= 1 ? "$\(Int(value))" : String(format: "$%.2f", value)
  }
}

private struct RepricingThumb: View {
  let urlString: String?
  var productName: String = ""

  var body: some View {
    let url = URL(string: (urlString ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    return Group {
      if let url {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            placeholderView
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
              .clipped()
          case .failure:
            placeholderView
          @unknown default:
            placeholderView
          }
        }
      } else {
        placeholderView
      }
    }
    .frame(width: 56, height: 56)
    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(NeonTheme.border.opacity(0.5), lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private var placeholderView: some View {
    let initial = productName
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased()
      .first
      .map(String.init) ?? "?"
    return Text(initial)
      .font(.system(size: 22, weight: .semibold))
      .foregroundStyle(Color.white.opacity(0.7))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
