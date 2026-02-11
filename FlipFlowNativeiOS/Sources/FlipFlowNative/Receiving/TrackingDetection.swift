import Foundation

enum CarrierHint: String {
  case ups = "UPS"
  case fedex = "FedEx"
}

enum TrackingDetection {
  /// Removes whitespace/dashes/underscores and uppercases (for UPS 1Z).
  static func normalize(_ raw: String) -> String {
    raw
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "[\\s\\-_]+", with: "", options: .regularExpression)
      .uppercased()
  }

  /// Returns carrier hint if the input is a supported tracking number.
  /// - UPS: `1Z` + 16 alphanumeric (18 chars total)
  /// - FedEx: 12–15 digits (we prefer 12-digit; reject 12-digit starting with 9 which is commonly USPS)
  static func validateSupported(_ normalized: String) -> CarrierHint? {
    validateSupported(normalized, allowSuspectFedex12: false)
  }

  private static func validateSupported(_ normalized: String, allowSuspectFedex12: Bool) -> CarrierHint? {
    if normalized.range(of: #"^1Z[0-9A-Z]{16}$"#, options: .regularExpression) != nil { return .ups }
    if normalized.range(of: #"^[0-9]{12,15}$"#, options: .regularExpression) != nil {
      if !allowSuspectFedex12, normalized.count == 12, normalized.hasPrefix("9") { return nil }
      return .fedex
    }
    return nil
  }

  /// Collect all UPS/FedEx tracking numbers found in a scan; USPS-like numbers are excluded.
  /// Use this when the payload may contain multiple numbers (e.g. USPS + FedEx) so we can
  /// prefer UPS/FedEx and disregard USPS.
  static func extractAllSupported(from raw: String) -> [(tracking: String, carrier: CarrierHint)] {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return [] }

    var seen = Set<String>()
    var results: [(tracking: String, carrier: CarrierHint)] = []

    func add(_ tracking: String, allowSuspectFedex12: Bool = false) {
      let n = normalize(tracking)
      guard seen.insert(n).inserted else { return }
      if let c = validateSupported(n, allowSuspectFedex12: allowSuspectFedex12) {
        results.append((n, c))
      }
    }

    let normalized = normalize(trimmed)
    let upper = trimmed.uppercased()

    // USPS composite labels often scan as a long all-digit string starting with "420" (routing + ZIP + tracking).
    // If we see that shape, ignore it entirely so the scanner can keep looking for a FedEx/UPS barcode on the label.
    if looksLikeUspsComposite(normalized) {
      return []
    }

    // 1) Whole string
    if let carrier = validateSupported(normalized) {
      if seen.insert(normalized).inserted { results.append((normalized, carrier)) }
    }

    // 2) Long all-digit string: last 12/15/14/13 digits (FedEx often at end)
    if normalized.range(of: #"^[0-9]{16,}$"#, options: .regularExpression) != nil {
      for len in [12, 15, 14, 13] where normalized.count >= len {
        let start = normalized.index(normalized.endIndex, offsetBy: -len)
        add(String(normalized[start...]), allowSuspectFedex12: true)
      }
    }

    // 3) URL query params
    if let url = URL(string: trimmed), let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) {
      for item in comps.queryItems ?? [] {
        guard let v = item.value else { continue }
        add(v)
      }
    }

    // 4) All UPS candidates (1Z + 16 alphanumeric)
    for ups in regexMatches(in: upper, pattern: #"1Z[0-9A-Z]{16}"#) {
      add(ups)
    }

    // 5) All FedEx candidates (12–15 digits); 12-digit starting with 9 is excluded as USPS in validateSupported
    let fedexCandidates =
      regexMatches(in: upper, pattern: #"(?<!\d)[0-9]{12}(?!\d)"#) +
      regexMatches(in: upper, pattern: #"(?<!\d)[0-9]{13,15}(?!\d)"#)
    for c in fedexCandidates {
      add(c)
    }

    // Prefer UPS then FedEx so we consistently pick the same type when both exist
    return results.sorted { a, b in
      if a.carrier != b.carrier { return a.carrier == .ups }
      return false
    }
  }

  /// Extract a supported tracking number from a scan payload (barcode text, clipboard paste, etc).
  /// When multiple numbers are present (e.g. USPS + FedEx), uses only UPS or FedEx and ignores USPS.
  static func extractSupported(from raw: String) -> (tracking: String, carrier: CarrierHint)? {
    let all = extractAllSupported(from: raw)
    return all.first
  }

  /// True if the payload looks like a UPS, FedEx, or USPS tracking number.
  /// Use in SKU verify flow to ignore accidental tracking scans and avoid false "Wrong item."
  static func looksLikeTrackingNumber(_ raw: String) -> Bool {
    let n = normalize(raw)
    if n.isEmpty { return false }
    if validateSupported(n) != nil { return true }
    // USPS / other: long digit strings (e.g. 20–30 digits)
    if n.count >= 12, n.allSatisfy({ $0.isNumber }) { return true }
    return false
  }

  /// USPS composite scans often include leading "420" and are 20+ digits.
  /// We treat these as USPS so the tracking scanner can ignore them and keep searching for UPS/FedEx.
  static func looksLikeUspsComposite(_ normalized: String) -> Bool {
    let n = normalized.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !n.isEmpty else { return false }
    guard n.allSatisfy({ $0.isNumber }) else { return false }
    if n.hasPrefix("420"), n.count >= 20 { return true }
    // Common USPS IMpb: 20–22 digits, usually starts with 9
    if n.hasPrefix("9"), (20...22).contains(n.count) { return true }
    return false
  }

  /// True if the payload looks like a slot/SKU barcode: one letter A–H then digits (e.g. A1, B42, H123).
  static func looksLikeSlotSku(_ raw: String) -> Bool {
    let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return false }
    return t.range(of: #"^[A-Ha-h][0-9]+$"#, options: .regularExpression) != nil
  }

  /// Best-effort: extract a tracking-like candidate even if it's not supported.
  /// Used only for user-facing feedback ("we captured X but can't use it").
  static func extractTrackingLike(from raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }

    let upper = trimmed.uppercased()
    // UPS-ish (shorter than full 1Z18 may still show useful info)
    if let upsLike = firstRegexMatch(in: upper, pattern: #"1Z[0-9A-Z]{6,22}"#) {
      return normalize(upsLike)
    }

    // Numeric-ish: return the longest 10–30 digit token, or the last-12 of a longer one.
    let tokens = regexMatches(in: upper, pattern: #"(?<!\d)[0-9]{10,30}(?!\d)"#)
    guard let best = tokens.max(by: { $0.count < $1.count }) else { return nil }
    let n = normalize(best)
    // If it looks USPS-ish, don't return it as a "candidate" (we want the scanner to keep going).
    if looksLikeUspsComposite(n) { return nil }
    if n.count >= 16 {
      let start = n.index(n.endIndex, offsetBy: -12)
      return String(n[start...])
    }
    return n
  }

  private static func firstRegexMatch(in s: String, pattern: String) -> String? {
    guard let r = try? NSRegularExpression(pattern: pattern, options: []) else { return nil }
    let range = NSRange(s.startIndex..<s.endIndex, in: s)
    guard let m = r.firstMatch(in: s, options: [], range: range),
          let rr = Range(m.range, in: s) else { return nil }
    return String(s[rr])
  }

  private static func regexMatches(in s: String, pattern: String) -> [String] {
    guard let r = try? NSRegularExpression(pattern: pattern, options: []) else { return [] }
    let range = NSRange(s.startIndex..<s.endIndex, in: s)
    return r.matches(in: s, options: [], range: range).compactMap { m in
      guard let rr = Range(m.range, in: s) else { return nil }
      return String(s[rr])
    }
  }
}

