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
      VStack(spacing: 18) {
        Spacer()

        NeonCard {
          VStack(spacing: 10) {
            Text("Flip Flow Native")
              .font(.system(size: 34, weight: .semibold))
              .foregroundStyle(NeonTheme.textPrimary)
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
            .padding(.top, 6)

            if mode == .google {
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
            .padding(.top, 6)
            } else {
              SecureField("Enter site password", text: $sitePassword)
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
                .padding(.top, 6)

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

            if let error = auth.errorMessage, !error.isEmpty {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
                .padding(.top, 6)
            }
          }
        }
        .padding(.horizontal, 18)

        Spacer()

        Text("Setup note: add `GoogleService-Info.plist` and set URL scheme (REVERSED_CLIENT_ID).")
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
          .multilineTextAlignment(.center)
          .padding(.horizontal, 24)
          .padding(.bottom, 18)
      }
    }
  }
}

