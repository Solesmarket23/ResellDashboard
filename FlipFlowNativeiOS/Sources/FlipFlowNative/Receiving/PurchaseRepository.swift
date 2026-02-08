import Foundation
import FirebaseFirestore

protocol PurchaseRepositoryProtocol {
  func findPurchasesByTracking(trackingNumber: String, userId: String) async throws -> [PurchaseMatch]
  func assignSku(purchaseId: String, userId: String) async throws -> String
  func markReceived(
    purchaseId: String,
    userId: String,
    receivedMethod: String,
    receivedNotes: String?,
    alsoMarkDelivered: Bool
  ) async throws
  func unmarkReceived(purchaseId: String, userId: String) async throws
  func saveVerification(
    purchaseId: String,
    userId: String,
    authSelfStatus: AuthStatus,
    authSelfNotes: String,
    externalProvider: String,
    externalUrl: String,
    externalStatus: AuthStatus,
    stockxUnitQrRaw: String
  ) async throws
}

final class FirestorePurchaseRepository: PurchaseRepositoryProtocol {
  private let db = Firestore.firestore()

  private func ownerId(from data: [String: Any]) -> String {
    (data["userId"] as? String) ?? (data["uid"] as? String) ?? ""
  }

  private func makeWhereField(_ field: String, equals value: String) -> Query {
    // Firestore supports dot-path strings for whereField.
    // We keep it simple and mirror the web’s best-effort behavior.
    db.collection("purchases").whereField(field, isEqualTo: value).limit(to: 25)
  }

  func findPurchasesByTracking(trackingNumber: String, userId: String) async throws -> [PurchaseMatch] {
    let trimmed = trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return [] }

    let candidates = [
      "tracking",
      "trackingNumber",
      "tracking_number",
      "shipment.tracking",
      "shipment.trackingNumber",
    ]

    var byId: [String: PurchaseMatch] = [:]

    for field in candidates {
      let snap = try await makeWhereField(field, equals: trimmed).getDocuments()
      for doc in snap.documents {
        let data = doc.data()
        if ownerId(from: data) != userId { continue }
        byId[doc.documentID] = PurchaseMatch(id: doc.documentID, data: data)
      }
    }

    // Stable ordering: prefer newest updatedAt/createdAt if present; otherwise by id.
    let ordered = byId.values.sorted { a, b in
      return a.id > b.id
    }
    return ordered
  }

  func assignSku(purchaseId: String, userId: String) async throws -> String {
    let now = isoNow()
    let purchaseRef = db.collection("purchases").document(purchaseId)

    let result = try await db.runTransaction { tx, errPtr -> Any? in
      let purchaseSnap: DocumentSnapshot
      do {
        purchaseSnap = try tx.getDocument(purchaseRef)
      } catch {
        errPtr?.pointee = error as NSError
        return nil
      }

      let data = purchaseSnap.data() ?? [:]
      let owner = (data["userId"] as? String) ?? (data["uid"] as? String) ?? ""
      if !owner.isEmpty, owner != userId {
        errPtr?.pointee = NSError(domain: "FlipFlowNative.SKU", code: 403, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
        return nil
      }

      if let existing = data["sku"] as? String, !existing.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return existing
      }

      let code = SkuCode.generate(length: 7)

      tx.updateData(
        [
          "sku": code,
          "skuAssignedAt": now,
          "skuAssignedBy": userId,
          "updatedAt": now,
        ],
        forDocument: purchaseRef
      )

      return code
    }

    if let sku = result as? String { return sku }
    throw NSError(domain: "FlipFlowNative.SKU", code: 0, userInfo: [NSLocalizedDescriptionKey: "Assign SKU failed."])
  }

  private func isoNow() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
  }

  func markReceived(
    purchaseId: String,
    userId: String,
    receivedMethod: String,
    receivedNotes: String?,
    alsoMarkDelivered: Bool
  ) async throws {
    let now = isoNow()

    var updates: [String: Any] = [
      "received": true,
      "receivedAt": now,
      "receivedBy": userId,
      "receivedMethod": receivedMethod,
      "updatedAt": now,
    ]

    if let receivedNotes, !receivedNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      updates["receivedNotes"] = receivedNotes.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    if alsoMarkDelivered {
      updates["status"] = "delivered"
      updates["deliveryStatus"] = "delivered"
      updates["deliveredAt"] = now
      updates["actualDelivery"] = now
    }

    try await db.collection("purchases").document(purchaseId).updateData(updates)
  }

  func unmarkReceived(purchaseId: String, userId: String) async throws {
    let now = isoNow()
    let updates: [String: Any] = [
      "received": false,
      "receivedAt": FieldValue.delete(),
      "receivedBy": FieldValue.delete(),
      "receivedMethod": FieldValue.delete(),
      "receivedNotes": FieldValue.delete(),
      "updatedAt": now,
    ]
    try await db.collection("purchases").document(purchaseId).updateData(updates)
  }

  func saveVerification(
    purchaseId: String,
    userId: String,
    authSelfStatus: AuthStatus,
    authSelfNotes: String,
    externalProvider: String,
    externalUrl: String,
    externalStatus: AuthStatus,
    stockxUnitQrRaw: String
  ) async throws {
    let now = isoNow()

    var updates: [String: Any] = [
      "updatedAt": now,
      "authSelf": [
        "status": authSelfStatus.rawValue,
        "notes": authSelfNotes,
        "authenticatedAt": now,
        "authenticatedBy": userId,
      ],
    ]

    let extUrlTrim = externalUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    if !extUrlTrim.isEmpty {
      updates["authExternal"] = [
        "provider": externalProvider,
        "url": extUrlTrim,
        "status": externalStatus.rawValue,
        "verifiedAt": now,
        "verifiedBy": userId,
      ]
    }

    let stockxTrim = stockxUnitQrRaw.trimmingCharacters(in: .whitespacesAndNewlines)
    if !stockxTrim.isEmpty {
      // Avoid overwriting other keys under `stockx`
      updates["stockx.unitQrRaw"] = stockxTrim
      updates["stockx.unitQrScannedAt"] = now
      updates["stockx.unitQrScannedBy"] = userId
    }

    try await db.collection("purchases").document(purchaseId).updateData(updates)
  }
}

