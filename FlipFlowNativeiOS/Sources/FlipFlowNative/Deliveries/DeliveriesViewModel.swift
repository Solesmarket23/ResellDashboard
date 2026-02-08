import Foundation

@MainActor
final class DeliveriesViewModel: ObservableObject {
  @Published var deliveries: [DeliveryItem] = []
  @Published var isLoading: Bool = false
  @Published var isHydrating: Bool = false
  @Published var errorMessage: String?
  @Published var lastSyncIso: String?

  @Published var searchText: String = ""
  @Published var statusFilter: DeliveryStatusFilter = .all
  @Published var carrierFilter: DeliveryCarrierFilter = .all
  @Published var includeArchived: Bool = false

  private let repo: DeliveriesRepositoryProtocol
  private let userIdProvider: () -> String
  private var didLoadOnce: Bool = false

  init(repo: DeliveriesRepositoryProtocol, userIdProvider: @escaping () -> String) {
    self.repo = repo
    self.userIdProvider = userIdProvider
  }

  func loadInitialIfNeeded() {
    guard !didLoadOnce else { return }
    didLoadOnce = true
    Task { await refresh(twoPhase: true) }
  }

  func refresh(twoPhase: Bool = true) async {
    let userId = userIdProvider()
    if userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      errorMessage = "Please sign in to view Deliveries."
      deliveries = []
      return
    }

    errorMessage = nil

    // Phase 1: fast (no live tracking) for quick render
    if !twoPhase {
      isLoading = true
      defer { isLoading = false }
      do {
        let resp = try await repo.fetchDeliveries(userId: userId, includeLiveTracking: true, includeArchived: includeArchived)
        deliveries = resp.deliveries
        lastSyncIso = resp.lastSync
      } catch {
        errorMessage = (error as NSError).localizedDescription
      }
      return
    }

    isLoading = true
    do {
      let lite = try await repo.fetchDeliveries(userId: userId, includeLiveTracking: false, includeArchived: includeArchived)
      deliveries = lite.deliveries
      lastSyncIso = lite.lastSync
      isLoading = false
    } catch {
      isLoading = false
      errorMessage = (error as NSError).localizedDescription
      return
    }

    // Phase 2: hydrate live tracking in background
    isHydrating = true
    do {
      let full = try await repo.fetchDeliveries(userId: userId, includeLiveTracking: true, includeArchived: includeArchived)
      deliveries = full.deliveries
      lastSyncIso = full.lastSync
    } catch {
      // Don't clobber the lite list; just show an error banner.
      errorMessage = (error as NSError).localizedDescription
    }
    isHydrating = false
  }

  var filteredDeliveries: [DeliveryItem] {
    let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

    return deliveries.filter { d in
      if includeArchived == false, let at = d.archivedAt, !at.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return false
      }

      if carrierFilter != .all {
        if d.carrier.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() != carrierFilter.rawValue {
          return false
        }
      }

      if statusFilter != .all {
        if !statusFilter.matches(item: d) { return false }
      }

      if q.isEmpty { return true }
      let hay = [
        d.productName,
        d.productBrand,
        d.productSize,
        d.trackingNumber,
        d.carrier,
        d.status,
      ].joined(separator: " ").lowercased()
      return hay.contains(q)
    }
  }
}

enum DeliveryCarrierFilter: String, CaseIterable, Identifiable {
  case all = "ALL"
  case ups = "UPS"
  case fedex = "FEDEX"
  case usps = "USPS"

  var id: String { rawValue }
  var label: String {
    switch self {
    case .all: return "All"
    case .ups: return "UPS"
    case .fedex: return "FedEx"
    case .usps: return "USPS"
    }
  }
}

enum DeliveryStatusFilter: String, CaseIterable, Identifiable {
  case all
  case today
  case tomorrow
  case thisWeek
  case delivered
  case shipped
  case inTransit
  case delayed
  case outForDelivery

  var id: String { rawValue }
  var label: String {
    switch self {
    case .all: return "All"
    case .today: return "Today"
    case .tomorrow: return "Tomorrow"
    case .thisWeek: return "This week"
    case .delivered: return "Delivered"
    case .shipped: return "Shipped"
    case .inTransit: return "In transit"
    case .delayed: return "Delayed"
    case .outForDelivery: return "Out for delivery"
    }
  }

  func matches(item: DeliveryItem) -> Bool {
    switch self {
    case .all:
      return true
    case .delivered:
      return item.status.lowercased() == "delivered"
    case .shipped:
      return item.status.lowercased() == "shipped"
    case .inTransit:
      return item.status.lowercased() == "in_transit" || item.status.lowercased() == "in transit"
    case .delayed:
      return item.status.lowercased() == "delayed" || item.status.lowercased() == "exception"
    case .outForDelivery:
      return item.status.lowercased() == "out_for_delivery" || item.status.lowercased() == "out for delivery"
    case .today, .tomorrow, .thisWeek:
      // Use estimatedDelivery first, then actualDelivery if delivered
      let dateStr = (item.estimatedDelivery?.isEmpty == false ? item.estimatedDelivery : item.actualDelivery) ?? ""
      guard let date = DateParsing.bestEffortDate(from: dateStr) else { return false }
      let cal = Calendar.current
      let startOfToday = cal.startOfDay(for: Date())
      let startOfDate = cal.startOfDay(for: date)
      let days = cal.dateComponents([.day], from: startOfToday, to: startOfDate).day ?? 999
      if self == .today { return days == 0 }
      if self == .tomorrow { return days == 1 }
      // thisWeek: within next 7 days (incl today)
      return days >= 0 && days < 7
    }
  }
}

enum DateParsing {
  static func bestEffortDate(from raw: String) -> Date? {
    let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.isEmpty { return nil }

    // Try ISO8601 first.
    if let d = iso.date(from: s) { return d }
    if let d = isoWithFractional.date(from: s) { return d }

    // Try "YYYY-MM-DD" (common in some APIs/UI)
    if let d = ymd.date(from: s) { return d }

    return nil
  }

  private static let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  private static let isoWithFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  private static let ymd: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(secondsFromGMT: 0)
    f.dateFormat = "yyyy-MM-dd"
    return f
  }()
}

