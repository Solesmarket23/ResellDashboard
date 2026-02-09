import SwiftUI

/// EOD: batch of shipped orders; scan tracking numbers; show which are missing from scans.
struct ReconciliationView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      NeonCard {
        VStack(alignment: .leading, spacing: 14) {
          HStack(spacing: 10) {
            Image(systemName: "checklist")
              .font(.system(size: 24, weight: .semibold))
              .foregroundStyle(NeonTheme.accentCyan)
            Text("Reconciliation")
              .font(.headline.weight(.semibold))
              .foregroundStyle(NeonTheme.textPrimary)
          }
          Text("Scan each package’s tracking number at the end of the day. The app will compare scanned tracking numbers to the batch you shipped and show any missing.")
            .font(.subheadline)
            .foregroundStyle(NeonTheme.textSecondary)
          Text("Coming soon: select a batch (e.g. shipped today), then scan tracking numbers to see which package is missing.")
            .font(.caption)
            .foregroundStyle(NeonTheme.textSecondary)
        }
      }
      .padding(.horizontal, 16)
    }
    .navigationTitle("Reconciliation")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
  }
}
