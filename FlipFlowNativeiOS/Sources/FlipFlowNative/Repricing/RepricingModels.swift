import Foundation

/// Response from GET /api/stockx/listings/native (Bearer token).
struct NativeListingsResponse: Decodable {
  let success: Bool
  let uid: String?
  let data: StockXListingsPayload?
  let error: String?
}

/// Raw StockX API payload (listings array may be at top level or under data).
struct StockXListingsPayload: Decodable {
  let listings: [RawStockXListing]?
  let count: Int?
  let pageSize: Int?
  let pageNumber: Int?
  let hasNextPage: Bool?

  enum CodingKeys: String, CodingKey {
    case listings
    case count
    case pageSize
    case pageNumber
    case hasNextPage
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    listings = try c.decodeIfPresent([RawStockXListing].self, forKey: .listings)
    count = try c.decodeIfPresent(Int.self, forKey: .count)
    pageSize = try c.decodeIfPresent(Int.self, forKey: .pageSize)
    pageNumber = try c.decodeIfPresent(Int.self, forKey: .pageNumber)
    hasNextPage = try c.decodeIfPresent(Bool.self, forKey: .hasNextPage)
  }
}

/// One listing from StockX (minimal fields we need for repricing list).
/// Backend may add top-level imageUrl from product.productImages or catalog enrichment.
struct RawStockXListing: Decodable {
  let id: String?
  let listingId: String?
  let productId: String?
  let variantId: String?
  let product: StockXProductRef?
  let variant: StockXVariantRef?
  let amount: String?
  let price: String?
  let size: String?
  let status: String?
  /// Backend sets from product or catalog; support both camelCase and snake_case.
  let imageUrl: String?

  enum CodingKeys: String, CodingKey {
    case id, listingId, productId, variantId, product, variant, amount, price, size, status
    case imageUrl
    case image_url
    case listing_id
    case productImage
    case product_image
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decodeIfPresent(String.self, forKey: .id)
    let fromCamelListingId = try c.decodeIfPresent(String.self, forKey: .listingId)
    let fromSnakeListingId = try c.decodeIfPresent(String.self, forKey: .listing_id)
    listingId = fromCamelListingId ?? fromSnakeListingId
    productId = try c.decodeIfPresent(String.self, forKey: .productId)
    variantId = try c.decodeIfPresent(String.self, forKey: .variantId)
    product = try c.decodeIfPresent(StockXProductRef.self, forKey: .product)
    variant = try c.decodeIfPresent(StockXVariantRef.self, forKey: .variant)
    amount = try c.decodeIfPresent(String.self, forKey: .amount)
    price = try c.decodeIfPresent(String.self, forKey: .price)
    size = try c.decodeIfPresent(String.self, forKey: .size)
    status = try c.decodeIfPresent(String.self, forKey: .status)
    let fromCamel = try c.decodeIfPresent(String.self, forKey: .imageUrl)
    let fromSnake = try c.decodeIfPresent(String.self, forKey: .image_url)
    let fromProductImage = try c.decodeIfPresent(String.self, forKey: .productImage)
    let fromProductImageSnake = try c.decodeIfPresent(String.self, forKey: .product_image)
    let topLevel = fromCamel ?? fromSnake ?? fromProductImage ?? fromProductImageSnake
    imageUrl = topLevel.flatMap { s in
      let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
      return t.isEmpty ? nil : t
    }
  }

  var listingIdValue: String {
    (listingId ?? id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var productName: String {
    product?.productName ?? product?.title ?? product?.name ?? "Unknown Product"
  }

  var sizeValue: String {
    (size ?? variant?.size ?? variant?.variantValue ?? "—").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Price in dollars (API may return cents or dollars).
  var currentPrice: Double {
    let raw = (amount ?? price ?? "0").trimmingCharacters(in: .whitespacesAndNewlines)
    guard let n = Double(raw), n > 0 else { return 0 }
    return n > 1000 ? n / 100 : n
  }

  /// Prefer backend-normalized top-level imageUrl (or productImage), then product images.
  var resolvedImageUrl: String? {
    if let u = imageUrl, !u.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return u }
    if let first = product?.productImages?.first, !first.isEmpty { return first }
    if let u = product?.imageUrl, !u.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return u }
    return nil
  }
}

struct StockXProductRef: Decodable {
  let productName: String?
  let title: String?
  let name: String?
  let productImages: [String]?
  let imageUrl: String?
  let productId: String?
  let id: String?

