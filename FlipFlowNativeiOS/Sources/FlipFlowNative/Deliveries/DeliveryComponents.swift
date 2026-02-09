import SwiftUI

struct DeliveryThumb: View {
  let urlString: String?

  var body: some View {
    let url = URL(string: (urlString ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    return ZStack {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(Color.white.opacity(0.06))
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.white.opacity(0.10), lineWidth: 1)
        )

      if let url {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView().tint(.white.opacity(0.8))
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
              .clipped()
          case .failure:
            Image(systemName: "photo")
              .font(.system(size: 18, weight: .semibold))
              .foregroundStyle(Color.white.opacity(0.65))
          @unknown default:
            EmptyView()
          }
        }
      } else {
        Image(systemName: "photo")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(Color.white.opacity(0.65))
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

struct DeliveryStatusBadge: View {
  let status: String

  var body: some View {
    let s = status.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    // Canonical statuses (match API): shipped, in_transit, out_for_delivery, delivered, exception, unknown. No hyphens in labels.
    let (label, color, icon): (String, Color, String) = {
      switch s {
      case "delivered":
        return ("Delivered", Color.green.opacity(0.95), "checkmark.circle.fill")
      case "out_for_delivery", "out for delivery":
        return ("Out for delivery", NeonTheme.accentCyan.opacity(0.95), "location.fill")
      case "in_transit", "in transit":
        return ("In transit", Color.white.opacity(0.85), "truck.box.fill")
      case "shipped":
        return ("Shipped", Color.white.opacity(0.78), "shippingbox.fill")
      case "exception", "delayed":
        return ("Exception", Color.orange.opacity(0.95), "exclamationmark.triangle.fill")
      case "unknown":
        return ("Unknown", Color.white.opacity(0.60), "questionmark.circle.fill")
      default:
        return ("Unknown", Color.white.opacity(0.60), "questionmark.circle.fill")
      }
    }()

    return HStack(spacing: 6) {
      Image(systemName: icon)
        .font(.caption2.weight(.semibold))
      Text(label)
        .font(.caption2.weight(.semibold))
    }
    .foregroundStyle(color)
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Color.black.opacity(0.28), in: Capsule())
  }
}

