import SwiftUI

struct OnboardingTemplateSelectionView: View {
    @State private var selectedTemplate: BudgetTemplate = .fiftyThirtyTwenty
    
    enum BudgetTemplate: String, CaseIterable {
        case fiftyThirtyTwenty = "50/30/20 Rule"
        case daveRamsey = "Dave Ramsey"
        case zeroBase = "Zero-Based"
        case custom = "Custom"
        
        var description: String {
            switch self {
            case .fiftyThirtyTwenty:
                return "50% needs, 30% wants, 20% savings"
            case .daveRamsey:
                return "Baby steps to financial freedom"
            case .zeroBase:
                return "Every dollar has a purpose"
            case .custom:
                return "Create your own categories"
            }
        }
        
        var icon: String {
            switch self {
            case .fiftyThirtyTwenty:
                return "chart.pie.fill"
            case .daveRamsey:
                return "graduationcap.fill"
            case .zeroBase:
                return "equal.circle.fill"
            case .custom:
                return "slider.horizontal.3"
            }
        }
    }
    
    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 12) {
                Text("Choose Your Method")
                    .font(.largeTitle.bold())
                
                Text("Select a budgeting template to get started")
                    .font(.body)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 40)
            
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(BudgetTemplate.allCases, id: \.self) { template in
                        TemplateCard(
                            template: template,
                            isSelected: selectedTemplate == template,
                            action: {
                                selectedTemplate = template
                            }
                        )
                    }
                }
                .padding(.horizontal, 20)
            }
            
            Spacer()
        }
    }
}

struct TemplateCard: View {
    let template: OnboardingTemplateSelectionView.BudgetTemplate
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(isSelected ? ThemeManager.cashGreen : Color(.systemGray5))
                        .frame(width: 50, height: 50)
                    
                    Image(systemName: template.icon)
                        .font(.title2)
                        .foregroundColor(isSelected ? .white : .secondary)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(template.rawValue)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text(template.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(ThemeManager.cashGreen)
                }
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
    OnboardingTemplateSelectionView()
}