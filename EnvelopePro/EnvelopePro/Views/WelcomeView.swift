import SwiftUI
import AuthenticationServices

struct WelcomeView: View {
    @EnvironmentObject var authManager: AuthenticationManager
    @EnvironmentObject var themeManager: ThemeManager
    @State private var showingEmailCapture = false
    
    var body: some View {
        ZStack {
            themeManager.primaryGradient
                .ignoresSafeArea()
            
            VStack(spacing: 40) {
                Spacer()
                
                VStack(spacing: 20) {
                    Image(systemName: "envelope.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.white)
                        .shadow(radius: 10)
                    
                    Text("EnvelopePro")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("Digital Cash Stuffing Made Simple")
                        .font(.headline)
                        .foregroundColor(.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                }
                
                Spacer()
                
                VStack(spacing: 16) {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.email, .fullName]
                    } onCompletion: { result in
                        handleSignInWithApple(result)
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 55)
                    .cornerRadius(12)
                    .shadow(radius: 5)
                    
                    Button(action: {
                        showingEmailCapture = true
                    }) {
                        HStack {
                            Image(systemName: "envelope.badge")
                            Text("Continue with Email")
                                .fontWeight(.semibold)
                        }
                        .foregroundColor(ThemeManager.cashGreen)
                        .frame(maxWidth: .infinity)
                        .frame(height: 55)
                        .background(Color.white)
                        .cornerRadius(12)
                        .shadow(radius: 5)
                    }
                    
                    Text("Get 30 days free premium!")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 50)
            }
        }
        .sheet(isPresented: $showingEmailCapture) {
            EmailCaptureView()
        }
    }
    
    private func handleSignInWithApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            authManager.signInWithApple(authorization: authorization)
        case .failure(let error):
            print("Sign in with Apple failed: \(error)")
        }
    }
}

#Preview {
    WelcomeView()
        .environmentObject(AuthenticationManager())
        .environmentObject(ThemeManager())
}