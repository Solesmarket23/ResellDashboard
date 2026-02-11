import SwiftUI
import FirebaseAuth
import SafariServices

struct ReceivingView: View {
  @EnvironmentObject private var auth: AuthViewModel

  var body: some View {
    switch auth.session {
    case .firebase(let uid):
      ReceivingHostView(repo: FirestorePurchaseRepository(), userId: uid)
    case .sitePassword(let uid):
      ReceivingHostView(repo: ApiPurchaseRepository(), userId: uid)
    case .signedOut:
      NeonScreen {
        VStack {
          Spacer()
          NeonCard {
            Text("Please sign in to use Receiving.")
              .foregroundStyle(.white)
          }
          .padding(.horizontal, 16)
          Spacer()
        }
      }
    }
  }
}

private struct ReceivingHostView: View {
  @StateObject private var vm: ReceivingViewModel

  init(repo: PurchaseRepositoryProtocol, userId: String) {
    _vm = StateObject(wrappedValue: ReceivingViewModel(repo: repo, userIdProvider: { userId }))
  }

  var body: some View {
    ReceivingScreen(vm: vm)
  }
}

private struct ReceivingScreen: View {
  @EnvironmentObject private var auth: AuthViewModel
  @ObservedObject var vm: ReceivingViewModel

  @State private var showScanner = false
  @State private var authSheetItem: IdentifiableURL?
  @State private var pendingAuthUrl: URL?
  @State private var expanded: Set<ReceivingViewModel.FlowStep> = [.tracking]
  @State private var bannerDismissWorkItem: DispatchWorkItem?
  @State private var isPrintingLabel: Bool = false
  @State private var showClearProcessedConfirm: Bool = false
  @State private var showAssignBinSheet: Bool = false
  @State private var assignBinLocation: String = ""
  @State private var isSavingBin: Bool = false
  @State private var assignBinBanner: String?
  @State private var isAssigningToNextSlot: Bool = false
  @State private var isPrintingTestLabel: Bool = false

