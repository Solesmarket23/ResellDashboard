import SwiftUI
import AVFoundation
import AudioToolbox

/// Custom AVCaptureSession scanner for smoother torch behavior than VisionKit on iOS 18.x.
struct AVCaptureScannerView: UIViewControllerRepresentable {
  let scanMode: ScanMode
  let onPayload: (String) -> Void
  let onClose: () -> Void

  @Binding var torchOn: Bool
  let onTorchStatus: (String) -> Void

  func makeUIViewController(context: Context) -> ScannerViewController {
    let vc = ScannerViewController()
    vc.scanMode = scanMode
    vc.onPayload = onPayload
    vc.onClose = onClose
    vc.onTorchStatus = onTorchStatus
    return vc
  }

  func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {
    uiViewController.scanMode = scanMode
    uiViewController.setTorchDesiredOn(torchOn)
  }

  static func dismantleUIViewController(_ uiViewController: ScannerViewController, coordinator: ()) {
    uiViewController.setTorchDesiredOn(false)
    uiViewController.stop()
  }

  // MARK: - UIKit Controller

  final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var scanMode: ScanMode = .tracking {
      didSet { applyMetadataTypesIfNeeded() }
    }
    var onPayload: ((String) -> Void)?
    var onClose: (() -> Void)?
    var onTorchStatus: ((String) -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "FlipFlowNative.capture.session", qos: .userInitiated)
    private let metadataQueue = DispatchQueue(label: "FlipFlowNative.capture.metadata", qos: .userInitiated)

    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var metadataOutput: AVCaptureMetadataOutput?
    private var captureDevice: AVCaptureDevice?
    private var lastTorchOn: Bool = false
    private var hasStarted = false

