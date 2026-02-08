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

  var body: some View {
    NeonScreen { screenContent }
      .overlay(alignment: .top) {
        if let message = vm.banner, !message.isEmpty {
          NeonToast(message: message) {
            bannerDismissWorkItem?.cancel()
            bannerDismissWorkItem = nil
            withAnimation(.easeInOut(duration: 0.18)) {
              vm.banner = nil
            }
          }
          .padding(.top, 10)
          .padding(.horizontal, 14)
          .transition(.move(edge: .top).combined(with: .opacity))
          .onAppear {
            bannerDismissWorkItem?.cancel()
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
    return NeonCard {
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
    }
  }

  private var step2Stockx: some View {
    let isActive = (vm.flowStep == .stockx)
    let isExpanded = expanded.contains(.stockx)
    return NeonCard {
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
            Text("Captured: \(vm.stockxUnitQrRaw)")
              .font(.caption2)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
              .lineLimit(2)
          }
        } else {
          if vm.isStep2Complete {
            Text("Captured: \(vm.stockxUnitQrRaw)")
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
    }
  }

  private var step3Auth: some View {
    let isActive = (vm.flowStep == .auth)
    let isExpanded = expanded.contains(.auth)
    return NeonCard {
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
    }
  }

  private var step4Result: some View {
    let isActive = (vm.flowStep == .result)
    let isExpanded = expanded.contains(.result)
    return NeonCard {
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
            StepHint(text: "Complete the Verify QR scan first (Step 3) so you can confirm the result.")
          }

          VStack(spacing: 10) {
            Button {
              vm.externalStatus = .pass
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
              vm.externalStatus = .fail
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

        if isExpanded {
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
                let sku = try await vm.assignSku()
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
        }

          Button {
            Task {
              let didReset = await vm.completeCurrentItemAndStartNext()
              if didReset {
                expanded = [.tracking]
              }
            }
          } label: {
            HStack {
              Image(systemName: "arrow.counterclockwise")
              Text("Start next item")
                .fontWeight(.semibold)
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())
          .padding(.top, 6)

          Text("Trial mode is ON: nothing is saved yet.")
            .font(.caption2)
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
        } else {
          if vm.externalStatus == .pass {
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
          Text("Trial mode is ON.")
            .font(.caption2)
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.85))
        }
      }
    }
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
            Button("Clear") { vm.clearProcessedLog() }
              .font(.caption.weight(.semibold))
              .foregroundStyle(Color.white.opacity(0.85))
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          }
        }

        Text("Trial mode: stored on this device only.")
          .font(.caption2)
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))

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

private struct NeonToast: View {
  let message: String
  let onDismiss: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(NeonTheme.accentCyan.opacity(0.9))
        .padding(.top, 1)

      Text(message)
        .font(.subheadline)
        .foregroundStyle(.white)
        .multilineTextAlignment(.leading)

      Spacer(minLength: 10)

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
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(NeonTheme.border.opacity(0.85), lineWidth: 1)
    )
    .shadow(color: Color.black.opacity(0.25), radius: 18, x: 0, y: 10)
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
          Text("StockX: \(stockx)")
            .font(.caption2)
            .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
            .lineLimit(1)
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

      Image(systemName: isComplete ? "checkmark.seal.fill" : "circle")
        .foregroundStyle(isComplete ? NeonTheme.accentEmerald : Color.white.opacity(0.25))

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

private struct IdentifiableURL: Identifiable {
  let id = UUID()
  let url: URL
}

private struct SafariSheet: View {
  let url: URL

  var body: some View {
    SafariViewController(url: url)
      .presentationDetents([.fraction(0.95), .large])
      .presentationDragIndicator(.visible)
  }
}

private struct SafariViewController: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    let vc = SFSafariViewController(url: url)
    vc.dismissButtonStyle = .done
    vc.preferredControlTintColor = UIColor.white
    return vc
  }

  func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

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

