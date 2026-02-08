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

  /// Extract a supported tracking number from a scan payload (barcode text, clipboard paste, etc).
  /// Accepts:
  /// - Raw tracking numbers
  /// - Tracking URLs (we search query + whole string)
  static func extractSupported(from raw: String) -> (tracking: String, carrier: CarrierHint)? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }

    // 1) Try normalized whole string first (fast path).
    let normalized = normalize(trimmed)
    if let carrier = validateSupported(normalized) { return (normalized, carrier) }

    // Special case: some FedEx barcodes encode a long numeric string where the
    // tracking number is the LAST 12 digits (sometimes last 15).
    if normalized.range(of: #"^[0-9]{16,}$"#, options: .regularExpression) != nil {
      let suffixes: [Int] = [12, 15, 14, 13] // prefer 12 for FedEx
      for len in suffixes where normalized.count >= len {
        let start = normalized.index(normalized.endIndex, offsetBy: -len)
        let suffix = String(normalized[start...])
        if let carrier = validateSupported(suffix, allowSuspectFedex12: true) {
          return (suffix, carrier)
        }
      }
    }

    // 2) If it looks like a URL, inspect query items.
    if let url = URL(string: trimmed), let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) {
      let queryValues = (comps.queryItems ?? [])
        .compactMap { $0.value }
        .flatMap { [$0, normalize($0)] }

      for v in queryValues {
        if let carrier = validateSupported(v) { return (v, carrier) }
      }
    }

    // 3) Search the raw string for embedded candidates.
    // UPS candidates
    if let ups = firstRegexMatch(in: trimmed.uppercased(), pattern: #"1Z[0-9A-Z]{16}"#) {
      if let carrier = validateSupported(ups) { return (ups, carrier) }
    }

    // FedEx candidates: prefer 12-digit, then 13–15
    let upper = trimmed.uppercased()
    // Avoid \b word-boundary issues when digits are adjacent to letters.
    // We only require "not preceded/followed by another digit".
    let fedexCandidates =
      regexMatches(in: upper, pattern: #"(?<!\d)[0-9]{12}(?!\d)"#) +
      regexMatches(in: upper, pattern: #"(?<!\d)[0-9]{13,15}(?!\d)"#)

    for c in fedexCandidates {
      let n = normalize(c)
      if let carrier = validateSupported(n) { return (n, carrier) }
    }

    return nil
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