  enum CodingKeys: String, CodingKey {
    case productName, title, name, productImages, imageUrl, productId, id
    case product_images
    case image_url
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    productName = try c.decodeIfPresent(String.self, forKey: .productName)
    title = try c.decodeIfPresent(String.self, forKey: .title)
    name = try c.decodeIfPresent(String.self, forKey: .name)
    let imgs = try c.decodeIfPresent([String].self, forKey: .productImages)
    let imgsSnake = try c.decodeIfPresent([String].self, forKey: .product_images)
    productImages = imgs ?? imgsSnake
    let urlCamel = try c.decodeIfPresent(String.self, forKey: .imageUrl)
    let urlSnake = try c.decodeIfPresent(String.self, forKey: .image_url)
    imageUrl = urlCamel ?? urlSnake
    productId = try c.decodeIfPresent(String.self, forKey: .productId)
    id = try c.decodeIfPresent(String.self, forKey: .id)
  }
}

struct StockXVariantRef: Decodable {
  let size: String?
  let variantValue: String?
}

/// UI-facing listing model used in the repricing list.
struct RepricingListing: Identifiable {
  var id: String { listingId }
  let listingId: String
  let productName: String
  let size: String
  let currentPrice: Double
  let imageUrl: String?
  let status: String?
  let productId: String?
  let variantId: String?

  /// Pricing rule type from saved settings (e.g. reset_then_beat_lowest, manual, keep_current).
  var pricingStrategyType: String?
  var minPrice: Double?
  var maxPrice: Double?

  /// Leader/Synced: same product+size = one group; leader = lowest price. Filled by ViewModel.
  var inventoryGroupId: String?
  var isGroupLeader: Bool?
  var groupLeaderId: String?
  var groupSize: Int?

  /// Market data (lowest ask, flex). Filled by ViewModel from market-data API.
  var lowestAsk: Double?
  var flexLowestAsk: Double?

  /// Order when fetched (0 = first in response). Used for "Newest to oldest" sort.
  var fetchedIndex: Int

  static func from(_ raw: RawStockXListing) -> RepricingListing {
    RepricingListing(
      listingId: raw.listingIdValue,
      productName: raw.productName,
      size: raw.sizeValue,
      currentPrice: raw.currentPrice,
      imageUrl: raw.resolvedImageUrl,
      status: raw.status,
      productId: raw.productId,
      variantId: raw.variantId,
      inventoryGroupId: nil,
      isGroupLeader: nil,
      groupLeaderId: nil,
      groupSize: nil,
      lowestAsk: nil,
      flexLowestAsk: nil,
      fetchedIndex: 0
    )
  }
}

// MARK: - Pricing settings (from GET/POST /api/stockx/pricing-settings)

struct PricingSettingsResponse: Decodable {
  let success: Bool?
  let userId: String?
  let settings: [PricingSettingDoc]?
  let error: String?
}

struct PricingSettingDoc: Decodable {
  let id: String?
  /// listingId from Firestore (web saves as listingId; API may return listing_id).
  let listingId: String?
  let pricingStrategy: PricingStrategyPayload?
  let minPrice: Double?
  let maxPrice: Double?
  let enabled: Bool?

  enum CodingKeys: String, CodingKey {
    case id, listingId, pricingStrategy, enabled
    case minPrice, maxPrice
    case min_price, max_price
    case listing_id
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decodeIfPresent(String.self, forKey: .id)
    let fromCamel = try c.decodeIfPresent(String.self, forKey: .listingId)
    let fromSnake = try c.decodeIfPresent(String.self, forKey: .listing_id)
    listingId = fromCamel ?? fromSnake
    pricingStrategy = try c.decodeIfPresent(PricingStrategyPayload.self, forKey: .pricingStrategy)
    enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled)
    minPrice = Self.decodePrice(c, keys: (.minPrice, .min_price))
    maxPrice = Self.decodePrice(c, keys: (.maxPrice, .max_price))
  }

  private static func decodePrice(_ c: KeyedDecodingContainer<PricingSettingDoc.CodingKeys>, keys: (CodingKeys, CodingKeys)) -> Double? {
    if let n = try? c.decodeIfPresent(Double.self, forKey: keys.0), n > 0 { return n }
    if let n = try? c.decodeIfPresent(Double.self, forKey: keys.1), n > 0 { return n }
    if let n = try? c.decodeIfPresent(Int.self, forKey: keys.0), n > 0 { return Double(n) }
    if let n = try? c.decodeIfPresent(Int.self, forKey: keys.1), n > 0 { return Double(n) }
    if let s = try? c.decodeIfPresent(String.self, forKey: keys.0), let n = Double(s.trimmingCharacters(in: .whitespacesAndNewlines)), n > 0 { return n }
    if let s = try? c.decodeIfPresent(String.self, forKey: keys.1), let n = Double(s.trimmingCharacters(in: .whitespacesAndNewlines)), n > 0 { return n }
    return nil
  }
}

struct PricingStrategyPayload: Decodable {
  let type: String?
}
