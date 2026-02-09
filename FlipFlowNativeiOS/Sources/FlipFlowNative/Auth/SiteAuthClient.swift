import Foundation

struct SiteAuthClient {
  struct VerifyResponse: Decodable {
    let success: Bool?
    let userId: String?
    let email: String?
    /// JWT for native API Bearer auth (e.g. StockX). Optional; only set when server has SITE_SESSION_SECRET.
    let siteSessionToken: String?
  }

  let baseURL: URL

  func verifySitePassword(password: String, remember: Bool = true) async throws -> VerifyResponse {
    let url = baseURL.appendingPathComponent("api/auth/verify")
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.cachePolicy = .reloadIgnoringLocalCacheData

    let body: [String: Any] = ["password": password, "remember": remember]
    req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

    let (data, resp) = try await URLSession.shared.data(for: req)
    let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
    if status < 200 || status >= 300 {
      throw NSError(domain: "FlipFlowNative.SiteAuth", code: status, userInfo: [
        NSLocalizedDescriptionKey: "Invalid password (status \(status))."
      ])
    }

    let decoded = try JSONDecoder().decode(VerifyResponse.self, from: data)
    return decoded
  }
}

