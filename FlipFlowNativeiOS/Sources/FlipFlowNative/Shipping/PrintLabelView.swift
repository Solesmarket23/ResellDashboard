import SwiftUI

/// Enter order number (or paste shippingDocumentUrl), fetch shipping document list then PDF, print via Air Print.
/// If input is a StockX shippingDocumentUrl we skip the list call and request the PDF directly.
struct PrintLabelView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  @State private var orderNumber = ""
  @State private var isPrinting = false
  @State private var bannerMessage: String?
  @State private var alertMessage: String?
  @State private var showAlert = false

  private let baseURL = URL(string: "https://www.solesmarket.com")!

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      VStack(spacing: 20) {
        if let msg = bannerMessage {
          Text(msg)
            .font(.subheadline)
            .foregroundStyle(msg.contains("error") || msg.contains("No shipping") ? Color.orange : NeonTheme.accentCyan)
            .padding(.horizontal)
        }
        NeonCard {
          VStack(alignment: .leading, spacing: 12) {
            Text("Order number")
              .font(.subheadline.weight(.medium))
              .foregroundStyle(NeonTheme.textSecondary)
            TextField("e.g. 06-XXXXX or paste shippingDocumentUrl", text: $orderNumber)
              .textFieldStyle(.plain)
              .neonTextFieldStyle()
              .autocapitalization(.none)
              .autocorrectionDisabled()
          }
        }
        .padding(.horizontal, 16)

        Button {
          Task { await fetchAndPrint() }
        } label: {
          HStack {
            if isPrinting {
              ProgressView()
                .tint(.white)
              Text("Preparing…")
            } else {
              Image(systemName: "printer.fill")
              Text("Print shipping label")
            }
          }
          .fontWeight(.semibold)
          .foregroundStyle(.white)
        }
        .disabled(isPrinting || orderNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .buttonStyle(NeonPrimaryButtonStyle())
        .padding(.horizontal, 16)

        Spacer()
      }
      .padding(.top, 24)
    }
    .navigationTitle("Print label")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .alert("Shipping label", isPresented: $showAlert) {
      Button("OK", role: .cancel) {
        showAlert = false
        alertMessage = nil
      }
    } message: {
      if let msg = alertMessage {
        Text(msg)
      }
    }
  }

  private func fetchAndPrint() async {
    let raw = orderNumber.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty,
          let bearer = try? await auth.getApiBearerToken(forcingRefresh: false),
          !bearer.isEmpty
    else {
      bannerMessage = "Enter order number and ensure you're signed in."
      return
    }

    isPrinting = true
    bannerMessage = nil
    defer { Task { @MainActor in isPrinting = false } }

    let (order, shippingIdFromUrl) = parseOrderNumberOrShippingDocumentUrl(raw)
    if let urlShippingId = shippingIdFromUrl {
      await MainActor.run { orderNumber = order }
    }

    var shippingId: String
    if let fromUrl = shippingIdFromUrl {
      shippingId = fromUrl
    } else {
      // 1) GET shipping-document list
      var listURL = baseURL.appendingPathComponent("api/stockx/shipping-document")
      var comps = URLComponents(url: listURL, resolvingAgainstBaseURL: false)!
      comps.queryItems = [URLQueryItem(name: "orderNumber", value: order)]
      guard let listReqURL = comps.url else {
        await MainActor.run { bannerMessage = "Invalid URL." }
        return
      }
      var listReq = URLRequest(url: listReqURL)
      listReq.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
      listReq.setValue("application/json", forHTTPHeaderField: "Accept")

      let (listData, listResp): (Data, URLResponse)
      do {
        (listData, listResp) = try await URLSession.shared.data(for: listReq)
      } catch {
        await MainActor.run { bannerMessage = "Network error: \(error.localizedDescription)" }
        return
      }

      let listStatus = (listResp as? HTTPURLResponse)?.statusCode ?? 0
      if listStatus != 200 {
        let decoded = try? JSONDecoder().decode(ShippingErrorResponse.self, from: listData)
        let userMsg = decoded?.error ?? "No shipping label available for this order. Shipping labels are only available for Standard/Direct orders."
        await MainActor.run {
          alertMessage = userMsg
          showAlert = true
        }
        return
      }

      guard let listJson = try? JSONSerialization.jsonObject(with: listData) as? [String: Any] else {
        await MainActor.run {
          alertMessage = "No shipping label available for this order. Shipping labels are only available for Standard/Direct orders."
          showAlert = true
        }
        return
      }
      // Backend may return top-level shippingId (fallback from order details when list returns 404)
      let firstId = (listJson["shippingId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        ?? extractFirstShippingId(from: listJson)
      guard let sid = firstId else {
        await MainActor.run {
          alertMessage = "No shipping label available for this order. Shipping labels are only available for Standard/Direct orders."
          showAlert = true
        }
        return
      }
      shippingId = sid
    }

    // 2) GET PDF
    var pdfComps = URLComponents(url: baseURL.appendingPathComponent("api/stockx/shipping-document/pdf"), resolvingAgainstBaseURL: false)!
    pdfComps.queryItems = [
      URLQueryItem(name: "orderNumber", value: order),
      URLQueryItem(name: "shippingId", value: shippingId),
    ]
    guard let pdfURL = pdfComps.url else {
      await MainActor.run { bannerMessage = "Invalid PDF URL." }
      return
    }
    var pdfReq = URLRequest(url: pdfURL)
    pdfReq.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    pdfReq.setValue("application/pdf", forHTTPHeaderField: "Accept")

    let (pdfData, pdfResp): (Data, URLResponse)
    do {
      (pdfData, pdfResp) = try await URLSession.shared.data(for: pdfReq)
    } catch {
      await MainActor.run { bannerMessage = "Network error: \(error.localizedDescription)" }
      return
    }

    let pdfStatus = (pdfResp as? HTTPURLResponse)?.statusCode ?? 0
    let contentType = (pdfResp as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? ""
    if pdfStatus != 200 || !contentType.contains("pdf") {
      let decoded = try? JSONDecoder().decode(ShippingErrorResponse.self, from: pdfData)
      let userMsg = decoded?.error ?? "No shipping label available for this order. Shipping labels are only available for Standard/Direct orders."
      await MainActor.run {
        alertMessage = userMsg
        showAlert = true
      }
      return
    }

    await MainActor.run {
      LabelPrinting.presentPrintSheet(
        pdfData: pdfData,
        jobName: "StockX \(order)"
      ) { completed, error in
        Task { @MainActor in
          if let error {
            bannerMessage = "Print failed: \(error.localizedDescription)"
          } else if completed {
            bannerMessage = "Sent to printer."
          } else {
            bannerMessage = "Print canceled."
          }
        }
      }
    }
  }

  /// If input is a StockX shippingDocumentUrl (e.g. .../orders/04-M60TNW9M0B/shipping-document/S-870622186),
  /// returns (orderNumber, shippingId). Otherwise returns (trimmedInput, nil).
  private func parseOrderNumberOrShippingDocumentUrl(_ input: String) -> (orderNumber: String, shippingId: String?) {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.contains("/orders/"), trimmed.contains("/shipping-document/") else {
      return (trimmed, nil)
    }
    let pattern = #"/orders/([^/]+)/shipping-document/([^/?#]+)"#
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
          match.numberOfRanges >= 3,
          let orderRange = Range(match.range(at: 1), in: trimmed),
          let idRange = Range(match.range(at: 2), in: trimmed)
    else { return (trimmed, nil) }
    let orderNum = String(trimmed[orderRange])
    let shipId = String(trimmed[idRange])
    guard !orderNum.isEmpty, !shipId.isEmpty else { return (trimmed, nil) }
    return (orderNum, shipId)
  }

  private func extractFirstShippingId(from json: [String: Any]) -> String? {
    // shippingDocuments.thermalLabelOnly might be a string (URL or id) or object with url/id
    if let docs = json["shippingDocuments"] as? [String: Any],
       let thermal = docs["thermalLabelOnly"] {
      if let s = thermal as? String, !s.isEmpty { return s }
      if let o = thermal as? [String: Any], let url = o["url"] as? String, !url.isEmpty {
        return url.split(separator: "/").last.map(String.init)
      }
    }
    if let docs = json["shippingDocuments"] as? [String: Any],
       let required = docs["requiredDocuments"] as? [String: Any],
       let first = required.values.first {
      if let s = first as? String, !s.isEmpty { return s }
      if let o = first as? [String: Any], let url = o["url"] as? String {
        return url.split(separator: "/").last.map(String.init)
      }
    }
    return nil
  }
}

private struct ShippingErrorResponse: Decodable {
  let error: String?
}
