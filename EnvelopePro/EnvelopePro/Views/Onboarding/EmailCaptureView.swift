import SwiftUI

struct EmailCaptureView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authManager: AuthenticationManager
    @State private var email = ""
    @State private var isValidEmail = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 30) {
                VStack(spacing: 16) {
                    Image(systemName: "envelope.badge.fill")
                        .font(.system(size: 60))
                        .foregroundColor(ThemeManager.cashGreen)
                    
                    Text("Start Your Journey")
                        .font(.largeTitle.bold())
                    
                    Text("Enter your email to get 30 days of premium features free!")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding(.top, 40)
                
                VStack(spacing: 20) {
                    TextField("your@email.com", text: $email)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .onChange(of: email) { _ in
                            isValidEmail = isValidEmailFormat(email)
                        }
                    
                    Button(action: {
                        continueWithEmail()
                    }) {
                        Text("Continue")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(isValidEmail ? ThemeManager.cashGreen : Color.gray)
                            .cornerRadius(12)
                    }
                    .disabled(!isValidEmail)
                }
                .padding(.horizontal, 30)
                
                Spacer()
                
                VStack(spacing: 8) {
                    Text("By continuing, you agree to our")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    HStack(spacing: 4) {
                        Button("Terms of Service") {
                            // Open terms
                        }
                        .font(.caption)
                        
                        Text("and")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Button("Privacy Policy") {
                            // Open privacy
                        }
                        .font(.caption)
                    }
                }
                .padding(.bottom, 30)
            }
            .navigationBarItems(
                leading: Button("Cancel") {
                    dismiss()
                }
            )
        }
    }
    
    private func isValidEmailFormat(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }
    
    private func continueWithEmail() {
        // Create temporary user with email
        // In a real app, this would send verification email
        dismiss()
    }
}

#Preview {
    EmailCaptureView()
        .environmentObject(AuthenticationManager())
}