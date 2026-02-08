import SwiftUI

// #region agent log helper
private func agentPostLog(_ location: String, _ message: String, runId: String, hypothesisId: String, data: [String: String] = [:]) {
  guard let url = URL(string: "http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e") else { return }
  let payload: [String: Any] = [
    "location": location,
    "message": message,
    "runId": runId,
    "hypothesisId": hypothesisId,
    "data": data,
    "timestamp": Int(Date().timeIntervalSince1970 * 1000),
  ]
  // Also print to Xcode console so this works on real devices (127.0.0.1 isn't reachable from iPhone).
  if let line = try? String(data: JSONSerialization.data(withJSONObject: payload), encoding: .utf8) {
    print("AGENTLOG \(line)")
  }
  #if targetEnvironment(simulator)
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = body
    URLSession.shared.dataTask(with: req).resume()
  #endif
}
// #endregion

struct SignInView: View {
  @EnvironmentObject private var auth: AuthViewModel
  @State private var showSitePasswordForm: Bool = false
  @State private var sitePassword: String = ""
  @State private var sitePasswordFirstResponder: Bool = false
  @State private var isSigningIn: Bool = false
  @State private var agentTapUptime: TimeInterval = 0
  @State private var agentTapSeq: Int = 0
  @State private var agentPrewarmText: String = ""