  private func applyActiveStepHighlight<V: View>(_ view: V, isActive: Bool) -> some View {
    view
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(isActive ? NeonTheme.accentCyan.opacity(0.85) : Color.clear, lineWidth: 2)
          .shadow(color: isActive ? NeonTheme.accentCyan.opacity(0.18) : .clear, radius: 18, x: 0, y: 10)
          .allowsHitTesting(false)
      )
      .background(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .fill(isActive ? AnyShapeStyle(NeonTheme.primaryGradient.opacity(0.10)) : AnyShapeStyle(Color.clear))
      )
  }

  var body: some View {
    NeonScreen { screenContent }
      .overlay(alignment: .top) {
        if let message = vm.banner, !message.isEmpty {
          let isStockxQrToast = message.hasPrefix("Captured StockX QR") && !vm.stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          NeonToast(
            message: message,
            kind: toastKind(for: message),
            copyPayload: isStockxQrToast ? vm.stockxUnitQrRaw : nil,
            onDismiss: {
              bannerDismissWorkItem?.cancel()
              bannerDismissWorkItem = nil
              withAnimation(.easeInOut(duration: 0.18)) {
                vm.banner = nil
              }
            }
          )
          .padding(.top, 10)
          .padding(.horizontal, 14)
          .transition(.move(edge: .top).combined(with: .opacity))
          .onAppear {
            bannerDismissWorkItem?.cancel()
            guard !isStockxQrToast else { return }
            let work = DispatchWorkItem {
              Task { @MainActor in
                withAnimation(.easeInOut(duration: 0.18)) {
                  if vm.banner == message { vm.banner = nil }
                }
              }
            }
            bannerDismissWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.2, execute: work)
          }
        }
      }
      .animation(.easeInOut(duration: 0.18), value: vm.banner)
      .overlay {
        if showClearProcessedConfirm {
          NeonConfirmDialog(
            title: "Clear processed log?",
            message: "This will delete \(vm.processedLog.count) entr\(vm.processedLog.count == 1 ? "y" : "ies") from this device. It won’t change your web dashboard.",
            confirmTitle: "Clear",
            confirmStyle: .destructive,
            onCancel: { showClearProcessedConfirm = false },
            onConfirm: {
              showClearProcessedConfirm = false
              vm.clearProcessedLog()
              vm.banner = "Cleared local processed log."
            }
          )
          .transition(.opacity)
        }
      }
      .animation(.easeInOut(duration: 0.18), value: showClearProcessedConfirm)
      .sheet(item: $authSheetItem) { item in
        SafariSheet(url: item.url)
          .onDisappear {
            vm.authBrowserUrl = nil
            vm.onAuthSafariDismissed()
          }
      }
      .sheet(isPresented: $showScanner, onDismiss: {
        // SwiftUI can't reliably present another sheet while a sheet is being dismissed.
        // If a scan produced an auth URL, present Safari *after* the scanner sheet fully closes.
        let url = pendingAuthUrl ?? vm.authBrowserUrl
        pendingAuthUrl = nil
        guard let url else { return }
        authSheetItem = IdentifiableURL(url: url)
      }) {
        ScannerSheet(vm: vm, isPresented: $showScanner)
      }
      .onChange(of: vm.authBrowserUrl) { newValue in
        guard let url = newValue else { return }
        if showScanner {
          pendingAuthUrl = url
        } else {
          authSheetItem = IdentifiableURL(url: url)
        }
      }
      .sheet(isPresented: $showAssignBinSheet) {
        AssignBinSheet(
          location: $assignBinLocation,
          banner: $assignBinBanner,
          isSaving: $isSavingBin,
          purchaseId: vm.selected?.id,
          productName: vm.selected?.productName ?? "",
          onSave: {
            Task { await saveAssignBin() }
          },
          onDismiss: { showAssignBinSheet = false }
        )
        .environmentObject(auth)
      }
  }

  private func saveAssignBin() async {
    guard !vm.trialModeEnabled else {
      assignBinBanner = "Trial mode is ON. Turn it off in the menu to save slots."
      return
    }
    guard let purchaseId = vm.selected?.id, !purchaseId.isEmpty,
          !assignBinLocation.trimmingCharacters(in: .whitespaces).isEmpty,
          let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty
    else {
      assignBinBanner = "Select an item and enter a location."
      return
    }
    let baseURL = URL(string: "https://www.solesmarket.com")!
    guard let url = baseURL.appendingPathComponent("api/purchases/set-pick-location") as URL? else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONEncoder().encode(["purchaseId": purchaseId, "location": assignBinLocation.trimmingCharacters(in: .whitespaces)])
    isSavingBin = true
    assignBinBanner = nil
    defer { Task { @MainActor in isSavingBin = false } }
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse else {
        assignBinBanner = "Failed to save location."
        return
      }
      if (200 ..< 300).contains(http.statusCode) {
        let loc = assignBinLocation.trimmingCharacters(in: .whitespaces)
        vm.banner = "Assigned to \(loc). Ready to Ship will use this for matching sales."
        vm.setPendingPickLocation(purchaseId: purchaseId, location: loc)
        showAssignBinSheet = false
        await vm.refreshCurrentSelection()
        return
      }
      if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         let msg = json["error"] as? String, !msg.isEmpty {
        assignBinBanner = msg
      } else {
        assignBinBanner = "That slot may already be in use. Each slot is unique."
      }
    } catch {
      assignBinBanner = "Failed to save."
    }
  }

  /// One-tap auto-assign: fetch next available slot and set pick location without opening the sheet.
  private func assignToNextAvailableSlot() async {
    guard !vm.trialModeEnabled else {
      vm.banner = "Trial mode is ON. Turn it off in the menu to save slots to the cloud."
      return
    }
    guard let purchaseId = vm.selected?.id, !purchaseId.isEmpty,
          let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty
    else {
      vm.banner = "Select an item first and ensure you're signed in."
      return
    }
    isAssigningToNextSlot = true
    defer { Task { @MainActor in isAssigningToNextSlot = false } }
    let baseURL = URL(string: "https://www.solesmarket.com")!
    guard let nextURL = baseURL.appendingPathComponent("api/inventory/next-available-slot") as URL?,
          let setURL = baseURL.appendingPathComponent("api/purchases/set-pick-location") as URL?
    else {
      vm.banner = "Configuration error."
      return
    }
    var nextReq = URLRequest(url: nextURL)
    nextReq.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    nextReq.setValue("application/json", forHTTPHeaderField: "Accept")
    guard let (data, res) = try? await URLSession.shared.data(for: nextReq),
          let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode),
          let decoded = try? JSONDecoder().decode(NextAvailableSlotResponse.self, from: data),
          let location = decoded.location, !location.isEmpty
    else {
      vm.banner = "No slot available (bins may be full). Try \"Or choose a specific slot…\"."
      return
    }
    var setReq = URLRequest(url: setURL)
    setReq.httpMethod = "POST"
    setReq.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    setReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
    setReq.httpBody = try? JSONEncoder().encode(["purchaseId": purchaseId, "location": location])
    do {
      let (setData, setRes) = try await URLSession.shared.data(for: setReq)
      guard let setHttp = setRes as? HTTPURLResponse else {
        vm.banner = "Failed to assign location."
        return
      }
      if (200 ..< 300).contains(setHttp.statusCode) {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        vm.banner = "Assigned to \(location). Ready to Ship will use this for matching."
        vm.setPendingPickLocation(purchaseId: purchaseId, location: location)
        await vm.refreshCurrentSelection()
        return
      }
      if let json = try? JSONSerialization.jsonObject(with: setData) as? [String: Any],
         let msg = json["error"] as? String, !msg.isEmpty {
        vm.banner = msg
      } else {
        vm.banner = "That slot is already in use. Try \"Or choose a specific slot…\"."
      }
    } catch {
      vm.banner = "Failed to save location."
    }
  }

  private func toastKind(for message: String) -> NeonToast.Kind {
    let m = message.trimmingCharacters(in: .whitespacesAndNewlines)
    if m.hasPrefix("Sent to printer") { return .success }
    if m.hasPrefix("Print failed") || m.hasPrefix("Failed") || m.hasPrefix("Sync failed") { return .error }
    if m.hasPrefix("Preparing label") || m.hasPrefix("Opening print") || m.hasPrefix("Printing") { return .progress }
    return .info
  }

  @ViewBuilder
  private func duplicateTrackingWarningCard(_ warning: ReceivingViewModel.DuplicateTrackingWarning) -> some View {
    ZStack {
      Color.black.opacity(0.78)
        .ignoresSafeArea()
        .onTapGesture { }
      VStack(alignment: .leading, spacing: 14) {
        Text("Already processed")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Text(warning.message)
          .font(.subheadline)
          .foregroundStyle(Color.white.opacity(0.85))
        HStack(spacing: 12) {
          Button("Cancel") {
            vm.clearSelectionAndTrackingAfterDuplicateCancel()
          }
          .foregroundStyle(Color.white.opacity(0.7))
          Button("Continue anyway") {
            vm.dismissDuplicateTrackingWarning()
          }
          .fontWeight(.semibold)
          .foregroundStyle(NeonTheme.accentCyan)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(24)
      .background(Color(white: 0.14).opacity(0.98), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      .padding(.horizontal, 24)
    }
  }

  private var screenContent: some View {
    ScrollViewReader { proxy in
      ZStack(alignment: .topTrailing) {
        ScrollView {
          VStack(spacing: 14) {
            FlowHeader(vm: vm)
              .padding(.horizontal, 16)
              .padding(.top, 14)

            step1Tracking
              .id("step-1")
              .padding(.horizontal, 16)

            step2Stockx
              .id("step-2")
              .padding(.horizontal, 16)

            step3Auth
              .id("step-3")
              .padding(.horizontal, 16)

            step4Result
              .id("step-4")
              .padding(.horizontal, 16)
              .padding(.bottom, 24)

            processedLogSection
              .padding(.horizontal, 16)
              .padding(.bottom, 28)
          }
        }
        .background(Color.clear)
        .onChange(of: vm.flowStep) { step in
          expanded.insert(step)
          withAnimation(.easeInOut(duration: 0.22)) {
            proxy.scrollTo(scrollId(for: step), anchor: .top)
          }
        }
        .safeAreaInset(edge: .bottom) {
          if shouldShowItemBanner, let selected = vm.selected {
            CurrentItemBanner(
              imageUrl: selected.productImageUrl,
              name: selected.productName,
              size: selected.productSize,
              onHide: { vm.showItemBanner = false }
            )
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .padding(.bottom, 8)
          }
        }

        .overlay {
          if let warning = vm.duplicateTrackingWarning {
            duplicateTrackingWarningCard(warning)
          }
        }

        HStack(spacing: 10) {
          Menu {
            Button {
              vm.showItemBanner.toggle()
            } label: {
              Label(
                vm.showItemBanner ? "Hide item banner" : "Show item banner",
                systemImage: vm.showItemBanner ? "rectangle.bottomthird.inset.filled" : "rectangle.bottomthird.inset"
              )
            }

            Button {
              vm.syncEnabled.toggle()
            } label: {
              Label(
                vm.syncEnabled ? "Disable web sync (writes)" : "Enable web sync (writes)",
                systemImage: vm.syncEnabled ? "arrow.triangle.2.circlepath.circle.fill" : "arrow.triangle.2.circlepath.circle"
              )
            }
            Button {
              vm.trialModeEnabled.toggle()
            } label: {
              Label(
                vm.trialModeEnabled ? "Turn OFF trial mode (save to cloud)" : "Turn ON trial mode (no saves)",
                systemImage: vm.trialModeEnabled ? "cloud.slash" : "cloud.fill"
              )
            }
            Button {
              vm.hideAssignSlotShortcut.toggle()
            } label: {
              Label(
                vm.hideAssignSlotShortcut ? "Show \"Assign slot & finish\" shortcut" : "Hide \"Assign slot & finish\" shortcut",
                systemImage: vm.hideAssignSlotShortcut ? "arrow.down.circle" : "arrow.down.circle.fill"
              )
            }
            Button {
              Task { @MainActor in
                isPrintingTestLabel = true
                let pdf = LabelPrinting.makeLabelPDF(
                  sku: "TEST1",
                  productName: "Fear of God Essentials Fleece Essential Sweatpant Light Heather Gray",
                  productSize: "M",
                  styleId: nil,
                  productImage: nil,
                  isTest: true
                )
                LabelPrinting.presentPrintSheet(pdfData: pdf, jobName: "FlipFlow SKU TEST1") { _, _ in
                  Task { @MainActor in
                    isPrintingTestLabel = false
                  }
                }
              }
            } label: {
              Label(
                "Test print SKU label",
                systemImage: "printer"
              )
            }
            .disabled(isPrintingTestLabel)
          } label: {
            Image(systemName: "slider.horizontal.3")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white)
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          }

          Button("Sign out") { auth.signOut() }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.22), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .padding(.top, 10)
        .padding(.trailing, 12)
      }
    }
  }

  private var shouldShowItemBanner: Bool {
    // Show from Step 2 onward, and only if enabled + we have a selected item.
    vm.showItemBanner && vm.selected != nil && vm.flowStep != .tracking
  }

  private func scrollId(for step: ReceivingViewModel.FlowStep) -> String {
    switch step {
    case .tracking: return "step-1"
    case .stockx: return "step-2"
    case .auth: return "step-3"
    case .result: return "step-4"
    }
  }

  private var step1Tracking: some View {
    let isActive = (vm.flowStep == .tracking)
    let isExpanded = expanded.contains(.tracking)
    return applyActiveStepHighlight(NeonCard {
      VStack(alignment: .leading, spacing: isExpanded ? 12 : 6) {
        StepTitle(
          step: 1,
          title: "Tracking",
          isComplete: vm.isStep1Complete,
          isActive: isActive,
          isExpanded: isExpanded,
          onToggle: { toggle(step: .tracking) }
        )
        .contentShape(Rectangle())
        .onTapGesture { vm.flowStep = .tracking; expanded.insert(.tracking) }

        if isExpanded {
          HStack(spacing: 10) {
            TextField("Tracking number", text: $vm.trackingInput)
              .keyboardType(.numbersAndPunctuation)
              .textInputAutocapitalization(.characters)
              .autocorrectionDisabled()
              .onChange(of: vm.trackingInput) { _ in vm.noteManualTrackingInput() }
              .submitLabel(.search)
              .onSubmit { Task { await vm.lookup() } }
              .padding(.vertical, 12)
              .padding(.horizontal, 14)
              .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
              .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                  .stroke(NeonTheme.border, lineWidth: 1)
              )
              .foregroundStyle(.white)

            Button("Lookup") { Task { await vm.lookup() } }
              .disabled(vm.trackingInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.lookupState == .loading)
              .padding(.vertical, 12)
              .padding(.horizontal, 14)
              .background(NeonTheme.primaryGradient.opacity(0.95), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
              .foregroundStyle(.white)
          }

          Button {
            vm.scanMode = .tracking
            showScanner = true
          } label: {
            HStack {
              Image(systemName: "qrcode.viewfinder")
              Text("Scan tracking with camera")
                .fontWeight(.semibold)
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())
          .padding(.top, 2)

          Text("Tip: Bluetooth scanners work great. Tap the tracking field, scan, and if your scanner adds a “Return” at the end it’ll search automatically.")
            .font(.caption)
            .foregroundStyle(NeonTheme.textSecondary)

          if vm.lookupState == .loading {
            HStack(spacing: 10) {
              ProgressView()
                .tint(NeonTheme.accentCyan)
              Text("Searching…")
                .foregroundStyle(NeonTheme.textSecondary)
            }
          }

          if vm.lookupState == .notFound || vm.lookupState == .error {
            VStack(alignment: .leading, spacing: 6) {
              Text("Lookup issue")
                .font(.headline)
                .foregroundStyle(.white)
              Text(vm.lookupError.isEmpty ? "Lookup failed." : vm.lookupError)
                .font(.subheadline)
                .foregroundStyle(Color.red.opacity(0.95))
            }
          }

          if let selected = vm.selected {
            Divider().overlay(NeonTheme.border.opacity(0.45))

            HStack(alignment: .top, spacing: 12) {
              ProductThumb(urlString: selected.productImageUrl)

              VStack(alignment: .leading, spacing: 6) {
                Text(selected.productName ?? "Unknown item")
                  .font(.headline)
                  .foregroundStyle(.white)

                Text([
                  selected.productBrand,
                  selected.productSize.map { "Size \($0)" },
                  selected.priceDisplay.map { "Paid \($0)" },
                ].compactMap { $0 }.joined(separator: " • "))
                .font(.subheadline)
                .foregroundStyle(NeonTheme.textSecondary)

                Text([
                  selected.trackingNumber,
                  selected.carrier,
                  selected.shippingStatus,
                ].compactMap { $0 }.joined(separator: " • "))
                .font(.caption)
                .foregroundStyle(NeonTheme.textSecondary)
              }
            }

            if vm.matches.count > 1 {
              Picker("Multiple matches", selection: Binding(
                get: { vm.selected?.id ?? "" },
                set: { newId in
                  vm.selected = vm.matches.first(where: { $0.id == newId })
                  vm.flowStep = .stockx
                }
              )) {
                ForEach(vm.matches) { m in
                  Text(m.productName ?? m.id).tag(m.id)
                }
              }
            }

            if !vm.hideAssignSlotShortcut, vm.isStep1Complete && (!vm.isStep2Complete || !vm.isStep3Complete) {
              Button {
                vm.skipSteps2And3ForTesting()
                expanded.insert(.result)
                vm.flowStep = .result
              } label: {
                HStack {
                  Image(systemName: "arrow.down.circle.fill")
                  Text("Assign slot & finish")
                    .fontWeight(.semibold)
                }
                .foregroundStyle(.white)
              }
              .buttonStyle(NeonPrimaryButtonStyle())
              .padding(.top, 10)
            }
          }
        } else {
          if let selected = vm.selected {
            HStack(alignment: .top, spacing: 12) {
              ProductThumb(urlString: selected.productImageUrl)
              VStack(alignment: .leading, spacing: 6) {
                Text(selected.productName ?? "Unknown item")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(.white)
                Text([
                  selected.productSize.map { "Size \($0)" },
                  selected.priceDisplay.map { "Paid \($0)" },
                ].compactMap { $0 }.joined(separator: " • "))
                .font(.caption)
                .foregroundStyle(NeonTheme.textSecondary)
              }
              Spacer()
            }
          } else {
            StepHint(text: "Tap to start. Scan/enter the tracking number to pull up the item (with image).")
          }
        }
      }
    }, isActive: isActive)
  }

  private var step2Stockx: some View {
    let isActive = (vm.flowStep == .stockx)
    let isExpanded = expanded.contains(.stockx)
    return applyActiveStepHighlight(NeonCard {
      VStack(alignment: .leading, spacing: isExpanded ? 12 : 6) {
        StepTitle(
          step: 2,
          title: "StockX tag",
          isComplete: vm.isStep2Complete,
          isActive: isActive,
          isExpanded: isExpanded,
          onToggle: { toggle(step: .stockx) }
        )
        .contentShape(Rectangle())
        .onTapGesture { vm.flowStep = .stockx; expanded.insert(.stockx) }

        if isExpanded {
          if !vm.isStep1Complete {
            StepHint(text: "You can scan now, but it’s best to identify the item first (Step 1).")
          }

          Button {
            vm.scanMode = .stockxQr
            showScanner = true
          } label: {
            HStack {
              Image(systemName: "qrcode.viewfinder")
              Text("Scan StockX tag")
                .fontWeight(.semibold)
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())

          if !vm.stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            HStack(alignment: .top, spacing: 8) {
              Text("Captured: \(vm.stockxUnitQrRaw)")
                .font(.caption2)
                .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
                .lineLimit(2)
              Button {
                UIPasteboard.general.string = vm.stockxUnitQrRaw
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
              } label: {
                Text("Copy")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(NeonTheme.accentCyan)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Copy StockX QR to clipboard")
            }
          }
        } else {
          if vm.isStep2Complete {
            HStack(spacing: 6) {
              Text("Captured: \(vm.stockxUnitQrRaw)")
                .font(.caption)
                .foregroundStyle(NeonTheme.textSecondary)
                .lineLimit(1)
              Button {
                UIPasteboard.general.string = vm.stockxUnitQrRaw
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
              } label: {
                Image(systemName: "doc.on.doc")
                  .font(.system(size: 12))
                  .foregroundStyle(NeonTheme.accentCyan)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Copy StockX QR to clipboard")
            }
          } else {
            Text("Not scanned yet.")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          }
        }
      }
    }, isActive: isActive)
  }

  private var step3Auth: some View {
    let isActive = (vm.flowStep == .auth)
    let isExpanded = expanded.contains(.auth)
    return applyActiveStepHighlight(NeonCard {
      VStack(alignment: .leading, spacing: isExpanded ? 12 : 6) {
        StepTitle(
          step: 3,
          title: "Verify QR",
          isComplete: vm.isStep3Complete,
          isActive: isActive,
          isExpanded: isExpanded,
          onToggle: { toggle(step: .auth) }
        )
        .contentShape(Rectangle())
        .onTapGesture { vm.flowStep = .auth; expanded.insert(.auth) }

        if isExpanded {
          if !vm.isStep1Complete {
            StepHint(text: "You can scan now, but it’s best to identify the item first (Step 1).")
          }

          Button {
            vm.scanMode = .authQr
            showScanner = true
          } label: {
            HStack {
              Image(systemName: "safari")
              Text("Scan verify QR (opens site)")
                .fontWeight(.semibold)
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())

          // Medium prominence: some items legitimately don't have a verify QR (esp. shoes).
          Button {
            if vm.verifyQrSkipped {
              vm.undoVerifyQrSkip()
            } else {
              vm.skipVerifyQrNoCode()
              expanded.insert(.result)
            }
          } label: {
            HStack {
              Image(systemName: vm.verifyQrSkipped ? "arrow.uturn.backward.circle" : "qrcode")
              Text(vm.verifyQrSkipped ? "Undo: No QR code on item" : "No QR code on item")
                .fontWeight(.semibold)
              Spacer()
            }
            .foregroundStyle(.white)
            .padding(.vertical, 10)
            .padding(.horizontal, 14)
            // Secondary styling: avoid looking like the primary action (and avoid looking "selected").
            // Use a neutral surface with a cyan outline to match the rest of the UI.
            .background(Color.white.opacity(vm.verifyQrSkipped ? 0.12 : 0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(NeonTheme.accentCyan.opacity(vm.verifyQrSkipped ? 0.85 : 0.55), lineWidth: 1)
            )
          }
          .buttonStyle(.plain)
          .padding(.top, 2)

          if !vm.externalProvider.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text("Provider: \(vm.externalProvider)")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
          }

          if !vm.externalUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text("Last scan: \(vm.externalUrl)")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
              .lineLimit(2)
          }
        } else {
          if vm.isStep3Complete {
            Text("\(vm.externalProvider): \(vm.externalUrl)")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
              .lineLimit(1)
          } else {
            Text("Not scanned yet.")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          }
        }
      }
    }, isActive: isActive)
  }

  private var step4Result: some View {
    let isActive = (vm.flowStep == .result)
    let isExpanded = expanded.contains(.result)
    return applyActiveStepHighlight(NeonCard {
      VStack(alignment: .leading, spacing: isExpanded ? 12 : 6) {
        StepTitle(
          step: 4,
          title: "Result",
          isComplete: vm.isStep4Complete,
          isActive: isActive,
          isExpanded: isExpanded,
          onToggle: { toggle(step: .result) }
        )
        .contentShape(Rectangle())
        .onTapGesture { vm.flowStep = .result; expanded.insert(.result) }

        if isExpanded {
          if !vm.isStep3Complete {
            StepHint(text: "Complete Step 3 (Verify QR), or use “No QR code on item” if there isn’t one.")
          } else if vm.verifyQrSkipped {
            Text("Verify QR skipped: \(vm.verifyQrSkipReason)")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
          }

          if vm.isStep3Complete && !vm.verifyQrSkipped {
            VStack(spacing: 10) {
              Button {
                // Toggle selection: tapping again clears to "not marked"
                vm.externalStatus = (vm.externalStatus == .pass) ? .unknown : .pass
                vm.flowStep = .result
              } label: {
                HStack {
                  Image(systemName: vm.externalStatus == .pass ? "checkmark.circle.fill" : "checkmark.circle")
                  Text("Authentic")
                    .fontWeight(.semibold)
                  Spacer()
                }
                .foregroundStyle(.white)
                .padding(.vertical, 12)
                .padding(.horizontal, 14)
                .background(
                  (vm.externalStatus == .pass ? NeonTheme.accentEmerald.opacity(0.55) : Color.white.opacity(0.06)),
                  in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                )
                .overlay(
                  RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(vm.externalStatus == .pass ? NeonTheme.accentEmerald.opacity(0.9) : NeonTheme.border, lineWidth: 1)
                )
              }
              .buttonStyle(.plain)

              Button {
                // Toggle selection: tapping again clears to "not marked"
                vm.externalStatus = (vm.externalStatus == .fail) ? .unknown : .fail
                vm.flowStep = .result
              } label: {
                HStack {
                  Image(systemName: vm.externalStatus == .fail ? "xmark.octagon.fill" : "xmark.octagon")
                  Text("Not authentic")
                    .fontWeight(.semibold)
                  Spacer()
                }
                .foregroundStyle(.white)
                .padding(.vertical, 12)
                .padding(.horizontal, 14)
                .background(
                  (vm.externalStatus == .fail ? Color.red.opacity(0.45) : Color.white.opacity(0.06)),
                  in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                )
                .overlay(
                  RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(vm.externalStatus == .fail ? Color.red.opacity(0.9) : NeonTheme.border, lineWidth: 1)
                )
              }
              .buttonStyle(.plain)
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
          } else if vm.verifyQrSkipped {
            // Keep the UI calm: if there's no verify QR on the item, don't ask the user to mark authentic/not-authentic.
            Text("Authenticity: No QR code")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
              .transition(.opacity)
          }

          // Slot first (assign or choose), then Print SKU label, so top-to-bottom flow uses slot format.
          if let loc = vm.effectivePickLocationForSelected(), !loc.isEmpty {
            Text("Location: \(loc)")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(NeonTheme.accentEmerald)
              .padding(.top, 6)
            Button {
              assignBinLocation = loc
              assignBinBanner = nil
              showAssignBinSheet = true
            } label: {
              Text("Change slot…")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(NeonTheme.accentCyan)
            }
            .padding(.top, 2)
          } else {
            Button {
              Task { await assignToNextAvailableSlot() }
            } label: {
              HStack {
                Image(systemName: "location.fill")
                if isAssigningToNextSlot {
                  ProgressView()
                    .tint(.white)
                  Text("Assigning…")
                    .fontWeight(.semibold)
                } else {
                  Text("Assign to next slot")
                    .fontWeight(.semibold)
                }
              }
              .foregroundStyle(.white)
            }
            .buttonStyle(NeonPrimaryButtonStyle())
            .disabled(vm.selected == nil || isAssigningToNextSlot)
            .opacity(vm.selected == nil ? 0.6 : 1)
            .padding(.top, 6)

            Button {
              assignBinLocation = ""
              assignBinBanner = nil
              showAssignBinSheet = true
            } label: {
              Text("Or choose a specific slot…")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(NeonTheme.accentCyan)
            }
            .disabled(vm.selected == nil)
            .padding(.top, 2)
          }

          Button {
            Task {
              UIImpactFeedbackGenerator(style: .medium).impactOccurred()
              isPrintingLabel = true
              vm.banner = "Preparing label…"
              guard vm.isStep1Complete, let selected = vm.selected else {
                isPrintingLabel = false
                vm.banner = "Scan an item first (Step 1: Tracking) before printing a SKU label."
                return
              }
              do {
                // Prefer slot (pick location); if none, try to assign to next slot first so label uses slot format.
                var skuForLabel: String?
                if let loc = vm.effectivePickLocationForSelected(), !loc.isEmpty {
                  skuForLabel = loc
                } else {
                  await assignToNextAvailableSlot()
                  skuForLabel = vm.effectivePickLocationForSelected().flatMap { $0.isEmpty ? nil : $0 }
                }
                if skuForLabel == nil || (skuForLabel?.isEmpty == true) {
                  skuForLabel = try await vm.assignSku()
                }
                let sku = skuForLabel ?? "SKU"
                let img = await LabelPrinting.loadProductImage(urlString: selected.productImageUrl)
                let pdf = LabelPrinting.makeLabelPDF(
                  sku: sku,
                  productName: selected.productName,
                  productSize: selected.productSize,
                  styleId: selected.styleId,
                  productImage: img,
                  isTest: !vm.syncEnabled && (selected.sku == nil)
                )
                vm.banner = "Opening print dialog…"
                LabelPrinting.presentPrintSheet(
                  pdfData: pdf,
                  jobName: "FlipFlow SKU \(sku)"
                ) { completed, error in
                  Task { @MainActor in
                    isPrintingLabel = false
                    if let error {
                      UINotificationFeedbackGenerator().notificationOccurred(.error)
                      vm.banner = "Print failed: \((error as NSError).localizedDescription)"
                    } else if completed {
                      UINotificationFeedbackGenerator().notificationOccurred(.success)
                      vm.banner = "Sent to printer."
                    } else {
                      vm.banner = "Printing canceled."
                    }
                  }
                }
              } catch {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                isPrintingLabel = false
                vm.banner = "Failed to assign/print SKU: \((error as NSError).localizedDescription)"
              }
            }
          } label: {
            HStack {
              Image(systemName: "printer.fill")
              if isPrintingLabel {
                ProgressView()
                  .tint(.white)
                Text("Printing…")
                  .fontWeight(.semibold)
              } else {
                Text("Print SKU label")
                  .fontWeight(.semibold)
              }
            }
            .foregroundStyle(.white)
          }
          .disabled(isPrintingLabel)
          .buttonStyle(NeonPrimaryButtonStyle())
          .padding(.top, 2)

          if vm.selected?.received == false {
            Button {
              Task { await vm.markReceived(method: vm.trackingEntryMethod) }
            } label: {
              HStack {
                Image(systemName: "checkmark.circle.fill")
                Text("Mark as received")
                  .fontWeight(.semibold)
              }
              .foregroundStyle(.white)
            }
            .buttonStyle(NeonPrimaryButtonStyle())
            .padding(.top, 2)
          }

          Button {
            Task {
              // Immediate tap feedback
              UIImpactFeedbackGenerator(style: .light).impactOccurred()
              let didReset = await vm.completeCurrentItemAndStartNext()
              if didReset {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                expanded = [.tracking]
              } else {
                // If the flow didn't complete (missing step / sync failure), give a subtle error haptic.
                UINotificationFeedbackGenerator().notificationOccurred(.error)
              }
            }
          } label: {
            HStack {
              Image(systemName: "arrow.counterclockwise")
              Text("Finish")
                .fontWeight(.semibold)
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())
          .padding(.top, 6)

          if vm.trialModeEnabled {
            Text("Trial mode is ON: nothing is saved yet.")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
          }
        } else {
          if vm.verifyQrSkipped {
            Text("Verify QR: No QR code")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          } else if vm.externalStatus == .pass {
            Text("Marked: Authentic")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          } else if vm.externalStatus == .fail {
            Text("Marked: Not authentic")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          } else {
            Text("Not marked yet.")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
          }
          if vm.trialModeEnabled {
            Text("Trial mode is ON.")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.85))
          }
        }
      }
    }, isActive: isActive)
  }

  private func toggle(step: ReceivingViewModel.FlowStep) {
    if expanded.contains(step) {
      expanded.remove(step)
    } else {
      expanded.insert(step)
      vm.flowStep = step
    }
  }

  private var processedLogSection: some View {
    NeonCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Text("Processed (local log)")
            .font(.headline)
            .foregroundStyle(.white)
          Spacer()
          if !vm.processedLog.isEmpty {
            Button("Clear") { showClearProcessedConfirm = true }
              .font(.caption.weight(.semibold))
              .foregroundStyle(Color.white.opacity(0.85))
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          }
        }

        if vm.trialModeEnabled {
          Text("Trial mode: stored on this device only.")
            .font(.caption2)
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
        }

        if vm.processedLog.isEmpty {
          Text("No items processed yet.")
            .font(.caption)
            .foregroundStyle(NeonTheme.textSecondary)
        } else {
          VStack(spacing: 0) {
            ForEach(vm.processedLog) { e in
              ProcessedLogRow(entry: e, onDelete: { vm.deleteProcessedLogEntry(id: e.id) })
              if e.id != vm.processedLog.last?.id {
                Divider().overlay(NeonTheme.border.opacity(0.35))
              }
            }
          }
        }
      }
    }
  }
}

private struct NeonConfirmDialog: View {
  enum ConfirmStyle { case normal, destructive }

  let title: String
  let message: String
  let confirmTitle: String
  let confirmStyle: ConfirmStyle
  let onCancel: () -> Void
  let onConfirm: () -> Void

  var body: some View {
    ZStack {
      Color.black.opacity(0.78)
        .ignoresSafeArea()
        .onTapGesture { onCancel() }

      VStack(spacing: 0) {
        VStack(alignment: .leading, spacing: 10) {
          Text(title)
            .font(.headline)
            .foregroundStyle(.white)

          Text(message)
            .font(.subheadline)
            .foregroundStyle(NeonTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)

          HStack(spacing: 10) {
            Button("Cancel") { onCancel() }
              .foregroundStyle(.white.opacity(0.9))
              .padding(.vertical, 12)
              .frame(maxWidth: .infinity)
              .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
              .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                  .stroke(NeonTheme.border.opacity(0.8), lineWidth: 1)
              )

            Button(confirmTitle) { onConfirm() }
              .foregroundStyle(.white)
              .padding(.vertical, 12)
              .frame(maxWidth: .infinity)
              .background(
                (confirmStyle == .destructive ? AnyShapeStyle(Color.red.opacity(0.65)) : AnyShapeStyle(NeonTheme.primaryGradient.opacity(0.95))),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
              )
              .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                  .stroke((confirmStyle == .destructive ? Color.red.opacity(0.9) : NeonTheme.accentCyan.opacity(0.55)), lineWidth: 1)
              )
          }
          .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 0.14).opacity(0.98), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .stroke(NeonTheme.border, lineWidth: 1)
        )
      }
      .padding(.horizontal, 24)
    }
    .accessibilityElement(children: .contain)
  }
}

