import SwiftUI

enum NeonTheme {
  // Mirrors the web app “Neon” palette (emerald → cyan accents, dark gradient background).
  static let backgroundTop = Color(red: 17/255, green: 24/255, blue: 39/255)   // gray-900
  static let backgroundMid = Color(red: 31/255, green: 41/255, blue: 55/255)   // gray-800
  static let backgroundBottom = Color(red: 15/255, green: 23/255, blue: 42/255) // slate-900

  static let card = Color.white.opacity(0.06)
  static let border = Color.cyan.opacity(0.30)

  static let textPrimary = Color.white
  static let textSecondary = Color.white.opacity(0.75)

  static let accentCyan = Color.cyan
  static let accentEmerald = Color(red: 16/255, green: 185/255, blue: 129/255) // emerald-500

  static let primaryGradient = LinearGradient(
    colors: [accentEmerald, accentCyan],
    startPoint: .leading,
    endPoint: .trailing
  )

  static let backgroundGradient = LinearGradient(
    colors: [backgroundTop, backgroundMid, backgroundBottom],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
  )
}

struct NeonScreen<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient.ignoresSafeArea()
      content
    }
    .preferredColorScheme(.dark)
  }
}

struct NeonCard<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(16)
      .background(NeonTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(NeonTheme.border, lineWidth: 1)
      )
  }
}

struct NeonPrimaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .frame(maxWidth: .infinity)
      .padding(.vertical, 14)
      .background(NeonTheme.primaryGradient.opacity(configuration.isPressed ? 0.85 : 1.0))
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      .shadow(color: NeonTheme.accentEmerald.opacity(0.25), radius: 18, x: 0, y: 8)
      .scaleEffect(configuration.isPressed ? 0.985 : 1.0)
  }
}

