import SwiftUI
import VisionKit

// VisionKit DataScanner (iOS 16+) provides high-quality barcode + QR scanning.
@available(iOS 16.0, *)
struct BarcodeScannerView: UIViewControllerRepresentable {
  let onPayload: (String) -> Void
  let onClose: () -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [
        .barcode(symbologies: [
          .qr,
          .aztec,
          .pdf417,
          .code128,
          .code39,
          .code93,
          .ean8,
          .ean13,
          .upce,
          .itf14
        ])
      ],
      qualityLevel: .balanced,
      recognizesMultipleItems: true,
      isHighFrameRateTrackingEnabled: true,
      isPinchToZoomEnabled: true,
      isGuidanceEnabled: true,
      isHighlightingEnabled: true
    )
    scanner.delegate = context.coordinator
    return scanner
  }

  func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
    // Start scanning once. (This is safe to call multiple times.)
    guard uiViewController.isViewLoaded else { return }
    if uiViewController.isScanning { return }
    do {
      try uiViewController.startScanning()
    } catch {
      // If scanning can't start (permissions/hardware), close and let the caller handle it.
      onClose()
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(onPayload: onPayload, onClose: onClose)
  }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    private let onPayload: (String) -> Void
    private let onClose: () -> Void
    private var lastPayloadAt: Date?
    private var lastPayload: String?

    init(onPayload: @escaping (String) -> Void, onClose: @escaping () -> Void) {
      self.onPayload = onPayload
      self.onClose = onClose
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
      handle(item: item, dataScanner: dataScanner)
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
      // If it confidently sees exactly 1 barcode, accept immediately.
      if addedItems.count == 1 {
        handle(item: addedItems[0], dataScanner: dataScanner)
      }
    }

    private func handle(item: RecognizedItem, dataScanner: DataScannerViewController) {
      guard case .barcode(let barcode) = item else { return }
      guard let payload = barcode.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !payload.isEmpty else { return }

      // Simple de-dupe to prevent rapid repeats.
      let now = Date()
      if let lastPayload, lastPayload == payload, let lastPayloadAt, now.timeIntervalSince(lastPayloadAt) < 1.0 {
        return
      }
      self.lastPayload = payload
      self.lastPayloadAt = now

      dataScanner.stopScanning()
      onPayload(payload)
      onClose()
    }
  }
}

