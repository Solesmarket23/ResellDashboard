import Foundation

final class ApiPurchaseRepository: PurchaseRepositoryProtocol {
  private let baseURL: URL

  init(baseURL: URL = URL(string: "https://solesmarket.com")!) {
    self.baseURL = baseURL
  }

  private func request(path: String, method: String, userId: String, body: [String: Any]? = nil, queryItems: [URLQueryItem] = []) throws -> URLRequest {
    var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
    if !queryItems.isEmpty {
      comps.queryItems = queryItems
    }
    guard let url = comps.url else {
      throw NSError(domain: "FlipFlowNative.API", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
    }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.cachePolicy = .reloadIgnoringLocalCacheData
    req.setValue(userId, forHTTPHeaderField: "x-user-id")
    if let body {
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
    }
    return req
  }

  func findPurchasesByTracking(trackingNumber: String, userId: String) async throws -> [PurchaseMatch] {
    let t = trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return [] }

    let req = try request(
      path: "api/purchases/by-tracking",
      method: "GET",
      userId: userId,
      queryItems: [URLQueryItem(name: "trackingNumber", value: t)]
    )

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status == 404 { return [] }
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: "Lookup failed (\(status))"])
    }

    let obj = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any]
    let ok = (obj?["success"] as? Bool) ?? false
    if !ok {
      let msg = (obj?["error"] as? String) ?? "Lookup failed."
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: msg])
    }

    if let matches = obj?["matches"] as? [[String: Any]] {
      return matches.compactMap { m in
        guard let id = m["id"] as? String else { return nil }
        return PurchaseMatch(id: id, data: m)
      }
    }
    if let match = obj?["match"] as? [String: Any], let id = match["id"] as? String {
      return [PurchaseMatch(id: id, data: match)]
    }
    return []
  }

  func assignSku(purchaseId: String, userId: String) async throws -> String {
    let req = try request(
      path: "api/purchases/assign-sku",
      method: "POST",
      userId: userId,
      body: ["purchaseId": purchaseId, "userId": userId]
    )

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: "Assign SKU failed (\(status))"])
    }

    let obj = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any]
    let ok = (obj?["success"] as? Bool) ?? false
    if !ok {
      let msg = (obj?["error"] as? String) ?? "Assign SKU failed."
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: msg])
    }
    if let sku = obj?["sku"] as? String, !sku.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return sku }
    throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: "Assign SKU failed (missing sku)."])
  }

  func markReceived(
    purchaseId: String,
    userId: String,
    receivedMethod: String,
    receivedNotes: String?,
    alsoMarkDelivered: Bool
  ) async throws {
    // API marks received by tracking number; easiest is update by purchaseId first to get tracking from server not available.
    // So we use /api/purchases/update directly to set received fields (Admin SDK).
    let now = ISO8601DateFormatter().string(from: Date())
    var updates: [String: Any] = [
      "received": true,
      "receivedAt": now,
      "receivedBy": userId,
      "receivedMethod": receivedMethod,
    ]
    if let receivedNotes, !receivedNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      updates["receivedNotes"] = receivedNotes
    }
    if alsoMarkDelivered {
      updates["status"] = "delivered"
      updates["deliveryStatus"] = "delivered"
      updates["deliveredAt"] = now
      updates["actualDelivery"] = now
    }

    let req = try request(
      path: "api/purchases/update",
      method: "POST",
      userId: userId,
      body: ["userId": userId, "purchaseId": purchaseId, "updates": updates]
    )
    let (_, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: "Mark received failed (\(status))"])
    }
  }

  func unmarkReceived(purchaseId: String, userId: String) async throws {
    let now = ISO8601DateFormatter().string(from: Date())
    let updates: [String: Any] = [
      "received": false,
      "updatedAt": now,
    ]

    // This won't delete `receivedAt/receivedBy/receivedNotes` (JSON limitation),
    // but it does put the item back into "not received" state for the workflow.
    let req = try request(
      path: "api/purchases/update",
      method: "POST",
      userId: userId,
      body: ["userId": userId, "purchaseId": purchaseId, "updates": updates]
    )
    let (_, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: "Undo received failed (\(status))"])
    }
  }

  func saveVerification(
    purchaseId: String,
    userId: String,
    authSelfStatus: AuthStatus,
    authSelfNotes: String,
    externalProvider: String,
    externalUrl: String,
    externalStatus: AuthStatus,
    stockxUnitQrRaw: String
  ) async throws {
    var updates: [String: Any] = [
      "authSelf": [
        "status": authSelfStatus.rawValue,
        "notes": authSelfNotes,
      ],
    ]
    if !externalUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      updates["authExternal"] = [
        "provider": externalProvider,
        "url": externalUrl,
        "status": externalStatus.rawValue,
      ]
    }
    if !stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      updates["stockx"] = [
        "unitQrRaw": stockxUnitQrRaw,
      ]
    }

    let req = try request(
      path: "api/purchases/update",
      method: "POST",
      userId: userId,
      body: ["userId": userId, "purchaseId": purchaseId, "updates": updates]
    )
    let (_, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.API", code: status, userInfo: [NSLocalizedDescriptionKey: "Save failed (\(status))"])
    }
  }
}

