import SwiftUI
import CoreData

struct DashboardView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @EnvironmentObject var authManager: AuthenticationManager
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Envelope.order, ascending: true)],
        animation: .default)
    private var envelopes: FetchedResults<Envelope>
    
    @State private var showingAddEnvelope = false
    @State private var selectedEnvelope: Envelope?
    @State private var totalBudget: Double = 0
    @State private var totalAllocated: Double = 0
    
    private let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16)
    ]
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Budget Overview Card
                    BudgetOverviewCard(
                        totalBudget: totalBudget,
                        totalAllocated: totalAllocated
                    )
                    .padding(.horizontal)
                    
                    // Envelopes Grid
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(envelopes) { envelope in
                            EnvelopeCard(envelope: envelope)
                                .onTapGesture {
                                    selectedEnvelope = envelope
                                }
                        }
                        
                        // Add Envelope Card
                        if canAddMoreEnvelopes {
                            AddEnvelopeCard()
                                .onTapGesture {
                                    showingAddEnvelope = true
                                }
                        }
                    }
                    .padding(.horizontal)
                    
                    // Daily Motivation
                    DailyMotivationCard()
                        .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle("My Envelopes")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        // Show stats
                    }) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                    }
                }
            }
            .sheet(isPresented: $showingAddEnvelope) {
                AddEnvelopeView()
            }
            .sheet(item: $selectedEnvelope) { envelope in
                EnvelopeDetailView(envelope: envelope)
            }
            .onAppear {
                calculateTotals()
            }
        }
    }
    
    private var canAddMoreEnvelopes: Bool {
        let isPremium = authManager.currentUser?.isPremium ?? false
        return isPremium || envelopes.count < 3
    }
    
    private func calculateTotals() {
        totalBudget = envelopes.reduce(0) { $0 + $1.targetAmount }
        totalAllocated = envelopes.reduce(0) { $0 + $1.currentAmount }
    }
}

struct BudgetOverviewCard: View {
    let totalBudget: Double
    let totalAllocated: Double
    
    private var percentageAllocated: Double {
        guard totalBudget > 0 else { return 0 }
        return (totalAllocated / totalBudget) * 100
    }
    
    var body: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Total Budget")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(totalBudget.currencyFormat)
                        .font(.title2.bold())
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Allocated")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(totalAllocated.currencyFormat)
                        .font(.title2.bold())
                        .foregroundColor(ThemeManager.cashGreen)
                }
            }
            
            // Progress Bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.systemGray5))
                        .frame(height: 8)
                    
                    RoundedRectangle(cornerRadius: 8)
                        .fill(ThemeManager.cashGreen)
                        .frame(width: geometry.size.width * (percentageAllocated / 100), height: 8)
                }
            }
            .frame(height: 8)
            
            Text("\(Int(percentageAllocated))% of budget allocated")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.05), radius: 10)
    }
}

struct EnvelopeCard: View {
    let envelope: Envelope
    
    private var progressPercentage: Double {
        guard envelope.targetAmount > 0 else { return 0 }
        return (envelope.currentAmount / envelope.targetAmount) * 100
    }
    
    private var isOverBudget: Bool {
        envelope.currentAmount > envelope.targetAmount
    }
    
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: envelope.icon ?? "envelope.fill")
                    .font(.title2)
                    .foregroundColor(Color.envelopeColor(named: envelope.color ?? "gray"))
                
                Spacer()
                
                if isOverBudget {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundColor(.orange)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(envelope.name ?? "Envelope")
                    .font(.headline)
                    .lineLimit(1)
                
                Text(envelope.currentAmount.currencyFormat)
                    .font(.title3.bold())
                
                Text("of \(envelope.targetAmount.currencyFormat)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            // Progress Ring
            ZStack {
                Circle()
                    .stroke(Color(.systemGray5), lineWidth: 6)
                
                Circle()
                    .trim(from: 0, to: min(progressPercentage / 100, 1))
                    .stroke(
                        isOverBudget ? Color.orange : Color.envelopeColor(named: envelope.color ?? "gray"),
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                
                Text("\(Int(progressPercentage))%")
                    .font(.caption2.bold())
            }
            .frame(width: 60, height: 60)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }
}

struct AddEnvelopeCard: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "plus.circle.fill")
                .font(.largeTitle)
                .foregroundColor(ThemeManager.cashGreen)
            
            Text("Add Envelope")
                .font(.headline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [10]))
                .foregroundColor(Color(.systemGray4))
        )
    }
}

struct DailyMotivationCard: View {
    private let motivations = [
        "Every dollar saved is a step toward your dreams!",
        "Small steps today, big wins tomorrow!",
        "You're crushing your budget goals!",
        "Financial freedom starts with one envelope at a time",
        "Keep going! Your future self will thank you"
    ]
    
    private var todaysMotivation: String {
        let dayOfYear = Calendar.current.ordinateOfDay(for: Date()) ?? 1
        return motivations[dayOfYear % motivations.count]
    }
    
    var body: some View {
        HStack {
            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundColor(.yellow)
            
            VStack(alignment: .leading, spacing: 4) {
                Text("Daily Motivation")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Text(todaysMotivation)
                    .font(.callout)
                    .foregroundColor(.primary)
            }
            
            Spacer()
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

extension Double {
    var currencyFormat: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: self)) ?? "$0"
    }
}

#Preview {
    DashboardView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .environmentObject(AuthenticationManager())
}