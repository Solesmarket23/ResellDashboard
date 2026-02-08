import Foundation

struct DeliveriesSyncResponse: Decodable {
  let success: Bool?
  let deliveries: [DeliveryItem]?
  let count: Int?
  let liveTrackingCount: Int?
  let errorCount: Int?
  let lastSync: String?
  let error: String?
}

struct DeliveryItem: Identifiable, Decodable, Hashable {
  let id: String
  let trackingNumber: String
  let carrier: String
  let productName: String
  let productBrand: String
  let productSize: String
  let productImage: String?

  let status: String
  let estimatedDelivery: String?
  let actualDelivery: String?
  let emailUrl: String?
  let statusNote: String?
  let archivedAt: String?

  let origin: String?
  let destination: String?
  let lastUpdate: String?

  let updates: [DeliveryUpdate]

  // Extra fields the API may include (safe to ignore in UI for now)
  let orderNumber: String?
  let purchaseDate: String?
  let price: Double?
  let platform: String?

  enum CodingKeys: String, CodingKey {
    case id
    case trackingNumber
    case carrier
    case productName
    case productBrand
    case productSize
    case productImage
    case status
    case estimatedDelivery
    case actualDelivery
    case emailUrl
    case statusNote
    case archivedAt
    case origin
    case destination
    case lastUpdate
    case updates
    case orderNumber
    case purchaseDate
    case price
    case platform
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)

    id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
    trackingNumber = (try? c.decode(LossyString.self, forKey: .trackingNumber).value) ?? ""
    carrier = (try? c.decode(LossyString.self, forKey: .carrier).value) ?? ""
    productName = (try? c.decode(LossyString.self, forKey: .productName).value) ?? ""
    productBrand = (try? c.decode(LossyString.self, forKey: .productBrand).value) ?? ""
    productSize = (try? c.decode(LossyString.self, forKey: .productSize).value) ?? ""
    productImage = try? c.decodeIfPresent(LossyString.self, forKey: .productImage)?.value

    status = (try? c.decode(LossyString.self, forKey: .status).value) ?? "unknown"
    estimatedDelivery = try? c.decodeIfPresent(LossyString.self, forKey: .estimatedDelivery)?.value
    actualDelivery = try? c.decodeIfPresent(LossyString.self, forKey: .actualDelivery)?.value
    emailUrl = try? c.decodeIfPresent(LossyString.self, forKey: .emailUrl)?.value
    statusNote = try? c.decodeIfPresent(LossyString.self, forKey: .statusNote)?.value
    archivedAt = try? c.decodeIfPresent(LossyString.self, forKey: .archivedAt)?.value

    origin = try? c.decodeIfPresent(LossyString.self, forKey: .origin)?.value
    destination = try? c.decodeIfPresent(LossyString.self, forKey: .destination)?.value
    lastUpdate = try? c.decodeIfPresent(LossyString.self, forKey: .lastUpdate)?.value

    updates = (try? c.decodeIfPresent([DeliveryUpdate].self, forKey: .updates)) ?? []

    orderNumber = try? c.decodeIfPresent(LossyString.self, forKey: .orderNumber)?.value
    purchaseDate = try? c.decodeIfPresent(LossyString.self, forKey: .purchaseDate)?.value

    if let n = try? c.decodeIfPresent(Double.self, forKey: .price) {
      price = n
    } else if let s = try? c.decodeIfPresent(LossyString.self, forKey: .price)?.value {
      let filtered = s.filter { ch in
        ("0123456789.-".contains(ch))
      }
      price = Double(filtered)
    } else {
      price = nil
    }

    platform = try? c.decodeIfPresent(LossyString.self, forKey: .platform)?.value
  }
}

struct DeliveryUpdate: Decodable, Hashable {
  let timestamp: String?
  let location: String?
  let status: String?
  let description: String?

  enum CodingKeys: String, CodingKey {
    case timestamp, location, status, description
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    timestamp = try? c.decodeIfPresent(LossyString.self, forKey: .timestamp)?.value
    location = try? c.decodeIfPresent(LossyString.self, forKey: .location)?.value
    status = try? c.decodeIfPresent(LossyString.self, forKey: .status)?.value
    description = try? c.decodeIfPresent(LossyString.self, forKey: .description)?.value
  }
}

/// Decodes strings even if the backend sends numbers/bools/objects.
struct LossyString: Decodable, Hashable {
  let value: String

  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()

    if let s = try? c.decode(String.self) {
      value = s
      return
    }
    if let i = try? c.decode(Int.self) {
      value = String(i)
      return
    }
    if let d = try? c.decode(Double.self) {
      if d.rounded(.down) == d {
        value = String(Int(d))
      } else {
        value = String(d)
      }
      return
    }
    if let b = try? c.decode(Bool.self) {
      value = b ? "true" : "false"
      return
    }
    if let dict = try? c.decode([String: LossyString].self) {
      // common shapes: { city, state } or { name }
      let city = dict["city"]?.value.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let state = dict["state"]?.value.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !city.isEmpty || !state.isEmpty {
        value = [city, state].filter { !$0.isEmpty }.joined(separator: ", ")
        return
      }
      let name = dict["name"]?.value.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !name.isEmpty {
        value = name
        return
      }
      value = dict
        .sorted(by: { $0.key < $1.key })
        .map { "\($0.key)=\($0.value.value)" }
        .joined(separator: " ")
      return
    }
    if let arr = try? c.decode([LossyString].self) {
      value = arr.map(\.value).joined(separator: " • ")
      return
    }

    value = ""
  }
}