  var body: some View {
    NeonScreen {
      GeometryReader { proxy in
        ScrollView(.vertical, showsIndicators: false) {
          centeredContent
            // Center on large screens, still scroll on small screens
            .frame(minHeight: proxy.size.height, alignment: .center)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.bottom, 16)
        }
        .scrollDismissesKeyboard(.interactively)
      }
    }
    // #region agent log A1
    .onChange(of: showSitePasswordForm) { newValue in
      let deltaMs = agentTapUptime > 0 ? Int((ProcessInfo.processInfo.systemUptime - agentTapUptime) * 1000) : -1
      agentPostLog(
        "Auth/SignInView.swift:body.onChange(showSitePasswordForm)",
        "sitePasswordForm toggle",
        runId: "login-inline-pre",
        hypothesisId: "H1",
        data: [
          "tapSeq": String(agentTapSeq),
          "showSitePasswordForm": String(newValue),
          "deltaMsSinceTap": String(deltaMs),
          "sitePasswordFirstResponder": String(sitePasswordFirstResponder),
        ]
      )
      if !newValue {
        sitePasswordFirstResponder = false
        isSigningIn = false
      }
    }
    // #endregion
    // #region agent log A8
    .onChange(of: sitePasswordFirstResponder) { newValue in
      let deltaMs = agentTapUptime > 0 ? Int((ProcessInfo.processInfo.systemUptime - agentTapUptime) * 1000) : -1
      agentPostLog(
        "Auth/SignInView.swift:body.onChange(sitePasswordFirstResponder)",
        "sitePasswordFirstResponder toggle",
        runId: "login-inline-pre",
        hypothesisId: "H1",
        data: [
          "sitePasswordFirstResponder": String(newValue),
          "deltaMsSinceTap": String(deltaMs),
          "showSitePasswordForm": String(showSitePasswordForm),
        ]
      )
    }
    // #endregion
    // #region agent log K0
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { note in
      let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect) ?? .zero
      let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? -1
      agentPostLog(
        "Auth/SignInView.swift:keyboardWillShow",
        "keyboard will show",
        runId: "login-inline-pre",
        hypothesisId: "H2",
        data: [
          "endFrame": NSCoder.string(for: end),
          "duration": String(duration),
          "showSitePasswordForm": String(showSitePasswordForm),
        ]
      )
    }
    // #endregion
    // #region agent log K1
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { note in
      let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? -1
      agentPostLog(
        "Auth/SignInView.swift:keyboardWillHide",
        "keyboard will hide",
        runId: "login-inline-pre",
        hypothesisId: "H2",
        data: [
          "duration": String(duration),
          "showSitePasswordForm": String(showSitePasswordForm),
        ]
      )
    }
    // #endregion
    .onChange(of: auth.session) { s in
      // If sign-in succeeds, hide the form.
      if case .sitePassword = s {
        showSitePasswordForm = false
      }
      if case .firebase = s {
        showSitePasswordForm = false
      }
    }
  }

  private var centeredContent: some View {
    VStack(spacing: 18) {
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

          // Keep the login page lightweight: open site-password entry in a sheet
          // to avoid iOS 18 keyboard focus stalls during segmented-control updates.
          googleSection
            .padding(.top, 6)

          if !showSitePasswordForm {
            Button {
              // #region agent log A0
              agentTapUptime = ProcessInfo.processInfo.systemUptime
              agentTapSeq += 1
              let tapSeq = agentTapSeq
              agentPostLog(
                "Auth/SignInView.swift:UseSitePasswordButton.tap",
                "tap use site password",
                runId: "login-inline-pre",
                hypothesisId: "H1",
                data: [
                  "tapSeq": String(tapSeq),
                  "showSitePasswordForm_before": String(showSitePasswordForm),
                  "sitePasswordFirstResponder_before": String(sitePasswordFirstResponder),
                  "isMainThread": String(Thread.isMainThread),
                ]
              )
              DispatchQueue.main.async {
                let deltaMs = Int((ProcessInfo.processInfo.systemUptime - agentTapUptime) * 1000)
                agentPostLog(
                  "Auth/SignInView.swift:UseSitePasswordButton.tap.mainAsync",
                  "main queue tick after tap",
                  runId: "login-inline-pre",
                  hypothesisId: "H4",
                  data: [
                    "tapSeq": String(tapSeq),
                    "deltaMsSinceTap": String(deltaMs),
                    "showSitePasswordForm_now": String(showSitePasswordForm),
                    "sitePasswordFirstResponder_now": String(sitePasswordFirstResponder),
                  ]
                )
              }
              // #endregion

              // Expand and clear prior state.
              sitePassword = ""
              auth.errorMessage = nil
              showSitePasswordForm = true
            } label: {
              HStack(spacing: 10) {
                Image(systemName: "lock.fill")
                Text("Use site password")
                  .font(.headline)
              }
              .foregroundStyle(.white)
            }
            .buttonStyle(NeonPrimaryButtonStyle())
          }

          // Keep the form mounted at all times so UITextField creation doesn't block the first expansion.
          // When hidden, collapse it to zero height and disable hit-testing.
          sitePasswordInlineForm

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
      .animation(.easeInOut(duration: 0.22), value: showSitePasswordForm)
      // Pre-warm the UIKit secure field so any one-time keyboard/autofill cost happens at launch,
      // not on the first tap of "Use site password".
      .background(
        NoAssistantSecureField(
          placeholder: "",
          text: $agentPrewarmText,
          isFirstResponder: .constant(false),
          onSubmit: nil
        )
        .frame(width: 1, height: 1)
        .opacity(0.01)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      )

      Text("Setup note: add `GoogleService-Info.plist` and set URL scheme (REVERSED_CLIENT_ID).")
        .font(.caption)
        .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
        .multilineTextAlignment(.center)
        .padding(.horizontal, 16)
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

  private func attemptSitePasswordSignIn() {
    let pw = sitePassword.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !pw.isEmpty else { return }
    isSigningIn = true
    Task {
      await auth.signInWithSitePassword(password: pw)
      isSigningIn = false
    }
  }

  private var sitePasswordInlineForm: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Site password")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white.opacity(0.9))
        Spacer()
        Button {
          // Collapse
          showSitePasswordForm = false
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white.opacity(0.85))
            .padding(8)
            .background(Color.black.opacity(0.20), in: Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.14), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hide site password")
      }

      NoAssistantSecureField(
        placeholder: "Enter site password",
        text: $sitePassword,
        isFirstResponder: $sitePasswordFirstResponder,
        onSubmit: { attemptSitePasswordSignIn() }
      )
      .padding(.vertical, 12)
      .padding(.horizontal, 14)
      .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(NeonTheme.border, lineWidth: 1)
      )

      Button {
        attemptSitePasswordSignIn()
      } label: {
        HStack(spacing: 10) {
          if isSigningIn {
            ProgressView().tint(.white)
          } else {
            Image(systemName: "lock.fill")
          }
          Text(isSigningIn ? "Signing in…" : "Access Dashboard")
            .font(.headline)
        }
        .foregroundStyle(.white)
      }
      .buttonStyle(NeonPrimaryButtonStyle())
      .disabled(isSigningIn || sitePassword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, showSitePasswordForm ? 6 : 0)
    .opacity(showSitePasswordForm ? 1 : 0)
    .offset(y: showSitePasswordForm ? 0 : -8)
    .frame(maxHeight: showSitePasswordForm ? 220 : 0)
    .clipped()
    .allowsHitTesting(showSitePasswordForm)
    // #region agent log A3
    .onChange(of: showSitePasswordForm) { newValue in
      let deltaMs = agentTapUptime > 0 ? Int((ProcessInfo.processInfo.systemUptime - agentTapUptime) * 1000) : -1
      agentPostLog(
        "Auth/SignInView.swift:sitePasswordInlineForm.onChange(showSitePasswordForm)",
        newValue ? "inline form shown" : "inline form hidden",
        runId: "login-inline-pre",
        hypothesisId: "H2",
        data: [
          "deltaMsSinceTap": String(deltaMs),
          "sitePasswordLen": String(sitePassword.count),
        ]
      )
    }
    // #endregion
    // #region agent log A6
    .onAppear {
      let deltaMs = agentTapUptime > 0 ? Int((ProcessInfo.processInfo.systemUptime - agentTapUptime) * 1000) : -1
      agentPostLog(
        "Auth/SignInView.swift:sitePasswordInlineForm.onAppear",
        "inline form appeared",
        runId: "login-inline-pre",
        hypothesisId: "H3",
        data: [
          "deltaMsSinceTap": String(deltaMs),
          "sitePasswordLen": String(sitePassword.count),
          "autoFocus": "false",
        ]
      )
    }
    // #endregion
    // #region agent log A7
    .onDisappear {
      agentPostLog(
        "Auth/SignInView.swift:sitePasswordInlineForm.onDisappear",
        "inline form disappeared",
        runId: "login-inline-pre",
        hypothesisId: "H3",
        data: [
          "sitePasswordLen": String(sitePassword.count),
          "sitePasswordFirstResponder": String(sitePasswordFirstResponder),
        ]
      )
      sitePasswordFirstResponder = false
    }
    // #endregion
  }
}

