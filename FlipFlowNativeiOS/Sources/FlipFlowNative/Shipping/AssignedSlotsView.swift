import SwiftUI

/// One assigned SKU (purchase with pickLocation) for list display.
struct AssignedSlotItem: Identifiable {
  let id: String
  let orderNumber: String?
  let productName: String?
  let size: String?
  let pickLocation: String
  let updatedAt: String?
  let productImageUrl: String?
  let styleId: String?
  /// When set, this SKU was used to fulfill a sale (order marked as shipped).
  let soldAt: String?
  let fulfilledOrderNumber: String?
  /// Formatted purchase price (e.g. "$45.00") for SKU label.
  let purchasePriceDisplay: String?
}

/// Lists all SKUs/slots assigned in the app (purchases with pickLocation). Swipe to delete clears the slot in Firebase.
struct AssignedSlotsView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  @State private var items: [AssignedSlotItem] = []
  @State private var isLoading = false
  @State private var bannerMessage: String?
  @State private var deletingId: String?
  @State private var searchText: String = ""
  @State private var selectedBin: String? = nil

  private let baseURL = URL(string: "https://www.solesmarket.com")!

  private var availableBins: [String] {
    let bins: Set<String> = Set(items.compactMap { (item) -> String? in
      let loc = item.pickLocation.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
      guard let first = loc.first, first.isLetter else { return nil }
      return String(first)
    })
    return Array(bins).sorted()
  }

  private var filteredItems: [AssignedSlotItem] {
    let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return items.filter { item in
      // Bin filter
      if let b = selectedBin, !b.isEmpty {
        let loc = item.pickLocation.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !loc.hasPrefix(b.uppercased()) { return false }
      }

      // Search filter
      if q.isEmpty { return true }
      let loc = item.pickLocation.lowercased()
      let name = (item.productName ?? "").lowercased()
      let style = (item.styleId ?? "").lowercased()
      return loc.contains(q) || name.contains(q) || style.contains(q)
    }
  }

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      VStack(spacing: 16) {
        bannerSection
        if isLoading && items.isEmpty {
          ProgressView()
            .tint(.white)
          Spacer()
        } else if items.isEmpty {
          Spacer()
          emptyStateCard
          Spacer()
        } else {
          searchBar
          binFilterBar
          if filteredItems.isEmpty {
            noResultsCard
          } else {
            listSection
          }
        }
      }
      .padding(.top, 8)
    }
    .navigationTitle("Assigned SKUs")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .task {
      await load()
    }
    .refreshable {
      await load()
    }
  }

  @ViewBuilder private var bannerSection: some View {
    if let msg = bannerMessage {
      Text(msg)
        .font(.subheadline)
        .foregroundStyle(NeonTheme.accentCyan)
        .padding(.horizontal)
    }
  }

  private var listSection: some View {
    List {
      ForEach(filteredItems) { item in
        AssignedSlotRow(item: item, isDeleting: deletingId == item.id, onPrint: { printLabel(for: item) })
          .listRowBackground(NeonCard { EmptyView() })
          .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
          .listRowSeparator(.hidden)
      }
      .onDelete { offsets in
        // Offsets are based on the filtered list.
        for index in offsets {
          guard index < filteredItems.count else { continue }
          let item = filteredItems[index]
          Task { await clearSlot(purchaseId: item.id) }
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Color.clear)
  }

  private var searchBar: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(NeonTheme.textSecondary)
      TextField("Search by SKU, product, style ID", text: $searchText)
        .textFieldStyle(.plain)
        .foregroundStyle(NeonTheme.textPrimary)
        .autocorrectionDisabled()
        .autocapitalization(.none)
      if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Button {
          searchText = ""
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(NeonTheme.textSecondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.vertical, 10)
    .padding(.horizontal, 14)
    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(NeonTheme.border.opacity(0.6), lineWidth: 1)
    )
    .padding(.horizontal, 16)
  }

  private var binFilterBar: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        binChip(title: "All bins", isSelected: selectedBin == nil) {
          selectedBin = nil
        }
        ForEach(availableBins, id: \.self) { bin in
          binChip(title: "Bin \(bin)", isSelected: selectedBin == bin) {
            selectedBin = bin
          }
        }
      }
      .padding(.horizontal, 16)
    }
  }

  private func binChip(title: String, isSelected: Bool, onTap: @escaping () -> Void) -> some View {
    Button {
      onTap()
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
    } label: {
      Text(title)
        .font(.caption.weight(.medium))
        .foregroundStyle(isSelected ? NeonTheme.textPrimary : NeonTheme.textSecondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
          isSelected ? AnyShapeStyle(NeonTheme.primaryGradient.opacity(0.95)) : AnyShapeStyle(Color.white.opacity(0.08)),
          in: Capsule()
        )
        .overlay(
          Capsule()
            .stroke(isSelected ? NeonTheme.accentCyan.opacity(0.5) : NeonTheme.border.opacity(0.6), lineWidth: 1)
        )
    }
    .buttonStyle(.plain)
  }

  private var noResultsCard: some View {
    NeonCard {
      VStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 28))
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
        Text("No results found")
          .font(.headline.weight(.semibold))
          .foregroundStyle(NeonTheme.textPrimary)
        Text("Try a different SKU, product name, or style ID. You can also switch bins or clear the search.")
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 20)
    }
    .padding(.horizontal, 16)
  }

  private func printLabel(for item: AssignedSlotItem) {
    Task {
      await MainActor.run { bannerMessage = "Preparing label…" }
      let img = await LabelPrinting.loadProductImage(urlString: item.productImageUrl)
      let pdf = LabelPrinting.makeLabelPDF(
        sku: item.pickLocation,
        productName: item.productName,
        productSize: item.size,
        styleId: item.styleId,
        productImage: img,
        isTest: false,
        purchasePrice: item.purchasePriceDisplay
      )
      await MainActor.run {
        bannerMessage = "Opening print…"
        LabelPrinting.presentPrintSheet(
          pdfData: pdf,
          jobName: "FlipFlow SKU \(item.pickLocation)"
        ) { completed, error in
          Task { @MainActor in
            if let error {
              bannerMessage = "Print failed: \((error as NSError).localizedDescription)"
            } else if completed {
              bannerMessage = "Sent to printer."
              UINotificationFeedbackGenerator().notificationOccurred(.success)
            } else {
              bannerMessage = "Print canceled."
            }
          }
        }
      }
    }
  }

  private var emptyStateCard: some View {
    NeonCard {
      VStack(spacing: 10) {
        Image(systemName: "tray")
          .font(.system(size: 28))
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
        Text("No assigned SKUs")
          .font(.headline.weight(.semibold))
          .foregroundStyle(NeonTheme.textPrimary)
        Text("SKUs you assign in Receiving (choose a slot or Print SKU label) will appear here. Swipe left to remove and reset.")
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 20)
    }
    .padding(.horizontal, 16)
  }

  private func load() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else {
      bannerMessage = "Sign in to load assigned SKUs."
      return
    }
    isLoading = true
    bannerMessage = nil
    defer { Task { @MainActor in isLoading = false } }
    guard let url = baseURL.appendingPathComponent("api/inventory/assigned-slots") as URL? else {
      bannerMessage = "Invalid URL."
      return
    }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
        bannerMessage = "Could not load assigned SKUs."
        return
      }
      let decoded = try JSONDecoder().decode(AssignedSlotsResponse.self, from: data)
      items = decoded.items?.map {
        AssignedSlotItem(
          id: $0.id,
          orderNumber: $0.orderNumber,
          productName: $0.productName,
          size: $0.size,
          pickLocation: $0.pickLocation,
          updatedAt: $0.updatedAt,
          productImageUrl: $0.productImageUrl,
          styleId: $0.styleId,
          soldAt: $0.soldAt,
          fulfilledOrderNumber: $0.fulfilledOrderNumber,
          purchasePriceDisplay: $0.purchasePriceDisplay
        )
      } ?? []
    } catch {
      bannerMessage = "Failed to load: \(error.localizedDescription)"
      items = []
    }
  }

  private func deleteItems(at offsets: IndexSet) {
    for index in offsets {
      let item = items[index]
      Task {
        await clearSlot(purchaseId: item.id)
      }
    }
  }

  private func clearSlot(purchaseId: String) async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else {
      bannerMessage = "Sign in to remove SKUs."
      return
    }
    await MainActor.run { deletingId = purchaseId }
    defer { Task { @MainActor in deletingId = nil } }
    guard let url = baseURL.appendingPathComponent("api/purchases/set-pick-location") as URL? else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let body = ClearSlotRequest(purchaseId: purchaseId, clear: true)
    req.httpBody = try? JSONEncoder().encode(body)
    do {
      let (_, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
        await MainActor.run { bannerMessage = "Failed to remove SKU." }
        return
      }
      await MainActor.run {
        items.removeAll { $0.id == purchaseId }
        bannerMessage = "SKU removed."
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      }
    } catch {
      await MainActor.run { bannerMessage = "Failed to remove: \(error.localizedDescription)" }
    }
  }
}

