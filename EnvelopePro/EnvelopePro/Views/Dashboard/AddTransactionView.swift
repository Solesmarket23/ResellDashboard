import SwiftUI
import CoreData

struct AddTransactionView: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    let envelope: Envelope
    @State private var transactionType: TransactionType = .expense
    @State private var amount = ""
    @State private var merchant = ""
    @State private var notes = ""
    @State private var date = Date()
    @State private var showingCamera = false
    
    enum TransactionType: String, CaseIterable {
        case expense = "Expense"
        case income = "Income"
        
        var icon: String {
            switch self {
            case .expense: return "arrow.up.circle.fill"
            case .income: return "arrow.down.circle.fill"
            }
        }
        
        var color: Color {
            switch self {
            case .expense: return .red
            case .income: return .green
            }
        }
    }
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Transaction Type") {
                    Picker("Type", selection: $transactionType) {
                        ForEach(TransactionType.allCases, id: \.self) { type in
                            Label(type.rawValue, systemImage: type.icon)
                                .tag(type)
                        }
                    }
                    .pickerStyle(SegmentedPickerStyle())
                }
                
                Section("Details") {
                    HStack {
                        Text("Amount")
                        Spacer()
                        TextField("$0.00", text: $amount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    
                    TextField("Merchant (optional)", text: $merchant)
                    
                    TextField("Notes (optional)", text: $notes)
                    
                    DatePicker("Date", selection: $date, displayedComponents: [.date, .hourAndMinute])
                }
                
                Section("Receipt") {
                    Button(action: {
                        showingCamera = true
                    }) {
                        HStack {
                            Image(systemName: "camera.fill")
                            Text("Add Receipt Photo")
                        }
                    }
                }
            }
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveTransaction()
                    }
                    .disabled(amount.isEmpty)
                }
            }
            .sheet(isPresented: $showingCamera) {
                // Camera view for receipt scanning
                Text("Camera View")
            }
        }
    }
    
    private func saveTransaction() {
        guard let amountValue = Double(amount.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "")) else {
            return
        }
        
        let transaction = Transaction(context: viewContext)
        transaction.id = UUID()
        transaction.amount = amountValue
        transaction.type = transactionType == .income ? "income" : "expense"
        transaction.merchant = merchant.isEmpty ? nil : merchant
        transaction.notes = notes.isEmpty ? nil : notes
        transaction.date = date
        transaction.envelope = envelope
        
        // Update envelope amount
        if transactionType == .income {
            envelope.currentAmount += amountValue
        } else {
            envelope.currentAmount -= amountValue
        }
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving transaction: \(error)")
        }
    }
}

#Preview {
    if let envelope = try? PersistenceController.preview.container.viewContext.fetch(Envelope.fetchRequest()).first {
        AddTransactionView(envelope: envelope)
    } else {
        Text("No preview available")
    }
}