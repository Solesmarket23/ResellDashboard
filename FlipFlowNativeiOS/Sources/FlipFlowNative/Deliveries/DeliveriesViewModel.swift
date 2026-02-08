import Foundation
import SwiftUI
import UserNotifications

@MainActor
final class DeliveriesViewModel: ObservableObject {
  @Published var deliveries: [DeliveryItem] = []
  @Published var isLoading: Bool = false
  @Published var isHydrating: Bool = false
  @Published var banner: DeliveriesBannerState?
  @Published var lastSyncIso: String?

  @Published var searchText: String = ""
  @Published var statusFilter: DeliveryStatusFilter = .all
  @Published var carrierFilter: DeliveryCarrierFilter = .all
  @Published var includeArchived: Bool = false

  @Published var selectedStats: [DeliveryStatId] = DeliveryStatId.defaultSelection
  /// When set, the list shows only deliveries matching this stat (e.g. tap "Arriving Tomorrow" card).
  @Published var cardFilter: DeliveryStatId? = nil

  private let repo: DeliveriesRepositoryProtocol
  private let userIdProvider: () -> String
  private var didLoadOnce: Bool = false

  init(repo: DeliveriesRepositoryProtocol, userIdProvider: @escaping () -> String) {
    self.repo = repo
    self.userIdProvider = userIdProvider
    loadSelectedStats()
  }

  func loadInitialIfNeeded() {
    guard !didLoadOnce else { return }
    didLoadOnce = true
    Task { await refresh(twoPhase: true) }
  }

  func refresh(twoPhase: Bool = true) async {
    let userId = userIdProvider()
    if userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      showBanner("Please sign in to view Deliveries.", kind: .error)
      deliveries = []
      return
    }

    banner = nil

    // Phase 1: fast (no live tracking) for quick render
    if !twoPhase {
      isLoading = true
      defer { isLoading = false }
      do {
        let resp = try await repo.fetchDeliveries(userId: userId, includeLiveTracking: true, includeArchived: includeArchived)
        deliveries = resp.deliveries ?? []
        lastSyncIso = resp.lastSync
      } catch {
        if shouldIgnore(error) { return }
        showBanner((error as NSError).localizedDescription, kind: .error)
      }
      return
    }

    isLoading = true
    do {
      let lite = try await repo.fetchDeliveries(userId: userId, includeLiveTracking: false, includeArchived: includeArchived)
      deliveries = lite.deliveries ?? []
      lastSyncIso = lite.lastSync
      isLoading = false
    } catch {
      isLoading = false
      if shouldIgnore(error) { return }
      showBanner((error as NSError).localizedDescription, kind: .error)
      return
    }

