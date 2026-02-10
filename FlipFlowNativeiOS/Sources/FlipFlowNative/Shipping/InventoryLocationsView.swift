import SwiftUI

/// Manage SKU/style ID → pick location (bin/shelf). Used by Ready to Ship to show "Pick from X".
struct InventoryLocationsView: View {
  @EnvironmentObject private var auth: AuthViewModel
  let userId: String
  @State private var locations: [String: String] = [:]
  @State private var isLoading = false
  @State private var bannerMessage: String?
  @State private var showAddSheet = false
  @State private var newSku = ""
  @State private var newLocation = ""
  @State private var skuToDelete: String?

  private let baseURL = URL(string: "https://www.solesmarket.com")!

  private var sortedEntries: [(key: String, value: String)] {
    locations.sorted { $0.key.localizedCaseInsensitiveCompare($1.key) == .orderedAscending }
  }

  var body: some View {
    ZStack {
      NeonTheme.backgroundGradient
        .ignoresSafeArea()
      VStack(spacing: 16) {
        if let msg = bannerMessage {
          Text(msg)
            .font(.subheadline)
            .foregroundStyle(NeonTheme.accentCyan)
            .padding(.horizontal)
        }
        if isLoading && locations.isEmpty {
          ProgressView()
            .tint(.white)
          Spacer()
        } else {
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
              Text("Ready to Ship will show “Pick from [location]” when a pending order’s SKU matches an entry below.")
                .font(.caption)
                .foregroundStyle(NeonTheme.textSecondary)
                .padding(.horizontal, 20)

              ForEach(sortedEntries, id: \.key) { entry in
                NeonCard {
                  HStack {
                    VStack(alignment: .leading, spacing: 2) {
                      Text(entry.key)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NeonTheme.textPrimary)
                      Text(entry.value)
                        .font(.caption)
                        .foregroundStyle(NeonTheme.textSecondary)
                    }
                    Spacer()
                    Button(role: .destructive) {
                      skuToDelete = entry.key
                    } label: {
                      Image(systemName: "trash")
                        .font(.body)
                        .foregroundStyle(Color.orange)
                    }
                  }
                  .padding(.horizontal, 16)
                }
                .padding(.horizontal, 16)
              }

              if locations.isEmpty {
                NeonCard {
                  VStack(spacing: 10) {
                    Image(systemName: "location.slash")
                      .font(.system(size: 28))
                      .foregroundStyle(NeonTheme.textSecondary.opacity(0.8))
                    Text("No pick locations yet")
                      .font(.headline.weight(.semibold))
                      .foregroundStyle(NeonTheme.textPrimary)
                    Text("Add SKU or style ID and a location (e.g. bin A1) so Ready to Ship can tell you where to pick.")
                      .font(.caption)
                      .foregroundStyle(NeonTheme.textSecondary)
                      .multilineTextAlignment(.center)
                  }
                  .frame(maxWidth: .infinity)
                  .padding(.vertical, 12)
                }
                .padding(.horizontal, 16)
              }
            }
            .padding(.vertical, 8)
          }
          .scrollContentBackground(.hidden)
          .background(Color.clear)
        }
      }
      .padding(.top, 8)
    }
    .navigationTitle("Pick locations")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Add") {
          newSku = ""
          newLocation = ""
          showAddSheet = true
        }
        .foregroundStyle(NeonTheme.accentCyan)
      }
    }
    .task {
      await loadLocations()
    }
    .sheet(isPresented: $showAddSheet) {
      addSheet
    }
    .alert("Remove location?", isPresented: Binding(
      get: { skuToDelete != nil },
      set: { if !$0 { skuToDelete = nil } }
    )) {
      Button("Cancel", role: .cancel) { skuToDelete = nil }
      Button("Remove", role: .destructive) {
        if let sku = skuToDelete {
          Task { await deleteLocation(sku: sku) }
        }
        skuToDelete = nil
      }
    } message: {
      if let sku = skuToDelete {
        Text("Remove “\(sku)” from pick locations?")
      }
    }
  }

  private var addSheet: some View {
    NavigationStack {
      ZStack {
        NeonTheme.backgroundGradient
          .ignoresSafeArea()
        VStack(spacing: 20) {
          NeonCard {
            VStack(alignment: .leading, spacing: 12) {
              Text("SKU or style ID")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(NeonTheme.textSecondary)
              TextField("e.g. 192HO246250F", text: $newSku)
                .textFieldStyle(.plain)
                .neonTextFieldStyle()
                .autocapitalization(.none)
                .autocorrectionDisabled()
              Text("Location (bin / shelf)")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(NeonTheme.textSecondary)
              TextField("e.g. C12 or type any", text: $newLocation)
                .textFieldStyle(.plain)
                .neonTextFieldStyle()
              Text("Format A1–A999 per bin; max 5 items per bin. Each slot is unique (never reused).")
                .font(.caption)
                .foregroundStyle(NeonTheme.textSecondary.opacity(0.9))
              slotQuickSelect
            }
          }
          .padding(.horizontal, 16)

          Button("Save") {
            Task { await saveAndClose() }
          }
          .fontWeight(.semibold)
          .foregroundStyle(.white)
          .buttonStyle(NeonPrimaryButtonStyle())
          .padding(.horizontal, 16)
          .disabled(newSku.trimmingCharacters(in: .whitespaces).isEmpty || newLocation.trimmingCharacters(in: .whitespaces).isEmpty)

          Spacer()
        }
        .padding(.top, 24)
      }
      .navigationTitle("Add pick location")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(.hidden, for: .navigationBar)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { showAddSheet = false }
            .foregroundStyle(NeonTheme.accentCyan)
        }
      }
    }
    .environmentObject(auth)
  }

  /// Quick-select grid: 8 bins A–H × 5 slots (A1–A5 … H1–H5). Tap to set location.
  private var slotQuickSelect: some View {
    let bins = ["A", "B", "C", "D", "E", "F", "G", "H"]
    let slotsPerBin = 5
    return VStack(alignment: .leading, spacing: 8) {
      Text("Quick select")
        .font(.caption.weight(.medium))
        .foregroundStyle(NeonTheme.textSecondary)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
        ForEach(bins, id: \.self) { bin in
          ForEach(1 ... slotsPerBin, id: \.self) { num in
            let slot = "\(bin)\(num)"
            Button {
              newLocation = slot
            } label: {
              Text(slot)
                .font(.caption.weight(.medium))
                .foregroundStyle(newLocation == slot ? .black : NeonTheme.textPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                  newLocation == slot ? NeonTheme.accentCyan : Color.white.opacity(0.08),
                  in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }

  private func loadLocations() async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    guard let url = baseURL.appendingPathComponent("api/inventory/locations") as URL? else { return }
    var req = URLRequest(url: url)
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    await MainActor.run { isLoading = true }
    defer { Task { @MainActor in isLoading = false } }
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
        await MainActor.run { bannerMessage = "Could not load locations." }
        return
      }
      let decoded = try JSONDecoder().decode(InventoryLocationsResponse.self, from: data)
      await MainActor.run {
        locations = decoded.locations ?? [:]
        bannerMessage = nil
      }
    } catch {
      await MainActor.run { bannerMessage = "Could not load locations." }
    }
  }

  private func saveAndClose() async {
    let sku = newSku.trimmingCharacters(in: .whitespaces)
    let loc = newLocation.trimmingCharacters(in: .whitespaces)
    guard !sku.isEmpty, !loc.isEmpty,
          let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    guard let url = baseURL.appendingPathComponent("api/inventory/locations") as URL? else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONEncoder().encode(["sku": sku, "location": loc])
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
        await MainActor.run { bannerMessage = "Could not save." }
        return
      }
      let decoded = try JSONDecoder().decode(InventoryLocationPostResponse.self, from: data)
      await MainActor.run {
        locations = decoded.locations ?? locations
        showAddSheet = false
        bannerMessage = nil
      }
    } catch {
      await MainActor.run { bannerMessage = "Could not save." }
    }
  }

  private func deleteLocation(sku: String) async {
    guard let bearer = try? await auth.getApiBearerToken(forcingRefresh: false), !bearer.isEmpty else { return }
    var comps = URLComponents(url: baseURL.appendingPathComponent("api/inventory/locations"), resolvingAgainstBaseURL: false)!
    comps.queryItems = [URLQueryItem(name: "sku", value: sku)]
    guard let url = comps.url else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "DELETE"
    req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      guard let http = res as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else { return }
      let decoded = try JSONDecoder().decode(InventoryLocationDeleteResponse.self, from: data)
      await MainActor.run { locations = decoded.locations ?? locations }
    } catch { /* non-fatal */ }
  }
}

private struct InventoryLocationsResponse: Decodable {
  let locations: [String: String]?
}

private struct InventoryLocationPostResponse: Decodable {
  let locations: [String: String]?
}

private struct InventoryLocationDeleteResponse: Decodable {
  let locations: [String: String]?
}
