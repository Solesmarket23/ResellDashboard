import SwiftUI

/// Debug overlay to diagnose "black bars"/letterboxing on device.
/// Shows screen vs root container sizes so we can tell if the app window
/// is smaller than the physical screen (iPad-compat style letterboxing).
struct DebugOverlayView: View {
  let rootSize: CGSize

  @State private var copied = false
  @State private var didLog = false

  private var screenBounds: CGRect { UIScreen.main.bounds }
  private var nativeBounds: CGRect { UIScreen.main.nativeBounds }
  private var scale: CGFloat { UIScreen.main.scale }
  private var idiom: UIUserInterfaceIdiom { UIDevice.current.userInterfaceIdiom }
  private var deviceFamilyInfo: Any? { Bundle.main.infoDictionary?["UIDeviceFamily"] }

  private var payload: String {
    let parts: [String] = [
      "rootSize=\(Int(rootSize.width))x\(Int(rootSize.height))",
      "screenBounds=\(Int(screenBounds.width))x\(Int(screenBounds.height))",
      "nativeBounds=\(Int(nativeBounds.width))x\(Int(nativeBounds.height))",
      "scale=\(scale)",
      "idiom=\(idiom == .phone ? "phone" : idiom == .pad ? "pad" : "other")",
      "UIDeviceFamily=\(deviceFamilyInfo.map { "\($0)" } ?? "nil")",
    ]
    return parts.joined(separator: " | ")
  }

  var body: some View {
    VStack {
      Spacer()
      HStack(alignment: .bottom, spacing: 10) {
        Text(payload)
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(.white.opacity(0.95))
          .lineLimit(3)

        Button(copied ? "Copied" : "Copy") {
          UIPasteboard.general.string = payload
          copied = true
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            copied = false
          }
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.black)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .padding(.horizontal, 12)
      .padding(.bottom, 10)
    }
    .allowsHitTesting(true)
    .accessibilityLabel("Debug overlay")
    .onAppear {
      guard !didLog else { return }
      didLog = true

      // #region agent log
      DebugLog.write(
        hypothesisId: "H1",
        runId: "pre-fix",
        location: "DebugOverlayView.swift:onAppear",
        message: "Root size vs screen bounds",
        data: [
          "rootSize": "\(Int(rootSize.width))x\(Int(rootSize.height))",
          "screenBounds": "\(Int(screenBounds.width))x\(Int(screenBounds.height))",
          "nativeBounds": "\(Int(nativeBounds.width))x\(Int(nativeBounds.height))",
          "scale": scale,
        ]
      )
      // #endregion agent log
    }
  }
}