    // Phase 2: hydrate live tracking in background
    isHydrating = true
    do {
      let full = try await repo.fetchDeliveries(userId: userId, includeLiveTracking: true, includeArchived: includeArchived)
      deliveries = full.deliveries ?? []
      lastSyncIso = full.lastSync
    } catch {
      // Don't clobber the lite list; just show an error banner.
      if !shouldIgnore(error) {
        showBanner((error as NSError).localizedDescription, kind: .error)
      }
    }
    isHydrating = false
  }

  func sendTestNotificationToast() {
    let items = filteredDeliveries
    let todayCount = items.filter { DeliveryStatusFilter.today.matches(item: $0) || DeliveryStatusFilter.outForDelivery.matches(item: $0) }.count

    let todayCost = items
      .filter { DeliveryStatusFilter.today.matches(item: $0) || DeliveryStatusFilter.outForDelivery.matches(item: $0) }
      .compactMap { $0.price }
      .reduce(0, +)

    // Profit isn't available in the deliveries sync payload today; show placeholder for now.
    let profitText = "—"
    let costText = todayCost > 0 ? MoneyFormat.usd(todayCost) : "—"
    showBanner("Test: \(todayCount) deliveries arriving today for \(profitText) profit (cost: \(costText)).", kind: .info)
  }

  /// Requests notification permission if needed, then schedules a local notification with how many packages are arriving tomorrow.
  func sendArrivingTomorrowNotification() {
    let count = filteredDeliveries.filter { DeliveryStatusFilter.tomorrow.matches(item: $0) }.count
    let body: String
    if count == 0 {
      body = "You have no packages arriving tomorrow."
    } else if count == 1 {
      body = "You have 1 package arriving tomorrow."
    } else {
      body = "You have \(count) packages arriving tomorrow."
    }

    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] granted, error in
      Task { @MainActor in
        if granted {
          let content = UNMutableNotificationContent()
          content.title = "Deliveries"
          content.body = body
          content.sound = .default
          let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 3, repeats: false)
          let request = UNNotificationRequest(identifier: "deliveries-arriving-tomorrow-\(UUID().uuidString)", content: content, trigger: trigger)
          center.add(request)
          self?.showBanner("Notification in 3 seconds.", kind: .info)
        } else {
          let message: String
          if let error = error?.localizedDescription, !error.isEmpty {
            message = "Notifications denied: \(error). Enable in Settings to get delivery reminders."
          } else {
            message = "Enable notifications in Settings to get delivery reminders."
          }
          self?.showBanner(message, kind: .info)
        }
      }
    }
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

  /// List to display: when cardFilter is set, only items matching that stat; otherwise same as filteredDeliveries. Stats are always from filteredDeliveries.
  var displayedDeliveries: [DeliveryItem] {
    guard let cf = cardFilter else { return filteredDeliveries }
    return filteredDeliveries.filter { itemMatches(stat: cf, item: $0) }
  }

  private func itemMatches(stat: DeliveryStatId, item: DeliveryItem) -> Bool {
    func status(_ raw: String) -> String {
      raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
    switch stat {
    case .total: return true
    case .delivered: return status(item.status) == "delivered"
    case .outForDelivery: return status(item.status) == "out_for_delivery" || status(item.status) == "out for delivery"
    case .inTransit:
      let s = status(item.status)
      return s == "in_transit" || s == "in transit" || s == "shipped"
    case .delayed: return status(item.status) == "delayed" || status(item.status) == "exception"
    case .arrivingToday: return DeliveryStatusFilter.today.matches(item: item) || DeliveryStatusFilter.outForDelivery.matches(item: item)
    case .arrivingTomorrow: return DeliveryStatusFilter.tomorrow.matches(item: item)
    case .arrivingThisWeek: return DeliveryStatusFilter.thisWeek.matches(item: item)
    }
  }

  var stats: [DeliveryStatId: Int] {
    let items = filteredDeliveries

    func status(_ raw: String) -> String {
      raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    let delivered = items.filter { status($0.status) == "delivered" }.count
    let outForDelivery = items.filter { status($0.status) == "out_for_delivery" || status($0.status) == "out for delivery" }.count
    let inTransit = items.filter {
      let s = status($0.status)
      return s == "in_transit" || s == "in transit" || s == "shipped"
    }.count
    let delayed = items.filter {
      let s = status($0.status)
      return s == "delayed" || s == "exception"
    }.count

    let arrivingToday = items.filter { DeliveryStatusFilter.today.matches(item: $0) || DeliveryStatusFilter.outForDelivery.matches(item: $0) }.count
    let arrivingTomorrow = items.filter { DeliveryStatusFilter.tomorrow.matches(item: $0) }.count
    let arrivingThisWeek = items.filter { DeliveryStatusFilter.thisWeek.matches(item: $0) }.count

    return [
      .total: items.count,
      .delivered: delivered,
      .arrivingToday: arrivingToday,
      .arrivingTomorrow: arrivingTomorrow,
      .arrivingThisWeek: arrivingThisWeek,
      .inTransit: inTransit,
      .outForDelivery: outForDelivery,
      .delayed: delayed,
    ]
  }

  // MARK: - Persistence

  private func statsStorageKey() -> String? {
    let uid = userIdProvider().trimmingCharacters(in: .whitespacesAndNewlines)
    if uid.isEmpty { return nil }
    return "flipflow_deliveries_selected_stats_\(uid)"
  }

  private func loadSelectedStats() {
    guard let key = statsStorageKey() else { return }
    guard let data = UserDefaults.standard.data(forKey: key) else { return }
    do {
      let raw = try JSONDecoder().decode([String].self, from: data)
      let parsed = raw.compactMap { DeliveryStatId(rawValue: $0) }
      if !parsed.isEmpty {
        selectedStats = Array(parsed.prefix(4))
      }
    } catch {
      // ignore
    }
  }

  func persistSelectedStats() {
    guard let key = statsStorageKey() else { return }
    let raw = selectedStats.map { $0.rawValue }
    if let data = try? JSONEncoder().encode(raw) {
      UserDefaults.standard.set(data, forKey: key)
    }
  }

  // MARK: - Banner

  private func showBanner(_ message: String, kind: DeliveriesBannerState.Kind) {
    let m = message.trimmingCharacters(in: .whitespacesAndNewlines)
    if m.isEmpty { return }
    banner = DeliveriesBannerState(kind: kind, message: m)
  }

  private func shouldIgnore(_ error: Error) -> Bool {
    if let urlError = error as? URLError, urlError.code == .cancelled { return true }
    let ns = error as NSError
    if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return true }
    return false
  }
}

struct DeliveriesBannerState: Identifiable, Equatable {
  enum Kind { case info, error }
  let id = UUID()
  let kind: Kind
  let message: String
}

enum MoneyFormat {
  static func usd(_ value: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.currencyCode = "USD"
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: value)) ?? "$\(Int(value))"
  }
}

enum DeliveryStatId: String, CaseIterable, Identifiable {
  case total
  case delivered
  case arrivingToday
  case arrivingTomorrow
  case arrivingThisWeek
  case inTransit
  case outForDelivery
  case delayed

  var id: String { rawValue }

  var title: String {
    switch self {
    case .total: return "Total"
    case .delivered: return "Delivered"
    case .arrivingToday: return "Arriving Today"
    case .arrivingTomorrow: return "Arriving Tomorrow"
    case .arrivingThisWeek: return "Arriving This Week"
    case .inTransit: return "In Transit"
    case .outForDelivery: return "Out for Delivery"
    case .delayed: return "Delayed"
    }
  }

  var systemImage: String {
    switch self {
    case .total: return "shippingbox"
    case .delivered: return "checkmark.circle.fill"
    case .arrivingToday: return "calendar"
    case .arrivingTomorrow: return "calendar.badge.clock"
    case .arrivingThisWeek: return "calendar.circle"
    case .inTransit: return "truck.box.fill"
    case .outForDelivery: return "location.fill"
    case .delayed: return "exclamationmark.triangle.fill"
    }
  }

  var tint: Color {
    switch self {
    case .total: return NeonTheme.accentCyan
    case .delivered: return NeonTheme.accentEmerald
    case .arrivingToday: return Color.red.opacity(0.95)
    case .arrivingTomorrow: return Color.yellow.opacity(0.95)
    case .arrivingThisWeek: return Color.purple.opacity(0.95)
    case .inTransit: return Color.orange.opacity(0.95)
    case .outForDelivery: return NeonTheme.accentCyan
    case .delayed: return Color.red.opacity(0.95)
    }
  }

  static let defaultSelection: [DeliveryStatId] = [.arrivingToday, .arrivingTomorrow, .arrivingThisWeek, .inTransit]
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

