import SwiftUI
import CoreData

struct AchievementsView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @EnvironmentObject var authManager: AuthenticationManager
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Achievement.dateEarned, ascending: false)],
        animation: .default)
    private var achievements: FetchedResults<Achievement>
    
    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Stats Overview
                    StatsOverviewCard()
                        .padding(.horizontal)
                    
                    // Achievements Grid
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Achievements")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        LazyVGrid(columns: columns, spacing: 20) {
                            ForEach(AchievementType.allCases, id: \.self) { type in
                                AchievementBadge(
                                    type: type,
                                    achievement: achievements.first { $0.achievementType == type.rawValue }
                                )
                            }
                        }
                        .padding(.horizontal)
                    }
                    
                    // Share Button
                    Button(action: shareAchievements) {
                        HStack {
                            Image(systemName: "square.and.arrow.up")
                            Text("Share My Progress")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(ThemeManager.primaryGradient)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    .padding(.bottom)
                }
            }
            .navigationTitle("Achievements")
        }
    }
    
    private func shareAchievements() {
        // Implement sharing functionality
    }
}

struct StatsOverviewCard: View {
    @EnvironmentObject var authManager: AuthenticationManager
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Your Progress")
                .font(.headline)
            
            HStack(spacing: 30) {
                StatItem(
                    value: "\(authManager.currentUser?.currentStreak ?? 0)",
                    label: "Day Streak",
                    icon: "flame.fill",
                    color: .orange
                )
                
                StatItem(
                    value: "\(authManager.currentUser?.longestStreak ?? 0)",
                    label: "Best Streak",
                    icon: "star.fill",
                    color: .yellow
                )
                
                StatItem(
                    value: calculateTotalSaved(),
                    label: "Total Saved",
                    icon: "banknote.fill",
                    color: ThemeManager.cashGreen
                )
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }
    
    private func calculateTotalSaved() -> String {
        // Calculate from transactions
        return "$0"
    }
}

struct StatItem: View {
    let value: String
    let label: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
            
            Text(value)
                .font(.title3.bold())
            
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

enum AchievementType: String, CaseIterable {
    case firstEnvelope = "First Envelope"
    case weekStreak = "Week Warrior"
    case monthStreak = "Monthly Master"
    case savingsGoal = "Savings Superstar"
    case budgetMaster = "Budget Master"
    case referralChamp = "Referral Champion"
    
    var icon: String {
        switch self {
        case .firstEnvelope: return "envelope.fill"
        case .weekStreak: return "calendar"
        case .monthStreak: return "calendar.badge.plus"
        case .savingsGoal: return "dollarsign.circle.fill"
        case .budgetMaster: return "chart.line.uptrend.xyaxis"
        case .referralChamp: return "person.2.fill"
        }
    }
    
    var description: String {
        switch self {
        case .firstEnvelope: return "Created your first envelope"
        case .weekStreak: return "Used the app for 7 days"
        case .monthStreak: return "30 day streak"
        case .savingsGoal: return "Saved your first $1000"
        case .budgetMaster: return "Stay under budget for 3 months"
        case .referralChamp: return "Referred 5 friends"
        }
    }
}

struct AchievementBadge: View {
    let type: AchievementType
    let achievement: Achievement?
    
    private var isUnlocked: Bool {
        achievement?.isUnlocked ?? false
    }
    
    private var progress: Double {
        achievement?.progress ?? 0
    }
    
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(Color(.systemGray5), lineWidth: 3)
                    .frame(width: 80, height: 80)
                
                if isUnlocked {
                    Circle()
                        .fill(ThemeManager.primaryGradient)
                        .frame(width: 80, height: 80)
                } else if progress > 0 {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(ThemeManager.cashGreen, lineWidth: 3)
                        .frame(width: 80, height: 80)
                        .rotationEffect(.degrees(-90))
                }
                
                Image(systemName: type.icon)
                    .font(.title2)
                    .foregroundColor(isUnlocked ? .white : .secondary)
            }
            
            Text(type.rawValue)
                .font(.caption2)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .foregroundColor(isUnlocked ? .primary : .secondary)
        }
    }
}

#Preview {
    AchievementsView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .environmentObject(AuthenticationManager())
}