private struct NeonToast: View {
  enum Kind { case info, progress, success, error }

  let message: String
  let kind: Kind
  var copyPayload: String? = nil
  let onDismiss: () -> Void

  private var iconName: String {
    switch kind {
    case .info: return "info.circle.fill"
    case .progress: return "printer.fill"
    case .success: return "checkmark.circle.fill"
    case .error: return "xmark.octagon.fill"
    }
  }

  private var accent: Color {
    switch kind {
    case .info, .progress: return NeonTheme.accentCyan
    case .success: return NeonTheme.accentEmerald
    case .error: return Color.red
    }
  }

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Image(systemName: iconName)
        .foregroundStyle(accent.opacity(0.95))

      Text(message)
        .font(.subheadline)
        .foregroundStyle(.white)
        .multilineTextAlignment(.leading)

      Spacer(minLength: 10)

      if let payload = copyPayload, !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Button {
          UIPasteboard.general.string = payload
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          onDismiss()
        } label: {
          HStack(spacing: 4) {
            Image(systemName: "doc.on.doc")
            Text("Copy")
              .font(.subheadline.weight(.semibold))
          }
          .foregroundStyle(NeonTheme.accentCyan)
          .padding(.horizontal, 10)
          .padding(.vertical, 8)
          .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Copy StockX QR to clipboard")
      }

