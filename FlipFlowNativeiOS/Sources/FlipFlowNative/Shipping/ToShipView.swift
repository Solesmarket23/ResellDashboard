import SwiftUI

/// Pending (CREATED) StockX order for picking/shipping.
struct PendingOrder: Identifiable {
  let id: String
  let orderNumber: String
  let productName: String
  let sku: String
  let size: String
  let status: String
  let salePrice: Double?
  let payout: Double?
  let orderDate: String?
  let shipByDate: String?
  let imageUrl: String?
}

/// List of orders to ship: pending (CREATED) from StockX + marked-as-shipped from app.
struct ToShipView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  @State private var pendingOrders: [PendingOrder] = []
  @State private var markedOrderNumbers: [String] = []
  @State private var markedAt: [String: Double] = [:]
  @State private var isLoadingPending = false
  @State private var isLoadingMarked = false
  @State private var bannerMessage: String?
  @State private var orderNumberToUndo: String?
  @State private var sheetOrderNumber: String?
  @State private var inventoryLocations: [String: String] = [:]
  /// Allocated pick location by order number (from product-name match + FIFO). Falls back to inventoryLocations[sku].
  @State private var allocatedLocationByOrderNumber: [String: String] = [:]
  @State private var orderForVerify: PendingOrder?
  @State private var searchText: String = ""
  @State private var filterSize: String? = nil
  @State private var filterProductName: String? = nil

  private let baseURL = URL(string: "https://www.solesmarket.com")!
  private var isLoading: Bool { isLoadingPending || isLoadingMarked }

  private var filteredPendingOrders: [PendingOrder] {
    var list = pendingOrders
    let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if !q.isEmpty {
      list = list.filter { order in
        order.orderNumber.lowercased().contains(q)
          || order.productName.lowercased().contains(q)
          || order.sku.lowercased().contains(q)
          || order.size.lowercased().contains(q)
      }
    }
    if let size = filterSize, !size.isEmpty {
      list = list.filter { $0.size == size }
    }
    if let name = filterProductName, !name.isEmpty {
      list = list.filter { $0.productName == name }
    }
    return list
  }

  private var uniqueSizes: [String] {
    Array(Set(pendingOrders.map(\.size))).filter { !$0.isEmpty && $0 != "—" }.sorted()
  }

  private var uniqueProductNames: [String] {
    Array(Set(pendingOrders.map(\.productName))).sorted()
  }

  /// StockX ship-by is in UTC; we display and bucket by EST (no weekends as business days).
  private static let est: TimeZone = TimeZone(identifier: "America/New_York") ?? .current
  private static var estCalendar: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = est
    return c
  }

  /// Parse ISO shipByDate to Date (UTC).
  private static func date(fromISO iso: String?) -> Date? {
    guard let iso = iso?.trimmingCharacters(in: .whitespacesAndNewlines), !iso.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = formatter.date(from: iso) { return d }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: iso)
  }

  /// Format shipByDate (ISO) as EST date only, e.g. "2/12/26".
  private static func shipByDateESTDisplay(_ iso: String?) -> String? {
    guard let d = date(fromISO: iso) else { return nil }
    let formatter = DateFormatter()
    formatter.timeZone = est
    formatter.dateStyle = .short
    formatter.timeStyle = .none
    return formatter.string(from: d)
  }

  /// EST calendar components (year, month, day) for a date (interpreted in EST for day boundary).
  private static func estDayComponents(_ date: Date) -> (year: Int, month: Int, day: Int)? {
    let comps = estCalendar.dateComponents([.year, .month, .day], from: date)
    guard let y = comps.year, let m = comps.month, let d = comps.day else { return nil }
    return (y, m, d)
  }

  /// Today's date in EST (year, month, day).
  private static func estToday() -> (year: Int, month: Int, day: Int)? {
    estDayComponents(Date())
  }

  /// Next business day in EST (StockX: Sat/Sun not business days). Returns (year, month, day).
  private static func estNextBusinessDay() -> (year: Int, month: Int, day: Int)? {
    let cal = estCalendar
    let today = Date()
    let weekday = cal.component(.weekday, from: today)
    // Sunday = 1, Monday = 2, ... Saturday = 7. Next business: Fri(6)->Mon +3, Sat(7)->Mon +2, Sun(1)->Mon +1, else +1.
    let daysToAdd: Int
    switch weekday {
    case 1: daysToAdd = 1  // Sun -> Mon
    case 7: daysToAdd = 2  // Sat -> Mon
    case 6: daysToAdd = 3  // Fri -> Mon
    default: daysToAdd = 1 // Mon->Tue, Tue->Wed, Wed->Thu, Thu->Fri
    }
    guard let next = cal.date(byAdding: .day, value: daysToAdd, to: today) else { return nil }
    return estDayComponents(next)
  }

  private func shipTodayCount() -> Int {
    guard let today = Self.estToday() else { return 0 }
    return pendingOrders.filter { order in
      guard let d = Self.date(fromISO: order.shipByDate), let comps = Self.estDayComponents(d) else { return false }
      return comps.year == today.year && comps.month == today.month && comps.day == today.day
    }.count
  }

  private func shipTomorrowCount() -> Int {
    guard let tomorrow = Self.estNextBusinessDay() else { return 0 }
    return pendingOrders.filter { order in
      guard let d = Self.date(fromISO: order.shipByDate) else { return false }
      guard let comps = Self.estDayComponents(d) else { return false }
      return comps.year == tomorrow.year && comps.month == tomorrow.month && comps.day == tomorrow.day
    }.count
  }

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      content
    }
    .navigationTitle("Ready to Ship")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .task {
      await loadLocations()
      await loadPending()
      await loadMarked()
    }
    .fullScreenCover(item: $orderForVerify) { order in
      let slot = pickLocation(for: order)
      VerifyOrderSheet(
        order: order,
        requiredScanValue: slot ?? order.sku,
        isVerifyingBySlot: slot != nil,
        onClose: { orderForVerify = nil }
      )
    }
    .sheet(isPresented: Binding(
      get: { sheetOrderNumber != nil },
      set: { if !$0 { sheetOrderNumber = nil } }
    )) {
      if let num = sheetOrderNumber {
        NavigationStack {
          PrintLabelView(userId: userId, initialOrderNumber: num)
            .toolbar {
              ToolbarItem(placement: .cancellationAction) {
                Button("Done") { sheetOrderNumber = nil }
              }
            }
        }
        .environmentObject(auth)
      }
    }
    .alert("Undo mark as shipped?", isPresented: Binding(
      get: { orderNumberToUndo != nil },
      set: { if !$0 { orderNumberToUndo = nil } }
    )) {
      Button("Cancel", role: .cancel) {
        orderNumberToUndo = nil
      }
      Button("Undo") {
        if let ord = orderNumberToUndo {
          Task { await undo(orderNumber: ord) }
        }
        orderNumberToUndo = nil
      }
    } message: {
      if let ord = orderNumberToUndo {
        Text("Remove order \(ord) from your shipped list?")
      }
    }
  }

  private var content: some View {
    VStack(spacing: 16) {
      if let msg = bannerMessage {
        Text(msg)
          .font(.subheadline)
          .foregroundStyle(NeonTheme.accentCyan)
          .padding(.horizontal)
      }
      if isLoading && pendingOrders.isEmpty && markedOrderNumbers.isEmpty {
        ProgressView()
          .tint(.white)
        Spacer()
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 16) {
            if !pendingOrders.isEmpty {
              summaryCards
            }
            if !pendingOrders.isEmpty {
              searchBar
              filterBar
            }
            if !pendingOrders.isEmpty {
              sectionHeader("Ready to ship", subtitle: "Tap an order to print its label")
              ForEach(filteredPendingOrders) { order in
                pendingOrderRow(order)
              }
            }

            if !markedOrderNumbers.isEmpty {
              sectionHeader("Shipped", subtitle: "Marked as shipped — tap Undo to remove")
              ForEach(markedOrderNumbers, id: \.self) { orderNumber in
                NeonCard {
                  HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                      Text(orderNumber)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NeonTheme.textPrimary)
                      if let ts = markedAt[orderNumber] {
                        Text(formatDate(ts))
                          .font(.caption)
                          .foregroundStyle(NeonTheme.textSecondary)
                      }
                    }
                    Spacer()
                    Button("Undo") {
                      orderNumberToUndo = orderNumber
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(NeonTheme.accentCyan)
                  }
                  .contentShape(Rectangle())
                }
                .padding(.horizontal, 16)
              }
            }

            if pendingOrders.isEmpty && markedOrderNumbers.isEmpty {
              NeonCard {
                VStack(spacing: 14) {
                  Image(systemName: "shippingbox.fill")
                    .font(.system(size: 44, weight: .medium))
                    .foregroundStyle(NeonTheme.accentCyan.opacity(0.85))
                  Text("All caught up")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(NeonTheme.textPrimary)
                  Text("When you have orders to ship, they’ll show up here. Tap one to print its label.")
                    .font(.subheadline)
                    .foregroundStyle(NeonTheme.textSecondary)
                    .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
              }
              .padding(.horizontal, 16)
            }
          }
          .padding(.vertical, 8)
        }
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .refreshable {
          await loadLocations()
          await loadPending()
          await loadMarked()
        }
      }
    }
    .padding(.top, 8)
  }

  private var summaryCards: some View {
    HStack(spacing: 12) {
      summaryCard(title: "Total pending", value: "\(pendingOrders.count)", icon: "shippingbox")
      summaryCard(title: "Ship today", value: "\(shipTodayCount())", icon: "calendar")
      summaryCard(title: "Ship tomorrow", value: "\(shipTomorrowCount())", icon: "calendar.badge.clock")
    }
    .padding(.horizontal, 16)
  }

  private var searchBar: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(NeonTheme.textSecondary)
      TextField("Search order, product, SKU, size", text: $searchText)
        .textFieldStyle(.plain)
        .foregroundStyle(NeonTheme.textPrimary)
        .autocorrectionDisabled()
      if !searchText.isEmpty {
        Button {
          searchText = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(NeonTheme.textSecondary)
        }
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

  private var filterBar: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        Menu {
          Button("All sizes") { filterSize = nil }
          ForEach(uniqueSizes, id: \.self) { size in
            Button("Size \(size)") { filterSize = size }
          }
        } label: {
          HStack(spacing: 4) {
            Text(filterSize.map { "Size \($0)" } ?? "Size")
              .font(.caption.weight(.medium))
            Image(systemName: "chevron.down")
              .font(.caption2)
          }
          .foregroundStyle(NeonTheme.accentCyan)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(Color.white.opacity(0.08), in: Capsule())
        }
        Menu {
          Button("All items") { filterProductName = nil }
          ForEach(uniqueProductNames, id: \.self) { name in
            Button(name.count > 40 ? String(name.prefix(37)) + "…" : name) { filterProductName = name }
          }
        } label: {
          HStack(spacing: 4) {
            Text(filterProductName.map { $0.count > 30 ? String($0.prefix(27)) + "…" : $0 } ?? "Item")
              .font(.caption.weight(.medium))
              .lineLimit(1)
            Image(systemName: "chevron.down")
              .font(.caption2)
          }
          .foregroundStyle(NeonTheme.accentCyan)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(Color.white.opacity(0.08), in: Capsule())
        }
        if filterSize != nil || filterProductName != nil {
          Button("Clear filters") {
            filterSize = nil
            filterProductName = nil
          }
          .font(.caption.weight(.medium))
          .foregroundStyle(NeonTheme.textSecondary)
        }
      }
      .padding(.horizontal, 2)
    }
    .padding(.horizontal, 16)
  }

  private func summaryCard(title: String, value: String, icon: String) -> some View {
    NeonCard {
      VStack(spacing: 6) {
        Image(systemName: icon)
          .font(.system(size: 16))
          .foregroundStyle(NeonTheme.accentCyan.opacity(0.9))
        Text(value)
          .font(.title2.weight(.bold))
          .foregroundStyle(NeonTheme.textPrimary)
        Text(title)
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func sectionHeader(_ title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(NeonTheme.textPrimary)
      Text(subtitle)
        .font(.caption)
        .foregroundStyle(NeonTheme.textSecondary)
    }
    .padding(.horizontal, 20)
  }

  /// Apple-style row: product image left, order info right; full-row tap to print label.
  private func pendingOrderRow(_ order: PendingOrder) -> some View {
    let imageUrl = order.imageUrl.flatMap { URL(string: $0) }
    return Button {
      sheetOrderNumber = order.orderNumber
    } label: {
      NeonCard {
        HStack(alignment: .center, spacing: 14) {
          Group {
            if let url = imageUrl {
              AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                  image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                case .failure:
                  Image(systemName: "photo")
                    .font(.system(size: 22))
                    .foregroundStyle(NeonTheme.textSecondary.opacity(0.7))
                case .empty:
                  ProgressView()
                    .tint(NeonTheme.accentCyan)
                @unknown default:
                  Image(systemName: "photo")
                    .font(.system(size: 22))
                    .foregroundStyle(NeonTheme.textSecondary.opacity(0.7))
                }
              }
            } else {
              Image(systemName: "tshirt.fill")
                .font(.system(size: 22))
                .foregroundStyle(NeonTheme.textSecondary.opacity(0.7))
            }
          }
          .frame(width: 56, height: 56)
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

          VStack(alignment: .leading, spacing: 4) {
            Text(order.orderNumber)
              .font(.system(.subheadline, design: .monospaced).weight(.semibold))
              .foregroundStyle(NeonTheme.textPrimary)
            Text(order.productName)
              .font(.subheadline)
              .foregroundStyle(NeonTheme.textSecondary)
              .lineLimit(2)
            HStack(spacing: 8) {
              Text(order.sku)
                .font(.caption.weight(.medium))
                .foregroundStyle(NeonTheme.accentCyan)
              Text("•")
                .foregroundStyle(NeonTheme.textSecondary.opacity(0.7))
              Text("Size \(order.size)")
                .font(.caption)
                .foregroundStyle(NeonTheme.textSecondary)
            }
            if let loc = pickLocation(for: order), !loc.isEmpty {
              Label("Pick from \(loc)", systemImage: "location.fill")
                .font(.caption.weight(.medium))
                .foregroundStyle(NeonTheme.accentEmerald)
            }
            if let shipBy = Self.shipByDateESTDisplay(order.shipByDate), !shipBy.isEmpty {
              Text("Ship by \(shipBy)")
                .font(.caption2)
                .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)

          VStack(spacing: 6) {
            Button("Verify") {
              orderForVerify = order
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(NeonTheme.accentCyan)
            Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 16)
  }

  private func loadLocations() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    guard let url = baseURL.appendingPathComponent("api/inventory/locations") as URL? else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else { return }
      let decoded = try JSONDecoder().decode(InventoryLocationsResponse.self, from: data)
      await MainActor.run {
        inventoryLocations = decoded.locations ?? [:]
      }
    } catch { /* non-fatal */ }
  }

  private func formatDate(_ ts: Double) -> String {
    let d = Date(timeIntervalSince1970: ts / 1000)
    let f = DateFormatter()
    f.dateStyle = .short
    f.timeStyle = .short
    return f.string(from: d)
  }

  /// Prefer allocated location (product-name match, FIFO), else styleId → location map.
  private func pickLocation(for order: PendingOrder) -> String? {
    if let loc = allocatedLocationByOrderNumber[order.orderNumber], !loc.isEmpty { return loc }
    return inventoryLocations[order.sku]
  }

  private func loadPending() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/stockx/orders/active"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [
      URLQueryItem(name: "orderStatus", value: "CREATED"),
      URLQueryItem(name: "includeCatalog", value: "1"), // Request product images from catalog
    ]
    guard let url = comps.url else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    await MainActor.run { isLoadingPending = true }
    defer { Task { @MainActor in isLoadingPending = false } }
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
        await MainActor.run { if bannerMessage == nil { bannerMessage = "Could not load pending orders." } }
        return
      }
      let decoded = try JSONDecoder().decode(ActiveOrdersResponse.self, from: data)
      let list = decoded.orders ?? []
      let orders = list.map { o in
        PendingOrder(
          id: o.orderNumber,
          orderNumber: o.orderNumber,
          productName: o.productName ?? "Unknown",
          sku: o.sku ?? "—",
          size: o.size ?? "—",
          status: o.status ?? "CREATED",
          salePrice: o.salePrice,
          payout: o.payout,
          orderDate: o.orderDate,
          shipByDate: o.shipment?.shipByDate,
          imageUrl: o.resolvedImageUrl
        )
      }
      await MainActor.run { pendingOrders = orders }
      await loadAllocations(for: orders, bearer: bearer)
    } catch {
      await MainActor.run {
        if bannerMessage == nil { bannerMessage = "Could not load pending orders." }
      }
    }
  }

  /// Call allocate-for-order for each pending order (product-name match, FIFO); updates allocatedLocationByOrderNumber.
  private func loadAllocations(for orders: [PendingOrder], bearer: String) async {
    var result: [String: String] = [:]
    for order in orders {
      var comps = URLComponents(url: baseURL.appendingPathComponent("api/inventory/allocate-for-order"), resolvingAgainstBaseURL: false)!
      comps.queryItems = [
        URLQueryItem(name: "orderNumber", value: order.orderNumber),
        URLQueryItem(name: "productName", value: order.productName),
      ]
      guard let url = comps.url else { continue }
      var req = URLRequest(url: url)
      req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
      req.setValue("application/json", forHTTPHeaderField: "Accept")
      guard let (data, res) = try? await URLSession.shared.data(for: req),
            let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode),
            let decoded = try? JSONDecoder().decode(AllocateForOrderResponse.self, from: data),
            let loc = decoded.location, !loc.isEmpty
      else { continue }
      result[order.orderNumber] = loc
    }
    await MainActor.run { allocatedLocationByOrderNumber = result }
  }

  private func loadMarked() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/shipping-fulfillment/marked"), resolvingAgainstBaseURL: false)!
    guard let url = comps.url else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    await MainActor.run { isLoadingMarked = true }
    defer { Task { @MainActor in isLoadingMarked = false } }
    do {
      let (data, _) = try await URLSession.shared.data(for: req)
      let decoded = try JSONDecoder().decode(MarkedResponse.self, from: data)
      await MainActor.run {
        markedOrderNumbers = decoded.orderNumbers ?? []
        markedAt = decoded.markedAt ?? [:]
      }
    } catch {
      await MainActor.run {
        bannerMessage = "Could not load marked orders."
      }
    }
  }

  private func undo(orderNumber: String) async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var req = URLRequest(url: baseURL.appendingPathComponent("api/shipping-fulfillment/undo"))
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONEncoder().encode(["orderNumber": orderNumber])
    do {
      _ = try await URLSession.shared.data(for: req)
      await loadMarked()
      await MainActor.run { bannerMessage = "Undone." }
    } catch {
      await MainActor.run { bannerMessage = "Undo failed." }
    }
  }

}

