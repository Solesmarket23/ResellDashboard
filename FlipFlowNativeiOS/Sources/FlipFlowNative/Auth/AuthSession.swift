import Foundation

enum AuthSession: Equatable {
  case signedOut
  case firebase(userId: String)
  case sitePassword(userId: String)

  var userId: String? {
    switch self {
    case .signedOut: return nil
    case .firebase(let userId): return userId
    case .sitePassword(let userId): return userId
    }
  }
}

