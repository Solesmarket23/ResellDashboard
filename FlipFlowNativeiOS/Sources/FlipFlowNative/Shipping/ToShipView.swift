import SwiftUI

/// List of orders to ship; mark as shipped / undo. Data from StockX + local marked state.
struct ToShipView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  @State private var markedOrderNumbers: [String] = []
  @State private var markedAt: [String: Double] = [:]
  @State private var isLoading = false
  @State private var bannerMessage: String?
  @State private var orderNumberToUndo: String?

  private let baseURL = URL(string: "https://www.solesmarket.com")!

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      content
    }
    .navigationTitle("To Ship")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .task {
      await loadMarked()
    }
    .alert("Undo mark as shipped?", isPresented: Binding(
      get: { orderNumberToUndo != nil },
      set: { if !$0 { orderNumberToUndo = nil } }
    )) {
      Button("Cancel", role: .cancel) {
        orderNumberToUndo = nil
      }
      Button("Undo") {
        if let ord = orderNumberToUndo {
          Task { await undo(orderNumber: ord) }
        }
        orderNumberToUndo = nil
      }
    } message: {
      if let ord = orderNumberToUndo {
        Text("Remove order \(ord) from your shipped list?")
      }
    }
  }

  private var content: some View {
    VStack(spacing: 16) {
      if let msg = bannerMessage {
        Text(msg)
          .font(.subheadline)
          .foregroundStyle(NeonTheme.accentCyan)
          .padding(.horizontal)
      }
      if isLoading {
        ProgressView()
          .tint(.white)
        Spacer()
      } else if markedOrderNumbers.isEmpty {
        NeonCard {
          VStack(spacing: 10) {
            Image(systemName: "shippingbox")
              .font(.system(size: 28, weight: .semibold))
              .foregroundStyle(NeonTheme.accentCyan.opacity(0.9))
            Text("No orders marked as shipped yet.")
              .font(.headline.weight(.semibold))
              .foregroundStyle(NeonTheme.textPrimary)
            Text("Mark orders as shipped from the list when you ship them; use Print shipping label to get labels.")
              .font(.caption)
              .foregroundStyle(NeonTheme.textSecondary)
              .multilineTextAlignment(.center)
          }
          .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 16)
        Spacer()
      } else {
        ScrollView {
          LazyVStack(spacing: 12) {
            ForEach(markedOrderNumbers, id: \.self) { orderNumber in
              NeonCard {
                HStack(alignment: .center, spacing: 12) {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(orderNumber)
                      .font(.headline.weight(.semibold))
                      .foregroundStyle(NeonTheme.textPrimary)
                    if let ts = markedAt[orderNumber] {
                      Text(formatDate(ts))
                        .font(.caption)
                        .foregroundStyle(NeonTheme.textSecondary)
                    }
                  }
                  Spacer()
                  Button("Undo") {
                    orderNumberToUndo = orderNumber
                  }
                  .font(.subheadline.weight(.medium))
                  .foregroundStyle(NeonTheme.accentCyan)
                }
                .contentShape(Rectangle())
              }
              .padding(.horizontal, 16)
            }
          }
          .padding(.vertical, 8)
        }
        .scrollContentBackground(.hidden)
        .background(Color.clear)
      }
    }
    .padding(.top, 8)
  }

  private func formatDate(_ ts: Double) -> String {
    let d = Date(timeIntervalSince1970: ts / 1000)
    let f = DateFormatter()
    f.dateStyle = .short
    f.timeStyle = .short
    return f.string(from: d)
  }

  private func loadMarked() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/shipping-fulfillment/marked"), resolvingAgainstBaseURL: false)!
    guard let url = comps.url else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    isLoading = true
    defer { Task { @MainActor in isLoading = false } }
    do {
      let (data, _) = try await URLSession.shared.data(for: req)
      let decoded = try JSONDecoder().decode(MarkedResponse.self, from: data)
      await MainActor.run {
        markedOrderNumbers = decoded.orderNumbers ?? []
        markedAt = decoded.markedAt ?? [:]
      }
    } catch {
      await MainActor.run {
        bannerMessage = "Could not load marked orders."
      }
    }
  }

  private func undo(orderNumber: String) async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var req = URLRequest(url: baseURL.appendingPathComponent("api/shipping-fulfillment/undo"))
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONEncoder().encode(["orderNumber": orderNumber])
    do {
      _ = try await URLSession.shared.data(for: req)
      await loadMarked()
      await MainActor.run { bannerMessage = "Undone." }
    } catch {
      await MainActor.run { bannerMessage = "Undo failed." }
    }
  }

}

private struct MarkedResponse: Decodable {
  let orderNumbers: [String]?
  let markedAt: [String: Double]?
}
