import SwiftUI

class ThemeManager: ObservableObject {
    @Published var colorScheme: ColorScheme? = nil
    @Published var primaryGradient: LinearGradient
    @Published var accentColor: Color
    
    static let cashGreen = Color(red: 0.0, green: 0.82, blue: 0.4)
    static let venmoBlue = Color(red: 0.24, green: 0.58, blue: 0.95)
    
    init() {
        self.primaryGradient = LinearGradient(
            colors: [Self.cashGreen, Self.venmoBlue],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        self.accentColor = Self.cashGreen
        
        loadThemePreferences()
    }
    
    private func loadThemePreferences() {
        if let savedScheme = UserDefaults.standard.string(forKey: "preferredColorScheme") {
            switch savedScheme {
            case "dark":
                colorScheme = .dark
            case "light":
                colorScheme = .light
            default:
                colorScheme = nil
            }
        }
    }
    
    func setColorScheme(_ scheme: ColorScheme?) {
        colorScheme = scheme
        
        let schemeString: String
        switch scheme {
        case .dark:
            schemeString = "dark"
        case .light:
            schemeString = "light"
        default:
            schemeString = "system"
        }
        
        UserDefaults.standard.set(schemeString, forKey: "preferredColorScheme")
    }
}

extension Color {
    static let envelopeColors: [String: Color] = [
        "red": .red,
        "blue": .blue,
        "green": .green,
        "orange": .orange,
        "purple": .purple,
        "pink": .pink,
        "yellow": .yellow,
        "teal": .teal,
        "indigo": .indigo
    ]
    
    static func envelopeColor(named name: String) -> Color {
        envelopeColors[name] ?? .gray
    }
}