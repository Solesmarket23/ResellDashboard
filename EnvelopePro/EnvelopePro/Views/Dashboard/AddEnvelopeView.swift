import SwiftUI
import CoreData

struct AddEnvelopeView: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @EnvironmentObject var authManager: AuthenticationManager
    
    @State private var envelopeName = ""
    @State private var targetAmount = ""
    @State private var selectedColor = "green"
    @State private var selectedIcon = "envelope.fill"
    
    private let colors = ["red", "blue", "green", "orange", "purple", "pink", "yellow", "teal", "indigo"]
    
    private let icons = [
        "envelope.fill", "cart.fill", "house.fill", "car.fill",
        "heart.fill", "star.fill", "gift.fill", "dollarsign.circle.fill",
        "creditcard.fill", "bag.fill", "fork.knife", "gamecontroller.fill"
    ]
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Envelope Details") {
                    TextField("Envelope Name", text: $envelopeName)
                    
                    HStack {
                        Text("Target Amount")
                        Spacer()
                        TextField("$0", text: $targetAmount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                }
                
                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 16) {
                        ForEach(colors, id: \.self) { color in
                            Circle()
                                .fill(Color.envelopeColor(named: color))
                                .frame(width: 40, height: 40)
                                .overlay(
                                    Circle()
                                        .stroke(Color.primary, lineWidth: selectedColor == color ? 3 : 0)
                                )
                                .onTapGesture {
                                    selectedColor = color
                                }
                        }
                    }
                    .padding(.vertical, 8)
                }
                
                Section("Icon") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 16) {
                        ForEach(icons, id: \.self) { icon in
                            Image(systemName: icon)
                                .font(.title2)
                                .foregroundColor(selectedIcon == icon ? Color.envelopeColor(named: selectedColor) : .secondary)
                                .frame(width: 50, height: 50)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color(.systemGray6))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(Color.primary, lineWidth: selectedIcon == icon ? 2 : 0)
                                        )
                                )
                                .onTapGesture {
                                    selectedIcon = icon
                                }
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
            .navigationTitle("New Envelope")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveEnvelope()
                    }
                    .disabled(envelopeName.isEmpty || targetAmount.isEmpty)
                }
            }
        }
    }
    
    private func saveEnvelope() {
        guard let user = authManager.currentUser,
              let amount = Double(targetAmount.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "")) else {
            return
        }
        
        let envelope = Envelope(context: viewContext)
        envelope.id = UUID()
        envelope.name = envelopeName
        envelope.targetAmount = amount
        envelope.currentAmount = 0
        envelope.color = selectedColor
        envelope.icon = selectedIcon
        envelope.createdAt = Date()
        envelope.isActive = true
        envelope.user = user
        
        // Set order based on existing envelopes
        let request: NSFetchRequest<Envelope> = Envelope.fetchRequest()
        request.predicate = NSPredicate(format: "user == %@", user)
        if let existingEnvelopes = try? viewContext.fetch(request) {
            envelope.order = Int32(existingEnvelopes.count)
        }
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving envelope: \(error)")
        }
    }
}

#Preview {
    AddEnvelopeView()
        .environmentObject(AuthenticationManager())
}