# StockX Shipping Fulfillment – Guide

This guide covers the sales fulfillment flow for the iOS app: printing shipping labels, listing and marking orders as shipped (with undo), pick instructions by SKU, end-of-day reconciliation (shipped vs scanned), and pick verification (scan to confirm correct SKU).

---

## Overview

- **Print labels:** Fetch StockX shipping label PDF and send to printer (same Air Print flow as SKU labels).
- **Items needing shipment:** Show count and list of orders that still need to be shipped.
- **Mark as shipped / Undo:** Local app state only (not StockX). Mark when you ship; undo if needed.
- **Pick instruction:** For each sale, show which SKU (and style ID) to pull.
- **Reconciliation:** EOD: you shipped N items; scan M packages (tracking numbers); app shows which of the N are missing from the M scans.
- **Pick verification:** Find item, scan barcode; app compares scanned value to required SKU and style ID. Match if scanned equals either SKU or style ID (exact string match). "Correct item" or "Wrong item – expected X."

**Note:** We use Standard/Direct shipping almost exclusively. Shipping label APIs support Standard/Direct orders only; Flex can be added later if needed.

---

## StockX Shipping Label API

Reference: `Stockx Public Api Documentation.json` (Shipment schema, shipping-document endpoints).

- **Single order** (`GET /selling/orders/{orderNumber}`) can include **Shipment** with `shippingLabelUrl` and `shippingDocumentUrl`.
- **List documents:** `GET /api/stockx/shipping-document?orderNumber=06-XXXXX`  
  Returns JSON: `shippingDocuments` (thermalLabelOnly, sellerShippingInstructions.thermalLabel, etc.). **Standard/Direct orders only.**
- **Get PDF:** `GET /api/stockx/shipping-document/pdf?orderNumber=06-XXXXX&shippingId=S-123`  
  Returns binary PDF. Use a document ID from the list response (e.g. first available thermal or required document).

**Auth:** StockX cookies (web) or Bearer token (native app). Native app uses same Bearer as Repricing/Purchases.

**404 / no document:** If the API returns 404 or empty documents, the backend returns a clear message: *"No shipping label available for this order. Shipping labels are only available for Standard/Direct orders."* The iOS app should show this message and not crash.

---

## Printing Shipping Labels on iOS

Same pattern as SKU labels in `LabelPrinting.swift`:

1. User taps "Print shipping label" for an order (or enters order number).
2. Call `GET /api/stockx/shipping-document?orderNumber=06-XXXXX` with Bearer auth.
3. From the response, get the first available document ID (e.g. from `shippingDocuments.thermalLabelOnly` or first entry in `requiredDocuments` / `sellerShippingInstructions.thermalLabel`). If the list is empty or the API returned 404, show: *"No shipping label available. Shipping labels are only available for Standard/Direct orders."*
4. Call `GET /api/stockx/shipping-document/pdf?orderNumber=06-XXXXX&shippingId=<id>` with Bearer auth. Request returns PDF bytes (or JSON error with the same 404 message if no label).
5. Pass the PDF `Data` to `LabelPrinting.presentPrintSheet(pdfData, jobName: "StockX \(orderNumber)", completion)` so the user picks printer (e.g. DYMO via Air Print) and prints.

Printing a label does **not** mark the order as shipped on StockX. Marking as shipped in the app is local only.

---

## Items Needing Shipment

- **Source:** StockX active (or history) orders, filtered by status (e.g. needs shipment).
- **Local state:** Backend stores "marked as shipped" per order number (see below). Merge: show "X still to ship" and list by combining StockX orders with local marked list (exclude marked from "to ship" or show both lists).

---

## Mark as Shipped and Undo

- **Storage:** Backend (Firestore) stores for each user: set of order numbers marked as shipped and optional timestamp. Collection: `markedShipped`, document per user, e.g. `{ orderNumbers: { "06-XXX": 1234567890 } }`.
- **API:**
  - `GET /api/shipping-fulfillment/marked` – list order numbers marked as shipped for the current user.
  - `POST /api/shipping-fulfillment/mark` – body `{ "orderNumber": "06-XXX" }` – add to marked.
  - `POST /api/shipping-fulfillment/undo` – body `{ "orderNumber": "06-XXX" }` – remove from marked.
- **Auth:** Bearer (native) or session/cookie (web). Resolve user ID and read/write that user’s document only.
- This does **not** call StockX to update order status; it is local tracking only.

---

## Pick Instruction

For each sale/order, display **"Pull: &lt;SKU&gt;"** (and optionally style ID and product name/size). Data comes from existing order APIs: `product.sku`, `product.styleId` (e.g. from `orders/history`, `orders/active`, or order-lookup).

---

## Reconciliation

- **Batch:** "Shipped today" or user-selected set of orders (order numbers) that were marked as shipped.
- **Scan target:** **Tracking numbers.** User scans each package’s tracking number at EOD.
- **Flow:** App has a list of N orders in the batch (each with tracking number from StockX or our data). User scans M packages. App records scanned tracking numbers and compares to the batch. Show: "Scanned 9 of 10 – missing: order 06-XXX" (or missing tracking number) so you know which package is missing.

---

## Pick Verification

- **Screen:** Shows required SKU and style ID for the current order.
- **User:** Finds item manually and scans its barcode.
- **Match rule:** Scanned string is compared to **both** the order’s SKU and the order’s style ID (trimmed, exact string match). If the scanned value equals **either** the SKU **or** the style ID, show **"Correct item"**. Otherwise show **"Wrong item – expected SKU &lt;X&gt; / style ID &lt;Y&gt;"**.
- **Implementation:** Normalize by trimming; optional case-insensitive comparison if barcodes use different casing. No need to choose "just one" – supporting both SKU and style ID is the intended behavior.

---

## iOS Navigation

- **Placement:** Implement as a **5th tab "Ship"** (or "More" with "Shipping fulfillment" as first item) in `MainTabView`.
- **Structure:** One tab that opens a flow with a `NavigationStack` and subpages:
  - **To Ship** – List and count of orders needing shipment; mark as shipped; undo.
  - **Print label** – Per order: fetch document list → fetch PDF → present print sheet (with 404 handling).
  - **Reconciliation** – Select batch (e.g. shipped today), scan tracking numbers, show missing.
  - **Pick verification** – Show required SKU/style ID, scan barcode, show Correct/Wrong (match SKU or style ID).

---

## Implementation Checklist

1. Backend: Clear 404 message for shipping-document and shipping-document/pdf (no document / Standard-only).
2. Backend: Marked-shipped Firestore collection and API (GET marked, POST mark, POST undo).
3. iOS: Add Ship (or More) tab and NavigationStack with subpages.
4. iOS: To Ship list (fetch orders, merge with marked, mark/undo calls).
5. iOS: Print label flow (fetch list → get shippingId → fetch PDF → presentPrintSheet; show 404 message when no document).
6. iOS: Pick instruction (show SKU and style ID per order from API).
7. iOS: Reconciliation (batch of orders with tracking, scan tracking numbers, diff and show missing).
8. iOS: Pick verification (show SKU/style ID, scan, compare to both; show Correct or Wrong).

---

## Testing Without Affecting StockX

- **Printing a label** only retrieves the label; it does not change any order state on StockX.
- **Mark as shipped / Undo** only update our backend; no StockX API is called.
- Use a real Standard/Direct order number to test print; if the order has no document (e.g. Flex or 404), you’ll see the clear "No shipping label available…" message.
