import Foundation

enum DeliveryTrackingLink {
  static func url(carrierRaw: String, trackingNumberRaw: String) -> URL? {
    let tracking = trackingNumberRaw.trimmingCharacters(in: .whitespacesAndNewlines)
    if tracking.isEmpty { return nil }
    let carrier = carrierRaw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

    if carrier.contains("ups") {
      return URL(string: "https://www.ups.com/track?loc=en_US&tracknum=\(tracking.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tracking)")
    }
    if carrier.contains("fedex") || carrier.contains("fed ex") {
      return URL(string: "https://www.fedex.com/fedextrack/?trknbr=\(tracking.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tracking)")
    }
    if carrier.contains("usps") {
      return URL(string: "https://tools.usps.com/go/TrackConfirmAction?tLabels=\(tracking.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tracking)")
    }

    return nil
  }
}

