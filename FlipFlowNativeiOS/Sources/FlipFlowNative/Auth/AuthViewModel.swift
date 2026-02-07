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

  private var isFirebaseConfigured: Bool {
    FirebaseApp.app() != nil
  }

  func start() {
    // Bootstrap site-password session first (works even without Firebase configured).
    let siteId = UserDefaults.standard.string(forKey: siteUserDefaultsKey) ?? ""
    if !siteId.isEmpty {
      session = .sitePassword(userId: siteId)
    }

    // If Firebase isn't configured yet (e.g. missing/misnamed GoogleService-Info.plist),
    // do NOT touch FirebaseAuth APIs — they will fatalError.
    guard isFirebaseConfigured else { return }

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
  }

  func stop() {
    if let authHandle {
      if isFirebaseConfigured {
        Auth.auth().removeStateDidChangeListener(authHandle)
      }
      self.authHandle = nil
    }
  }

  func signInWithGoogle(presenting: UIViewController) async {
    errorMessage = nil
    do {
      guard let clientID = FirebaseApp.app()?.options.clientID else {
        throw NSError(
          domain: "FlipFlowNative",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Firebase not configured. Ensure `GoogleService-Info.plist` is in the app target (and named exactly that), then set the URL scheme (REVERSED_CLIENT_ID)."]
        )
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
      if isFirebaseConfigured {
        try Auth.auth().signOut()
      }
      GIDSignIn.sharedInstance.signOut()
      UserDefaults.standard.removeObject(forKey: siteUserDefaultsKey)
      session = .signedOut
    } catch {
      errorMessage = (error as NSError).localizedDescription
    }
  }
}

