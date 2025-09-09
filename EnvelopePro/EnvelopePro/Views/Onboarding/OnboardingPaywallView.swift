import SwiftUI

struct OnboardingPaywallView: View {
    @State private var selectedPlan = SubscriptionPlan.yearly
    
    enum SubscriptionPlan: String, CaseIterable {
        case monthly = "Monthly"
        case yearly = "Yearly"
        
        var price: String {
            switch self {
            case .monthly: return "$4.99"
            case .yearly: return "$39.99"
            }
        }
        
        var period: String {
            switch self {
            case .monthly: return "per month"
            case .yearly: return "per year"
            }
        }
        
        var savings: String? {
            switch self {
            case .monthly: return nil
            case .yearly: return "Save 33%"
            }
        }
    }
    
    var body: some View {
        VStack(spacing: 30) {
            VStack(spacing: 16) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 60))
                    .foregroundColor(Color.yellow)
                
                Text("Unlock Everything")
                    .font(.largeTitle.bold())
                
                Text("Start with 30 days free, then:")
                    .font(.body)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 40)
            
            // Features list
            VStack(alignment: .leading, spacing: 16) {
                FeatureRow(icon: "infinity", text: "Unlimited envelopes")
                FeatureRow(icon: "chart.line.uptrend.xyaxis", text: "Advanced analytics")
                FeatureRow(icon: "person.2.fill", text: "Family sharing")
                FeatureRow(icon: "camera.fill", text: "Receipt scanning")
                FeatureRow(icon: "sparkles", text: "Premium themes")
                FeatureRow(icon: "bell.badge.fill", text: "Smart reminders")
            }
            .padding(.horizontal, 40)
            
            // Plan selection
            VStack(spacing: 12) {
                ForEach(SubscriptionPlan.allCases, id: \.self) { plan in
                    PlanOption(
                        plan: plan,
                        isSelected: selectedPlan == plan,
                        action: {
                            selectedPlan = plan
                        }
                    )
                }
            }
            .padding(.horizontal, 30)
            
            Spacer()
            
            VStack(spacing: 8) {
                Text("30 days free, then \(selectedPlan.price) \(selectedPlan.period)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Text("Cancel anytime")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct FeatureRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(ThemeManager.cashGreen)
                .frame(width: 30)
            
            Text(text)
                .font(.body)
            
            Spacer()
        }
    }
}

struct PlanOption: View {
    let plan: OnboardingPaywallView.SubscriptionPlan
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(plan.rawValue)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text(plan.price)
                        .font(.title2.bold())
                        .foregroundColor(ThemeManager.cashGreen)
                }
                
                Spacer()
                
                if let savings = plan.savings {
                    Text(savings)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.orange)
                        .cornerRadius(20)
                }
                
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundColor(isSelected ? ThemeManager.cashGreen : .secondary)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemBackground))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? ThemeManager.cashGreen : Color(.systemGray4), lineWidth: isSelected ? 2 : 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    OnboardingPaywallView()
}