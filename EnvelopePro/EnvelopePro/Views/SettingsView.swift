import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authManager: AuthenticationManager
    @EnvironmentObject var themeManager: ThemeManager
    @AppStorage("enableNotifications") private var enableNotifications = true
    @AppStorage("enableHaptics") private var enableHaptics = true
    @AppStorage("enableSounds") private var enableSounds = false
    
    var body: some View {
        NavigationStack {
            List {
                // Profile Section
                Section {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.largeTitle)
                            .foregroundColor(ThemeManager.cashGreen)
                        
                        VStack(alignment: .leading) {
                            Text(authManager.currentUser?.name ?? "User")
                                .font(.headline)
                            Text(authManager.currentUser?.email ?? "")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        if authManager.currentUser?.isPremium ?? false {
                            Image(systemName: "crown.fill")
                                .foregroundColor(.yellow)
                        }
                    }
                    .padding(.vertical, 8)
                }
                
                // Subscription Section
                Section("Subscription") {
                    if authManager.currentUser?.isPremium ?? false {
                        HStack {
                            Text("Premium Member")
                            Spacer()
                            Text("Active")
                                .foregroundColor(ThemeManager.cashGreen)
                        }
                    } else {
                        Button(action: {
                            // Show paywall
                        }) {
                            HStack {
                                Image(systemName: "crown.fill")
                                    .foregroundColor(.yellow)
                                Text("Upgrade to Premium")
                                Spacer()
                                Text("$4.99/mo")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    
                    Button(action: {
                        // Restore purchases
                    }) {
                        Text("Restore Purchases")
                    }
                }
                
                // Preferences Section
                Section("Preferences") {
                    Toggle("Push Notifications", isOn: $enableNotifications)
                    Toggle("Haptic Feedback", isOn: $enableHaptics)
                    Toggle("Sound Effects", isOn: $enableSounds)
                    
                    HStack {
                        Text("Appearance")
                        Spacer()
                        Menu {
                            Button("System") {
                                themeManager.setColorScheme(nil)
                            }
                            Button("Light") {
                                themeManager.setColorScheme(.light)
                            }
                            Button("Dark") {
                                themeManager.setColorScheme(.dark)
                            }
                        } label: {
                            Text(appearanceText)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                // Referral Section
                Section("Invite Friends") {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Your Referral Code")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(authManager.currentUser?.referralCode ?? "ABC-123")
                                .font(.title3.bold())
                        }
                        
                        Spacer()
                        
                        Button(action: {
                            // Copy code
                        }) {
                            Image(systemName: "doc.on.doc")
                        }
                    }
                    
                    Button(action: {
                        // Share referral
                    }) {
                        HStack {
                            Image(systemName: "gift.fill")
                            Text("Give 30 days, Get 30 days")
                        }
                    }
                }
                
                // Support Section
                Section("Support") {
                    Link(destination: URL(string: "https://example.com/help")!) {
                        HStack {
                            Text("Help Center")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Link(destination: URL(string: "mailto:support@envelopepro.app")!) {
                        HStack {
                            Text("Contact Support")
                            Spacer()
                            Image(systemName: "envelope")
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Button(action: {
                        // Rate app
                    }) {
                        HStack {
                            Text("Rate EnvelopePro")
                            Spacer()
                            Image(systemName: "star.fill")
                                .foregroundColor(.yellow)
                        }
                    }
                }
                
                // Legal Section
                Section("Legal") {
                    Link(destination: URL(string: "https://example.com/terms")!) {
                        Text("Terms of Service")
                    }
                    
                    Link(destination: URL(string: "https://example.com/privacy")!) {
                        Text("Privacy Policy")
                    }
                }
                
                // Account Actions
                Section {
                    Button(action: {
                        authManager.signOut()
                    }) {
                        Text("Sign Out")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
    
    private var appearanceText: String {
        switch themeManager.colorScheme {
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        default:
            return "System"
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthenticationManager())
        .environmentObject(ThemeManager())
}