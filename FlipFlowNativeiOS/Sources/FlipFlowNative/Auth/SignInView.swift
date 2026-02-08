import SwiftUI

struct SignInView: View {
  @EnvironmentObject private var auth: AuthViewModel
  @State private var showSitePasswordSheet: Bool = false
  @State private var sitePassword: String = ""
  @State private var sitePasswordFirstResponder: Bool = false
  @State private var isSigningIn: Bool = false

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
    .sheet(isPresented: $showSitePasswordSheet, onDismiss: {
      sitePasswordFirstResponder = false
      isSigningIn = false
    }) {
      sitePasswordSheet
    }
    .onChange(of: auth.session) { s in
      // If sign-in succeeds, dismiss the sheet.
      if case .sitePassword = s {
        showSitePasswordSheet = false
      }
      if case .firebase = s {
        showSitePasswordSheet = false
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

          Button {
            sitePassword = ""
            showSitePasswordSheet = true
            // Delay enabling first responder until the sheet is presented.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
              sitePasswordFirstResponder = true
            }
          } label: {
            HStack(spacing: 10) {
              Image(systemName: "lock.fill")
              Text("Use site password")
                .font(.headline)
            }
            .foregroundStyle(.white)
          }
          .buttonStyle(NeonPrimaryButtonStyle())

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

  private var sitePasswordSheet: some View {
    NeonScreen {
      VStack(spacing: 14) {
        Spacer(minLength: 0)

        NeonCard {
          VStack(alignment: .leading, spacing: 12) {
            HStack {
              Text("Site password")
                .font(.headline)
                .foregroundStyle(.white)
              Spacer()
              Button {
                showSitePasswordSheet = false
              } label: {
                Image(systemName: "xmark")
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundStyle(.white.opacity(0.9))
                  .padding(10)
                  .background(Color.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
              }
              .buttonStyle(.plain)
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

            if let error = auth.errorMessage, !error.isEmpty {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
            }
          }
        }
        .padding(.horizontal, 16)

        Spacer(minLength: 0)
      }
      .padding(.vertical, 18)
    }
    .presentationDetents([.fraction(0.45), .medium])
    .presentationDragIndicator(.visible)
  }
}

