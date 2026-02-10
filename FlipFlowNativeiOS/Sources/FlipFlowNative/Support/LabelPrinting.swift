import Foundation
import SwiftUI
import UIKit
import PDFKit

enum LabelPrinting {
  // 1 inch = 72 points in PDF space.
  // User label: 1.25" x 2.25" (commonly 2.25w x 1.25h in landscape).
  static let labelSizePoints = CGSize(width: 2.25 * 72.0, height: 1.25 * 72.0)

  static func makeLabelPDF(
    sku: String,
    productName: String?,
    productSize: String?,
    styleId: String?,
    productImage: UIImage?,
    isTest: Bool
  ) -> Data {
    let skuString = sku.trimmingCharacters(in: .whitespacesAndNewlines)
    let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: labelSizePoints))
    let data = renderer.pdfData { ctx in
      ctx.beginPage()
      // Keep vertical insets tight so the barcode has enough height on a 1.25" tall label.
      let bounds = CGRect(origin: .zero, size: labelSizePoints).insetBy(dx: 6, dy: 3)

      // Background (white for thermal)
      UIColor.white.setFill()
      ctx.cgContext.fill(CGRect(origin: .zero, size: labelSizePoints))

      // Header: optional thumbnail + text
      let title = (productName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
        ? (productName!.trimmingCharacters(in: .whitespacesAndNewlines))
        : "Item"
      let styleTrim = styleId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let sizeTrim = productSize?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let sizeLine = sizeTrim.isEmpty ? "" : "Size: \(sizeTrim)"
      let styleLine = styleTrim.isEmpty ? "" : " • Style: \(styleTrim)"
      // Don't place a "TEST" stamp in the barcode area (it makes the barcode look tiny).
      // Instead, label the SKU line so test prints are still obvious.
      let skuLine = isTest ? "SKU: \(skuString) (TEST)" : "SKU: \(skuString)"

      let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 8.8, weight: .semibold),
        .foregroundColor: UIColor.black,
      ]
      let skuAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .bold),
        .foregroundColor: UIColor.black,
      ]
      let sizeBoldAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 8.8, weight: .semibold),
        .foregroundColor: UIColor.black,
      ]
      let styleRegularAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 8.8, weight: .regular),
        .foregroundColor: UIColor.black,
      ]

      let paragraphTitle: NSParagraphStyle = {
        let p = NSMutableParagraphStyle()
        p.alignment = .left
        p.lineBreakMode = .byTruncatingTail
        return p
      }()
      let paragraphSub: NSParagraphStyle = {
        let p = NSMutableParagraphStyle()
        p.lineBreakMode = .byTruncatingTail
        return p
      }()

      // Proposed layout:
      // - Title full-width at top (2 lines)
      // - Size/style line on left, image on right (same row block as size+sku)
      // - SKU line below
      // Slight left inset so wrapped line alignment looks intentional.
      let titleInsetX: CGFloat = 1
      // Give the title enough height for 2 lines so it doesn't clip.
      let titleRect = CGRect(x: bounds.minX + titleInsetX, y: bounds.minY, width: bounds.width - titleInsetX, height: 24)
      let titleAttrs2: [NSAttributedString.Key: Any] = titleAttrs.merging([.paragraphStyle: paragraphTitle]) { $1 }
      (title as NSString).draw(with: titleRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: titleAttrs2, context: nil)

      let rowY = titleRect.maxY + 1
      // Make the product image ~40% larger (24 -> ~34).
      // +10% from the last revision.
      let imgSize: CGFloat = 37
      let imgRect: CGRect = (productImage != nil)
        // Nudge up slightly so it visually aligns with the text block.
        ? CGRect(x: bounds.maxX - imgSize - 2, y: rowY - 3, width: imgSize, height: imgSize)
        : .zero
      let textRightPad = (productImage != nil) ? (imgSize + 7) : 0
      let subRect = CGRect(x: bounds.minX, y: rowY, width: bounds.width - textRightPad, height: 10)

      let sizeAttrs2: [NSAttributedString.Key: Any] = sizeBoldAttrs.merging([.paragraphStyle: paragraphSub]) { $1 }
      let styleAttrs2: [NSAttributedString.Key: Any] = styleRegularAttrs.merging([.paragraphStyle: paragraphSub]) { $1 }
      let sizeStyle = NSMutableAttributedString(string: sizeLine, attributes: sizeAttrs2)
      if !sizeLine.isEmpty, !styleTrim.isEmpty {
        sizeStyle.append(NSAttributedString(string: styleLine, attributes: styleAttrs2))
      }
      sizeStyle.draw(with: subRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)

      let skuRect = CGRect(x: bounds.minX, y: subRect.maxY + 1, width: bounds.width - textRightPad, height: 10)
      let skuAttrs2: [NSAttributedString.Key: Any] = skuAttrs.merging([.paragraphStyle: paragraphSub]) { $1 }
      if isTest {
        let skuText = NSMutableAttributedString(string: "SKU: \(skuString)", attributes: skuAttrs2)
        let testAttrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.monospacedSystemFont(ofSize: 8.5, weight: .regular),
          .foregroundColor: UIColor.black.withAlphaComponent(0.55),
          .paragraphStyle: paragraphSub,
        ]
        skuText.append(NSAttributedString(string: " (TEST)", attributes: testAttrs))
        skuText.draw(with: skuRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
      } else {
        (skuLine as NSString).draw(with: skuRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: skuAttrs2, context: nil)
      }

      if let img = productImage, !imgRect.equalTo(.zero) {
        // Draw thumbnail (aspect fit) with a light border.
        ctx.cgContext.saveGState()
        let path = UIBezierPath(roundedRect: imgRect, cornerRadius: 4).cgPath
        ctx.cgContext.addPath(path)
        ctx.cgContext.clip()

        // Use UIImage drawing so orientation metadata is respected.
        let iw = img.size.width
        let ih = img.size.height
        let scale = min(imgRect.width / iw, imgRect.height / ih)
        let dw = iw * scale
        let dh = ih * scale
        let dx = imgRect.midX - dw / 2
        let dy = imgRect.midY - dh / 2
        img.draw(in: CGRect(x: dx, y: dy, width: dw, height: dh))
        ctx.cgContext.restoreGState()

        UIColor.black.withAlphaComponent(0.25).setStroke()
        UIBezierPath(roundedRect: imgRect, cornerRadius: 4).stroke()
      }

      // Barcode image
      let headerBottom = max(skuRect.maxY, imgRect.maxY)
      let barcodeTop = headerBottom + 1
      let barcodeRect = CGRect(x: bounds.minX, y: barcodeTop, width: bounds.width, height: bounds.maxY - barcodeTop)
      if let barcode = Code128Barcode.make(payload: skuString) {
        let img = barcode
        // Snap to whole points to avoid fractional scaling artifacts (thin-looking bars).
        let target = barcodeRect.insetBy(dx: 1, dy: 0).integral
        ctx.cgContext.interpolationQuality = .none
        ctx.cgContext.setAllowsAntialiasing(false)
        ctx.cgContext.setShouldAntialias(false)
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

  /// Rotates each page of the PDF 90° and flips so text isn't mirrored. clockwise: true = CW, false = CCW.
  static func rotatePDF90(_ data: Data, clockwise: Bool) -> Data? {
    guard let doc = PDFDocument(data: data), doc.pageCount > 0 else { return nil }
    var pages: [(CGRect, PDFPage)] = []
    for i in 0 ..< doc.pageCount {
      guard let page = doc.page(at: i) else { continue }
      let bounds = page.bounds(for: .mediaBox)
      let rotatedSize = CGSize(width: bounds.height, height: bounds.width)
      pages.append((CGRect(origin: .zero, size: rotatedSize), page))
    }
    guard let first = pages.first else { return nil }
    let angle: CGFloat = clockwise ? -.pi / 2 : .pi / 2
    let renderer = UIGraphicsPDFRenderer(bounds: first.0)
    let rotatedData = renderer.pdfData { ctx in
      for (rect, page) in pages {
        ctx.beginPage(withBounds: rect, pageInfo: [:])
        let cg = ctx.cgContext
        cg.saveGState()
        if clockwise {
          cg.translateBy(x: 0, y: rect.width - rect.height)
          cg.translateBy(x: 0, y: rect.height)
          cg.rotate(by: angle)
          cg.translateBy(x: rect.width, y: 0)
          cg.scaleBy(x: -1, y: 1)
        } else {
          cg.translateBy(x: 0, y: rect.width - rect.height)
          cg.translateBy(x: rect.width, y: 0)
          cg.rotate(by: angle)
          cg.translateBy(x: 0, y: rect.height)
          cg.scaleBy(x: 1, y: -1)
        }
        page.draw(with: .mediaBox, to: cg)
        cg.restoreGState()
      }
    }
    return rotatedData
  }

  /// rotate90Clockwise: nil = no rotation, true = 90° CW, false = 90° CCW
  @MainActor
  static func presentPrintSheet(
    pdfData: Data,
    jobName: String,
    orientation: UIPrintInfo.Orientation = .portrait,
    rotate90Clockwise: Bool? = nil,
    onComplete: ((Bool, Error?) -> Void)? = nil
  ) {
    let dataToPrint: Data
    if let cw = rotate90Clockwise, let rotated = rotatePDF90(pdfData, clockwise: cw) {
      dataToPrint = rotated
    } else {
      dataToPrint = pdfData
    }
    let controller = UIPrintInteractionController.shared
    controller.printingItem = dataToPrint
    controller.printInfo = {
      let info = UIPrintInfo(dictionary: nil)
      info.outputType = .general
      info.jobName = jobName
      info.orientation = orientation
      return info
    }()

    controller.present(animated: true) { _, completed, error in
      onComplete?(completed, error)
    }
  }

  static func loadProductImage(urlString: String?) async -> UIImage? {
    let trimmed = (urlString ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return nil }
    var req = URLRequest(url: url)
    req.cachePolicy = .returnCacheDataElseLoad
    req.timeoutInterval = 6

    do {
      let (data, resp) = try await URLSession.shared.data(for: req)
      let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
      if status >= 400 { return nil }
      return UIImage(data: data)
    } catch {
      return nil
    }
  }
}

enum Code128Barcode {
  static func make(payload: String) -> UIImage? {
    guard let data = payload.data(using: .ascii),
          let filter = CIFilter(name: "CICode128BarcodeGenerator")
    else { return nil }

    filter.setValue(data, forKey: "inputMessage")
    // A bit of quiet space helps scan reliability and looks more "normal".
    filter.setValue(7, forKey: "inputQuietSpace")

    guard let output = filter.outputImage else { return nil }

    // Scale up without blurring
    // Slightly larger scale yields a bolder-looking barcode when drawn into a small label.
    let scaleX: CGFloat = 5.0
    let scaleY: CGFloat = 5.0
    let scaled = output.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

    // Slightly thicken bars (subtle) while staying scannable.
    // This expands dark regions a bit, making the barcode look less "hairline" in previews.
    let thickened: CIImage = {
      guard let f = CIFilter(name: "CIMorphologyMinimum") else { return scaled }
      f.setValue(scaled, forKey: kCIInputImageKey)
      f.setValue(1.2, forKey: kCIInputRadiusKey)
      return f.outputImage ?? scaled
    }()
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cg = context.createCGImage(thickened, from: thickened.extent) else { return nil }
    return UIImage(cgImage: cg)
  }
}