      Button(action: onDismiss) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(.white.opacity(0.85))
          .padding(8)
          .background(Color.white.opacity(0.10), in: Circle())
          .overlay(Circle().stroke(Color.white.opacity(0.14), lineWidth: 1))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Dismiss message")
    }
    // Make the toast "thicker" and more visible (neon themed).
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(
      ZStack {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          // More solid base so it reads clearly on the neon background.
          .fill(Color.black.opacity(0.90))
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          // Stronger neon wash for visibility without sacrificing contrast.
          .fill(NeonTheme.primaryGradient.opacity(kind == .error ? 0.22 : 0.42))
      }
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(accent.opacity(0.85), lineWidth: 1.6)
    )
    .shadow(color: accent.opacity(0.18), radius: 18, x: 0, y: 10)
    .onTapGesture { onDismiss() }
  }
}

private struct ProcessedLogRow: View {
  let entry: ProcessedLogEntry
  let onDelete: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      ProductThumb(urlString: entry.productImageUrl)

      VStack(alignment: .leading, spacing: 4) {
        Text(entry.productName ?? "Unknown item")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)

        Text([
          entry.productSize.map { "Size \($0)" },
          entry.trackingNumber,
        ].compactMap { $0 }.joined(separator: " • "))
        .font(.caption)
        .foregroundStyle(NeonTheme.textSecondary)
        .lineLimit(1)

