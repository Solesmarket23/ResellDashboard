import Foundation

@MainActor
final class ReceivingViewModel: ObservableObject {
  private let processedLogKey = "flipflow_processed_log_v1"
  private let showItemBannerKey = "flipflow_show_item_banner_v1"
  private let syncEnabledKey = "flipflow_sync_enabled_v1"
  private let trialModeEnabledKey = "flipflow_trial_mode_v1"
  private let hideAssignSlotShortcutKey = "flipflow_hide_assign_slot_shortcut_v1"
  private let localSkuMapKey = "flipflow_local_sku_map_v1"
  private let maxProcessedEntries = 200

  enum FlowStep: Int, CaseIterable, Identifiable {
    case tracking = 1
    case stockx = 2
    case auth = 3
    case result = 4

    var id: Int { rawValue }

    var title: String {
      switch self {
      case .tracking: return "Tracking"
      case .stockx: return "StockX Tag"
      case .auth: return "Verify QR"
      case .result: return "Result"
      }
    }
  }

  @Published var flowStep: FlowStep = .tracking
  @Published private(set) var processedLog: [ProcessedLogEntry] = []
  @Published var showItemBanner: Bool = true {
    didSet {
      UserDefaults.standard.set(showItemBanner, forKey: showItemBannerKey)
    }
  }
  @Published var syncEnabled: Bool = false {
    didSet {
      UserDefaults.standard.set(syncEnabled, forKey: syncEnabledKey)
    }
  }
  /// When true, receiving/verification writes are skipped (local log only). Toggle off to save to Firebase.
  @Published var trialModeEnabled: Bool = true {
    didSet {
      UserDefaults.standard.set(trialModeEnabled, forKey: trialModeEnabledKey)
    }
  }
  /// When true, the "Assign slot & finish" shortcut in Step 1 is hidden so you always go through Steps 2–4.
  @Published var hideAssignSlotShortcut: Bool = true {
    didSet {
      UserDefaults.standard.set(hideAssignSlotShortcut, forKey: hideAssignSlotShortcutKey)
    }
  }

  @Published var trackingInput: String = ""
  @Published var lookupState: LookupState = .idle
  @Published var lookupError: String = ""
  @Published var matches: [PurchaseMatch] = []
  @Published var selected: PurchaseMatch?

  /// After "Assign to next slot" succeeds, we store the location here so Print SKU label can use it
  /// immediately (before refresh returns). Prefers selected.pickLocation when present.
  @Published var pendingPickLocationByPurchaseId: [String: String] = [:]

  @Published var receivedNotes: String = ""
  @Published var alsoMarkDelivered: Bool = true
  @Published private(set) var trackingEntryMethod: String = "manual" // "manual" | "scan"

  @Published var scanMode: ScanMode = .tracking

  @Published var authSelfStatus: AuthStatus = .unknown
  @Published var authSelfNotes: String = ""

  @Published var externalProvider: String = "Other"
  @Published var externalUrl: String = ""
  @Published var externalStatus: AuthStatus = .unknown

  /// Some items don't have an authenticity/verify QR. This allows a legit "skip" path
  /// without stamping "(testing)" values or blocking saving.
  @Published var verifyQrSkipped: Bool = false
  @Published var verifyQrSkipReason: String = ""

  private var previousExternalProvider: String?
  private var previousExternalUrl: String?
  private var previousExternalStatus: AuthStatus?

  @Published var stockxUnitQrRaw: String = ""

  @Published var banner: String?
  @Published var authBrowserUrl: URL?

  /// When set, this tracking was already processed (local log) or already received (server). User can continue or cancel.
  @Published var duplicateTrackingWarning: DuplicateTrackingWarning?

  enum LookupState: Equatable {
    case idle
    case loading
    case found
    case notFound
    case error
  }

  enum DuplicateTrackingWarning: Equatable {
    case alreadyProcessedLocally(when: String)
    case alreadyReceivedOnServer

    var message: String {
      switch self {
      case .alreadyProcessedLocally(let when):
        return "This tracking was already processed on this device on \(when). Continue anyway?"
      case .alreadyReceivedOnServer:
        return "This item was already marked received. Continue anyway?"
      }
    }
  }

  private let repo: PurchaseRepositoryProtocol
  private let userIdProvider: () -> String?

