import SwiftUI
import CoreData

struct PaydayRitualView: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @EnvironmentObject var authManager: AuthenticationManager
    
    @State private var paycheckAmount = ""
    @State private var currentStep = 0
    @State private var allocations: [EnvelopeAllocation] = []
    @State private var showingCelebration = false
    
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Envelope.order, ascending: true)],
        predicate: NSPredicate(format: "isActive == YES"),
        animation: .default)
    private var envelopes: FetchedResults<Envelope>
    
    struct EnvelopeAllocation: Identifiable {
        let id = UUID()
        let envelope: Envelope
        var amount: Double
        var percentage: Double
    }
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                ThemeManager.primaryGradient
                    .opacity(0.1)
                    .ignoresSafeArea()
                
                VStack {
                    // Progress indicator
                    ProgressView(value: Double(currentStep), total: Double(envelopes.count + 1))
                        .progressViewStyle(LinearProgressViewStyle(tint: ThemeManager.cashGreen))
                        .padding()
                    
                    // Content based on step
                    Group {
                        if currentStep == 0 {
                            PaydayAmountView(paycheckAmount: $paycheckAmount)
                        } else if currentStep <= envelopes.count {
                            if let envelope = Array(envelopes)[safe: currentStep - 1] {
                                EnvelopeAllocationView(
                                    envelope: envelope,
                                    totalAmount: Double(paycheckAmount.replacingOccurrences(of: ",", with: "")) ?? 0,
                                    allocation: binding(for: envelope)
                                )
                            }
                        } else {
                            PaydayReviewView(
                                allocations: allocations,
                                totalAmount: Double(paycheckAmount.replacingOccurrences(of: ",", with: "")) ?? 0
                            )
                        }
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
                    
                    Spacer()
                    
                    // Navigation buttons
                    HStack(spacing: 20) {
                        if currentStep > 0 {
                            Button(action: {
                                withAnimation(.spring()) {
                                    currentStep -= 1
                                }
                            }) {
                                Text("Back")
                                    .fontWeight(.semibold)
                                    .foregroundColor(.secondary)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(Color(.systemGray5))
                                    .cornerRadius(12)
                            }
                        }
                        
                        Button(action: {
                            if currentStep == envelopes.count + 1 {
                                completePayday()
                            } else {
                                withAnimation(.spring()) {
                                    currentStep += 1
                                }
                            }
                        }) {
                            Text(currentStep == envelopes.count + 1 ? "Complete Payday!" : "Next")
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(ThemeManager.cashGreen)
                                .cornerRadius(12)
                        }
                        .disabled(currentStep == 0 && paycheckAmount.isEmpty)
                    }
                    .padding()
                }
            }
            .navigationTitle("Payday Ritual")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .fullScreenCover(isPresented: $showingCelebration) {
                PaydayCelebrationView(
                    totalAllocated: allocations.reduce(0) { $0 + $1.amount }
                ) {
                    dismiss()
                }
            }
        }
        .onAppear {
            setupAllocations()
        }
    }
    
    private func setupAllocations() {
        allocations = envelopes.map { envelope in
            EnvelopeAllocation(
                envelope: envelope,
                amount: 0,
                percentage: 0
            )
        }
    }
    
    private func binding(for envelope: Envelope) -> Binding<EnvelopeAllocation> {
        guard let index = allocations.firstIndex(where: { $0.envelope.id == envelope.id }) else {
            return .constant(EnvelopeAllocation(envelope: envelope, amount: 0, percentage: 0))
        }
        
        return $allocations[index]
    }
    
    private func completePayday() {
        // Save allocations
        for allocation in allocations {
            if allocation.amount > 0 {
                // Create income transaction
                let transaction = Transaction(context: viewContext)
                transaction.id = UUID()
                transaction.amount = allocation.amount
                transaction.type = "income"
                transaction.merchant = "Payday Allocation"
                transaction.date = Date()
                transaction.envelope = allocation.envelope
                
                // Update envelope amount
                allocation.envelope.currentAmount += allocation.amount
                allocation.envelope.lastRefillDate = Date()
            }
        }
        
        // Update user streak
        if let user = authManager.currentUser {
            user.lastActiveDate = Date()
            user.currentStreak += 1
            if user.currentStreak > user.longestStreak {
                user.longestStreak = user.currentStreak
            }
        }
        
        do {
            try viewContext.save()
            showingCelebration = true
        } catch {
            print("Error saving payday: \(error)")
        }
    }
}

struct PaydayAmountView: View {
    @Binding var paycheckAmount: String
    
