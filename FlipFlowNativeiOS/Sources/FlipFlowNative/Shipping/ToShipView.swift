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

  private let baseURL = URL(string: "https://www.solesmarket.com")!
  private var isLoading: Bool { isLoadingPending || isLoadingMarked }

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      content
    }
    .navigationTitle("To Ship")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .task {
      await loadPending()
      await loadMarked()
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
              sectionHeader("To ship", subtitle: "Pick by SKU/size, then print label")
              ForEach(pendingOrders) { order in
                NeonCard {
                  VStack(alignment: .leading, spacing: 8) {
                    HStack {
                      Text(order.orderNumber)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NeonTheme.textPrimary)
                      Spacer()
                      Button("Print label") {
                        sheetOrderNumber = order.orderNumber
                      }
                      .font(.subheadline.weight(.medium))
                      .foregroundStyle(NeonTheme.accentCyan)
                    }
                    Text(order.productName)
                      .font(.subheadline)
                      .foregroundStyle(NeonTheme.textSecondary)
                    HStack(spacing: 12) {
                      Label(order.sku, systemImage: "barcode")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(NeonTheme.accentCyan)
                      Text("Size: \(order.size)")
                        .font(.caption)
                        .foregroundStyle(NeonTheme.textSecondary)
                    }
                    if let shipBy = order.shipByDate, !shipBy.isEmpty {
                      Text("Ship by: \(shipBy)")
                        .font(.caption2)
                        .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
                    }
                  }
                  .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 16)
              }
            }

            if !markedOrderNumbers.isEmpty {
              sectionHeader("Marked as shipped", subtitle: "Undo to remove from list")
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
                VStack(spacing: 10) {
                  Image(systemName: "shippingbox")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(NeonTheme.accentCyan.opacity(0.9))
                  Text("No orders to ship.")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(NeonTheme.textPrimary)
                  Text("Pending StockX orders appear here. Use Print shipping label to get labels.")
                    .font(.caption)
                    .foregroundStyle(NeonTheme.textSecondary)
                    .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
              }
              .padding(.horizontal, 16)
            }
          }
          .padding(.vertical, 8)
        }
        .scrollContentBackground(.hidden)
        .background(Color.clear)
      }
    }
    .padding(.top, 8)
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

  private func formatDate(_ ts: Double) -> String {
    let d = Date(timeIntervalSince1970: ts / 1000)
    let f = DateFormatter()
    f.dateStyle = .short
    f.timeStyle = .short
    return f.string(from: d)
  }

  private func loadPending() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/stockx/orders/active"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [URLQueryItem(name: "orderStatus", value: "CREATED")]
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
      await MainActor.run {
        pendingOrders = list.map { o in
          let shipBy = o.shipment?.shipByDate.flatMap { formatISODate($0) }
          return PendingOrder(
            id: o.orderNumber,
            orderNumber: o.orderNumber,
            productName: o.productName ?? "Unknown",
            sku: o.sku ?? "—",
            size: o.size ?? "—",
            status: o.status ?? "CREATED",
            salePrice: o.salePrice,
            payout: o.payout,
            orderDate: o.orderDate,
            shipByDate: shipBy
          )
        }
      }
    } catch {
      await MainActor.run {
        if bannerMessage == nil { bannerMessage = "Could not load pending orders." }
      }
    }
  }

  private func formatISODate(_ iso: String) -> String? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: iso) {
      let out = DateFormatter()
      out.dateStyle = .short
      out.timeStyle = .none
      return out.string(from: date)
    }
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: iso) else { return nil }
    let out = DateFormatter()
    out.dateStyle = .short
    out.timeStyle = .none
    return out.string(from: date)
  }

  private func loadMarked() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/shipping-fulfillment/marked"), resolvingAgainstBaseURL: false)!
    guard let url = comps.url else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    isLoading = true
    defer { Task { @MainActor in isLoading = false } }
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
}

private struct ShipmentInfo: Decodable {
  let shipByDate: String?
}
