import Foundation
import FirebaseAuth
import FirebaseCore
import GoogleSignIn

@MainActor
final class AuthViewModel: ObservableObject {
  @Published private(set) var user: User?
  @Published private(set) var session: AuthSession = .signedOut
  @Published var errorMessage: String?

  private var authHandle: AuthStateDidChangeListenerHandle?
  private let siteUserDefaultsKey = "flipflow_site_user_id"

  // Use your production domain by default (matches the site-password flow).
  // You can change later to a configurable setting if needed.
  private let siteBaseURL = URL(string: "https://solesmarket.com")!

  func start() {
    guard authHandle == nil else { return }
    authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
      guard let self else { return }
      self.user = user
      if let uid = user?.uid {
        self.session = .firebase(userId: uid)
        return
      }

      // If not firebase-signed-in, fall back to an existing site-password session if present.
      let siteId = UserDefaults.standard.string(forKey: self.siteUserDefaultsKey) ?? ""
      if !siteId.isEmpty {
        self.session = .sitePassword(userId: siteId)
      } else {
        self.session = .signedOut
      }
    }

    // Also bootstrap immediately in case Firebase isn't configured yet.
    let siteId = UserDefaults.standard.string(forKey: siteUserDefaultsKey) ?? ""
    if !siteId.isEmpty {
      session = .sitePassword(userId: siteId)
    }
  }

  func stop() {
    if let authHandle {
      Auth.auth().removeStateDidChangeListener(authHandle)
      self.authHandle = nil
    }
  }

  func signInWithGoogle(presenting: UIViewController) async {
    errorMessage = nil
    do {
      guard let clientID = FirebaseApp.app()?.options.clientID else {
        throw NSError(domain: "FlipFlowNative", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing Firebase clientID. Did you add GoogleService-Info.plist to the target?"])
      }

      let config = GIDConfiguration(clientID: clientID)
      GIDSignIn.sharedInstance.configuration = config

      let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
      guard let idToken = result.user.idToken?.tokenString else {
        throw NSError(domain: "FlipFlowNative", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing Google ID token"])
      }
      let accessToken = result.user.accessToken.tokenString

      let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
      _ = try await Auth.auth().signIn(with: credential)
    } catch {
      errorMessage = (error as NSError).localizedDescription
    }
  }

  func signInWithSitePassword(password: String) async {
    errorMessage = nil
    do {
      let client = SiteAuthClient(baseURL: siteBaseURL)
      let resp = try await client.verifySitePassword(password: password, remember: true)
      let uid = (resp.userId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !uid.isEmpty else {
        throw NSError(domain: "FlipFlowNative.SiteAuth", code: 1, userInfo: [NSLocalizedDescriptionKey: "No userId returned from server."])
      }
      UserDefaults.standard.set(uid, forKey: siteUserDefaultsKey)
      session = .sitePassword(userId: uid)
    } catch {
      errorMessage = (error as NSError).localizedDescription
    }
  }

  func signOut() {
    errorMessage = nil
    do {
      try Auth.auth().signOut()
      GIDSignIn.sharedInstance.signOut()
      UserDefaults.standard.removeObject(forKey: siteUserDefaultsKey)
    } catch {
      errorMessage = (error as NSError).localizedDescription
    }
  }
}