private struct MarkedResponse: Decodable {
  let orderNumbers: [String]?
  let markedAt: [String: Double]?
}

private struct ActiveOrdersResponse: Decodable {
  let orders: [ActiveOrderRow]?
}

private struct ActiveOrderRow: Decodable {
  let orderNumber: String
  let productName: String?
  let sku: String?
  let size: String?
  let status: String?
  let salePrice: Double?
  let payout: Double?
  let orderDate: String?
  let shipment: ShipmentInfo?
  /// Prefer imageUrl; fallback to image_url for API compatibility.
  private let imageUrl: String?
  private let image_url: String?

  var resolvedImageUrl: String? {
    (imageUrl ?? image_url).flatMap { s in s.isEmpty ? nil : s }
  }

  enum CodingKeys: String, CodingKey {
    case orderNumber, productName, sku, size, status, salePrice, payout, orderDate, shipment
    case imageUrl
    case image_url
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    orderNumber = try c.decode(String.self, forKey: .orderNumber)
    productName = try c.decodeIfPresent(String.self, forKey: .productName)
    sku = try c.decodeIfPresent(String.self, forKey: .sku)
    size = try c.decodeIfPresent(String.self, forKey: .size)
    status = try c.decodeIfPresent(String.self, forKey: .status)
    salePrice = try c.decodeIfPresent(Double.self, forKey: .salePrice)
    payout = try c.decodeIfPresent(Double.self, forKey: .payout)
    orderDate = try c.decodeIfPresent(String.self, forKey: .orderDate)
    shipment = try c.decodeIfPresent(ShipmentInfo.self, forKey: .shipment)
    imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
    image_url = try c.decodeIfPresent(String.self, forKey: .image_url)
  }
}

