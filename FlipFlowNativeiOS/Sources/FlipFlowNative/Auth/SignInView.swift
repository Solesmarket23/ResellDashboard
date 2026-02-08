import SwiftUI

struct SignInView: View {
  @EnvironmentObject private var auth: AuthViewModel
  @State private var mode: Mode = .google
  @State private var sitePassword: String = ""

  enum Mode: String, CaseIterable, Identifiable {
    case google = "Google"
    case sitePassword = "Site password"
    var id: String { rawValue }
  }

  var body: some View {
    NeonScreen {
      GeometryReader { geo in
        ScrollView(.vertical, showsIndicators: false) {
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

            Text("Setup note: add `GoogleService-Info.plist` and set URL scheme (REVERSED_CLIENT_ID).")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
              .multilineTextAlignment(.center)
          }
          // Keep content centered in the safe visible area, but allow scroll if needed.
          .frame(minHeight: max(0, geo.size.height - 24), alignment: .center)
          .padding(.horizontal, 16)
          .padding(.vertical, 24)
        }
        .scrollDismissesKeyboard(.interactively)
      }
    }
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
        Task { await auth.signInWithSitePassword(password: sitePassword) }
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "lock.fill")
          Text("Access Dashboard")
            .font(.headline)
        }
        .foregroundStyle(.white)
      }
      .buttonStyle(NeonPrimaryButtonStyle())
    }
  }
}

