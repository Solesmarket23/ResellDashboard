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
  @State private var orderForVerify: PendingOrder?

  private let baseURL = URL(string: "https://www.solesmarket.com")!
  private var isLoading: Bool { isLoadingPending || isLoadingMarked }

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
      VerifyOrderSheet(
        order: order,
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
              sectionHeader("Ready to ship", subtitle: "Tap an order to print its label")
              ForEach(pendingOrders) { order in
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
            if let loc = inventoryLocations[order.sku], !loc.isEmpty {
              Label("Pick from \(loc)", systemImage: "location.fill")
                .font(.caption.weight(.medium))
                .foregroundStyle(NeonTheme.accentEmerald)
            }
            if let shipBy = order.shipByDate, !shipBy.isEmpty {
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
            shipByDate: shipBy,
            imageUrl: o.imageUrl
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
  let imageUrl: String?
}

private struct ShipmentInfo: Decodable {
  let shipByDate: String?
}

private struct InventoryLocationsResponse: Decodable {
  let locations: [String: String]?
}

// MARK: - Verify order (scan to match SKU)

private struct VerifyOrderSheet: View {
  let order: PendingOrder
  let onClose: () -> Void
  @State private var showScanner = false
  @State private var verificationResult: String?
  @State private var torchOn = false

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
              Text("Required: \(order.sku)")
                .font(.subheadline)
                .foregroundStyle(NeonTheme.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          .padding(.horizontal, 16)

          if let result = verificationResult {
            Text(result)
              .font(.headline)
              .foregroundStyle(result.hasPrefix("Correct") ? NeonTheme.accentEmerald : Color.orange)
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
      .fullScreenCover(isPresented: $showScanner) {
        VerifyScannerOverlay(
          requiredSku: order.sku,
          torchOn: $torchOn,
          onPayload: { scanned in
            let scanNorm = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
            let skuNorm = order.sku.trimmingCharacters(in: .whitespacesAndNewlines)
            Task { @MainActor in
              showScanner = false
              if scanNorm.isEmpty {
                verificationResult = "No barcode value."
              } else if scanNorm == skuNorm {
                verificationResult = "Correct item."
              } else {
                verificationResult = "Wrong item – expected SKU \(skuNorm)."
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
