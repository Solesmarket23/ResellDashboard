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
  /// When we last fetched market data (for cache TTL and "prices as of" UI).
  @Published private(set) var lastMarketDataFetchedAt: Date?

  private let repo: RepricingRepositoryProtocol
  private let getIDToken: (Bool) async throws -> String?
  /// Market data cache: listingId (normalized) -> (lowestAsk, flexLowestAsk). TTL = marketDataCacheTTL.
  private var marketDataCache: [String: (lowestAsk: Double?, flexLowestAsk: Double?)] = [:]
  private static let marketDataCacheTTL: TimeInterval = 5 * 60 // 5 minutes

  init(repo: RepricingRepositoryProtocol, getIDToken: @escaping (Bool) async throws -> String?) {
    self.repo = repo
    self.getIDToken = getIDToken
  }

  /// If false, market data is used from cache when < 5 min old to avoid redundant StockX calls.
  func refresh(forceRefresh: Bool = false) async {
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
      merged = Self.applyInventoryGroups(merged)
      for i in merged.indices {
        merged[i].fetchedIndex = i
      }
      if !merged.isEmpty {
        let norm = Self.normalizeListingId
        let cacheValid: Bool = {
          guard !forceRefresh, let last = lastMarketDataFetchedAt, !marketDataCache.isEmpty else { return false }
          return Date().timeIntervalSince(last) < Self.marketDataCacheTTL
        }()

        if cacheValid, let last = lastMarketDataFetchedAt {
          for i in merged.indices {
            let key = norm(merged[i].listingId)
            if let pair = marketDataCache[key] {
              merged[i].lowestAsk = pair.lowestAsk
              merged[i].flexLowestAsk = pair.flexLowestAsk
            }
          }
          let minAgo = Int(-last.timeIntervalSinceNow / 60)
          print("[Repricing] refresh: using cached market data (\(minAgo) min old).")
        } else {
          let newestFirst = merged.sorted { $0.fetchedIndex < $1.fetchedIndex }
          let toFetch = Array(newestFirst.prefix(100)).map { (listingId: $0.listingId, productId: $0.productId, variantId: $0.variantId) }
          do {
            let marketMap = try await repo.fetchMarketData(idToken: token, listings: toFetch)
            var newCache: [String: (lowestAsk: Double?, flexLowestAsk: Double?)] = [:]
            for i in merged.indices {
              let key = norm(merged[i].listingId)
              if let pair = marketMap[key] ?? marketMap[merged[i].listingId] {
                merged[i].lowestAsk = pair.lowestAsk
                merged[i].flexLowestAsk = pair.flexLowestAsk
                newCache[key] = pair
              }
            }
            marketDataCache = newCache
            lastMarketDataFetchedAt = Date()
            print("[Repricing] refresh: merged market data for \(min(merged.count, 100)) listings (newest first), cache updated.")
          } catch {
            if !marketDataCache.isEmpty {
              for i in merged.indices {
                let key = norm(merged[i].listingId)
                if let pair = marketDataCache[key] {
                  merged[i].lowestAsk = pair.lowestAsk
                  merged[i].flexLowestAsk = pair.flexLowestAsk
                }
              }
              print("[Repricing] refresh: market data failed, using stale cache.")
            } else {
              print("[Repricing] refresh: market data failed: \(error). Continuing without.")
            }
          }
        }
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
            var retryList = Self.applyInventoryGroups(fetched)
            for i in retryList.indices { retryList[i].fetchedIndex = i }
            listings = retryList
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

  /// Group by productId+variantId (ACTIVE only); leader = lowest price; propagate leader's strategy to followers.
  private static func applyInventoryGroups(_ list: [RepricingListing]) -> [RepricingListing] {
    typealias GroupKey = String
    var groups: [GroupKey: [Int]] = [:] // groupId -> indices in list
    for (index, listing) in list.enumerated() {
      guard listing.status == "ACTIVE" else { continue }
      let pid = listing.productId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let vid = listing.variantId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      guard !pid.isEmpty || !vid.isEmpty else { continue }
      let key = "\(pid)_\(vid)"
      groups[key, default: []].append(index)
    }
    var result = list
    for (groupId, indices) in groups {
      guard !indices.isEmpty else { continue }
      let count = indices.count
      if count == 1 {
        let i = indices[0]
        result[i].inventoryGroupId = groupId
        result[i].isGroupLeader = true
        result[i].groupLeaderId = result[i].listingId
        result[i].groupSize = 1
        continue
      }
      let sorted = indices.sorted { result[$0].currentPrice < result[$1].currentPrice }
      let leaderIdx = sorted[0]
      let leaderId = result[leaderIdx].listingId
      result[leaderIdx].inventoryGroupId = groupId
      result[leaderIdx].isGroupLeader = true
      result[leaderIdx].groupLeaderId = leaderId
      result[leaderIdx].groupSize = count
      let leaderStrategy = result[leaderIdx].pricingStrategyType
      let leaderMin = result[leaderIdx].minPrice
      let leaderMax = result[leaderIdx].maxPrice
      for idx in sorted.dropFirst() {
        result[idx].inventoryGroupId = groupId
        result[idx].isGroupLeader = false
        result[idx].groupLeaderId = leaderId
        result[idx].groupSize = count
        result[idx].pricingStrategyType = leaderStrategy
        result[idx].minPrice = leaderMin
        result[idx].maxPrice = leaderMax
      }
    }
    return result
  }

  /// For groups: save/apply to the leader so one setting per product+size. For single listings, returns listingId.
  func effectiveLeaderId(for listingId: String) -> String {
    let norm = Self.normalizeListingId(listingId)
    guard let listing = listings.first(where: { Self.normalizeListingId($0.listingId) == norm }) else { return listingId }
    if let leader = listing.groupLeaderId, !leader.isEmpty { return leader }
    return listingId
  }

  /// Save pricing rule and min/max for a listing (or group leader). Updates local state for leader and all synced listings in the group.
  func saveSettings(listingId: String, productId: String?, variantId: String?, strategyType: String, minPrice: Double?, maxPrice: Double?) async throws {
    guard let token = try? await getIDToken(true), !token.isEmpty else {
      throw NSError(domain: "FlipFlowNative.Repricing", code: 401, userInfo: [NSLocalizedDescriptionKey: "Not signed in"])
    }
    let leaderId = effectiveLeaderId(for: listingId)
    guard let leader = listings.first(where: { Self.normalizeListingId($0.listingId) == Self.normalizeListingId(leaderId) }) else { return }
    try await repo.savePricingSetting(idToken: token, listingId: leaderId, productId: leader.productId, variantId: leader.variantId, strategyType: strategyType, minPrice: minPrice, maxPrice: maxPrice)
    let groupId = leader.inventoryGroupId
    var arr = listings
    for i in arr.indices {
      let isInGroup = groupId != nil && arr[i].inventoryGroupId == groupId
      let isLeader = Self.normalizeListingId(arr[i].listingId) == Self.normalizeListingId(leaderId)
      if isLeader || (isInGroup && arr[i].groupLeaderId == leaderId) {
        arr[i].pricingStrategyType = strategyType
        arr[i].minPrice = minPrice
        arr[i].maxPrice = maxPrice
      }
    }
    listings = arr
  }

  /// Apply same rule and min/max to multiple listings (by unique group leaders); updates local state for each group.
  func applyRuleToListings(listingIds: [String], strategyType: String, minPrice: Double?, maxPrice: Double?) async throws {
    let norm = Self.normalizeListingId
    var leaderIdsSeen = Set<String>()
    for id in listingIds {
      let leaderId = effectiveLeaderId(for: id)
      let key = norm(leaderId)
      if leaderIdsSeen.contains(key) { continue }
      leaderIdsSeen.insert(key)
      guard let listing = listings.first(where: { norm($0.listingId) == key }) else { continue }
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