    private var lastPayload: String?
    private var lastPayloadAt: Date?

    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .clear
      configureSessionIfPossible()
    }

    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      previewLayer?.frame = view.bounds
      if let conn = previewLayer?.connection, conn.isVideoOrientationSupported {
        conn.videoOrientation = .portrait
      }
      updateRectOfInterest()
    }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      start()
    }

    override func viewWillDisappear(_ animated: Bool) {
      super.viewWillDisappear(animated)
      stop()
    }

    func start() {
      guard !hasStarted else { return }
      hasStarted = true
      sessionQueue.async { [weak self] in
        guard let self else { return }
        guard self.session.inputs.isEmpty == false else { return }
        self.applyMetadataTypesIfNeeded()
        if !self.session.isRunning {
          self.session.startRunning()
#if DEBUG
          print("[Scanner] session started, mode=\(self.scanMode.rawValue)")
#endif
        }
      }
    }

    func stop() {
      sessionQueue.async { [weak self] in
        guard let self else { return }
        if self.session.isRunning {
          self.session.stopRunning()
        }
      }
    }

    func setTorchDesiredOn(_ desiredOn: Bool) {
      guard desiredOn != lastTorchOn else { return }
      lastTorchOn = desiredOn

      sessionQueue.async { [weak self] in
        guard let self else { return }
        guard let device = self.captureDevice, device.hasTorch else {
          DispatchQueue.main.async { self.onTorchStatus?("Torch unavailable") }
          return
        }

        do {
          try device.lockForConfiguration()
          if desiredOn {
            let level: Float = 0.6
            try device.setTorchModeOn(level: level)
          } else {
            device.torchMode = .off
          }
          device.unlockForConfiguration()
          DispatchQueue.main.async { self.onTorchStatus?(desiredOn ? "Torch ON" : "Torch OFF") }
        } catch {
          device.unlockForConfiguration()
          DispatchQueue.main.async { self.onTorchStatus?("Torch failed") }
        }
      }
    }

    // MARK: - AVCapture setup

    private func configureSessionIfPossible() {
      let status = AVCaptureDevice.authorizationStatus(for: .video)
      switch status {
      case .authorized:
        configureSession()
      case .notDetermined:
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
          DispatchQueue.main.async {
            guard let self else { return }
            if granted {
              self.configureSession()
            } else {
              self.onTorchStatus?("Camera permission denied")
              self.onClose?()
            }
          }
        }
      default:
        onTorchStatus?("Camera permission denied")
        onClose?()
      }
    }

    private func configureSession() {
      sessionQueue.async { [weak self] in
        guard let self else { return }
        self.session.beginConfiguration()
        self.session.sessionPreset = .high

        // Input
        let device = Self.bestBackVideoDevice()
        self.captureDevice = device
        guard let device else {
          DispatchQueue.main.async { self.onTorchStatus?("No back camera") }
          self.session.commitConfiguration()
          return
        }

        do {
          let input = try AVCaptureDeviceInput(device: device)
          if self.session.canAddInput(input) {
            self.session.addInput(input)
          }

          // Continuous focus helps with barcodes/QR at different distances.
          if device.isFocusModeSupported(.continuousAutoFocus) {
            try device.lockForConfiguration()
            device.focusMode = .continuousAutoFocus
            device.unlockForConfiguration()
          }
        } catch {
          DispatchQueue.main.async { self.onTorchStatus?("Camera input error") }
          self.session.commitConfiguration()
          return
        }

        // Output
        let metadata = AVCaptureMetadataOutput()
        if self.session.canAddOutput(metadata) {
          self.session.addOutput(metadata)
          metadata.setMetadataObjectsDelegate(self, queue: self.metadataQueue)
          self.metadataOutput = metadata

          // Ensure portrait orientation for metadata detection.
          if let conn = metadata.connection(with: .video), conn.isVideoOrientationSupported {
            conn.videoOrientation = .portrait
          }
        }

        self.session.commitConfiguration()

        DispatchQueue.main.async {
          let layer = AVCaptureVideoPreviewLayer(session: self.session)
          layer.videoGravity = .resizeAspectFill
          self.previewLayer = layer
          self.view.layer.insertSublayer(layer, at: 0)
          layer.frame = self.view.bounds
          if let conn = layer.connection, conn.isVideoOrientationSupported {
            conn.videoOrientation = .portrait
          }
          self.updateRectOfInterest()
        }
      }
    }

    private func applyMetadataTypesIfNeeded() {
      guard let output = metadataOutput else { return }
      let desired: [AVMetadataObject.ObjectType] = {
        switch scanMode {
        case .tracking:
          return [.code128, .pdf417, .itf14, .code39, .qr]
        case .authQr, .stockxQr:
          return [.qr, .dataMatrix]
        }
      }()

      // Some devices report `availableMetadataObjectTypes` as empty until the session is running.
      // Use the desired types as a fallback so scanning still works immediately.
      let available = output.availableMetadataObjectTypes
      if available.isEmpty {
        output.metadataObjectTypes = desired
      } else {
        let availableSet = Set(available)
        let filtered = desired.filter { availableSet.contains($0) }
        output.metadataObjectTypes = filtered.isEmpty ? available : filtered
      }

#if DEBUG
      print("[Scanner] metadata types=\(output.metadataObjectTypes.map { $0.rawValue }.joined(separator: ","))")
#endif
    }

    /// Restrict scanning to the on-screen square to reduce workload (major perf win with torch on).
    private func updateRectOfInterest() {
      guard let output = metadataOutput else { return }
      // Temporarily scan the full frame to ensure reliability.
      // We can re-enable a restricted ROI after we confirm consistent detection on-device.
      output.rectOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
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

    // MARK: - Metadata delegate

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
      guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject else { return }
      guard let payload = obj.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !payload.isEmpty else { return }

      // De-dupe to avoid rapid repeats.
      let now = Date()
      if let lastPayload, lastPayload == payload, let lastPayloadAt, now.timeIntervalSince(lastPayloadAt) < 1.0 {
        return
      }
      lastPayload = payload
      lastPayloadAt = now

      DispatchQueue.main.async { [weak self] in
        guard let self else { return }

#if DEBUG
        print("[Scanner] captured payload len=\(payload.count)")
#endif
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        AudioServicesPlaySystemSound(1104)

        self.stop()
        self.onPayload?(payload)
        // Give the host view a beat to process the payload (e.g. schedule Safari sheet)
        // before dismissing the camera sheet.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
          self.onClose?()
        }
      }
    }
  }
}

