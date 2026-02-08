import SwiftUI

struct DeliveryDetailView: View {
  let item: DeliveryItem

  @State private var safariItem: IdentifiableURL?

  var body: some View {
    NeonScreen {
      NavigationStack {
        ScrollView {
          VStack(spacing: 14) {
            header
              .padding(.horizontal, 16)
              .padding(.top, 12)

            infoCard
              .padding(.horizontal, 16)

            updatesCard
              .padding(.horizontal, 16)
              .padding(.bottom, 20)
          }
        }
        .navigationTitle("Package")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            if let s = item.emailUrl, let url = URL(string: s), !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              Button {
                safariItem = IdentifiableURL(url: url)
              } label: {
                Image(systemName: "envelope.open")
                  .foregroundStyle(.white)
              }
            }
          }
        }
      }
    }
    .sheet(item: $safariItem) { item in
      SafariSheet(url: item.url)
    }
  }

  private var header: some View {
    NeonCard {
      HStack(alignment: .top, spacing: 12) {
        DeliveryThumb(urlString: item.productImage)
          .frame(width: 72, height: 72)

        VStack(alignment: .leading, spacing: 8) {
          Text(item.productName.isEmpty ? "Unknown Product" : item.productName)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(3)

          Text([item.productBrand, item.productSize].filter { !$0.isEmpty }.joined(separator: " • "))
            .font(.subheadline)
            .foregroundStyle(NeonTheme.textSecondary)
            .lineLimit(1)

          HStack(spacing: 10) {
            DeliveryStatusBadge(status: item.status)
            Spacer()
          }
        }
      }
    }
  }

  private var infoCard: some View {
    NeonCard {
      VStack(alignment: .leading, spacing: 10) {
        row(label: "Carrier", value: item.carrier)
        trackingRow
        if let eta = displayDate(item.estimatedDelivery) {
          row(label: "Estimated", value: eta)
        }
        if let actual = displayDate(item.actualDelivery) {
          row(label: "Delivered", value: actual)
        }
        if let note = nonEmpty(item.statusNote) {
          row(label: "Note", value: note)
        }
        if let o = nonEmpty(item.origin) {
          row(label: "Origin", value: o)
        }
        if let d = nonEmpty(item.destination) {
          row(label: "Destination", value: d)
        }
        if let last = displayDate(item.lastUpdate) {
          row(label: "Last update", value: last)
        }
      }
    }
  }

  private var trackingRow: some View {
    let tracking = item.trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
    let url = DeliveryTrackingLink.url(carrierRaw: item.carrier, trackingNumberRaw: tracking)

    return HStack(alignment: .top, spacing: 10) {
      Text("Tracking")
        .font(.caption.weight(.semibold))
        .foregroundStyle(NeonTheme.textSecondary)
        .frame(width: 90, alignment: .leading)

      Text(tracking.isEmpty ? "—" : tracking)
        .font(.caption.monospaced().weight(.semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)

      if let url {
        Button {
          safariItem = IdentifiableURL(url: url)
        } label: {
          Image(systemName: "safari.fill")
            .foregroundStyle(NeonTheme.accentCyan.opacity(0.95))
            .padding(8)
            .background(Color.white.opacity(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open carrier tracking")
      }
    }
  }

  private var updatesCard: some View {
    NeonCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Text("Updates")
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
          Spacer()
        }

        if item.updates.isEmpty {
          Text("No live tracking updates yet.")
            .font(.subheadline)
            .foregroundStyle(NeonTheme.textSecondary)
        } else {
          VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(item.updates.prefix(12)).indices, id: \.self) { idx in
              let u = item.updates[idx]
              VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                  Text(displayDate(u.timestamp) ?? "—")
                    .font(.caption2.monospaced().weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.75))
                  if let loc = nonEmpty(u.location) {
                    Text(loc)
                      .font(.caption2.weight(.semibold))
                      .foregroundStyle(NeonTheme.textSecondary)
                      .lineLimit(1)
                  }
                  Spacer()
                }

                if let desc = nonEmpty(u.description) {
                  Text(desc)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                } else if let st = nonEmpty(u.status) {
                  Text(st)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                }
              }

              if idx != min(item.updates.count, 12) - 1 {
                Divider().overlay(Color.white.opacity(0.08))
              }
            }
          }
        }
      }
    }
  }

  private func row(label: String, value: String?, mono: Bool = false) -> some View {
    let v = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return HStack(alignment: .top, spacing: 10) {
      Text(label)
        .font(.caption.weight(.semibold))
        .foregroundStyle(NeonTheme.textSecondary)
        .frame(width: 90, alignment: .leading)
      Text(v.isEmpty ? "—" : v)
        .font(mono ? .caption.monospaced().weight(.semibold) : .caption)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func nonEmpty(_ s: String?) -> String? {
    let t = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }

  private func displayDate(_ raw: String?) -> String? {
    guard let s = nonEmpty(raw) else { return nil }
    // If it's ISO, show a compact local date/time; otherwise return as-is.
    if let d = DateParsing.bestEffortDate(from: s) {
      return DateFormatter.localizedString(from: d, dateStyle: .medium, timeStyle: .short)
    }
    return s
  }
}

