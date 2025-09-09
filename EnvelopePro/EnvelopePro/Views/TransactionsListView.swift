import SwiftUI
import CoreData

struct TransactionsListView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Transaction.date, ascending: false)],
        animation: .default)
    private var transactions: FetchedResults<Transaction>
    
    @State private var searchText = ""
    @State private var selectedFilter: TransactionFilter = .all
    
    enum TransactionFilter: String, CaseIterable {
        case all = "All"
        case income = "Income"
        case expense = "Expenses"
        
        var predicate: NSPredicate? {
            switch self {
            case .all:
                return nil
            case .income:
                return NSPredicate(format: "type == %@", "income")
            case .expense:
                return NSPredicate(format: "type == %@", "expense")
            }
        }
    }
    
    var body: some View {
        NavigationStack {
            List {
                // Filter Picker
                Picker("Filter", selection: $selectedFilter) {
                    ForEach(TransactionFilter.allCases, id: \.self) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(SegmentedPickerStyle())
                .padding(.vertical, 8)
                
                // Transactions grouped by date
                ForEach(groupedTransactions, id: \.key) { group in
                    Section(header: Text(group.key)) {
                        ForEach(group.value) { transaction in
                            TransactionListRow(transaction: transaction)
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search transactions")
            .navigationTitle("Transactions")
        }
    }
    
    private var filteredTransactions: [Transaction] {
        var filtered = Array(transactions)
        
        // Apply type filter
        if let predicate = selectedFilter.predicate {
            filtered = filtered.filter { predicate.evaluate(with: $0) }
        }
        
        // Apply search filter
        if !searchText.isEmpty {
            filtered = filtered.filter { transaction in
                transaction.merchant?.localizedCaseInsensitiveContains(searchText) ?? false ||
                transaction.notes?.localizedCaseInsensitiveContains(searchText) ?? false
            }
        }
        
        return filtered
    }
    
    private var groupedTransactions: [(key: String, value: [Transaction])] {
        let grouped = Dictionary(grouping: filteredTransactions) { transaction -> String in
            guard let date = transaction.date else { return "Unknown" }
            
            let formatter = DateFormatter()
            if Calendar.current.isDateInToday(date) {
                return "Today"
            } else if Calendar.current.isDateInYesterday(date) {
                return "Yesterday"
            } else {
                formatter.dateFormat = "EEEE, MMM d"
                return formatter.string(from: date)
            }
        }
        
        return grouped.sorted { $0.value.first?.date ?? Date() > $1.value.first?.date ?? Date() }
    }
}

struct TransactionListRow: View {
    let transaction: Transaction
    
    var body: some View {
        HStack {
            // Icon
            ZStack {
                Circle()
                    .fill(Color(.systemGray6))
                    .frame(width: 40, height: 40)
                
                Image(systemName: transaction.envelope?.icon ?? "dollarsign")
                    .foregroundColor(Color.envelopeColor(named: transaction.envelope?.color ?? "gray"))
            }
            
            // Details
            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.merchant ?? "Transaction")
                    .font(.headline)
                
                HStack {
                    Text(transaction.envelope?.name ?? "No envelope")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    if let notes = transaction.notes, !notes.isEmpty {
                        Text("• \(notes)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            
            Spacer()
            
            // Amount
            VStack(alignment: .trailing, spacing: 4) {
                Text(transaction.type == "income" ? "+\(transaction.amount.currencyFormat)" : "-\(transaction.amount.currencyFormat)")
                    .font(.headline)
                    .foregroundColor(transaction.type == "income" ? .green : .primary)
                
                if let date = transaction.date {
                    Text(date.formatted(date: .omitted, time: .shortened))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    TransactionsListView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}