        if let stockx = entry.stockxUnitQrRaw, !stockx.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          HStack(spacing: 4) {
            Text("StockX: \(stockx)")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
              .lineLimit(1)
            Button {
              UIPasteboard.general.string = stockx
              UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
              Image(systemName: "doc.on.doc")
                .font(.system(size: 10))
                .foregroundStyle(NeonTheme.accentCyan)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Copy StockX QR to clipboard")
          }
        }

        Text("Auth: \(authLabel)")
          .font(.caption2)
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
          .lineLimit(1)

        Text(formatter.string(from: entry.processedAt))
          .font(.caption2)
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.85))
      }

      Spacer()

      Button(action: onDelete) {
        Image(systemName: "trash")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.white.opacity(0.8))
          .padding(8)
          .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Delete log entry")
    }
    .padding(.vertical, 10)
  }

  private var authLabel: String {
    let provider = (entry.authProvider ?? "Other").trimmingCharacters(in: .whitespacesAndNewlines)
    let url = (entry.authUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

    // Special-case: items without an authenticity/verify QR.
    if url == "SKIPPED_NO_QR" || provider.lowercased().contains("no qr") {
      return "No QR code"
    }
    switch entry.authResult {
    case .pass: return "\(provider) • Authentic"
    case .fail: return "\(provider) • Not authentic"
    case .unknown: return "\(provider) • Unknown"
    }
  }

  private var formatter: DateFormatter {
    let f = DateFormatter()
    f.dateStyle = .short
    f.timeStyle = .short
    return f
  }
}

