import Foundation

enum SkuCode {
  // Crockford-ish Base32 without ambiguous chars (I, L, O, 0, 1)
  private static let alphabet: [Character] = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")

  static func generate(length: Int = 7) -> String {
    let n = max(4, length)
    var out: [Character] = []
    out.reserveCapacity(n)
    for _ in 0..<n {
      let idx = Int.random(in: 0..<alphabet.count)
      out.append(alphabet[idx])
    }
    return String(out)
  }
}

