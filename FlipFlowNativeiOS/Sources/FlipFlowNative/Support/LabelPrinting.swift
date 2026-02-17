import Foundation
import SwiftUI
import UIKit
import PDFKit

/// Retained as print controller delegate so we can auto-pick paper size (e.g. 4×6 for shipping, 1.2"×2.2" for SKU).
private final class LabelPrintDelegate: NSObject, UIPrintInteractionControllerDelegate {
  let desiredSize: CGSize

  init(desiredSize: CGSize) {
    self.desiredSize = desiredSize
  }

  func printInteractionController(
    _ printInteractionController: UIPrintInteractionController,
    choosePaper paperList: [UIPrintPaper]
  ) -> UIPrintPaper {
    guard let first = paperList.first else {
      fatalError("UIPrintInteractionController choosePaper called with empty paper list")
    }
    // When we want 4×6, explicitly pick a paper that matches 4×6" (either orientation) so we don't get 2.2×1.2.
    let fourBySixW = 4 * 72 as CGFloat
    let fourBySixH = 6 * 72 as CGFloat
    let tolerance: CGFloat = 18 // ~0.25"
    if desiredSize.width >= fourBySixW - tolerance, desiredSize.height >= fourBySixH - tolerance {
      for paper in paperList {
        let r = paper.paperSize
        let w = r.width
        let h = r.height
        let is4x6Portrait = abs(w - fourBySixW) <= tolerance && abs(h - fourBySixH) <= tolerance
        let is4x6Landscape = abs(w - fourBySixH) <= tolerance && abs(h - fourBySixW) <= tolerance
        if is4x6Portrait || is4x6Landscape {
          return paper
        }
      }
    }
    return UIPrintPaper.bestPaper(forPageSize: desiredSize, withPapersFrom: paperList) ?? first
  }
}

enum LabelPrinting {
  // 1 inch = 72 points in PDF space.
  // User label: 1.25" x 2.25" (commonly 2.25w x 1.25h in landscape).
  static let labelSizePoints = CGSize(width: 2.25 * 72.0, height: 1.25 * 72.0)
  /// 4×6" shipping label; use with print-as-photo so AirPrint defaults to 4×6.
  static let shippingLabel4x6Points = CGSize(width: 4 * 72, height: 6 * 72)
  /// 6×4" (landscape) for insert so it uses 6" for width; same paper, different orientation.
  static let shippingLabel6x4Points = CGSize(width: 6 * 72, height: 4 * 72)

  private static var printDelegate: LabelPrintDelegate?

  static func makeLabelPDF(
    sku: String,
    productName: String?,
    productSize: String?,
    styleId: String?,
    productImage: UIImage?,
    isTest: Bool,
    purchasePrice: String? = nil
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
        p.lineBreakMode = .byWordWrapping
        return p
      }()
      let paragraphSub: NSParagraphStyle = {
        let p = NSMutableParagraphStyle()
        p.lineBreakMode = .byTruncatingTail
        return p
      }()

      // Layout: title (up to 2 lines, left-aligned) then size/SKU then barcode.
      let titleInsetX: CGFloat = 1
      let titleMaxHeight: CGFloat = 26
      let titleRect = CGRect(x: bounds.minX + titleInsetX, y: bounds.minY, width: bounds.width - titleInsetX, height: titleMaxHeight)
      let titleAttrs2: [NSAttributedString.Key: Any] = titleAttrs.merging([.paragraphStyle: paragraphTitle]) { $1 }
      (title as NSString).draw(with: titleRect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: titleAttrs2, context: nil)

      let rowY = titleRect.maxY + 2
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

