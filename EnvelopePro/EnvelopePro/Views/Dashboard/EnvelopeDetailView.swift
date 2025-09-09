import SwiftUI
import CoreData

struct EnvelopeDetailView: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    let envelope: Envelope
    @State private var showingAddTransaction = false
    @State private var transactions: [Transaction] = []
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Envelope Summary Card
                    EnvelopeSummaryCard(envelope: envelope)
                    
                    // Quick Actions
                    HStack(spacing: 16) {
                        QuickActionButton(
                            title: "Add Money",
                            icon: "plus.circle.fill",
                            color: ThemeManager.cashGreen
                        ) {
                            // Add money action
                        }
                        
                        QuickActionButton(
                            title: "Spend",
                            icon: "minus.circle.fill",
                            color: .red
                        ) {
                            showingAddTransaction = true
                        }
                    }
                    .padding(.horizontal)
                    
                    // Transactions List
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Recent Transactions")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        if transactions.isEmpty {
                            EmptyTransactionsView()
                                .padding(.horizontal)
                        } else {
                            ForEach(transactions) { transaction in
                                TransactionRow(transaction: transaction)
                                    .padding(.horizontal)
                            }
                        }
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle(envelope.name ?? "Envelope")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(action: {
                            // Edit envelope
                        }) {
                            Label("Edit Envelope", systemImage: "pencil")
                        }
                        
                        Button(action: {
                            // Delete envelope
                        }, role: .destructive) {
                            Label("Delete Envelope", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingAddTransaction) {
                AddTransactionView(envelope: envelope)
            }
            .onAppear {
                loadTransactions()
            }
        }
    }
    
    private func loadTransactions() {
        let request: NSFetchRequest<Transaction> = Transaction.fetchRequest()
        request.predicate = NSPredicate(format: "envelope == %@", envelope)
        request.sortDescriptors = [NSSortDescriptor(keyPath: \Transaction.date, ascending: false)]
        request.fetchLimit = 10
        
        do {
            transactions = try viewContext.fetch(request)
        } catch {
            print("Error fetching transactions: \(error)")
        }
    }
}

struct EnvelopeSummaryCard: View {
    let envelope: Envelope
    
    private var progressPercentage: Double {
        guard envelope.targetAmount > 0 else { return 0 }
        return (envelope.currentAmount / envelope.targetAmount) * 100
    }
    
    var body: some View {
        VStack(spacing: 20) {
            // Progress Circle
            ZStack {
                Circle()
                    .stroke(Color(.systemGray5), lineWidth: 12)
                    .frame(width: 150, height: 150)
                
                Circle()
                    .trim(from: 0, to: min(progressPercentage / 100, 1))
                    .stroke(
                        Color.envelopeColor(named: envelope.color ?? "gray"),
                        style: StrokeStyle(lineWidth: 12, lineCap: .round)
                    )
                    .frame(width: 150, height: 150)
                    .rotationEffect(.degrees(-90))
                
                VStack(spacing: 8) {
                    Image(systemName: envelope.icon ?? "envelope.fill")
                        .font(.largeTitle)
                        .foregroundColor(Color.envelopeColor(named: envelope.color ?? "gray"))
                    
                    Text("\(Int(progressPercentage))%")
                        .font(.title2.bold())
                }
            }
            
            // Amount Details
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Current")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(envelope.currentAmount.currencyFormat)
                            .font(.title3.bold())
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("Target")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(envelope.targetAmount.currencyFormat)
                            .font(.title3.bold())
                    }
                }
                
                HStack {
                    Text("Remaining")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text((envelope.targetAmount - envelope.currentAmount).currencyFormat)
                        .font(.headline)
                        .foregroundColor(ThemeManager.cashGreen)
                }
            }
            .padding(.horizontal, 30)
        }
        .padding(.vertical, 30)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(20)
        .padding(.horizontal)
    }
}

struct QuickActionButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                Text(title)
                    .fontWeight(.semibold)
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(color)
            .cornerRadius(12)
        }
    }
}

struct EmptyTransactionsView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "list.bullet.rectangle")
                .font(.largeTitle)
                .foregroundColor(.secondary)
            
            Text("No transactions yet")
                .font(.headline)
                .foregroundColor(.secondary)
            
            Text("Add money or record spending to see your history")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct TransactionRow: View {
    let transaction: Transaction
    
    var body: some View {
        HStack {
            Image(systemName: transaction.type == "income" ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                .foregroundColor(transaction.type == "income" ? .green : .red)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.merchant ?? "Transaction")
                    .font(.headline)
                
                Text(transaction.date?.formatted(date: .abbreviated, time: .shortened) ?? "")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Text(transaction.amount.currencyFormat)
                .font(.headline)
                .foregroundColor(transaction.type == "income" ? .green : .red)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(10)
    }
}

#Preview {
    if let envelope = try? PersistenceController.preview.container.viewContext.fetch(Envelope.fetchRequest()).first {
        EnvelopeDetailView(envelope: envelope)
    } else {
        Text("No preview available")
    }
}