private struct ShipmentInfo: Decodable {
  let shipByDate: String?

  enum CodingKeys: String, CodingKey {
    case shipByDate
    case ship_by_date
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    shipByDate = try c.decodeIfPresent(String.self, forKey: .shipByDate)
      ?? c.decodeIfPresent(String.self, forKey: .ship_by_date)
  }
}

private struct InventoryLocationsResponse: Decodable {
  let locations: [String: String]?
}

private struct AllocateForOrderResponse: Decodable {
  let location: String?
}

// MARK: - Verify order (scan to match SKU / pick location)

private struct VerifyOrderSheet: View {
  @EnvironmentObject private var auth: AuthViewModel
  let order: PendingOrder
  /// Value to match when scanning: slot (e.g. A2) when isVerifyingBySlot, else style ID.
  let requiredScanValue: String
  /// True when we have an assigned slot (SKU); false when falling back to style code.
  let isVerifyingBySlot: Bool
  let onClose: () -> Void
  @State private var showScanner = false
  @State private var verificationResult: String?
  @State private var torchOn = false
  @State private var showMatchDebug = false
  @State private var matchDebugText: String = ""
  @State private var isLoadingMatchDebug = false

  private var requiredLabel: String {
    isVerifyingBySlot ? "Required (SKU):" : "Required (Style ID):"
  }

