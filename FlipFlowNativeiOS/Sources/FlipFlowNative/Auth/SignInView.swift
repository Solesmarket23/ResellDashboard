import SwiftUI
import os

struct SignInView: View {
  @EnvironmentObject private var auth: AuthViewModel
  @State private var mode: Mode = .google
  @State private var sitePassword: String = ""
  @FocusState private var focusedField: Field?
  private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "FlipFlowNative", category: "SignInPerf")
  @State private var modeChangedAt: Double?

  enum Field: Hashable {
    case sitePassword
  }

  enum Mode: String, CaseIterable, Identifiable {
    case google = "Google"
    case sitePassword = "Site password"
    var id: String { rawValue }
  }

  var body: some View {
    NeonScreen {
      // Avoid always-on ScrollView on large devices; it can cause keyboard/layout churn on iOS 18.
      ViewThatFits(in: .vertical) {
        centeredContent
        ScrollView(.vertical, showsIndicators: false) {
          centeredContent
            .padding(.bottom, 16)
        }
        .scrollDismissesKeyboard(.interactively)
      }
    }
    .onAppear {
      log.debug("SignInView appeared")
    }
    .onChange(of: mode) { newMode in
      let t = CACurrentMediaTime()
      modeChangedAt = t
      log.debug("mode changed -> \(newMode.rawValue, privacy: .public)")
      if newMode == .sitePassword {
        DispatchQueue.main.async {
          focusedField = .sitePassword
        }
      } else {
        focusedField = nil
      }
    }
    .onChange(of: focusedField) { newValue in
      let t = CACurrentMediaTime()
      if let modeChangedAt, let newValue {
        log.debug("focus set -> \(String(describing: newValue), privacy: .public) Δ=\(t - modeChangedAt, privacy: .public)s")
      } else {
        log.debug("focus changed -> \(String(describing: newValue), privacy: .public)")
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      let t = CACurrentMediaTime()
      if let modeChangedAt {
        log.debug("keyboard willShow Δ=\(t - modeChangedAt, privacy: .public)s")
      } else {
        log.debug("keyboard willShow")
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
      let t = CACurrentMediaTime()
      if let modeChangedAt {
        log.debug("keyboard didShow Δ=\(t - modeChangedAt, privacy: .public)s")
      } else {
        log.debug("keyboard didShow")
      }
    }
  }

  private var centeredContent: some View {
    VStack(spacing: 18) {
      Spacer(minLength: 0)
      NeonCard {
        VStack(spacing: 10) {
          Text("Flip Flow Native")
            .font(.system(size: 34, weight: .semibold))
            .foregroundStyle(NeonTheme.textPrimary)
            .multilineTextAlignment(.center)

          Text("Sign in to start receiving")
            .font(.subheadline)
            .foregroundStyle(NeonTheme.textSecondary)
            .multilineTextAlignment(.center)

          Picker("Sign in method", selection: $mode) {
            ForEach(Mode.allCases) { m in
              Text(m.rawValue).tag(m)
            }
          }
          .pickerStyle(.segmented)
          .tint(NeonTheme.accentCyan)
          .padding(.top, 6)

          // Keep both sign-in sections mounted to avoid long stalls when toggling modes
          // (e.g. keyboard + layout work hitting all at once on first appearance).
          ZStack(alignment: .top) {
            googleSection
              .opacity(mode == .google ? 1 : 0)
              .allowsHitTesting(mode == .google)

            sitePasswordSection
              .opacity(mode == .sitePassword ? 1 : 0)
              .allowsHitTesting(mode == .sitePassword)
          }
          .padding(.top, 6)
          .transaction { txn in
            // Avoid any implicit animation that can feel like "lag".
            txn.animation = nil
          }

          if let error = auth.errorMessage, !error.isEmpty {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
              .multilineTextAlignment(.center)
              .padding(.top, 6)
          }
        }
      }
      .padding(.horizontal, 16)

      Text("Setup note: add `GoogleService-Info.plist` and set URL scheme (REVERSED_CLIENT_ID).")
        .font(.caption)
        .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
        .multilineTextAlignment(.center)
        .padding(.horizontal, 16)

      Spacer(minLength: 0)
    }
    .padding(.vertical, 24)
  }

  private var googleSection: some View {
    Button {
      guard let presenting = UIApplication.shared.topMostViewController() else {
        auth.errorMessage = "Unable to find a presenting view controller."
        return
      }
      Task { await auth.signInWithGoogle(presenting: presenting) }
    } label: {
      HStack(spacing: 10) {
        ZStack {
          Circle()
            .fill(Color.white.opacity(0.18))
          Text("G")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(.white)
        }
        .frame(width: 26, height: 26)

        Text("Continue with Google")
          .font(.headline)
      }
      .foregroundStyle(.white)
    }
    .buttonStyle(NeonPrimaryButtonStyle())
  }

  private var sitePasswordSection: some View {
    VStack(spacing: 12) {
      SecureField("Enter site password", text: $sitePassword)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .textContentType(.password)
        .submitLabel(.go)
        .focused($focusedField, equals: .sitePassword)
        .onSubmit { attemptSitePasswordSignIn() }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(NeonTheme.border, lineWidth: 1)
            .allowsHitTesting(false)
        )
        .foregroundStyle(.white)

      Button {
        attemptSitePasswordSignIn()
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "lock.fill")
          Text("Access Dashboard")
            .font(.headline)
        }
        .foregroundStyle(.white)
      }
      .buttonStyle(NeonPrimaryButtonStyle())
      .disabled(sitePassword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
  }

  private func attemptSitePasswordSignIn() {
    let pw = sitePassword.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !pw.isEmpty else { return }
    Task { await auth.signInWithSitePassword(password: pw) }
  }
}

