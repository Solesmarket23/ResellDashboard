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
  private let siteSessionTokenKey = "flipflow_site_session_token"

  // Use www so verify hits the same host as Repricing API (Vercel env applies consistently).
  private let siteBaseURL = URL(string: "https://www.solesmarket.com")!

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
    print("[Auth] Site password sign-in: calling verify API at \(siteBaseURL.absoluteString)...")
    do {
      let client = SiteAuthClient(baseURL: siteBaseURL)
      let resp = try await client.verifySitePassword(password: password, remember: true)
      let uid = (resp.userId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let hasToken = (resp.siteSessionToken ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
      print("[Auth] Site password sign-in: verify response success=\(resp.success ?? false), userId=\(uid.prefix(8))..., siteSessionToken present=\(hasToken)")
      guard !uid.isEmpty else {
        throw NSError(domain: "FlipFlowNative.SiteAuth", code: 1, userInfo: [NSLocalizedDescriptionKey: "No userId returned from server."])
      }
      UserDefaults.standard.set(uid, forKey: siteUserDefaultsKey)
      let token = (resp.siteSessionToken ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      if !token.isEmpty {
        UserDefaults.standard.set(token, forKey: siteSessionTokenKey)
        print("[Auth] Site password sign-in: stored siteSessionToken (length \(token.count)) for API.")
      } else {
        UserDefaults.standard.removeObject(forKey: siteSessionTokenKey)
        print("[Auth] Site password sign-in: no siteSessionToken in response. Add SITE_SESSION_SECRET in Vercel env and redeploy.")
      }
      session = .sitePassword(userId: uid)
    } catch {
      errorMessage = (error as NSError).localizedDescription
      print("[Auth] Site password sign-in failed: \(error.localizedDescription)")
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
      UserDefaults.standard.removeObject(forKey: siteSessionTokenKey)
      session = .signedOut
    } catch {
      errorMessage = (error as NSError).localizedDescription
    }
  }

  /// Returns a Firebase ID token for calling backend APIs that require Bearer auth (e.g. StockX native listings).
  /// Only available when signed in with Firebase (Google). Returns nil for site-password or signed-out.
  func getFirebaseIDToken(forcingRefresh: Bool = false) async throws -> String? {
    guard isFirebaseConfigured else { return nil }
    guard let user = Auth.auth().currentUser else { return nil }
    return try await user.getIDToken(forcingRefresh: forcingRefresh)
  }

  /// Returns the Bearer token to use for native API calls (listings, native-auth/start).
  /// For Firebase session: Firebase ID token. For site-password: site session JWT from server (if available).
  func getApiBearerToken(forcingRefresh: Bool = false) async throws -> String? {
    switch session {
    case .firebase:
      return try await getFirebaseIDToken(forcingRefresh: forcingRefresh)
    case .sitePassword:
      let raw = UserDefaults.standard.string(forKey: siteSessionTokenKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let t = raw, !t.isEmpty else {
        print("[Auth] getApiBearerToken (site password): no token in UserDefaults.")
        return nil
      }
      print("[Auth] getApiBearerToken (site password): using stored token (length \(t.count)).")
      return t
    case .signedOut:
      return nil
    }
  }
}

