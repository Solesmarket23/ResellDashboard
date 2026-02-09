import Foundation

protocol RepricingRepositoryProtocol {
  func fetchListings(idToken: String, page: Int, pageSize: Int) async throws -> (listings: [RepricingListing], totalCount: Int?)
  /// Returns the StockX OAuth URL so tokens are saved to your account. Requires Firebase ID token.
  func startStockXAuth(idToken: String) async throws -> URL
  /// Fetch all pricing settings for the current user (merge with listings by listingId).
  func fetchPricingSettings(idToken: String) async throws -> [PricingSettingDoc]
  /// Save pricing rule and min/max for one listing.
  func savePricingSetting(idToken: String, listingId: String, productId: String?, variantId: String?, strategyType: String, minPrice: Double?, maxPrice: Double?) async throws
}

final class ApiRepricingRepository: RepricingRepositoryProtocol {
  private let baseURL: URL

  init(baseURL: URL = URL(string: "https://www.solesmarket.com")!) {
    self.baseURL = baseURL
  }

  func fetchListings(idToken: String, page: Int = 1, pageSize: Int = 100) async throws -> (listings: [RepricingListing], totalCount: Int?) {
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/stockx/listings/native"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [
      URLQueryItem(name: "page", value: "\(max(1, page))"),
      URLQueryItem(name: "pageSize", value: "\(min(200, max(1, pageSize)))"),
    ]
    guard let url = comps.url else {
      throw NSError(domain: "FlipFlowNative.Repricing", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
    }

    var req = URLRequest(url: url)
    req.httpMethod = "GET"
    req.cachePolicy = .reloadIgnoringLocalCacheData
    req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    print("[Repricing] listings API response: HTTP \(status)")

    if status == 401 {
      let decoded = try? JSONDecoder().decode(NativeListingsResponse.self, from: data)
      let message = decoded?.error ?? "StockX not connected. Connect StockX on the web dashboard first."
      print("[Repricing] listings API 401: \(message)")
      throw NSError(domain: "FlipFlowNative.Repricing", code: 401, userInfo: [NSLocalizedDescriptionKey: message])
    }

    if status < 200 || status >= 300 {
      let decoded = try? JSONDecoder().decode(NativeListingsResponse.self, from: data)
      let message = decoded?.error ?? "Listings failed (\(status))."
      let bodySnippet = String(data: data, encoding: .utf8).map { String($0.prefix(200)) } ?? "nil"
      print("[Repricing] listings API \(status) body: \(bodySnippet)")
      throw NSError(domain: "FlipFlowNative.Repricing", code: status, userInfo: [NSLocalizedDescriptionKey: message])
    }

    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    let decoded = try decoder.decode(NativeListingsResponse.self, from: data)
    guard decoded.success else {
      throw NSError(domain: "FlipFlowNative.Repricing", code: 0, userInfo: [NSLocalizedDescriptionKey: decoded.error ?? "Request failed."])
    }

    guard let payload = decoded.data else {
      return ([], nil)
    }

    let rawList = payload.listings ?? []
    let totalCount = payload.count
    let listings = rawList.map { RepricingListing.from($0) }
    print("[Repricing] listings API 200 OK: count=\(listings.count), totalCount=\(totalCount ?? -1)")
    return (listings, totalCount)
  }

  func startStockXAuth(idToken: String) async throws -> URL {
    let url = baseURL.appendingPathComponent("api/stockx/native-auth/start")
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONEncoder().encode(["callbackScheme": "flipflow"])

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    print("[Repricing] native-auth/start response: HTTP \(status)")
    if status == 401 {
      let decoded = try? JSONDecoder().decode(StockXAuthStartResponse.self, from: data)
      let msg = decoded?.error ?? "Sign in with Google first to connect StockX."
      print("[Repricing] native-auth/start 401: \(msg)")
      throw NSError(domain: "FlipFlowNative.Repricing", code: 401, userInfo: [NSLocalizedDescriptionKey: msg])
    }
    if status < 200 || status >= 300 {
      let decoded = try? JSONDecoder().decode(StockXAuthStartResponse.self, from: data)
      throw NSError(domain: "FlipFlowNative.Repricing", code: status, userInfo: [NSLocalizedDescriptionKey: decoded?.error ?? "Failed to start StockX login"])
    }

    let decoded = try JSONDecoder().decode(StockXAuthStartResponse.self, from: data)
    guard decoded.success == true, let authUrlString = decoded.authUrl, let authUrl = URL(string: authUrlString) else {
      throw NSError(domain: "FlipFlowNative.Repricing", code: 0, userInfo: [NSLocalizedDescriptionKey: decoded.error ?? "Invalid response"])
    }
    return authUrl
  }

  func fetchPricingSettings(idToken: String) async throws -> [PricingSettingDoc] {
    let url = baseURL.appendingPathComponent("api/stockx/pricing-settings")
    var req = URLRequest(url: url)
    req.httpMethod = "GET"
    req.cachePolicy = .reloadIgnoringLocalCacheData
    req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status != 200 {
      let decoded = try? JSONDecoder().decode(PricingSettingsResponse.self, from: data)
      throw NSError(domain: "FlipFlowNative.Repricing", code: status, userInfo: [NSLocalizedDescriptionKey: decoded?.error ?? "Failed to load settings"])
    }
    let decoded = try JSONDecoder().decode(PricingSettingsResponse.self, from: data)
    guard decoded.success == true else {
      throw NSError(domain: "FlipFlowNative.Repricing", code: 0, userInfo: [NSLocalizedDescriptionKey: decoded.error ?? "Invalid response"])
    }
    return decoded.settings ?? []
  }

  func savePricingSetting(idToken: String, listingId: String, productId: String?, variantId: String?, strategyType: String, minPrice: Double?, maxPrice: Double?) async throws {
    let url = baseURL.appendingPathComponent("api/stockx/pricing-settings")
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")

    var settings: [String: Any] = [
      "pricingStrategy": ["type": strategyType],
      "enabled": strategyType != "keep_current",
    ]
    settings["minPrice"] = (minPrice != nil && minPrice! > 0) ? minPrice! : NSNull()
    settings["maxPrice"] = (maxPrice != nil && maxPrice! > 0) ? maxPrice! : NSNull()

    var body: [String: Any] = ["listingId": listingId, "settings": settings]
    if let pid = productId, !pid.isEmpty { body["productId"] = pid }
    if let vid = variantId, !vid.isEmpty { body["variantId"] = vid }

    req.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      let decoded = try? JSONDecoder().decode(PricingSettingsResponse.self, from: data)
      throw NSError(domain: "FlipFlowNative.Repricing", code: status, userInfo: [NSLocalizedDescriptionKey: decoded?.error ?? "Failed to save settings"])
    }
  }
}

private struct StockXAuthStartResponse: Decodable {
  let success: Bool?
  let authUrl: String?
  let error: String?
}
