import SwiftUI

struct OnboardingBudgetSetupView: View {
    @State private var monthlyIncome = ""
    @State private var paydayFrequency = PaydayFrequency.biweekly
    
    enum PaydayFrequency: String, CaseIterable {
        case weekly = "Weekly"
        case biweekly = "Every 2 Weeks"
        case twiceMonthly = "Twice a Month"
        case monthly = "Monthly"
        
        var multiplier: Double {
            switch self {
            case .weekly: return 4.33
            case .biweekly: return 2.17
            case .twiceMonthly: return 2
            case .monthly: return 1
            }
        }
    }
    
    var body: some View {
        VStack(spacing: 30) {
            VStack(spacing: 12) {
                Text("Set Your Income")
                    .font(.largeTitle.bold())
                
                Text("We'll help you allocate your money into envelopes")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            .padding(.top, 40)
            
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Monthly Income")
                        .font(.headline)
                    
                    HStack {
                        Text("$")
                            .font(.title2)
                            .foregroundColor(.secondary)
                        
                        TextField("0", text: $monthlyIncome)
                            .font(.title2)
                            .keyboardType(.numberPad)
                            .onChange(of: monthlyIncome) { newValue in
                                // Format number with commas
                                let filtered = newValue.filter { "0123456789".contains($0) }
                                if let number = Int(filtered) {
                                    let formatter = NumberFormatter()
                                    formatter.numberStyle = .decimal
                                    monthlyIncome = formatter.string(from: NSNumber(value: number)) ?? filtered
                                }
                            }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("How often do you get paid?")
                        .font(.headline)
                    
                    ForEach(PaydayFrequency.allCases, id: \.self) { frequency in
                        PaydayOption(
                            frequency: frequency,
                            isSelected: paydayFrequency == frequency,
                            action: {
                                paydayFrequency = frequency
                            }
                        )
                    }
                }
            }
            .padding(.horizontal, 30)
            
            Spacer()
            
            if !monthlyIncome.isEmpty {
                VStack(spacing: 8) {
                    Text("Per paycheck amount:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text(calculatePerPaycheck())
                        .font(.title2.bold())
                        .foregroundColor(ThemeManager.cashGreen)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .padding(.horizontal, 30)
            }
            
            Spacer()
        }
    }
    
    private func calculatePerPaycheck() -> String {
        let cleanedIncome = monthlyIncome.replacingOccurrences(of: ",", with: "")
        guard let income = Double(cleanedIncome) else { return "$0" }
        
        let perPaycheck = income / paydayFrequency.multiplier
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        
        return formatter.string(from: NSNumber(value: perPaycheck)) ?? "$0"
    }
}

struct PaydayOption: View {
    let frequency: OnboardingBudgetSetupView.PaydayFrequency
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? ThemeManager.cashGreen : .secondary)
                
                Text(frequency.rawValue)
                    .foregroundColor(.primary)
                
                Spacer()
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? ThemeManager.cashGreen.opacity(0.1) : Color(.systemGray6))
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    OnboardingBudgetSetupView()
}