private struct AssignedSlotRow: View {
  let item: AssignedSlotItem
  let isDeleting: Bool
  let onPrint: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 8) {
          Text(item.pickLocation)
            .font(.system(.body, design: .monospaced).weight(.bold))
            .foregroundStyle(NeonTheme.accentCyan)
          if item.soldAt != nil {
            Text("Sold")
              .font(.caption2.weight(.bold))
              .foregroundStyle(.white)
              .padding(.horizontal, 6)
              .padding(.vertical, 3)
              .background(Color.orange.opacity(0.7), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
          }
        }
        Text(item.productName ?? "Unknown")
          .font(.subheadline)
          .foregroundStyle(NeonTheme.textPrimary)
          .lineLimit(2)
        HStack(spacing: 6) {
          if let size = item.size, !size.isEmpty {
            Text("Size \(size)")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          }
          if let order = item.orderNumber, !order.isEmpty {
            Text("Order: \(order)")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary)
          }
          if let fulfilled = item.fulfilledOrderNumber, !fulfilled.isEmpty {
            Text("Fulfilled: \(fulfilled)")
              .font(.caption2)
              .foregroundStyle(Color.orange.opacity(0.95))
          }
        }
      }
      Spacer(minLength: 8)
      if isDeleting {
        ProgressView()
          .tint(.white)
      }
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
    .contextMenu {
      Button {
        onPrint()
      } label: {
        Label("Print SKU label", systemImage: "printer.fill")
      }
    }
  }
}

private struct ClearSlotRequest: Encodable {
  let purchaseId: String
  let clear: Bool
}

private struct AssignedSlotsResponse: Decodable {
  let items: [AssignedSlotRowDTO]?
  let count: Int?
}

private struct AssignedSlotRowDTO: Decodable {
  let id: String
  let orderNumber: String?
  let productName: String?
  let size: String?
  let pickLocation: String
  let updatedAt: String?
  let productImageUrl: String?
  let styleId: String?
  let soldAt: String?
  let fulfilledOrderNumber: String?
  let purchasePriceDisplay: String?
}
