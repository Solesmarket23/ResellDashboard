import Foundation
import FirebaseAuth

@MainActor
final class ReceivingViewModel: ObservableObject {
  @Published var trackingInput: String = ""
  @Published var lookupState: LookupState = .idle
  @Published var lookupError: String = ""
  @Published var matches: [PurchaseMatch] = []
  @Published var selected: PurchaseMatch?

  @Published var receivedNotes: String = ""
  @Published var alsoMarkDelivered: Bool = true
  @Published private(set) var trackingEntryMethod: String = "manual" // "manual" | "scan"

  @Published var scanMode: ScanMode = .tracking

  @Published var authSelfStatus: AuthStatus = .unknown
  @Published var authSelfNotes: String = ""

  @Published var externalProvider: String = "Other"
  @Published var externalUrl: String = ""
  @Published var externalStatus: AuthStatus = .unknown

  @Published var stockxUnitQrRaw: String = ""

  @Published var banner: String?

  enum LookupState: Equatable {
    case idle
    case loading
    case found
    case notFound
    case error
  }

  private let repo: PurchaseRepositoryProtocol
  private let userIdProvider: () -> String?

  init(repo: PurchaseRepositoryProtocol, userIdProvider: @escaping () -> String?) {
    self.repo = repo
    self.userIdProvider = userIdProvider
  }

  func normalizeTracking(_ raw: String) -> String {
    raw
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "[\\s\\-_]+", with: "", options: .regularExpression)
  }

  func lookup() async {
    let tracking = normalizeTracking(trackingInput)
    trackingInput = tracking
    guard !tracking.isEmpty else { return }
    guard let userId = userIdProvider() else {
      lookupState = .error
      lookupError = "Not signed in."
      return
    }

    lookupState = .loading
    lookupError = ""
    matches = []
    selected = nil

    do {
      let found = try await repo.findPurchasesByTracking(trackingNumber: tracking, userId: userId)
      if found.isEmpty {
        lookupState = .notFound
        lookupError = "No purchase found for this tracking number."
        return
      }
      matches = found
      selected = found.first
      lookupState = .found
    } catch {
      lookupState = .error
      lookupError = (error as NSError).localizedDescription
    }
  }

  func applyScanPayload(_ raw: String) {
    let payload = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !payload.isEmpty else { return }

    switch scanMode {
    case .tracking:
      if payload.lowercased().hasPrefix("http://") || payload.lowercased().hasPrefix("https://") {
        banner = "That looks like a URL. Switch to Auth QR or StockX QR."
        return
      }
      trackingEntryMethod = "scan"
      trackingInput = normalizeTracking(payload)
      Task { await lookup() }

    case .authQr:
      externalUrl = payload

    case .stockxQr:
      stockxUnitQrRaw = payload
    }
  }

  func noteManualTrackingInput() {
    trackingEntryMethod = "manual"
  }

  func markReceived(method: String) async {
    guard let userId = userIdProvider() else { banner = "Not signed in."; return }
    guard let selected else { banner = "No purchase selected."; return }

    do {
      try await repo.markReceived(
        purchaseId: selected.id,
        userId: userId,
        receivedMethod: method,
        receivedNotes: receivedNotes,
        alsoMarkDelivered: alsoMarkDelivered
      )
      banner = "Marked received."
      await lookup()
    } catch {
      banner = "Failed to mark received: \((error as NSError).localizedDescription)"
    }
  }

  func unmarkReceived() async {
    guard selected != nil else { return }
    do {
      guard let userId = userIdProvider() else { banner = "Not signed in."; return }
      try await repo.unmarkReceived(purchaseId: selected!.id, userId: userId)
      banner = "Undid received."
      await lookup()
    } catch {
      banner = "Failed to undo received: \((error as NSError).localizedDescription)"
    }
  }

  func saveVerification() async {
    guard let userId = userIdProvider() else { banner = "Not signed in."; return }
    guard let selected else { banner = "No purchase selected."; return }

    do {
      try await repo.saveVerification(
        purchaseId: selected.id,
        userId: userId,
        authSelfStatus: authSelfStatus,
        authSelfNotes: authSelfNotes.trimmingCharacters(in: .whitespacesAndNewlines),
        externalProvider: externalProvider,
        externalUrl: externalUrl,
        externalStatus: externalStatus,
        stockxUnitQrRaw: stockxUnitQrRaw
      )
      banner = "Saved verification info."
      await lookup()
    } catch {
      banner = "Failed to save: \((error as NSError).localizedDescription)"
    }
  }
}

