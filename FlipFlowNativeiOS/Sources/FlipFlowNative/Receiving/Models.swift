import Foundation
import FirebaseFirestore

enum ScanMode: String, CaseIterable, Identifiable {
  case tracking = "Tracking"
  case authQr = "Auth_QR"
  case stockxQr = "StockX_QR"

  var id: String { rawValue }

  var title: String {
    switch self {
    case .tracking: return "Tracking"
    case .authQr: return "Auth QR"
    case .stockxQr: return "StockX QR"
    }
  }
}

enum AuthStatus: String, CaseIterable, Identifiable {
  case unknown
  case pass
  case fail

  var id: String { rawValue }
}

struct PurchaseMatch: Identifiable, Hashable {
  let id: String

  let trackingNumber: String?
  let carrier: String?
  let shippingStatus: String?
  let deliveredAt: String?

  let received: Bool
  let receivedAt: String?

  let productName: String?
  let productBrand: String?
  let productSize: String?
  let productImageUrl: String?
  let priceDisplay: String?

  init(id: String, data: [String: Any]) {
    self.id = id

    self.trackingNumber = Self.pickString(data, keys: ["tracking", "trackingNumber", "tracking_number"]) ?? Self.pickNestedString(data, path: ["shipment", "tracking"]) ?? Self.pickNestedString(data, path: ["shipment", "trackingNumber"])
    self.carrier = Self.pickString(data, keys: ["carrier"]) ?? Self.pickNestedString(data, path: ["shipment", "carrier"])
    self.shippingStatus = Self.pickString(data, keys: ["shippingStatus", "status"])
    self.deliveredAt = Self.pickString(data, keys: ["actualDelivery", "deliveredAt"]) ?? Self.pickNestedString(data, path: ["shipment", "deliveredAt"])

    self.received = (data["received"] as? Bool) ?? false
    self.receivedAt = data["receivedAt"] as? String

    self.productName =
      Self.pickString(data, keys: ["productName", "title"]) ??
      ((data["product"] as? [String: Any])?["name"] as? String) ??
      ((data["product"] as? [String: Any])?["productName"] as? String)

    self.productBrand =
      Self.pickString(data, keys: ["productBrand", "brand"]) ??
      ((data["product"] as? [String: Any])?["brand"] as? String)

    self.productSize =
      Self.pickString(data, keys: ["productSize", "size"]) ??
      ((data["product"] as? [String: Any])?["size"] as? String)

    self.productImageUrl =
      Self.pickString(data, keys: ["productImageUrl", "imageUrl", "image"]) ??
      Self.pickNestedString(data, path: ["product", "imageUrl"]) ??
      Self.pickNestedString(data, path: ["product", "image"])

    self.priceDisplay = Self.formatUsd(Self.computeNetPaid(data: data))
  }

  private static func pickString(_ data: [String: Any], keys: [String]) -> String? {
    for k in keys {
      if let s = data[k] as? String, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return s }
    }
    return nil
  }

  private static func pickNestedString(_ data: [String: Any], path: [String]) -> String? {
    var cur: Any = data
    for p in path {
      guard let dict = cur as? [String: Any], let next = dict[p] else { return nil }
      cur = next
    }
    if let s = cur as? String, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return s }
    return nil
  }

  private static func parseMoney(_ val: Any?) -> Double? {
    if let n = val as? Double, n.isFinite { return n }
    if let n = val as? Int { return Double(n) }
    if let s = val as? String {
      let cleaned = s.replacingOccurrences(of: "[^0-9.\\-]", with: "", options: .regularExpression)
      if cleaned.isEmpty { return nil }
      let n = Double(cleaned)
      return n?.isFinite == true ? n : nil
    }
    return nil
  }

  private static func pickCreditsAmount(data: [String: Any]) -> Double {
    let raw = data["credits"] ?? data["discounts"] ?? 0
    let n = parseMoney(raw) ?? 0
    return n > 0 ? n : 0
  }

  private static func pickGrossAmount(data: [String: Any]) -> Double? {
    let candidates: [Any?] = [data["totalAmount"], data["totalPayment"], data["purchasePrice"], data["price"], data["originalPrice"]]
    for c in candidates {
      if let n = parseMoney(c), n > 0 { return n }
    }
    return nil
  }

  private static func computeNetPaid(data: [String: Any]) -> Double? {
    if let net = parseMoney(data["netPaid"]), net >= 0 { return net }
    guard let gross = pickGrossAmount(data: data) else { return nil }
    let credits = pickCreditsAmount(data: data)
    return max(0, gross - credits)
  }

  private static func formatUsd(_ n: Double?) -> String? {
    guard let n, n.isFinite else { return nil }
    return String(format: "$%.2f", n)
  }
}