private struct CurrentItemBanner: View {
  let imageUrl: String?
  let name: String?
  let size: String?
  let onHide: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      ProductThumb(urlString: imageUrl)

      VStack(alignment: .leading, spacing: 4) {
        Text(name ?? "Unknown item")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)

        if let size, !size.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Text("Size \(size)")
            .font(.caption)
            .foregroundStyle(NeonTheme.textSecondary)
        }
      }

      Spacer()

      Button(action: onHide) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(.white.opacity(0.85))
          .padding(10)
          .background(Color.white.opacity(0.10), in: Circle())
          .overlay(Circle().stroke(Color.white.opacity(0.14), lineWidth: 1))
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Hide current item banner")
    }
    .padding(12)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(NeonTheme.border.opacity(0.8), lineWidth: 1)
    )
  }
}

private struct FlowHeader: View {
  @ObservedObject var vm: ReceivingViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Receiving")
        .font(.system(size: 24, weight: .semibold))
        .foregroundStyle(NeonTheme.textPrimary)

      HStack(spacing: 8) {
        Button { vm.flowStep = .tracking } label: {
          StepChip(step: 1, title: "Tracking", isComplete: vm.isStep1Complete, isActive: vm.flowStep == .tracking)
        }
        .buttonStyle(.plain)

        Button { vm.flowStep = .stockx } label: {
          StepChip(step: 2, title: "StockX Tag", isComplete: vm.isStep2Complete, isActive: vm.flowStep == .stockx)
        }
        .buttonStyle(.plain)

        Button { vm.flowStep = .auth } label: {
          StepChip(step: 3, title: "Verify QR", isComplete: vm.isStep3Complete, isActive: vm.flowStep == .auth)
        }
        .buttonStyle(.plain)

        Button { vm.flowStep = .result } label: {
          StepChip(step: 4, title: "Result", isComplete: vm.isStep4Complete, isActive: vm.flowStep == .result)
        }
        .buttonStyle(.plain)
      }
    }
  }
}

