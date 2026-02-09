import Foundation
import SwiftUI

@MainActor
final class RepricingViewModel: ObservableObject {
  @Published private(set) var listings: [RepricingListing] = []
  @Published private(set) var totalCount: Int?
  @Published private(set) var isLoading: Bool = false
  @Published private(set) var errorMessage: String?
  /// True when user is signed in but StockX isn't available (e.g. site-password only, or not connected on web).
  @Published private(set) var needsStockXAuth: Bool = false

  private let repo: RepricingRepositoryProtocol
  private let getIDToken: (Bool) async throws -> String?

  init(repo: RepricingRepositoryProtocol, getIDToken: @escaping (Bool) async throws -> String?) {
    self.repo = repo
    self.getIDToken = getIDToken
  }

  func refresh() async {
    print("[Repricing] refresh() called.")
    errorMessage = nil
    needsStockXAuth = false

    // Use forceRefresh: true so pull-to-refresh gets a valid token (same as toolbar button behavior).
    guard let token = try? await getIDToken(true), !token.isEmpty else {
      print("[Repricing] refresh: no API token (sign in with site password again to get siteSessionToken, or use Google).")
      needsStockXAuth = true
      listings = []
      totalCount = nil
      return
    }

    print("[Repricing] refresh: got token, calling listings API...")
    isLoading = true
    defer { isLoading = false }

    do {
      let (fetched, total) = try await repo.fetchListings(idToken: token, page: 1, pageSize: 100)
      var merged = fetched
      do {
        let settings = try await repo.fetchPricingSettings(idToken: token)
        var byListingId: [String: PricingSettingDoc] = [:]
        for doc in settings {
          guard let lid = doc.listingId, !Self.normalizeListingId(lid).isEmpty else { continue }
          let key = Self.normalizeListingId(lid)
          byListingId[key] = doc
        }
        for i in merged.indices {
          let key = Self.normalizeListingId(merged[i].listingId)
          guard let doc = byListingId[key] else { continue }
          merged[i].pricingStrategyType = doc.pricingStrategy?.type
          merged[i].minPrice = doc.minPrice
          merged[i].maxPrice = doc.maxPrice
        }
        print("[Repricing] refresh: merged \(byListingId.count) pricing settings.")
      } catch {
        print("[Repricing] refresh: could not load pricing settings: \(error). Continuing with listings only.")
      }
      listings = merged
      totalCount = total
      print("[Repricing] refresh: success, listings=\(merged.count), total=\(total ?? -1).")
    } catch let err as NSError {
      if err.domain == "FlipFlowNative.Repricing", err.code == 401 {
        print("[Repricing] refresh: 401 from API: \(err.localizedDescription)")
        // Retry once with a fresh token (e.g. right after Google sign-in).
        if let freshToken = try? await getIDToken(true), !freshToken.isEmpty {
          do {
            let (fetched, total) = try await repo.fetchListings(idToken: freshToken, page: 1, pageSize: 100)
            listings = fetched
            totalCount = total
            print("[Repricing] refresh: retry with fresh token succeeded, listings=\(fetched.count).")
            return
          } catch {
            print("[Repricing] refresh: retry with fresh token failed: \((error as NSError).localizedDescription)")
          }
        }
        needsStockXAuth = true
        errorMessage = err.localizedDescription
      } else {
        print("[Repricing] refresh: error \(err.code) - \(err.localizedDescription)")
        errorMessage = err.localizedDescription
        // 502 = server couldn't fetch from StockX (not connected, expired tokens, or StockX error). Show Connect button.
        if err.code == 502 {
          print("[Repricing] refresh: 502 → setting needsStockXAuth=true (Connect card will show).")
          needsStockXAuth = true
        }
      }
      listings = []
      totalCount = nil
    }
  }

  /// Normalize listingId for merge/lookup so we match web-saved docs (trim only; same as API).
  private static func normalizeListingId(_ s: String) -> String {
    s.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Save pricing rule and min/max for a listing, then update local state.
  func saveSettings(listingId: String, productId: String?, variantId: String?, strategyType: String, minPrice: Double?, maxPrice: Double?) async throws {
    guard let token = try? await getIDToken(true), !token.isEmpty else {
      throw NSError(domain: "FlipFlowNative.Repricing", code: 401, userInfo: [NSLocalizedDescriptionKey: "Not signed in"])
    }
    let normalizedId = Self.normalizeListingId(listingId)
    try await repo.savePricingSetting(idToken: token, listingId: listingId, productId: productId, variantId: variantId, strategyType: strategyType, minPrice: minPrice, maxPrice: maxPrice)
    if let idx = listings.firstIndex(where: { Self.normalizeListingId($0.listingId) == normalizedId }) {
      var arr = listings
      var item = arr[idx]
      item.pricingStrategyType = strategyType
      item.minPrice = minPrice
      item.maxPrice = maxPrice
      arr[idx] = item
      listings = arr
    }
  }

  /// Apply same rule and min/max to multiple listings; updates local state for each.
  func applyRuleToListings(listingIds: [String], strategyType: String, minPrice: Double?, maxPrice: Double?) async throws {
    let norm = Self.normalizeListingId
    for id in listingIds {
      guard let listing = listings.first(where: { norm($0.listingId) == norm(id) }) else { continue }
      try await saveSettings(
        listingId: listing.listingId,
        productId: listing.productId,
        variantId: listing.variantId,
        strategyType: strategyType,
        minPrice: minPrice,
        maxPrice: maxPrice
      )
    }
  }

  /// Returns the StockX OAuth URL (from native-auth/start) so tokens are saved to your account.
  func getStockXAuthURL() async throws -> URL {
    guard let token = try await getIDToken(true), !token.isEmpty else {
      print("[Repricing] getStockXAuthURL: no API token.")
      throw NSError(domain: "FlipFlowNative.Repricing", code: 401, userInfo: [NSLocalizedDescriptionKey: "No API token. Sign out and sign in again to connect StockX."])
    }
    print("[Repricing] getStockXAuthURL: calling native-auth/start...")
    let url = try await repo.startStockXAuth(idToken: token)
    print("[Repricing] getStockXAuthURL: got auth URL.")
    return url
  }
}
