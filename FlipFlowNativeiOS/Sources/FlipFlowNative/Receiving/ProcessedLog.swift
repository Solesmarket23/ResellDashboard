import Foundation

struct ProcessedLogEntry: Identifiable, Codable, Hashable {
  let id: String

  let processedAt: Date

  let purchaseId: String
  let productName: String?
  let productBrand: String?
  let productSize: String?
  let productImageUrl: String?

  let trackingNumber: String?
  let carrier: String?

  let stockxUnitQrRaw: String?

  let authProvider: String?
  let authUrl: String?
  let authResult: AuthStatus

  init(
    processedAt: Date,
    purchase: PurchaseMatch,
    stockxUnitQrRaw: String?,
    authProvider: String?,
    authUrl: String?,
    authResult: AuthStatus
  ) {
    self.processedAt = processedAt
    self.purchaseId = purchase.id
    self.productName = purchase.productName
    self.productBrand = purchase.productBrand
    self.productSize = purchase.productSize
    self.productImageUrl = purchase.productImageUrl
    self.trackingNumber = purchase.trackingNumber
    self.carrier = purchase.carrier
    self.stockxUnitQrRaw = stockxUnitQrRaw
    self.authProvider = authProvider
    self.authUrl = authUrl
    self.authResult = authResult

    // Stable-ish ID for dedupe: purchaseId + timestamp.
    self.id = "\(purchase.id)|\(Int(processedAt.timeIntervalSince1970))"
  }

  enum CodingKeys: String, CodingKey {
    case id
    case processedAt
    case purchaseId
    case productName
    case productBrand
    case productSize
    case productImageUrl
    case trackingNumber
    case carrier
    case stockxUnitQrRaw
    case authProvider
    case authUrl
    case authResult
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try c.decode(String.self, forKey: .id)
    self.processedAt = try c.decode(Date.self, forKey: .processedAt)
    self.purchaseId = try c.decode(String.self, forKey: .purchaseId)
    self.productName = try c.decodeIfPresent(String.self, forKey: .productName)
    self.productBrand = try c.decodeIfPresent(String.self, forKey: .productBrand)
    self.productSize = try c.decodeIfPresent(String.self, forKey: .productSize)
    self.productImageUrl = try c.decodeIfPresent(String.self, forKey: .productImageUrl)
    self.trackingNumber = try c.decodeIfPresent(String.self, forKey: .trackingNumber)
    self.carrier = try c.decodeIfPresent(String.self, forKey: .carrier)
    self.stockxUnitQrRaw = try c.decodeIfPresent(String.self, forKey: .stockxUnitQrRaw)
    self.authProvider = try c.decodeIfPresent(String.self, forKey: .authProvider)
    self.authUrl = try c.decodeIfPresent(String.self, forKey: .authUrl)
    let raw = try c.decode(String.self, forKey: .authResult)
    self.authResult = AuthStatus(rawValue: raw) ?? .unknown
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id, forKey: .id)
    try c.encode(processedAt, forKey: .processedAt)
    try c.encode(purchaseId, forKey: .purchaseId)
    try c.encodeIfPresent(productName, forKey: .productName)
    try c.encodeIfPresent(productBrand, forKey: .productBrand)
    try c.encodeIfPresent(productSize, forKey: .productSize)
    try c.encodeIfPresent(productImageUrl, forKey: .productImageUrl)
    try c.encodeIfPresent(trackingNumber, forKey: .trackingNumber)
    try c.encodeIfPresent(carrier, forKey: .carrier)
    try c.encodeIfPresent(stockxUnitQrRaw, forKey: .stockxUnitQrRaw)
    try c.encodeIfPresent(authProvider, forKey: .authProvider)
    try c.encodeIfPresent(authUrl, forKey: .authUrl)
    try c.encode(authResult.rawValue, forKey: .authResult)
  }
}