  init(repo: PurchaseRepositoryProtocol, userIdProvider: @escaping () -> String?) {
    self.repo = repo
    self.userIdProvider = userIdProvider
    self.processedLog = Self.loadProcessedLog(key: processedLogKey)
    self.showItemBanner = UserDefaults.standard.object(forKey: showItemBannerKey) as? Bool ?? true
    self.syncEnabled = UserDefaults.standard.object(forKey: syncEnabledKey) as? Bool ?? false
    self.trialModeEnabled = UserDefaults.standard.object(forKey: trialModeEnabledKey) as? Bool ?? true
    self.hideAssignSlotShortcut = UserDefaults.standard.object(forKey: hideAssignSlotShortcutKey) as? Bool ?? true

    // If the app was interrupted mid-save, entries can remain stuck on "Saving…".
    // Also, older log entries created before we tracked sync state will decode as `.pending`.
    // Treat stale pending entries as failed so the user gets a clear "Not saved" + Retry path.
    self.processedLog = Self.normalizeProcessedLogOnLoad(self.processedLog)
  }

  private static func normalizeProcessedLogOnLoad(_ entries: [ProcessedLogEntry]) -> [ProcessedLogEntry] {
    let now = Date()
    return entries.map { entry in
      guard entry.syncState == .pending else { return entry }
      let age = now.timeIntervalSince(entry.processedAt)
      // If it's been more than 30s, assume it didn't complete.
      guard age > 30 else { return entry }
      var copy = entry
      copy.syncState = .failed
      copy.syncError = copy.syncError ?? "Sync interrupted. Tap Retry to post to solesmarket.com."
      return copy
    }
  }

  func normalizeTracking(_ raw: String) -> String {
    TrackingDetection.normalize(raw)
  }