  private var expectedKindInMessage: String {
    isVerifyingBySlot ? "SKU" : "Style ID"
  }

  private let matchDebugBaseURL = URL(string: "https://www.solesmarket.com")!

  private func fetchMatchDebug() async {
    await MainActor.run { isLoadingMatchDebug = true }
    defer { Task { @MainActor in isLoadingMatchDebug = false } }
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else {
      await MainActor.run {
        matchDebugText = "Not signed in. Sign in to use debug."
        showMatchDebug = true
      }
      return
    }
    var comps = URLComponents(url: matchDebugBaseURL.appendingPathComponent("api/inventory/match-debug"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [URLQueryItem(name: "productName", value: order.productName)]
    guard let finalURL = comps.url else {
      await MainActor.run { matchDebugText = "Could not build URL."; showMatchDebug = true }
      return
    }
    var request = URLRequest(url: finalURL)
    request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    do {
      let (data, _) = try await URLSession.shared.data(for: request)
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      let requested = json?["requestedProductName"] as? String ?? "—"
      let normalized = json?["normalizedRequested"] as? String ?? "—"
      let purchases = json?["purchases"] as? [[String: Any]] ?? []
      var lines: [String] = [
        "Order product name (requested):",
        requested,
        "",
        "Normalized (what we compare):",
        normalized,
        "",
        "Your received items with a pick location:",
      ]
      for (i, p) in purchases.enumerated() {
        let name = p["productName"] as? String ?? "—"
        let norm = p["normalized"] as? String ?? "—"
        let loc = p["pickLocation"] as? String ?? "—"
        let received = (p["received"] as? Bool) ?? false
        let match = p["matchType"] as? String ?? "—"
        let reason = p["reason"] as? String ?? ""
        let allocated = p["allocatedToOrderNumber"] as? String
        lines.append("")
        lines.append("--- \(i + 1) ---")
        lines.append("  productName: \(name)")
        lines.append("  normalized: \(norm)")
        lines.append("  pickLocation: \(loc)")
        lines.append("  received: \(received ? "yes" : "NO – mark received in Receiving")")
        lines.append("  match: \(match) \(reason)")
        if let a = allocated, !a.isEmpty { lines.append("  (already allocated to \(a))") }
      }
      if purchases.isEmpty {
        lines.append("  (none – assign slots in Receiving first)")
      } else {
        lines.append("")
        lines.append("Note: allocate-for-order only uses items with received=yes. If you see a slot in Assigned slots but received=NO above, complete Receiving and mark that item received.")
      }
      await MainActor.run {
        matchDebugText = lines.joined(separator: "\n")
        showMatchDebug = true
      }
    } catch {
      await MainActor.run {
        matchDebugText = "Request failed: \(error.localizedDescription)"
        showMatchDebug = true
      }
    }
  }

  var body: some View {
    NavigationStack {
      ZStack {
        NeonTheme.backgroundGradient
          .ignoresSafeArea()
        VStack(spacing: 20) {
          NeonCard {
            VStack(alignment: .leading, spacing: 8) {
              Text("Order \(order.orderNumber)")
                .font(.headline.weight(.semibold))
                .foregroundStyle(NeonTheme.textPrimary)
              Text("\(requiredLabel) \(requiredScanValue)")
                .font(.subheadline)
                .foregroundStyle(NeonTheme.textSecondary)
              if !isVerifyingBySlot {
                Text("Assign a slot in Receiving to verify by SKU.")
                  .font(.caption)
                  .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
                Button {
                  Task { await fetchMatchDebug() }
                } label: {
                  if isLoadingMatchDebug {
                    ProgressView()
                      .tint(NeonTheme.accentCyan)
                    Text("Loading…")
                      .font(.caption)
                      .foregroundStyle(NeonTheme.accentCyan)
                  } else {
                    Text("Debug: why no SKU match?")
                      .font(.caption)
                      .foregroundStyle(NeonTheme.accentCyan)
                  }
                }
                .disabled(isLoadingMatchDebug)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          .padding(.horizontal, 16)

          if let result = verificationResult {
            Text(result)
              .font(.headline)
              .foregroundStyle(result.hasPrefix("Correct") ? NeonTheme.accentEmerald : Color.red)
              .padding(.horizontal)
          }

          Button {
            verificationResult = nil
            showScanner = true
          } label: {
            HStack {
              Image(systemName: "barcode.viewfinder")
              Text("Scan to verify")
            }
            .fontWeight(.semibold)
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())
          .padding(.horizontal, 16)

          Spacer()
        }
        .padding(.top, 24)
      }
      .navigationTitle("Verify item")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(.hidden, for: .navigationBar)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { onClose() }
            .foregroundStyle(NeonTheme.accentCyan)
        }
      }
      .sheet(isPresented: $showMatchDebug) {
        NavigationStack {
          ScrollView {
            Text(matchDebugText)
              .font(.system(.caption, design: .monospaced))
              .foregroundStyle(NeonTheme.textPrimary)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding()
          }
          .background(NeonTheme.backgroundGradient)
          .navigationTitle("Match debug")
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .confirmationAction) {
              Button("Done") { showMatchDebug = false }
                .foregroundStyle(NeonTheme.accentCyan)
            }
          }
        }
      }
      .fullScreenCover(isPresented: $showScanner) {
        VerifyScannerOverlay(
          requiredSku: requiredScanValue,
          torchOn: $torchOn,
          onPayload: { scanned in
            let scanNorm = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
            let requiredNorm = requiredScanValue.trimmingCharacters(in: .whitespacesAndNewlines)
            Task { @MainActor in
              showScanner = false
              if scanNorm.isEmpty {
                verificationResult = "No barcode value."
              } else if scanNorm == requiredNorm {
                verificationResult = "Correct item."
              } else {
                verificationResult = "Wrong item – expected \(expectedKindInMessage) \(requiredNorm)."
              }
            }
          },
          onClose: { Task { @MainActor in showScanner = false } }
        )
      }
    }
  }
}

private struct VerifyScannerOverlay: View {
  let requiredSku: String
  @Binding var torchOn: Bool
  let onPayload: (String) -> Void
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      ZStack {
        AVCaptureScannerView(
          scanMode: .tracking,
          onPayload: { onPayload($0) },
          onClose: onClose,
          torchOn: $torchOn,
          onTorchStatus: { _ in }
        )
        .ignoresSafeArea()
        VStack {
          Spacer()
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(Color.white.opacity(0.85), lineWidth: 3)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.black.opacity(0.06)))
            .frame(width: 280, height: 280)
          Text("Scan product barcode to verify")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.top, 14)
          Spacer()
        }
        .allowsHitTesting(false)
        VStack {
          HStack {
            Spacer()
            Button {
              torchOn.toggle()
            } label: {
              Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                .font(.system(size: 18))
                .foregroundStyle(.white)
                .padding(12)
                .background(Color.black.opacity(0.35), in: Circle())
            }
            .padding(.trailing, 16)
            .padding(.top, 8)
          }
          Spacer()
        }
      }
      .navigationTitle("Scan to verify")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onClose() }
            .foregroundStyle(.white)
        }
      }
      .toolbarBackground(.hidden, for: .navigationBar)
    }
  }
}