      var skuY = subRect.maxY + 1
      if let price = purchasePrice?.trimmingCharacters(in: .whitespacesAndNewlines), !price.isEmpty {
        let priceAttrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 8, weight: .medium),
          .foregroundColor: UIColor.black.withAlphaComponent(0.85),
          .paragraphStyle: paragraphSub,
        ]
        let priceLine = "Paid: \(price)"
        let priceRect = CGRect(x: bounds.minX, y: skuY, width: bounds.width - textRightPad, height: 9)
        (priceLine as NSString).draw(with: priceRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: priceAttrs, context: nil)
        skuY = priceRect.maxY + 1
      }

      let skuRect = CGRect(x: bounds.minX, y: skuY, width: bounds.width - textRightPad, height: 10)
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

  /// If the PDF has more than one page, returns a new PDF with only the first page (no re-render, so orientation stays correct).
  static func pdfDataSinglePage(_ data: Data) -> Data {
    guard let doc = PDFDocument(data: data), doc.pageCount > 0 else { return data }
    if doc.pageCount == 1 { return data }
    let onePage = PDFDocument()
    guard let first = doc.page(at: 0) else { return data }
    onePage.insert(first, at: 0)
    return onePage.dataRepresentation() ?? data
  }

  /// Returns the mediaBox bounds for the first page (single-page safe).
  static func firstPageBounds(_ pdfData: Data) -> CGRect? {
    let onePage = pdfDataSinglePage(pdfData)
    guard let doc = PDFDocument(data: onePage), doc.pageCount > 0, let page = doc.page(at: 0) else { return nil }
    return page.bounds(for: .mediaBox)
  }

  /// Renders the first page of the PDF to an image at the given size (in points). Use for print-as-photo so AirPrint can default to 4×6.
  /// Pass pre-rotated PDF data if you need rotation.
  static func image(fromPdf pdfData: Data, sizeInPoints: CGSize, scale: CGFloat = 2) -> UIImage? {
    let onePage = pdfDataSinglePage(pdfData)
    guard let doc = PDFDocument(data: onePage), doc.pageCount > 0, let page = doc.page(at: 0) else { return nil }
    let pageBounds = page.bounds(for: .mediaBox)
    guard pageBounds.width > 0, pageBounds.height > 0 else { return nil }
    let imageSize = CGSize(width: sizeInPoints.width * scale, height: sizeInPoints.height * scale)
    let renderer = UIGraphicsImageRenderer(size: imageSize)
    let image = renderer.image { ctx in
      let cg = ctx.cgContext
      cg.saveGState()
      cg.translateBy(x: 0, y: imageSize.height)
      cg.scaleBy(x: 1, y: -1)
      cg.scaleBy(x: imageSize.width / pageBounds.width, y: imageSize.height / pageBounds.height)
      page.draw(with: .mediaBox, to: cg)
      cg.restoreGState()
    }
    return image
  }

  /// Print one or more images as "photo" so AirPrint tends to default to 4×6. preferredPaperSize is used by the delegate to pick paper.
  @MainActor
  static func presentPrintSheetAsPhoto(
    images: [UIImage],
    jobName: String,
    preferredPaperSize: CGSize = LabelPrinting.shippingLabel4x6Points,
    onComplete: ((Bool, Error?) -> Void)? = nil
  ) {
    guard !images.isEmpty else {
      onComplete?(false, nil)
      return
    }
    let controller = UIPrintInteractionController.shared
    controller.printingItem = nil
    if images.count == 1 {
      controller.printingItem = images[0]
    } else {
      controller.printingItems = images
    }
    controller.showsNumberOfCopies = false
    controller.printInfo = {
      let info = UIPrintInfo(dictionary: nil)
      info.outputType = .photo
      info.jobName = jobName
      info.orientation = .portrait
      return info
    }()
    let delegate = LabelPrintDelegate(desiredSize: preferredPaperSize)
    Self.printDelegate = delegate
    controller.delegate = delegate
    controller.present(animated: true) { _, completed, error in
      Self.printDelegate = nil
      onComplete?(completed, error)
    }
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
    var dataToPrint: Data
    if let cw = rotate90Clockwise, let rotated = rotatePDF90(pdfData, clockwise: cw) {
      dataToPrint = rotated
    } else {
      dataToPrint = pdfData
    }
    dataToPrint = pdfDataSinglePage(dataToPrint)
    let controller = UIPrintInteractionController.shared
    controller.printingItems = nil
    controller.printingItem = dataToPrint
    controller.showsNumberOfCopies = false
    controller.printInfo = {
      let info = UIPrintInfo(dictionary: nil)
      info.outputType = .general
      info.jobName = jobName
      info.orientation = orientation
      return info
    }()

    let delegate = LabelPrintDelegate(desiredSize: labelSizePoints)
    Self.printDelegate = delegate
    controller.delegate = delegate
    controller.present(animated: true) { _, completed, error in
      Self.printDelegate = nil
      onComplete?(completed, error)
    }
  }

  /// Share PDF (e.g. for AirDrop to Mac to print with 4×6). Optionally rotates for label orientation.
  @MainActor
  static func presentShareSheet(
    pdfData: Data,
    filename: String,
    rotate90Clockwise: Bool? = nil,
    onComplete: (() -> Void)? = nil
  ) {
    var dataToShare: Data
    if let cw = rotate90Clockwise, let rotated = rotatePDF90(pdfData, clockwise: cw) {
      dataToShare = rotated
    } else {
      dataToShare = pdfData
    }
    dataToShare = pdfDataSinglePage(dataToShare)

    let ext = (filename as NSString).pathExtension.lowercased()
    let name = (ext == "pdf") ? filename : "\(filename).pdf"
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(name)
    do {
      try dataToShare.write(to: tmp)
    } catch {
      onComplete?()
      return
    }

    guard let vc = Self.topViewController else {
      try? FileManager.default.removeItem(at: tmp)
      onComplete?()
      return
    }

    let activity = UIActivityViewController(activityItems: [tmp], applicationActivities: nil)
    activity.completionWithItemsHandler = { _, _, _, _ in
      try? FileManager.default.removeItem(at: tmp)
      DispatchQueue.main.async { onComplete?() }
    }
    if let popover = activity.popoverPresentationController {
      popover.sourceView = vc.view
      popover.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 0, height: 0)
      popover.permittedArrowDirections = []
    }
    vc.present(activity, animated: true)
  }

  private static var topViewController: UIViewController? {
    guard let windowScene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .first(where: { $0.activationState == .foregroundActive }),
          let window = windowScene.windows.first(where: { $0.isKeyWindow }),
          let root = window.rootViewController
    else { return nil }
    var top = root
    while let presented = top.presentedViewController { top = presented }
    while let child = (top as? UINavigationController)?.topViewController ?? (top as? UITabBarController)?.selectedViewController {
      top = child
    }
    return top
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

    // Thicken bars by ~20% total (1.2 * 1.1 * 1.1) for better scan reliability and visibility.
    let thicknessRadius: CGFloat = 1.2 * 1.10 * 1.10
    let thickened: CIImage = {
      guard let f = CIFilter(name: "CIMorphologyMinimum") else { return scaled }
      f.setValue(scaled, forKey: kCIInputImageKey)
      f.setValue(thicknessRadius, forKey: kCIInputRadiusKey)
      return f.outputImage ?? scaled
    }()
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cg = context.createCGImage(thickened, from: thickened.extent) else { return nil }
    return UIImage(cgImage: cg)
  }
}