  func lookup() async {
    let tracking = normalizeTracking(trackingInput)
    trackingInput = tracking
    guard !tracking.isEmpty else { return }
    guard TrackingDetection.validateSupported(tracking) != nil else {
      lookupState = .error
      lookupError = "Only UPS (1Z...) and FedEx (12–15 digits) tracking numbers are supported right now."
      return
    }
    guard let userId = userIdProvider() else {
      lookupState = .error
      lookupError = "Not signed in."
      return
    }

    lookupState = .loading
    lookupError = ""
    duplicateTrackingWarning = nil
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
      // Auto-advance the flow once an item is found.
      flowStep = .stockx

      // Duplicate check: already in processed log (this device) or already received (server).
      if let existing = processedLog.first(where: { normalizeTracking($0.trackingNumber ?? "") == tracking }) {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        let when = formatter.string(from: existing.processedAt)
        duplicateTrackingWarning = .alreadyProcessedLocally(when: when)
        return
      }
      if selected?.received == true {
        duplicateTrackingWarning = .alreadyReceivedOnServer
      }
    } catch {
      lookupState = .error
      lookupError = (error as NSError).localizedDescription
    }
  }

  func dismissDuplicateTrackingWarning() {
    duplicateTrackingWarning = nil
  }

  /// Clear current selection and tracking so user can scan again (used when they choose Cancel on duplicate warning).
  func clearSelectionAndTrackingAfterDuplicateCancel() {
    duplicateTrackingWarning = nil
    trackingInput = ""
    lookupState = .idle
    lookupError = ""
    matches = []
    selected = nil
    flowStep = .tracking
  }

  /// Re-fetch matches by current tracking and restore selection (e.g. after assigning pick location so UI shows updated pickLocation).
  func refreshCurrentSelection() async {
    let currentId = selected?.id
    let tracking = trackingInput.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !tracking.isEmpty, let userId = userIdProvider() else { return }
    do {
      let found = try await repo.findPurchasesByTracking(trackingNumber: tracking, userId: userId)
      matches = found
      if let id = currentId, let match = found.first(where: { $0.id == id }) {
        selected = match
        // Clear pending now that we have server state (so we don't show stale pending)
        if match.pickLocation != nil, !(match.pickLocation?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) {
          pendingPickLocationByPurchaseId.removeValue(forKey: id)
        }
      } else {
        selected = found.first
      }
    } catch {
      // Keep current state on refresh failure
    }
  }

  /// Call after "Assign to next slot" succeeds so Print SKU label uses the new slot even before refresh.
  func setPendingPickLocation(purchaseId: String, location: String) {
    let loc = location.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !loc.isEmpty else { return }
    pendingPickLocationByPurchaseId[purchaseId] = loc
  }

  /// Prefer selected.pickLocation; if nil, use pending from last assign (fixes timing so Print uses new slot).
  func effectivePickLocationForSelected() -> String? {
    guard let sel = selected else { return nil }
    if let loc = sel.pickLocation, !loc.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return loc.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    let pending = pendingPickLocationByPurchaseId[sel.id]?.trimmingCharacters(in: .whitespacesAndNewlines)
    return (pending?.isEmpty == false) ? pending : nil
  }

  func applyScanPayload(_ raw: String) {
    let payload = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !payload.isEmpty else { return }

    switch scanMode {
    case .tracking:
      // Extract UPS/FedEx tracking numbers only; ignore anything else.
      guard let extracted = TrackingDetection.extractSupported(from: payload) else {
        // If this scan is clearly USPS, ignore silently and keep scanning for a FedEx/UPS barcode.
        // Many labels include a USPS barcode in addition to the real UPS/FedEx tracking.
        if TrackingDetection.looksLikeUspsComposite(TrackingDetection.normalize(payload)) {
          return
        }
        if let candidate = TrackingDetection.extractTrackingLike(from: payload) {
          let normalized = TrackingDetection.normalize(candidate)
          let reason: String = {
            if normalized.hasPrefix("1Z") { return "Not a complete UPS tracking number yet." }
            if normalized.range(of: #"^[0-9]+$"#, options: .regularExpression) != nil {
              if normalized.count == 12, normalized.hasPrefix("9") { return "Looks like USPS (FedEx 12-digit rarely starts with 9)." }
              if normalized.count < 12 || normalized.count > 15 { return "Not 12–15 digits." }
              return "Not recognized as UPS/FedEx by current rules."
            }
            return "Not recognized as UPS/FedEx by current rules."
          }()
          banner = "Scanned: \(shortPayload(payload))\nFound: \(normalized)\n\(reason)"
        } else {
          // No candidate at all; show minimal feedback.
          banner = "Scanned: \(shortPayload(payload))\nNo UPS/FedEx tracking number found."
        }
        return
      }
      trackingEntryMethod = "scan"
      trackingInput = extracted.tracking
      Task { await lookup() }

    case .authQr:
      externalUrl = payload
      externalProvider = detectExternalProvider(from: payload) ?? "Other"
      // If the QR is a URL, open it. If it's not (some auth tags are just codes),
      // open a browser anyway via a search so the flow is still 1-tap.
      authBrowserUrl = validHttpUrl(from: payload) ?? googleSearchUrl(for: payload)
      // Avoid showing an alert that can block the Safari sheet presentation.
      banner = nil
      // We'll mark step 3 done once Safari returns, but we can advance intent now.
      flowStep = .auth

    case .stockxQr:
      stockxUnitQrRaw = payload
      banner = "Captured StockX QR:\n\(shortPayload(payload))"
      flowStep = .auth
    }
  }

  // MARK: - Step completion (soft gating)

  var isStep1Complete: Bool { selected != nil && lookupState == .found }
  var isStep2Complete: Bool { !stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  var isStep3Complete: Bool { verifyQrSkipped || !externalUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  var isStep4Complete: Bool { verifyQrSkipped || externalStatus != .unknown }

  func onAuthSafariDismissed() {
    // After returning from the web verifier, move the user to marking the result.
    flowStep = .result
  }

  /// For testing: mark step 2 and 3 complete and go to Result so you can use Assign to next slot etc. without scanning StockX or Verify QR.
  func skipSteps2And3ForTesting() {
    stockxUnitQrRaw = "(testing)"
    externalUrl = "https://testing"
    externalStatus = .pass
    verifyQrSkipped = false
    verifyQrSkipReason = ""
    flowStep = .result
  }

  /// Legit skip: Some items have no verify QR available on the tag/packaging.
  /// This should NOT mark the entry as "(testing)" and should still allow saving (when sync is enabled and trial mode is off).
  func skipVerifyQrNoCode() {
    if !verifyQrSkipped {
      previousExternalProvider = externalProvider
      previousExternalUrl = externalUrl
      previousExternalStatus = externalStatus
    }
    verifyQrSkipped = true
    verifyQrSkipReason = "No verify QR available"
    externalProvider = "No QR code"
    // Persist a clear marker so web/debugging can explain why external verification is missing.
    externalUrl = "SKIPPED_NO_QR"
    externalStatus = .unknown
    flowStep = .result
  }

  func undoVerifyQrSkip() {
    verifyQrSkipped = false
    verifyQrSkipReason = ""

    externalProvider = previousExternalProvider ?? "Other"
    externalUrl = previousExternalUrl ?? ""
    externalStatus = previousExternalStatus ?? .unknown

    previousExternalProvider = nil
    previousExternalUrl = nil
    previousExternalStatus = nil
  }

  func resetFlowForNextItem() {
    trackingInput = ""
    lookupState = .idle
    lookupError = ""
    duplicateTrackingWarning = nil
    matches = []
    selected = nil
    pendingPickLocationByPurchaseId = [:]
    trackingEntryMethod = "manual"

    authSelfStatus = .unknown
    authSelfNotes = ""
    externalProvider = "Other"
    externalUrl = ""
    externalStatus = .unknown
    verifyQrSkipped = false
    verifyQrSkipReason = ""
    stockxUnitQrRaw = ""

    banner = nil
    authBrowserUrl = nil
    flowStep = .tracking
  }

  // MARK: - Processed log (local trial log)

  func completeCurrentItemAndStartNext() async -> Bool {
    guard let selected else {
      banner = "No item selected."
      return false
    }
    // If we had a draft for this item, remove it so we only have one entry per completion.
    processedLog.removeAll { $0.purchaseId == selected.id && $0.syncState == .draft }
    persistProcessedLog()

    // Guided gating: always tell the user the *next missing step*.
    if !isStep1Complete {
      banner = "Action required: Scan tracking (Step 1) first."
      return false
    }
    if !isStep2Complete {
      banner = "Action required: Scan the StockX tag (Step 2) next."
      return false
    }
    if !isStep3Complete {
      banner = "Action required: Scan Verify QR (Step 3) next."
      return false
    }
    // If the user skipped verify QR (legit), do NOT auto-mark as pass.
    if !isStep4Complete && !verifyQrSkipped {
      externalStatus = .pass
    }

    // Prevent "it looked like it worked" when nothing will persist.
    // Users expect Finish to save to the web dashboard.
    if trialModeEnabled {
      banner = "Trial mode is ON. Turn it off in the menu to save to solesmarket.com."
      return false
    }
    if !syncEnabled {
      banner = "Web sync is OFF. Enable it in the menu to save to solesmarket.com."
      return false
    }

    let entry = ProcessedLogEntry(
      processedAt: Date(),
      purchase: selected,
      stockxUnitQrRaw: stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines),
      authProvider: externalProvider.trimmingCharacters(in: .whitespacesAndNewlines),
      authUrl: externalUrl.trimmingCharacters(in: .whitespacesAndNewlines),
      authResult: externalStatus,
      scannedTrackingNumber: normalizeTracking(trackingInput)
    )
    appendProcessedLog(entry)

    guard let userId = userIdProvider() else {
      banner = "Not signed in. Can't sync."
      return false
    }
    do {
      // 0) Tracking source-of-truth:
      // If the scanned tracking differs from what the web parser saved, overwrite it.
      let scanned = normalizeTracking(trackingInput)
      let existing = normalizeTracking(selected.trackingNumber ?? "")
      if !scanned.isEmpty, scanned != existing {
        let carrier: String? = {
          switch TrackingDetection.validateSupported(scanned) {
          case .ups?: return "UPS"
          case .fedex?: return "FedEx"
          case nil: return nil
          }
        }()
        try await repo.updateTracking(purchaseId: selected.id, userId: userId, trackingNumber: scanned, carrier: carrier)
      }

      // 1) Save verification fields
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

      // 2) Mark received (NOT delivered) after all steps are complete
      try await repo.markReceived(
        purchaseId: selected.id,
        userId: userId,
        receivedMethod: trackingEntryMethod,
        receivedNotes: nil,
        alsoMarkDelivered: false
      )
      updateProcessedLogEntry(id: entry.id) { e in
        e.syncState = .synced
        e.syncError = nil
      }
    } catch {
      let msg = (error as NSError).localizedDescription
      updateProcessedLogEntry(id: entry.id) { e in
        e.syncState = .failed
        e.syncError = msg
      }
      banner = "Sync failed: \(msg)"
      return false
    }

    resetFlowForNextItem()
    banner = "Marked as received."
    return true
  }

  /// Save current item as a draft (local log only). Appears in Processed section; user can Post or Clear.
  func saveDraft() {
    guard let selected else {
      banner = "No item selected."
      return
    }
    guard isStep1Complete else {
      banner = "Scan tracking (Step 1) first, then you can save a draft."
      return
    }
    let entry = ProcessedLogEntry(
      processedAt: Date(),
      purchase: selected,
      stockxUnitQrRaw: stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines),
      authProvider: externalProvider.trimmingCharacters(in: .whitespacesAndNewlines),
      authUrl: externalUrl.trimmingCharacters(in: .whitespacesAndNewlines),
      authResult: externalStatus,
      scannedTrackingNumber: normalizeTracking(trackingInput),
      asDraft: true
    )
    appendProcessedLog(entry)
    banner = "Draft saved. Post or clear it in the Processed list below."
  }

  func deleteProcessedLogEntry(id: String) {
    processedLog.removeAll(where: { $0.id == id })
    persistProcessedLog()
  }

  func clearProcessedLog() {
    processedLog = []
    persistProcessedLog()
  }

  private func appendProcessedLog(_ entry: ProcessedLogEntry) {
    processedLog.removeAll(where: { $0.id == entry.id })
    processedLog.insert(entry, at: 0)
    if processedLog.count > maxProcessedEntries {
      processedLog = Array(processedLog.prefix(maxProcessedEntries))
    }
    persistProcessedLog()
  }

  private func updateProcessedLogEntry(id: String, mutate: (inout ProcessedLogEntry) -> Void) {
    guard let idx = processedLog.firstIndex(where: { $0.id == id }) else { return }
    var copy = processedLog[idx]
    mutate(&copy)
    processedLog[idx] = copy
    persistProcessedLog()
  }

  func retrySyncProcessedLogEntry(id: String) async {
    guard let entry = processedLog.first(where: { $0.id == id }) else { return }
    guard !trialModeEnabled else {
      banner = "Trial mode is ON. Turn it off in the menu to save to solesmarket.com."
      return
    }
    guard syncEnabled else {
      banner = "Web sync is OFF. Enable it in the menu to save to solesmarket.com."
      return
    }
    guard let userId = userIdProvider() else {
      banner = "Not signed in. Can't sync."
      return
    }

    updateProcessedLogEntry(id: id) { e in
      e.syncState = .pending
      e.syncError = nil
    }

    do {
      let scanned = normalizeTracking(entry.scannedTrackingNumber ?? entry.trackingNumber ?? "")
      if !scanned.isEmpty {
        let carrier: String? = {
          switch TrackingDetection.validateSupported(scanned) {
          case .ups?: return "UPS"
          case .fedex?: return "FedEx"
          case nil: return nil
          }
        }()
        try await repo.updateTracking(purchaseId: entry.purchaseId, userId: userId, trackingNumber: scanned, carrier: carrier)
      }
      try await repo.saveVerification(
        purchaseId: entry.purchaseId,
        userId: userId,
        authSelfStatus: .unknown,
        authSelfNotes: "",
        externalProvider: entry.authProvider ?? "Other",
        externalUrl: entry.authUrl ?? "",
        externalStatus: entry.authResult,
        stockxUnitQrRaw: entry.stockxUnitQrRaw ?? ""
      )
      try await repo.markReceived(
        purchaseId: entry.purchaseId,
        userId: userId,
        receivedMethod: "retry",
        receivedNotes: nil,
        alsoMarkDelivered: false
      )

      updateProcessedLogEntry(id: id) { e in
        e.syncState = .synced
        e.syncError = nil
      }
      banner = "Saved to solesmarket.com."
    } catch {
      let msg = (error as NSError).localizedDescription
      updateProcessedLogEntry(id: id) { e in
        e.syncState = .failed
        e.syncError = msg
      }
      banner = "Sync failed: \(msg)"
    }
  }

  private func persistProcessedLog() {
    do {
      let data = try JSONEncoder().encode(processedLog)
      UserDefaults.standard.set(data, forKey: processedLogKey)
    } catch {
      // Ignore persistence errors in trial mode.
    }
  }

  private static func loadProcessedLog(key: String) -> [ProcessedLogEntry] {
    guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
    do {
      return try JSONDecoder().decode([ProcessedLogEntry].self, from: data)
    } catch {
      return []
    }
  }

  private func shortPayload(_ s: String) -> String {
    let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count <= 36 { return trimmed }
    let prefix = trimmed.prefix(16)
    let suffix = trimmed.suffix(10)
    return "\(prefix)…\(suffix)"
  }

  private func validHttpUrl(from s: String) -> URL? {
    let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed) else { return nil }
    let scheme = (url.scheme ?? "").lowercased()
    guard scheme == "https" || scheme == "http" else { return nil }
    return url
  }

  private func googleSearchUrl(for s: String) -> URL? {
    let q = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !q.isEmpty else { return nil }
    var comps = URLComponents()
    comps.scheme = "https"
    comps.host = "www.google.com"
    comps.path = "/search"
    comps.queryItems = [URLQueryItem(name: "q", value: q)]
    return comps.url
  }

  private func detectExternalProvider(from payload: String) -> String? {
    // Best-effort provider detection by URL host / payload string.
    // Keep it flexible: we only use this to label the flow for the user.
    let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    if let url = URL(string: trimmed),
       let host = url.host?.lowercased() {
      if host.contains("certilogo") { return "Certilogo" }
      if host.contains("denimtears") || host.contains("denim-tears") { return "DenimTears" }
      if host.contains("sertalogo") { return "SertaLogo" }
      return "Other"
    }

    let lower = trimmed.lowercased()
    if lower.contains("certilogo") { return "Certilogo" }
    if lower.contains("denimtears") || lower.contains("denim tears") { return "DenimTears" }
    if lower.contains("sertalogo") { return "SertaLogo" }
    return nil
  }

  func noteManualTrackingInput() {
    trackingEntryMethod = "manual"
  }

  func markReceived(method: String) async {
    guard !trialModeEnabled else { banner = "Trial Mode is ON. Not saving anything yet."; return }
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
    guard !trialModeEnabled else { banner = "Trial Mode is ON. Not saving anything yet."; return }
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

  func assignSku() async throws -> String {
    guard let userId = userIdProvider() else {
      throw NSError(domain: "FlipFlowNative.SKU", code: 2, userInfo: [NSLocalizedDescriptionKey: "Not signed in."])
    }
    guard let selected else {
      throw NSError(domain: "FlipFlowNative.SKU", code: 3, userInfo: [NSLocalizedDescriptionKey: "No item selected."])
    }

    // If we already have a persisted SKU, just reuse it (works for both Firestore + API sessions).
    if let existing = selected.sku, !existing.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return existing
    }

    if syncEnabled {
      return try await repo.assignSku(purchaseId: selected.id, userId: userId)
    }

    // Trial/test path: generate and persist a local-only SKU mapping so printing can be tested
    // without writing to Firebase yet.
    return assignLocalSku(purchaseId: selected.id)
  }

  private func assignLocalSku(purchaseId: String) -> String {
    var map = loadLocalSkuMap()
    if let existing = map[purchaseId], !existing.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return existing
    }

    // Random, human-friendly SKU code for local testing.
    let code = SkuCode.generate(length: 7)
    map[purchaseId] = code
    persistLocalSkuMap(map)
    return code
  }

  private func loadLocalSkuMap() -> [String: String] {
    guard let data = UserDefaults.standard.data(forKey: localSkuMapKey) else { return [:] }
    do {
      return try JSONDecoder().decode([String: String].self, from: data)
    } catch {
      return [:]
    }
  }

  private func persistLocalSkuMap(_ map: [String: String]) {
    do {
      let data = try JSONEncoder().encode(map)
      UserDefaults.standard.set(data, forKey: localSkuMapKey)
    } catch {
      // Ignore in trial mode.
    }
  }

  func saveVerification() async {
    guard !trialModeEnabled else { banner = "Trial Mode is ON. Not saving anything yet."; return }
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