    var body: some View {
        VStack(spacing: 30) {
            VStack(spacing: 16) {
                Image(systemName: "dollarsign.circle.fill")
                    .font(.system(size: 80))
                    .foregroundColor(ThemeManager.cashGreen)
                
                Text("How much is your paycheck?")
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                
                Text("Let's allocate your money into envelopes")
                    .font(.body)
                    .foregroundColor(.secondary)
            }
            
            HStack {
                Text("$")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
                
                TextField("0", text: $paycheckAmount)
                    .font(.largeTitle)
                    .keyboardType(.numberPad)
                    .onChange(of: paycheckAmount) { newValue in
                        // Format with commas
                        let filtered = newValue.filter { "0123456789".contains($0) }
                        if let number = Int(filtered) {
                            let formatter = NumberFormatter()
                            formatter.numberStyle = .decimal
                            paycheckAmount = formatter.string(from: NSNumber(value: number)) ?? filtered
                        }
                    }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(16)
            .padding(.horizontal, 40)
        }
        .padding()
    }
}

struct EnvelopeAllocationView: View {
    let envelope: Envelope
    let totalAmount: Double
    @Binding var allocation: PaydayRitualView.EnvelopeAllocation
    
    @State private var allocationMethod: AllocationMethod = .percentage
    @State private var percentageText = ""
    @State private var amountText = ""
    
    enum AllocationMethod {
        case percentage
        case amount
    }
    
    var body: some View {
        VStack(spacing: 30) {
            // Envelope Header
            VStack(spacing: 16) {
                Image(systemName: envelope.icon ?? "envelope.fill")
                    .font(.system(size: 60))
                    .foregroundColor(Color.envelopeColor(named: envelope.color ?? "gray"))
                
                Text(envelope.name ?? "Envelope")
                    .font(.largeTitle.bold())
                
                HStack {
                    VStack(alignment: .leading) {
                        Text("Current")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(envelope.currentAmount.currencyFormat)
                            .font(.headline)
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing) {
                        Text("Target")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(envelope.targetAmount.currencyFormat)
                            .font(.headline)
                    }
                }
                .padding(.horizontal, 60)
            }
            
            // Allocation Controls
            VStack(spacing: 20) {
                Picker("Method", selection: $allocationMethod) {
                    Text("Percentage").tag(AllocationMethod.percentage)
                    Text("Amount").tag(AllocationMethod.amount)
                }
                .pickerStyle(SegmentedPickerStyle())
                .padding(.horizontal, 40)
                
                if allocationMethod == .percentage {
                    VStack(spacing: 12) {
                        HStack {
                            TextField("0", text: $percentageText)
                                .keyboardType(.numberPad)
                                .font(.title)
                                .multilineTextAlignment(.center)
                                .frame(width: 80)
                                .onChange(of: percentageText) { newValue in
                                    if let percentage = Double(newValue) {
                                        let clampedPercentage = min(100, max(0, percentage))
                                        allocation.percentage = clampedPercentage
                                        allocation.amount = totalAmount * (clampedPercentage / 100)
                                    }
                                }
                            
                            Text("%")
                                .font(.title)
                                .foregroundColor(.secondary)
                        }
                        
                        Text("= \((totalAmount * (Double(percentageText) ?? 0) / 100).currencyFormat)")
                            .font(.headline)
                            .foregroundColor(ThemeManager.cashGreen)
                    }
                } else {
                    HStack {
                        Text("$")
                            .font(.title)
                            .foregroundColor(.secondary)
                        
                        TextField("0", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.title)
                            .multilineTextAlignment(.center)
                            .onChange(of: amountText) { newValue in
                                if let amount = Double(newValue.replacingOccurrences(of: ",", with: "")) {
                                    allocation.amount = min(totalAmount, amount)
                                    allocation.percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0
                                }
                            }
                    }
                }
                
                // Quick percentage buttons
                HStack(spacing: 16) {
                    ForEach([10, 20, 30, 50], id: \.self) { percentage in
                        Button(action: {
                            percentageText = "\(percentage)"
                            allocation.percentage = Double(percentage)
                            allocation.amount = totalAmount * (Double(percentage) / 100)
                        }) {
                            Text("\(percentage)%")
                                .font(.callout)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.envelopeColor(named: envelope.color ?? "gray"))
                                .cornerRadius(8)
                        }
                    }
                }
                .padding(.horizontal, 40)
            }
        }
        .padding()
        .onAppear {
            if allocation.percentage > 0 {
                percentageText = "\(Int(allocation.percentage))"
            }
            if allocation.amount > 0 {
                amountText = "\(Int(allocation.amount))"
            }
        }
    }
}

// Helper extension for safe array access
extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

#Preview {
    PaydayRitualView()
        .environmentObject(AuthenticationManager())
}