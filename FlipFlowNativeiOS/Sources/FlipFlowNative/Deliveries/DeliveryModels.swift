import Foundation

struct DeliveriesSyncResponse: Decodable {
  let success: Bool
  let deliveries: [DeliveryItem]
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
}

struct DeliveryUpdate: Decodable, Hashable {
  let timestamp: String?
  let location: String?
  let status: String?
  let description: String?
}

