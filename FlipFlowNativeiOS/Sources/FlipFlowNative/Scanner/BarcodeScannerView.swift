import SwiftUI
import VisionKit
import Vision
import UIKit
import AudioToolbox
import AVFoundation

// VisionKit DataScanner (iOS 16+) provides high-quality barcode + QR scanning.
@available(iOS 16.0, *)
struct BarcodeScannerView: UIViewControllerRepresentable {
  let onPayload: (String) -> Void
  let onClose: () -> Void
  let scanMode: ScanMode
  @Binding var torchOn: Bool
  let onTorchStatus: (String) -> Void

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let symbologies: [VNBarcodeSymbology] = {
      switch scanMode {
      case .tracking:
        // Keep this tight for speed + shipping label realism.
        // UPS/FedEx tracking is commonly Code128; PDF417 is common on labels.
        return [.code128, .pdf417, .itf14, .code39, .qr]
      case .authQr, .stockxQr:
        // Auth + StockX are effectively QR/DataMatrix in practice.
        return [.qr, .dataMatrix]
      }
    }()

    let scanner = DataScannerViewController(
      recognizedDataTypes: [
        .barcode(symbologies: symbologies)
      ],
      // Prefer responsiveness in the live camera view.
      qualityLevel: .fast,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isPinchToZoomEnabled: true,
      isGuidanceEnabled: false,
      // Highlighting adds some overhead and isn't required since we show our own scan box overlay.
      isHighlightingEnabled: false
    )
    scanner.delegate = context.coordinator
    return scanner
  }

  func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
    // Start scanning once. (This is safe to call multiple times.)
    guard uiViewController.isViewLoaded else { return }
    let isScanning = uiViewController.isScanning
    if !isScanning {
      do {
        try uiViewController.startScanning()
      } catch {
        // If scanning can't start (permissions/hardware), close and let the caller handle it.
        onClose()
        return
      }
    }

    // Torch control.
    // Avoid unnecessary stop/start cycles — those can feel like "lag", especially on-device.
    let willChangeTorch = context.coordinator.willChangeTorch(desiredOn: torchOn)
    guard willChangeTorch else { return }

    // On older iOS versions, turning the torch ON while scanning can freeze the feed unless we pause briefly.
    // On iOS 18+, this pause tends to introduce more visible "lag" than it prevents, so we skip it.
    let shouldPauseForTorchOn: Bool = {
      if !torchOn { return false }
      if #available(iOS 18.0, *) { return false }
      return true
    }()
    let pausedForTorch = (shouldPauseForTorchOn && uiViewController.isScanning)
    if pausedForTorch { uiViewController.stopScanning() }

    // Apply torch off the main thread to avoid blocking UI updates.
    context.coordinator.applyTorchAsync(desiredOn: torchOn) { available, status in
      onTorchStatus(status)
      if !available && torchOn {
        torchOn = false
      }

      guard pausedForTorch else { return }
      // Small delay helps the camera settle after torch changes on-device.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
        do {
          try uiViewController.startScanning()
        } catch {
          onClose()
        }
      }
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(onPayload: onPayload, onClose: onClose)
  }

  static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
    // Best-effort: stop scanning and force torch off when the sheet is dismissed.
    if uiViewController.isScanning {
      uiViewController.stopScanning()
    }
    coordinator.applyTorchAsync(desiredOn: false) { _, _ in }
  }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    private let onPayload: (String) -> Void
    private let onClose: () -> Void
    private var lastPayloadAt: Date?
    private var lastPayload: String?
    private let feedback = UIImpactFeedbackGenerator(style: .medium)
    private let torchController = TorchController()

    init(onPayload: @escaping (String) -> Void, onClose: @escaping () -> Void) {
      self.onPayload = onPayload
      self.onClose = onClose
      feedback.prepare()
    }

    func willChangeTorch(desiredOn: Bool) -> Bool {
      torchController.willChange(desiredOn: desiredOn)
    }

    func applyTorchAsync(desiredOn: Bool, completion: @escaping (Bool, String) -> Void) {
      torchController.apply(desiredOn: desiredOn, completion: completion)
    }

    private static func bestBackVideoDevice() -> AVCaptureDevice? {
      let types: [AVCaptureDevice.DeviceType] = [
        .builtInTripleCamera,
        .builtInDualWideCamera,
        .builtInDualCamera,
        .builtInWideAngleCamera,
      ]
      let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: .back)
      return discovery.devices.first ?? AVCaptureDevice.default(for: .video)
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

      // Beep + haptic on successful capture.
      feedback.impactOccurred()
      // "Tock" system sound (keeps it simple; no custom audio files needed).
      AudioServicesPlaySystemSound(1104)

      dataScanner.stopScanning()
      onPayload(payload)
      onClose()
    }
  }
}

// MARK: - Torch Controller (non-main-actor helper)

private final class TorchController {
  private let queue = DispatchQueue(label: "FlipFlowNative.torch", qos: .userInitiated)
  private var lastTorchOn: Bool = false
  private var isApplying = false

  func willChange(desiredOn: Bool) -> Bool {
    queue.sync {
      if isApplying { return false }
      return lastTorchOn != desiredOn
    }
  }

  func apply(desiredOn: Bool, completion: @escaping (Bool, String) -> Void) {
    queue.async {
      if self.isApplying {
        DispatchQueue.main.async { completion(true, "Torch busy") }
        return
      }
      if self.lastTorchOn == desiredOn {
        DispatchQueue.main.async { completion(true, desiredOn ? "Torch already ON" : "Torch already OFF") }
        return
      }

      self.isApplying = true
      let result = Self.applyTorchToHardware(desiredOn: desiredOn)
      self.isApplying = false

      if result.available {
        self.lastTorchOn = desiredOn
      } else {
        self.lastTorchOn = false
      }

      DispatchQueue.main.async { completion(result.available, result.status) }
    }
  }

  private static func applyTorchToHardware(desiredOn: Bool) -> (available: Bool, status: String) {
    let device = bestBackVideoDevice()
    guard let device, device.hasTorch else {
      return (false, "Torch unavailable")
    }

    do {
      try device.lockForConfiguration()
      if desiredOn {
        // Moderate level; max brightness can increase heat + frame drops.
        try device.setTorchModeOn(level: 0.6)
      } else {
        device.torchMode = AVCaptureDevice.TorchMode.off
      }
      device.unlockForConfiguration()
      return (true, desiredOn ? "Torch ON" : "Torch OFF")
    } catch {
      device.unlockForConfiguration()
      return (false, "Torch failed: \((error as NSError).localizedDescription)")
    }
  }

  private static func bestBackVideoDevice() -> AVCaptureDevice? {
    let types: [AVCaptureDevice.DeviceType] = [
      .builtInTripleCamera,
      .builtInDualWideCamera,
      .builtInDualCamera,
      .builtInWideAngleCamera,
    ]
    let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: .back)
    return discovery.devices.first ?? AVCaptureDevice.default(for: .video)
  }
}

