import SwiftUI

/// Show required SKU and style ID for an order; scan barcode; match if scanned equals either SKU or style ID.
struct PickVerificationView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  @State private var requiredSku = ""
  @State private var requiredStyleId = ""
  @State private var lastScanned: String?
  @State private var verificationResult: String? // "Correct item" or "Wrong item – expected ..."
  @State private var showScanner = false

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      VStack(spacing: 20) {
        NeonCard {
          VStack(alignment: .leading, spacing: 12) {
            Text("Required SKU / Style ID")
              .font(.subheadline.weight(.medium))
              .foregroundStyle(NeonTheme.textSecondary)
            TextField("SKU (e.g. DD1391-100)", text: $requiredSku)
              .textFieldStyle(.plain)
              .neonTextFieldStyle()
              .autocapitalization(.none)
            TextField("Style ID (optional)", text: $requiredStyleId)
              .textFieldStyle(.plain)
              .neonTextFieldStyle()
              .autocapitalization(.none)
          }
        }
        .padding(.horizontal, 16)

        if let result = verificationResult {
          Text(result)
            .font(.headline)
            .foregroundStyle(result.hasPrefix("Correct") ? NeonTheme.accentEmerald : Color.orange)
            .padding(.horizontal)
        }

        Button {
          showScanner = true
        } label: {
          HStack {
            Image(systemName: "barcode.viewfinder")
            Text("Scan to verify")
          }
          .fontWeight(.semibold)
          .foregroundStyle(.white)
        }
        .disabled(requiredSku.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && requiredStyleId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .buttonStyle(NeonPrimaryButtonStyle())
        .padding(.horizontal, 16)

        Spacer()
      }
      .padding(.top, 24)
    }
    .navigationTitle("Pick verification")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .fullScreenCover(isPresented: $showScanner) {
      PickVerifyScannerSheet(
        requiredSku: requiredSku.trimmingCharacters(in: .whitespacesAndNewlines),
        requiredStyleId: requiredStyleId.trimmingCharacters(in: .whitespacesAndNewlines),
        onPayload: { scanned in
          lastScanned = scanned
          let skuNorm = requiredSku.trimmingCharacters(in: .whitespacesAndNewlines)
          let styleNorm = requiredStyleId.trimmingCharacters(in: .whitespacesAndNewlines)
          let scanNorm = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
          if scanNorm.isEmpty {
            verificationResult = "No barcode value."
          } else if (!skuNorm.isEmpty && scanNorm == skuNorm) || (!styleNorm.isEmpty && scanNorm == styleNorm) {
            verificationResult = "Correct item."
          } else {
            var expected = [String]()
            if !skuNorm.isEmpty { expected.append("SKU \(skuNorm)") }
            if !styleNorm.isEmpty { expected.append("style ID \(styleNorm)") }
            verificationResult = "Wrong item – expected \(expected.joined(separator: " or "))."
          }
          showScanner = false
        },
        onClose: {
          showScanner = false
        }
      )
    }
  }
}

private struct PickVerifyScannerSheet: View {
  let requiredSku: String
  let requiredStyleId: String
  let onPayload: (String) -> Void
  let onClose: () -> Void
  @State private var torchOn = false
  @State private var torchStatus = ""

  var body: some View {
    NavigationStack {
      ZStack {
        AVCaptureScannerView(
          scanMode: .tracking,
          onPayload: { onPayload($0) },
          onClose: onClose,
          torchOn: $torchOn,
          onTorchStatus: { torchStatus = $0 }
        )
        .ignoresSafeArea()
        VStack {
          Spacer()
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(Color.white.opacity(0.85), lineWidth: 3)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.black.opacity(0.06)))
            .frame(width: 280, height: 280)
          Text("Scan product barcode to verify")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.top, 14)
          Spacer()
        }
        .allowsHitTesting(false)
        VStack {
          HStack {
            Spacer()
            Button {
              torchOn.toggle()
            } label: {
              Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                .font(.system(size: 18))
                .foregroundStyle(.white)
                .padding(12)
                .background(Color.black.opacity(0.35), in: Circle())
            }
            .padding(.trailing, 16)
            .padding(.top, 8)
          }
          Spacer()
        }
      }
      .navigationTitle("Scan to verify")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            onClose()
          }
          .foregroundStyle(.white)
        }
      }
      .toolbarBackground(.hidden, for: .navigationBar)
    }
  }
}
