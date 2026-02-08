import Foundation
import SwiftUI
import UIKit

enum LabelPrinting {
  // 1 inch = 72 points in PDF space.
  // User label: 1.25" x 2.25" (commonly 2.25w x 1.25h in landscape).
  static let labelSizePoints = CGSize(width: 2.25 * 72.0, height: 1.25 * 72.0)

  static func makeLabelPDF(
    sku: Int,
    productName: String?,
    productSize: String?
  ) -> Data {
    let skuString = String(sku)
    let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: labelSizePoints))
    let data = renderer.pdfData { ctx in
      ctx.beginPage()
      let bounds = CGRect(origin: .zero, size: labelSizePoints).insetBy(dx: 6, dy: 6)

      // Background (white for thermal)
      UIColor.white.setFill()
      ctx.cgContext.fill(CGRect(origin: .zero, size: labelSizePoints))

      // Header text
      let title = (productName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
        ? (productName!.trimmingCharacters(in: .whitespacesAndNewlines))
        : "Item"
      let subtitleParts = [
        productSize?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? "Size \(productSize!.trimmingCharacters(in: .whitespacesAndNewlines))" : nil,
        "SKU \(skuString)",
      ].compactMap { $0 }
      let subtitle = subtitleParts.joined(separator: " • ")

      let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 10, weight: .semibold),
        .foregroundColor: UIColor.black,
      ]
      let subtitleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 8.5, weight: .regular),
        .foregroundColor: UIColor.black,
      ]

      let titleRect = CGRect(x: bounds.minX, y: bounds.minY, width: bounds.width, height: 12)
      (title as NSString).draw(in: titleRect, withAttributes: titleAttrs)
      let subRect = CGRect(x: bounds.minX, y: titleRect.maxY + 1, width: bounds.width, height: 11)
      (subtitle as NSString).draw(in: subRect, withAttributes: subtitleAttrs)

      // Barcode image
      let barcodeTop = subRect.maxY + 4
      let barcodeRect = CGRect(x: bounds.minX, y: barcodeTop, width: bounds.width, height: bounds.maxY - barcodeTop - 2)
      if let barcode = Code128Barcode.make(payload: skuString) {
        let img = barcode
        let target = barcodeRect.insetBy(dx: 8, dy: 0)
        ctx.cgContext.interpolationQuality = .none
        ctx.cgContext.draw(img.cgImage!, in: target)
      } else {
        // Fallback text if barcode fails
        let fallbackAttrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.monospacedSystemFont(ofSize: 12, weight: .bold),
          .foregroundColor: UIColor.black,
        ]
        (skuString as NSString).draw(in: barcodeRect, withAttributes: fallbackAttrs)
      }
    }
    return data
  }

  @MainActor
  static func presentPrintSheet(pdfData: Data, jobName: String) {
    let controller = UIPrintInteractionController.shared
    controller.printingItem = pdfData
    controller.printInfo = {
      let info = UIPrintInfo(dictionary: nil)
      info.outputType = .general
      info.jobName = jobName
      return info
    }()

    controller.present(animated: true, completionHandler: nil)
  }
}

enum Code128Barcode {
  static func make(payload: String) -> UIImage? {
    guard let data = payload.data(using: .ascii),
          let filter = CIFilter(name: "CICode128BarcodeGenerator")
    else { return nil }

    filter.setValue(data, forKey: "inputMessage")
    filter.setValue(0, forKey: "inputQuietSpace")

    guard let output = filter.outputImage else { return nil }

    // Scale up without blurring
    let scaleX: CGFloat = 3.0
    let scaleY: CGFloat = 3.0
    let scaled = output.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
    return UIImage(cgImage: cg)
  }
}