private struct StepChip: View {
  let step: Int
  let title: String
  let isComplete: Bool
  let isActive: Bool

  var body: some View {
    HStack(spacing: 6) {
      Text("\(step)")
        .font(.caption.weight(.bold))
        .foregroundStyle(.white.opacity(0.95))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background((isComplete ? NeonTheme.accentEmerald.opacity(0.65) : Color.white.opacity(0.10)), in: Capsule())

      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.white.opacity(isActive ? 0.95 : 0.75))
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .allowsTightening(true)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      (isActive
        ? AnyShapeStyle(NeonTheme.primaryGradient.opacity(0.40))
        : AnyShapeStyle(Color.black.opacity(0.10))
      ),
      in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(isActive ? NeonTheme.accentCyan.opacity(0.75) : NeonTheme.border.opacity(0.55), lineWidth: isActive ? 1.25 : 1)
    )
    .shadow(color: isActive ? NeonTheme.accentCyan.opacity(0.10) : .clear, radius: 14, x: 0, y: 7)
  }
}

private struct StepTitle: View {
  let step: Int
  let title: String
  let isComplete: Bool
  let isActive: Bool
  let isExpanded: Bool
  let onToggle: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Text("Step \(step)")
        .font(.caption.weight(.bold))
        .foregroundStyle(.white.opacity(isActive ? 0.95 : 0.85))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
          (isActive
            ? AnyShapeStyle(NeonTheme.primaryGradient.opacity(0.48))
            : AnyShapeStyle(Color.white.opacity(0.10))
          ),
          in: Capsule()
        )

      Text(title)
        .font(.headline)
        .foregroundStyle(isActive ? NeonTheme.accentCyan.opacity(0.88) : .white)

      Spacer()

      if isComplete {
        Image(systemName: "checkmark.seal.fill")
          .foregroundStyle(NeonTheme.accentEmerald)
      } else {
        // Keep spacing so the chevron doesn't jump when completed.
        Color.clear
          .frame(width: 18, height: 18)
      }

      Button(action: onToggle) {
        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(isActive ? NeonTheme.accentCyan.opacity(0.82) : Color.white.opacity(0.65))
          .padding(.horizontal, 10)
          .padding(.vertical, 8)
          .background(Color.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .stroke(isActive ? NeonTheme.accentCyan.opacity(0.40) : Color.white.opacity(0.12), lineWidth: 1)
          )
      }
      .buttonStyle(.plain)
    }
  }
}

private struct StepHint: View {
  let text: String

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "info.circle")
        .foregroundStyle(NeonTheme.accentCyan.opacity(0.9))
      Text(text)
        .font(.caption)
        .foregroundStyle(NeonTheme.textSecondary)
      Spacer()
    }
    .padding(.vertical, 10)
    .padding(.horizontal, 12)
    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(NeonTheme.border.opacity(0.8), lineWidth: 1)
    )
  }
}

// SafariSheet + IdentifiableURL live in Support/SafariSheet.swift

private struct ProductThumb: View {
  let urlString: String?

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(Color.white.opacity(0.06))

      if let url = safeURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView().tint(NeonTheme.accentCyan)
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            Image(systemName: "photo")
              .font(.system(size: 18, weight: .semibold))
              .foregroundStyle(Color.white.opacity(0.6))
          @unknown default:
            EmptyView()
          }
        }
      } else {
        Image(systemName: "photo")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(Color.white.opacity(0.6))
      }
    }
    .frame(width: 56, height: 56)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(NeonTheme.border.opacity(0.8), lineWidth: 1)
    )
  }

  private var safeURL: URL? {
    guard let urlString = urlString?.trimmingCharacters(in: .whitespacesAndNewlines), !urlString.isEmpty else { return nil }
    guard let url = URL(string: urlString) else { return nil }
    let scheme = (url.scheme ?? "").lowercased()
    guard scheme == "https" || scheme == "http" else { return nil }
    return url
  }
}

private struct ScannerSheet: View {
  @ObservedObject var vm: ReceivingViewModel
  @Binding var isPresented: Bool
  @State private var torchOn = false
  @State private var torchStatus: String = ""

  var body: some View {
    NavigationStack {
      Group {
        if #available(iOS 16.0, *) {
          ZStack {
            AVCaptureScannerView(
              scanMode: vm.scanMode,
              onPayload: { payload in
                vm.applyScanPayload(payload)
              },
              onClose: {
                torchOn = false
                isPresented = false
              }
              ,
              torchOn: $torchOn,
              onTorchStatus: { status in
                torchStatus = status
              }
            )
            .ignoresSafeArea()

            // Scan box overlay to guide the user.
            VStack {
              Spacer()

              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Color.white.opacity(0.85), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                .background(
                  RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.black.opacity(0.06))
                )
                .frame(width: 280, height: 280)
                .shadow(color: Color.black.opacity(0.25), radius: 18, x: 0, y: 10)

              Text("Align the barcode/QR inside the square")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.top, 14)

              Text("Scanning…")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.85))
                .padding(.top, 6)

              Spacer()
            }
            .padding(.vertical, 40)
            .allowsHitTesting(false)

