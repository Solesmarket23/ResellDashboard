import SwiftUI

/// Enter order number (or paste shippingDocumentUrl), fetch shipping document list then PDF(s), print via Air Print.
/// StockX can return multiple documents (shipping label + invoice/insert); we fetch and print each.
/// If input is a StockX shippingDocumentUrl we skip the list call and request that PDF directly.
///
/// StockX printing defaults (keep until Alias printing is added):
/// - Page 1 (shipping label): rotate 90° clockwise
/// - Page 2 (insert): no rotation
/// - Printer paper size: 104.4 mm × 159.4 mm
struct PrintLabelView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  /// When opening from To Ship, prefill this order number.
  var initialOrderNumber: String? = nil
  @State private var orderNumber = ""
  @State private var isPrinting = false
  @State private var useThermalLabel = true
  @State private var bannerMessage: String?
  @State private var alertMessage: String?
  @State private var showAlert = false
  @State private var isSharing = false

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

        Toggle(isOn: $useThermalLabel) {
          Text("Thermal label")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(NeonTheme.textSecondary)
        }
        .tint(NeonTheme.accentCyan)
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
        .disabled(isPrinting || isSharing || orderNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .buttonStyle(NeonPrimaryButtonStyle())
        .padding(.horizontal, 16)

        Button {
          Task { await fetchAndShare() }
        } label: {
          HStack {
            if isSharing {
              ProgressView()
                .tint(NeonTheme.accentCyan)
              Text("Preparing…")
            } else {
              Image(systemName: "square.and.arrow.up")
              Text("Share label (print on Mac)")
            }
          }
          .fontWeight(.semibold)
          .foregroundStyle(NeonTheme.accentCyan)
        }
        .disabled(isPrinting || isSharing || orderNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .buttonStyle(.bordered)
        .tint(NeonTheme.accentCyan)
        .padding(.horizontal, 16)

        Text("Tip: Make sure printer paper size is 104.4 mm × 159.4 mm.")
          .font(.caption)
          .foregroundStyle(NeonTheme.textSecondary)
          .multilineTextAlignment(.center)
          .padding(.horizontal, 24)

        Text("AirDrop or save to Files, then open on your Mac and print.")
          .font(.caption2)
          .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
          .multilineTextAlignment(.center)
          .padding(.horizontal, 24)

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
    .onAppear {
      if let o = initialOrderNumber, !o.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        orderNumber = o.trimmingCharacters(in: .whitespacesAndNewlines)
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
    if shippingIdFromUrl != nil {
      await MainActor.run { orderNumber = order }
    }

    var documentIds: [String]
    if let fromUrl = shippingIdFromUrl {
      documentIds = [fromUrl]
    } else {
      // 1) GET shipping-document list (may return multiple: label + insert/invoice)
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
      // Use thermal vs normal (ink) based on toggle when backend provides both; else shippingDocumentIds
      let thermalIds = listJson["thermalDocumentIds"] as? [String]
      let normalIds = listJson["normalDocumentIds"] as? [String]
      if useThermalLabel, let ids = thermalIds, !ids.isEmpty {
        documentIds = ids
      } else if !useThermalLabel, let ids = normalIds, !ids.isEmpty {
        documentIds = ids
      } else if let ids = listJson["shippingDocumentIds"] as? [String], !ids.isEmpty {
        documentIds = ids
      } else if let sid = (listJson["shippingId"] as? String).flatMap({ $0.isEmpty ? nil : $0 }) ?? extractFirstShippingId(from: listJson) {
        documentIds = [sid]
      } else {
        await MainActor.run {
          alertMessage = "No shipping label available for this order. Shipping labels are only available for Standard/Direct orders."
          showAlert = true
        }
        return
      }
    }

    // 2) Fetch each PDF, apply StockX defaults, render to images (auto 4×6 vs 6×4), then print all in one job.
    let pdfBase = baseURL.appendingPathComponent("api/stockx/shipping-document/pdf")
    var images: [UIImage] = []
    for (index, docId) in documentIds.enumerated() {
      var pdfComps = URLComponents(url: pdfBase, resolvingAgainstBaseURL: false)!
      pdfComps.queryItems = [
        URLQueryItem(name: "orderNumber", value: order),
        URLQueryItem(name: "shippingId", value: docId),
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

      // StockX defaults:
      // - shipping label (page 1): rotate 90° clockwise
      // - insert (page 2): no rotation
      var dataToRender = pdfData
      if index == 0, let rotated = LabelPrinting.rotatePDF90(pdfData, clockwise: true) {
        dataToRender = rotated
      }
      dataToRender = LabelPrinting.pdfDataSinglePage(dataToRender)

      // Auto-size render target based on the post-rotation PDF orientation to avoid stretching.
      let bounds = LabelPrinting.firstPageBounds(dataToRender)
      let isLandscape = (bounds?.width ?? 0) >= (bounds?.height ?? 1)
      let sizeForPage = isLandscape ? LabelPrinting.shippingLabel6x4Points : LabelPrinting.shippingLabel4x6Points
      guard let image = LabelPrinting.image(fromPdf: dataToRender, sizeInPoints: sizeForPage) else {
        await MainActor.run {
          bannerMessage = "Could not render label image."
        }
        return
      }
      images.append(image)
    }

    guard !images.isEmpty else { return }

    let jobName = documentIds.count > 1 ? "StockX \(order) (Label + Insert)" : "StockX \(order)"
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      Task { @MainActor in
        LabelPrinting.presentPrintSheetAsPhoto(
          images: images,
          jobName: jobName,
          preferredPaperSize: LabelPrinting.shippingLabel4x6Points
        ) { completed, error in
          Task { @MainActor in
            if let error {
              bannerMessage = "Print failed: \(error.localizedDescription)"
            } else if completed {
              bannerMessage = "Sent to printer."
            } else {
              bannerMessage = "Print canceled."
            }
            cont.resume()
          }
        }
      }
    }
  }

  /// Fetches the shipping label PDF and presents the share sheet so you can AirDrop to Mac and print with 4×6.
  private func fetchAndShare() async {
    let raw = orderNumber.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty,
          let bearer = try? await auth.getApiBearerToken(forcingRefresh: false),
          !bearer.isEmpty
    else {
      bannerMessage = "Enter order number and ensure you're signed in."
      return
    }

    isSharing = true
    bannerMessage = nil
    defer { Task { @MainActor in isSharing = false } }

    let (order, shippingIdFromUrl) = parseOrderNumberOrShippingDocumentUrl(raw)
    if shippingIdFromUrl != nil {
      await MainActor.run { orderNumber = order }
    }

    var documentIds: [String]
    if let fromUrl = shippingIdFromUrl {
      documentIds = [fromUrl]
    } else {
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

      do {
        let (listData, listResp) = try await URLSession.shared.data(for: listReq)
        let listStatus = (listResp as? HTTPURLResponse)?.statusCode ?? 0
        if listStatus != 200 {
          let decoded = try? JSONDecoder().decode(ShippingErrorResponse.self, from: listData)
          let userMsg = decoded?.error ?? "No shipping label available for this order."
          await MainActor.run {
            alertMessage = userMsg
            showAlert = true
          }
          return
        }
        guard let listJson = try? JSONSerialization.jsonObject(with: listData) as? [String: Any] else {
          await MainActor.run {
            alertMessage = "No shipping label available for this order."
            showAlert = true
          }
          return
        }
        let thermalIds = listJson["thermalDocumentIds"] as? [String]
        let normalIds = listJson["normalDocumentIds"] as? [String]
        if useThermalLabel, let ids = thermalIds, !ids.isEmpty {
          documentIds = ids
        } else if !useThermalLabel, let ids = normalIds, !ids.isEmpty {
          documentIds = ids
        } else if let ids = listJson["shippingDocumentIds"] as? [String], !ids.isEmpty {
          documentIds = ids
        } else if let sid = (listJson["shippingId"] as? String).flatMap({ $0.isEmpty ? nil : $0 }) ?? extractFirstShippingId(from: listJson) {
          documentIds = [sid]
        } else {
          await MainActor.run {
            alertMessage = "No shipping label available for this order."
            showAlert = true
          }
          return
        }
      } catch {
        await MainActor.run { bannerMessage = "Network error: \(error.localizedDescription)" }
        return
      }
    }

    let pdfBase = baseURL.appendingPathComponent("api/stockx/shipping-document/pdf")
    let docId = documentIds[0]
    var pdfComps = URLComponents(url: pdfBase, resolvingAgainstBaseURL: false)!
    pdfComps.queryItems = [
      URLQueryItem(name: "orderNumber", value: order),
      URLQueryItem(name: "shippingId", value: docId),
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
      let userMsg = decoded?.error ?? "No shipping label available for this order."
      await MainActor.run {
        alertMessage = userMsg
        showAlert = true
      }
      return
    }

    let safeOrder = order.replacingOccurrences(of: "/", with: "-")
    let filename = "StockX-\(safeOrder)-label.pdf"
    await MainActor.run {
      LabelPrinting.presentShareSheet(
        pdfData: pdfData,
        filename: filename,
        // StockX default for sharing/printing on Mac: rotate 90° clockwise.
        rotate90Clockwise: true
      ) {
        Task { @MainActor in
          bannerMessage = "Share sheet closed. Open the PDF on your Mac and print with 4×6."
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
