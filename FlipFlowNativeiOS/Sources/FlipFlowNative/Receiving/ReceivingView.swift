import SwiftUI
import FirebaseAuth

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

  var body: some View {
    NavigationStack {
      NeonScreen {
        ScrollView {
          VStack(spacing: 14) {
            NeonCard {
              VStack(alignment: .leading, spacing: 12) {
                Text("Receiving")
                  .font(.system(size: 24, weight: .semibold))
                  .foregroundStyle(NeonTheme.textPrimary)

                Picker("Scan mode", selection: $vm.scanMode) {
                  ForEach(ScanMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                  }
                }
                .pickerStyle(.segmented)

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
                  showScanner = true
                } label: {
                  HStack {
                    Image(systemName: "qrcode.viewfinder")
                    Text("Scan with camera")
                      .fontWeight(.semibold)
                  }
                  .foregroundStyle(.white)
                }
                .buttonStyle(NeonPrimaryButtonStyle())
                .padding(.top, 2)

                Text("Tip: Bluetooth scanners work great. Tap the tracking field, scan, and if your scanner sends Enter it’ll auto-lookup.")
                  .font(.caption)
                  .foregroundStyle(NeonTheme.textSecondary)
              }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)

            if vm.lookupState == .loading {
              NeonCard {
                HStack(spacing: 10) {
                  ProgressView()
                    .tint(NeonTheme.accentCyan)
                  Text("Searching…")
                    .foregroundStyle(NeonTheme.textSecondary)
                }
              }
              .padding(.horizontal, 16)
            }

            if vm.lookupState == .notFound || vm.lookupState == .error {
              NeonCard {
                VStack(alignment: .leading, spacing: 6) {
                  Text("Lookup issue")
                    .font(.headline)
                    .foregroundStyle(.white)
                  Text(vm.lookupError.isEmpty ? "Lookup failed." : vm.lookupError)
                    .font(.subheadline)
                    .foregroundStyle(Color.red.opacity(0.95))
                }
              }
              .padding(.horizontal, 16)
            }

            if let selected = vm.selected {
              NeonCard {
                VStack(alignment: .leading, spacing: 10) {
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
                      set: { newId in vm.selected = vm.matches.first(where: { $0.id == newId }) }
                    )) {
                      ForEach(vm.matches) { m in
                        Text(m.productName ?? m.id).tag(m.id)
                      }
                    }
                  }

                  Toggle("Also mark delivered", isOn: $vm.alsoMarkDelivered)
                    .tint(NeonTheme.accentCyan)

                  TextField("Receiving notes (optional)", text: $vm.receivedNotes)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                      RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(NeonTheme.border, lineWidth: 1)
                    )
                    .foregroundStyle(.white)

                  if selected.received {
                    Button {
                      Task { await vm.unmarkReceived() }
                    } label: {
                      HStack {
                        Image(systemName: "arrow.uturn.backward")
                        Text("Undo received")
                          .fontWeight(.semibold)
                      }
                      .foregroundStyle(.white)
                    }
                    .buttonStyle(NeonPrimaryButtonStyle())
                  } else {
                    Button {
                      Task { await vm.markReceived(method: vm.trackingEntryMethod) }
                    } label: {
                      HStack {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Mark received")
                          .fontWeight(.semibold)
                      }
                      .foregroundStyle(.white)
                    }
                    .buttonStyle(NeonPrimaryButtonStyle())
                  }
                }
              }
              .padding(.horizontal, 16)

              NeonCard {
                VStack(alignment: .leading, spacing: 12) {
                  Text("Authentication + StockX")
                    .font(.headline)
                    .foregroundStyle(.white)

                  HStack {
                    Text("Your auth")
                      .foregroundStyle(NeonTheme.textSecondary)
                    Spacer()
                    Picker("", selection: $vm.authSelfStatus) {
                      ForEach(AuthStatus.allCases) { s in
                        Text(s.rawValue.capitalized).tag(s)
                      }
                    }
                    .labelsHidden()
                  }

                  TextField("Your auth notes", text: $vm.authSelfNotes)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                      RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(NeonTheme.border, lineWidth: 1)
                    )
                    .foregroundStyle(.white)

                  HStack {
                    Text("Brand QR provider")
                      .foregroundStyle(NeonTheme.textSecondary)
                    Spacer()
                    Picker("", selection: $vm.externalProvider) {
                      Text("Other").tag("Other")
                      Text("SertaLogo").tag("SertaLogo")
                      Text("DenimTears").tag("DenimTears")
                    }
                    .labelsHidden()
                  }

                  TextField("Brand QR URL/payload", text: $vm.externalUrl)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                      RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(NeonTheme.border, lineWidth: 1)
                    )
                    .foregroundStyle(.white)

                  HStack {
                    Text("Brand QR result")
                      .foregroundStyle(NeonTheme.textSecondary)
                    Spacer()
                    Picker("", selection: $vm.externalStatus) {
                      ForEach(AuthStatus.allCases) { s in
                        Text(s.rawValue.capitalized).tag(s)
                      }
                    }
                    .labelsHidden()
                  }

                  if let url = URL(string: vm.externalUrl), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                    Link(destination: url) {
                      Label("Open verification link", systemImage: "safari")
                        .foregroundStyle(.white)
                    }
                  }

                  Divider().overlay(NeonTheme.border.opacity(0.45))

                  TextField("StockX unit QR payload", text: $vm.stockxUnitQrRaw)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                      RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(NeonTheme.border, lineWidth: 1)
                    )
                    .foregroundStyle(.white)

                  Button {
                    Task { await vm.saveVerification() }
                  } label: {
                    HStack {
                      Image(systemName: "shield.checkered")
                      Text("Save verification info")
                        .fontWeight(.semibold)
                    }
                    .foregroundStyle(.white)
                  }
                  .buttonStyle(NeonPrimaryButtonStyle())
                }
              }
              .padding(.horizontal, 16)
              .padding(.bottom, 24)
            }
          }
        }
        .background(Color.clear)
      }
      .navigationTitle("")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Sign out") { auth.signOut() }
            .foregroundStyle(.white)
        }
      }
      .toolbarBackground(.hidden, for: .navigationBar)
      .alert("Info", isPresented: Binding(
        get: { vm.banner != nil },
        set: { if !$0 { vm.banner = nil } }
      )) {
        Button("OK", role: .cancel) { vm.banner = nil }
      } message: {
        Text(vm.banner ?? "")
      }
      .sheet(isPresented: $showScanner) {
        ScannerSheet(vm: vm, isPresented: $showScanner)
      }
    }
  }
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

  var body: some View {
    NavigationStack {
      Group {
        if #available(iOS 16.0, *) {
          ZStack {
            BarcodeScannerView(
              onPayload: { payload in
                vm.applyScanPayload(payload)
              },
              onClose: {
                torchOn = false
                isPresented = false
              }
              ,
              torchOn: $torchOn
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

              Spacer()
            }
            .padding(.vertical, 40)
            .allowsHitTesting(false)

            // Torch button overlay
            VStack {
              HStack {
                Spacer()
                Button {
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
  }
}