            // Torch button overlay
            VStack {
              HStack {
                Spacer()
                Button {
                  UIImpactFeedbackGenerator(style: .light).impactOccurred()
                  torchOn.toggle()
                } label: {
                  Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(Color.black.opacity(0.35), in: Circle())
                    .overlay(
                      Circle().stroke(Color.white.opacity(0.25), lineWidth: 1)
                    )
                }
                .accessibilityLabel(torchOn ? "Turn flashlight off" : "Turn flashlight on")
              }
              .padding(.horizontal, 16)
              .padding(.top, 8)
              if !torchStatus.isEmpty {
                Text(torchStatus)
                  .font(.caption2)
                  .foregroundStyle(.white.opacity(0.9))
                  .padding(.top, 8)
                  .padding(.horizontal, 10)
                  .padding(.vertical, 6)
                  .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                  .padding(.trailing, 12)
              }
              Spacer()
            }
          }
          .task {
            // Start scanning as soon as presented
            // (DataScannerViewController starts scanning automatically when view appears)
          }
        } else {
          VStack(spacing: 12) {
            Text("Requires iOS 16+")
              .font(.headline)
            Text("This build targets iOS 16+ for reliable barcode + QR scanning.")
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
              .padding(.horizontal)
          }
        }
      }
      .navigationTitle("Scan")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button {
            torchOn = false
            isPresented = false
          } label: {
            Image(systemName: "xmark")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(.white)
              .padding(8)
              .background(Color.black.opacity(0.25), in: Circle())
          }
          .accessibilityLabel("Close scanner")
        }
      }
    }
    // If the user swipes down to dismiss the sheet, ensure the torch is turned off.
    .onChange(of: isPresented) { newValue in
      if !newValue { torchOn = false }
    }
    .onDisappear {
      torchOn = false
    }
  }
}

// MARK: - Assign to bin (pick location for fulfillment)

private struct AssignBinSheet: View {
  @Binding var location: String
  @Binding var banner: String?
  @Binding var isSaving: Bool
  let purchaseId: String?
  let productName: String
  let onSave: () -> Void
  let onDismiss: () -> Void
  @EnvironmentObject private var auth: AuthViewModel

  private let bins = ["A", "B", "C", "D", "E", "F", "G", "H"]
  private let maxSlotNumber = 999

  @State private var selectedBin: String = "A"
  @State private var selectedNumber: Double = 1
  @State private var lastHapticNumber: Int = -1

  private var selectedSlot: String {
    let bin = bins.contains(selectedBin) ? selectedBin : "A"
    let n = Int(selectedNumber.rounded())
    let clamped = max(1, min(maxSlotNumber, n))
    return "\(bin)\(clamped)"
  }

  var body: some View {
    NavigationStack {
      ZStack {
        NeonTheme.backgroundGradient
          .ignoresSafeArea()
        VStack(alignment: .leading, spacing: 16) {
          if !productName.isEmpty {
            Text(productName)
              .font(.subheadline)
              .foregroundStyle(NeonTheme.textSecondary)
              .lineLimit(2)
              .padding(.horizontal)
          }
          Text("Slots are unique and never reused (e.g. A3 won’t be suggested again). Format A1–A999 per bin; max 5 items per bin. Suggested slot is next available.")
            .font(.caption)
            .foregroundStyle(NeonTheme.textSecondary)
            .padding(.horizontal)
          
          // Selected slot preview
          HStack {
            Text("Selected")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
            Spacer()
            Text(selectedSlot)
              .font(.system(.title2, design: .monospaced).weight(.bold))
              .foregroundStyle(.white)
              .padding(.horizontal, 12)
              .padding(.vertical, 6)
              .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
          }
          .padding(.horizontal, 16)

          // Bin selector (A–H)
          VStack(alignment: .leading, spacing: 8) {
            Text("Bin")
              .font(.caption.weight(.semibold))
              .foregroundStyle(NeonTheme.textSecondary)
              .padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 10) {
                ForEach(bins, id: \.self) { bin in
                  Button {
                    selectedBin = bin
                    UISelectionFeedbackGenerator().selectionChanged()
                  } label: {
                    Text(bin)
                      .font(.subheadline.weight(.semibold))
                      .foregroundStyle(selectedBin == bin ? .black : .white)
                      .frame(width: 44, height: 36)
                      .background(
                        selectedBin == bin ? NeonTheme.accentCyan : Color.white.opacity(0.08),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                      )
                  }
                  .buttonStyle(.plain)
                }
              }
              .padding(.horizontal, 16)
            }
          }

          // Slot number selector (horizontal slider)
          VStack(alignment: .leading, spacing: 10) {
            HStack {
              Text("Slot number")
                .font(.caption.weight(.semibold))
                .foregroundStyle(NeonTheme.textSecondary)
              Spacer()
              Text("\(Int(selectedNumber.rounded()))")
                .font(.caption.weight(.bold))
                .foregroundStyle(NeonTheme.accentCyan)
            }
            .padding(.horizontal, 16)

            Slider(value: $selectedNumber, in: 1...Double(maxSlotNumber), step: 1)
              .tint(NeonTheme.accentCyan)
              .padding(.horizontal, 16)
              .onChange(of: selectedNumber) { _ in
                let n = Int(selectedNumber.rounded())
                if n != lastHapticNumber {
                  lastHapticNumber = n
                  UISelectionFeedbackGenerator().selectionChanged()
                }
              }
          }

          Button {
            location = selectedSlot
            onSave()
          } label: {
            HStack {
              Image(systemName: "checkmark.circle.fill")
              if isSaving {
                ProgressView().tint(.white)
                Text("Saving…")
                  .fontWeight(.semibold)
              } else {
                Text("Confirm slot")
                  .fontWeight(.semibold)
              }
              Spacer()
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())
          .disabled(isSaving)
          .padding(.horizontal, 16)
          if let msg = banner {
            Text(msg)
              .font(.caption)
              .foregroundStyle(Color.orange)
              .padding(.horizontal)
          }
          Spacer()
        }
        .padding(.top, 20)
      }
      .navigationTitle("Assign to bin")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(.hidden, for: .navigationBar)
      .onAppear {
        syncSelectionFromLocation()
        Task {
          await suggestNextSlot()
          syncSelectionFromLocation()
        }
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onDismiss() }
            .foregroundStyle(NeonTheme.accentCyan)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            location = selectedSlot
            onSave()
          }
          .foregroundStyle(NeonTheme.accentCyan)
          .disabled(isSaving)
        }
      }
    }
  }

  private func syncSelectionFromLocation() {
    let t = location.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard t.count >= 2 else { return }
    let bin = String(t.prefix(1))
    let numStr = String(t.dropFirst())
    guard bins.contains(bin), let n = Int(numStr), n >= 1, n <= maxSlotNumber else { return }
    selectedBin = bin
    selectedNumber = Double(n)
    lastHapticNumber = n
  }

  private func suggestNextSlot() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    let baseURL = URL(string: "https://www.solesmarket.com")!
    guard let url = baseURL.appendingPathComponent("api/inventory/next-available-slot") as URL? else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    guard let (data, res) = try? await URLSession.shared.data(for: req),
          let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode),
          let decoded = try? JSONDecoder().decode(NextAvailableSlotResponse.self, from: data),
          let loc = decoded.location, !loc.isEmpty
    else { return }
    await MainActor.run { location = loc }
  }
}

private struct NextAvailableSlotResponse: Decodable {
  let location: String?
}

