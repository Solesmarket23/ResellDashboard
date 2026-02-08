import Foundation

protocol DeliveriesRepositoryProtocol {
  func fetchDeliveries(
    userId: String,
    includeLiveTracking: Bool,
    includeArchived: Bool
  ) async throws -> DeliveriesSyncResponse
}

final class ApiDeliveriesRepository: DeliveriesRepositoryProtocol {
  private let baseURL: URL

  init(baseURL: URL = URL(string: "https://solesmarket.com")!) {
    self.baseURL = baseURL
  }

  private func makeRequest(
    userId: String,
    includeLiveTracking: Bool,
    includeArchived: Bool
  ) throws -> URLRequest {
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/deliveries/sync"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [
      URLQueryItem(name: "userId", value: userId),
      URLQueryItem(name: "includeLiveTracking", value: includeLiveTracking ? "1" : "0"),
      URLQueryItem(name: "includeArchived", value: includeArchived ? "1" : "0"),
    ]
    guard let url = comps.url else {
      throw NSError(domain: "FlipFlowNative.Deliveries", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
    }
    var req = URLRequest(url: url)
    req.httpMethod = "GET"
    req.cachePolicy = .reloadIgnoringLocalCacheData
    // Keep consistent with the rest of the app (server can also use query param).
    req.setValue(userId, forHTTPHeaderField: "x-user-id")
    return req
  }

  func fetchDeliveries(
    userId: String,
    includeLiveTracking: Bool,
    includeArchived: Bool
  ) async throws -> DeliveriesSyncResponse {
    let trimmed = userId.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      throw NSError(domain: "FlipFlowNative.Deliveries", code: 0, userInfo: [NSLocalizedDescriptionKey: "Missing userId"])
    }

    let req = try makeRequest(userId: trimmed, includeLiveTracking: includeLiveTracking, includeArchived: includeArchived)
    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.Deliveries", code: status, userInfo: [
        NSLocalizedDescriptionKey: "Deliveries sync failed (\(status))."
      ])
    }

    // Better diagnostics when the server returns HTML or a different payload.
    let contentType = (resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? ""
    let trimmedPrefix = String(decoding: data.prefix(120), as: UTF8.self)
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "\n", with: " ")

    if !trimmedPrefix.hasPrefix("{") && !trimmedPrefix.hasPrefix("[") {
      throw NSError(domain: "FlipFlowNative.Deliveries", code: status, userInfo: [
        NSLocalizedDescriptionKey: "Deliveries response was not JSON (Content-Type: \(contentType))."
      ])
    }

    let decoder = JSONDecoder()
    let decoded = try decoder.decode(DeliveriesSyncResponse.self, from: data)
    if decoded.success != true {
      let msg = decoded.error ?? "Deliveries sync failed."
      throw NSError(domain: "FlipFlowNative.Deliveries", code: status, userInfo: [NSLocalizedDescriptionKey: msg])
    }

    // Normalize optionals so UI doesn't have to.
    return DeliveriesSyncResponse(
      success: true,
      deliveries: decoded.deliveries ?? [],
      count: decoded.count,
      liveTrackingCount: decoded.liveTrackingCount,
      errorCount: decoded.errorCount,
      lastSync: decoded.lastSync,
      error: decoded.error
    )
  }
}

