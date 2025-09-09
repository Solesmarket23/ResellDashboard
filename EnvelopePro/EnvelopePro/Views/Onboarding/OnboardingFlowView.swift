import SwiftUI

struct OnboardingFlowView: View {
    @EnvironmentObject var authManager: AuthenticationManager
    @State private var currentStep = 0
    
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            
            VStack {
                // Progress indicator
                ProgressView(value: Double(currentStep + 1), total: 4)
                    .progressViewStyle(LinearProgressViewStyle(tint: ThemeManager.cashGreen))
                    .padding()
                
                TabView(selection: $currentStep) {
                    OnboardingWelcomeView()
                        .tag(0)
                    
                    OnboardingTemplateSelectionView()
                        .tag(1)
                    
                    OnboardingBudgetSetupView()
                        .tag(2)
                    
                    OnboardingPaywallView()
                        .tag(3)
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
                
                // Navigation buttons
                HStack {
                    if currentStep > 0 {
                        Button("Back") {
                            withAnimation {
                                currentStep -= 1
                            }
                        }
                        .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    Button(action: {
                        if currentStep < 3 {
                            withAnimation {
                                currentStep += 1
                            }
                        } else {
                            completeOnboarding()
                        }
                    }) {
                        Text(currentStep == 3 ? "Get Started" : "Next")
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 30)
                            .padding(.vertical, 12)
                            .background(ThemeManager.cashGreen)
                            .cornerRadius(25)
                    }
                }
                .padding(.horizontal, 30)
                .padding(.bottom, 30)
            }
        }
    }
    
    private func completeOnboarding() {
        authManager.completeOnboarding()
    }
}

struct OnboardingWelcomeView: View {
    var body: some View {
        VStack(spacing: 30) {
            Spacer()
            
            Image(systemName: "hands.clap.fill")
                .font(.system(size: 80))
                .foregroundColor(ThemeManager.cashGreen)
            
            VStack(spacing: 16) {
                Text("Welcome to EnvelopePro!")
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                
                Text("Transform your finances with the viral cash stuffing method, now digital")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            
            Spacer()
            Spacer()
        }
    }
}

#Preview {
    OnboardingFlowView()
        .environmentObject(AuthenticationManager())
}