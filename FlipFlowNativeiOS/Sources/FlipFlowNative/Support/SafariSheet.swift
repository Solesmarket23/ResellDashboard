import SwiftUI

struct IdentifiableURL: Identifiable {
  let id = UUID()
  let url: URL
}

struct SafariSheet: View {
  let url: URL

  var body: some View {
    SafariView(url: url)
      .presentationDetents([.fraction(0.95), .large])
      .presentationDragIndicator(.visible)
  }
}

