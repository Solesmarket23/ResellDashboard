# Inventory & Pick Testing Guide

## Receiving → Firebase: make sure your work is saved

Use this checklist **before** processing real inventory in the iOS app so nothing is lost.

### 1. Turn OFF trial mode

- In **Receiving**, open the **menu** (top right).
- Tap **"Turn OFF trial mode (save to cloud)"** so it shows **"Turn ON trial mode (no saves)"** when you’re done.
- **Trial mode ON** = nothing is written to Firebase or the API (pick location, received, verification are all local-only or skipped).
- **Trial mode OFF** = writes are allowed when web sync is on.

### 2. Turn ON web sync (writes)

- In the same menu, tap **"Enable web sync (writes)"** so it’s enabled.
- When **web sync is OFF**, the app does not call the backend for assign-SKU, mark-received, or verification. Pick location is also gated by trial mode (see above).
- When **web sync is ON** and trial mode is OFF, all receiving actions that persist data will go to Firebase (or your API, depending on sign-in).

### 3. Be signed in

- You must be **signed in** (Firebase or site password). If you’re signed out, Receiving will show “Please sign in” and no data is saved.

### 4. Backend (API) is deployed

- **Assign to next slot** and **Choose specific slot** call your hosted API (`/api/purchases/set-pick-location`, `/api/inventory/next-available-slot`). So your Next.js app (e.g. on Vercel) must be **deployed** and reachable.
- **Mark received**, **verification**, and (when using site password) **lookup** go through the same backend when using “site password” sign-in. When using **Firebase** sign-in, mark received and verification write **directly to Firestore** from the app; lookup also uses Firestore. So:
  - **Firebase sign-in:** Pick location still uses the API; mark received + verification use Firestore. Ensure the app can reach your API for slots, and that Firebase is configured in the app.
  - **Site password sign-in:** All of the above go through your API; the API must be deployed and must have access to Firebase (or your data store).

### What gets saved when (and where)

| Action | Trial OFF + sync ON? | Where it’s saved |
|--------|----------------------|-------------------|
| **Assign to next slot** / **Choose specific slot** | Yes (and trial must be OFF) | API → Firebase (purchases: `pickLocation`) |
| **Mark as received** (button or “Start next item”) | Yes | Repo (Firestore or API) → `received: true` etc. |
| **Verification** (Authentic / Not authentic) | Yes (when you tap “Start next item” with sync ON) | Repo → purchase document |
| **Lookup** (tracking search) | Read-only | Firestore or API (no write) |

If **trial mode is ON**, none of the write actions above will run; you’ll see a message like “Trial mode is ON. Turn it off…” instead of saving.

### Quick verification

1. Turn **trial mode OFF** and **web sync ON** in the Receiving menu.
2. Process **one** item: scan/enter tracking → **Assign to next slot** (or choose a slot) → tap **Mark as received** (or complete the flow and **Start next item**).
3. In your Firebase Console (or your app’s “Assigned slots” / Ready to Ship), confirm the purchase has `pickLocation` and `received: true`. Then you’re good to process more.

---

## End-to-end checklist (what to test)

Use this list to confirm the full flow works. Pick **Path A** (receive → assign bin → allocation) or **Path B** (manual Pick locations only).

### Path A: Receive → Assign to bin → “Pick from X” (product-name allocation)

- [ ] **Prereqs:** At least one purchase in Firebase that is **received** and has a **product name** (e.g. from email parsing). You’ll need a pending StockX order with the **exact same product name** later.
- [ ] **Receiving:** In the app → **Receiving** → enter or scan the **tracking number** for that purchase → select the matching result.
- [ ] **Assign to bin:** Tap **“Assign to next slot”** (one tap). You should see e.g. “Assigned to A1.”  
  - *Optional:* Tap **“Or choose a specific slot…”** and Save to use a specific slot (e.g. C12).
- [ ] **StockX order:** Have a **pending (CREATED)** StockX order whose **product name** exactly matches that purchase. (Create a test sale on StockX if needed.)
- [ ] **Ready to Ship:** **Ship → Ready to Ship** → pull to refresh. That order should show **“Pick from A1”** (or the slot you assigned).
- [ ] **Verify:** On that order, tap **Verify** → scan the product barcode → should show “Correct item.”
- [ ] **Print label:** Tap the order → **Print label** → order number prefilled → print.

### Path B: Manual Pick locations (no receiving)

- [ ] **Ready to Ship:** **Ship → Ready to Ship**. Note the **SKU / style ID** of one pending order.
- [ ] **Pick locations:** **Ship → Pick locations → Add** → enter that **style ID** and a **location** (e.g. A1 or C12) → Save.
- [ ] **Ready to Ship:** Pull to refresh. That order should show **“Pick from [location]”.**
- [ ] **Verify / Print label:** Same as Path A (Verify scan, Print label).

### Sanity checks

- [ ] **Next slot:** Assign a few items in Receiving; first should get A1, then A2, … then B1 when bin A has 5.
- [ ] **Conflict:** In “Or choose a specific slot…”, try saving a slot already in use → should see an error (e.g. “That slot is already in use”).

---

## Your bin system (A–H, slot number e.g. C12)

Using **8 bins (A–H)** and **slot = bin letter + number** (e.g. **C12** = Bin C, slot 12) is a solid, common approach:

- **Bins:** A, B, C, D, E, F, G, H  
- **Slots:** Format **A1–A999** (and B1–B999, …) per bin. Each slot is **unique and never reused** (e.g. once A3 is assigned, it will never be suggested again).  
- **Max 5 items per bin:** At most 5 items can be in bin A at once; then the next item is suggested in bin B, etc. So you get many possible slots (up to 999 per bin) but only 5 in use per bin at a time.  
- **Next slot:** The app suggests the **next available** slot: first bin with &lt; 5 items, then the smallest slot number in that bin that has never been used.

---

## How “Pick from C12” is chosen

Ready to Ship matches by **product name** (exact match after normalizing spaces) and uses **oldest received items first** (FIFO).

1. **First:** For each pending order, the app calls the **allocate-for-order** API with the order’s **product name** (e.g. `"Fear of God Essentials Fleece Hoodie (FW24) Black"`). The API finds a **received** purchase that:
   - has the **same product name** (exact match),
   - has a **pick location** (bin) set,
   - is not already allocated to another order,
   - and picks the **oldest** one (by `receivedAt`).
   It then allocates that unit to this order and returns the location (e.g. `C12`).
2. **Fallback:** If no such purchase exists, Ready to Ship uses the **Pick locations** map (style ID → location) if you’ve added one for that product’s SKU.

So: **assign bins when you receive** (Receiving → Assign to bin), and when you get a sale for that product name, the app will tell you where to pick (FIFO).

---

## Assign to bin when receiving

1. **Receiving:** Scan tracking, select the matching purchase, complete verification if needed.
2. **Auto-assign (one tap):** Tap **"Assign to next slot"**. The app fetches the next available slot (e.g. A1, then A2, … then B1 when A has 5) and saves it—no sheet. You'll see "Assigned to A1" (or whatever slot was used).
3. **Or choose a specific slot:** Tap **"Or choose a specific slot…"** to open the sheet. The sheet pre-fills the next available slot; you can change it (e.g. **C12** or tap A1–H5) and tap **Save**.
4. That purchase is now “in inventory” at that location. When a sale has the **same product name**, the app will allocate this unit (oldest first) and show “Pick from C12” on Ready to Ship.

---

## Manual Pick locations (fallback)

If you haven’t assigned a bin to a received item, you can still add a **style ID → location** mapping:

1. **Ship → Pick locations → Add**
2. **SKU or style ID:** the product’s style ID (e.g. from the Ready to Ship row).
3. **Location:** e.g. `C12` or tap A1–H5.
4. Save.

Ready to Ship uses this when **no** received purchase with that product name has a pick location (so allocation returns nothing).

---

## Quick test checklist

1. **Ready to Ship**
   - Open **Ship → Ready to Ship**. You should see pending (CREATED) StockX orders with product image, SKU (style ID), size, ship-by.
   - If you have no pending orders, create a test sale on StockX so one order is in CREATED.

2. **Pick locations**
   - **Ship → Pick locations → Add**
   - Use a **style ID** from one of the pending orders (e.g. copy the SKU from Ready to Ship).
   - Location: e.g. **C12** (or A1, B2, …).
   - Save. Pull to refresh **Ready to Ship**; that order should show **“Pick from C12”.**

3. **Verify**
   - On that order tap **Verify** → scan the product barcode. It should match the order’s SKU and show “Correct item.”

4. **Print label**
   - Tap the order (or **Print label** from the sheet) → order number is prefilled → print the shipping label.

---

## How inventory is saved (and why it’s there 10 mins later)

**Inventory = received purchases with a pick location.**

- When you **Assign to bin** in Receiving, the app calls the backend with the **purchase ID** and the **location** (e.g. A1). The backend saves that on the **purchase document in Firestore**: `pickLocation: "A1"` (and `updatedAt`). Nothing is stored in a separate “inventory” table—the purchase record itself is the inventory row.
- That write happens **as soon as you tap Save**. It’s persisted in Firestore immediately.
- **10 minutes (or days) later:** When you open **Ready to Ship**, the app loads your pending StockX orders, then for each order calls **allocate-for-order** with the order’s **product name**. The backend queries **all your purchases** where `received === true` and `pickLocation` is set, finds ones whose **product name** matches the order (FIFO), allocates one to that order, and returns the location. So you see “Pick from A1” because that purchase was saved with `pickLocation: "A1"` when you assigned it.

So: **yes, you “process” inventory by receiving (and optionally scanning) and then assigning a bin.** The “which SKU/location to pick” comes from that saved `pickLocation` on the purchase, matched later by product name.

---

## Testing "why isn't it showing the SKU?" (product name match debug)

If Ready to Ship shows **"Required (Style ID)"** instead of **"Required (SKU): A1"**, allocation didn't find a matching received item. Usually that's because the **product name** from the StockX order doesn't exactly match the **product name** on your purchase in Firebase.

**In the app:** Open **Ship → Ready to Ship** → tap **Verify** on an order that shows Style ID → tap **"Debug: why no SKU match?"**. A sheet shows the order's product name (and normalized form) and every received purchase with a pick location, with its product name, normalized form, pick location, and **match** (`exact`, `containment`, or `none`). Compare the normalized strings to see why a match failed.

**Via API:** **GET** `/api/inventory/match-debug?productName=...` with the same auth as allocate-for-order. Response includes `requestedProductName`, `normalizedRequested`, and `purchases[]` with `productName`, `normalized`, `pickLocation`, `matchType`, `reason`.

---

## Mark as received in the iOS app

If Match debug shows a slot (e.g. A1) but **received: NO**, that item won’t be used for allocation until it’s marked received.

**Quick way (one tap):**

1. **Receiving** → turn **trial mode OFF** and **Enable web sync (writes) ON** (menu).
2. Enter or scan the **tracking number** for that item so it loads as the selected item.
3. Go to **Step 4 Result** (expand if needed). If the item is not yet received, a **"Mark as received"** button appears.
4. Tap **"Mark as received"**. The app saves `received: true` to Firebase; Ready to Ship / allocation will then use that slot.

**Full flow:** Complete all four steps (Tracking → StockX tag → Verify QR → Result), then tap **"Start next item"**. That also marks the current item received (when trial mode is OFF and web sync is ON).

---

## How to test end-to-end

### Option A: Test with receiving + assign to bin (product-name allocation)

1. **Have at least one purchase in Firebase** that’s received (or you’re okay marking received). It should have a **product name** (e.g. from email parsing or manual entry) that **exactly matches** a StockX order’s product name later.
2. **In the app → Receiving:** Enter or scan the **tracking number** for that purchase. Select the matching result.
3. **Assign to bin:** Tap **"Assign to next slot"** (one tap; app assigns e.g. A1) or tap **"Or choose a specific slot…"** and tap **Save**. That purchase is now stored with `pickLocation` (e.g. "A1") in Firestore.
4. **Have a pending (CREATED) StockX order** whose **product name** is the same (e.g. “Fear of God Essentials Fleece Hoodie (FW24) Black”). If you don’t have one, create a test sale on StockX so one order is CREATED.
5. **Open Ship → Ready to Ship** (now or 10 mins later). Pull to refresh. That order should show **“Pick from A1”** (or whatever slot you assigned). The app called allocate-for-order, found your received purchase with that product name and that location, and allocated it.
6. **Verify / Print label:** Tap the order to verify (scan barcode) and/or print the shipping label.

### Option B: Test without receiving (manual Pick locations fallback)

1. **Ship → Pick locations → Add:** Enter the **style ID** (SKU) from a pending order and a **location** (e.g. A1). Save.
2. **Ready to Ship:** Pull to refresh. That order shows “Pick from A1” from the manual map (no purchase allocation).

---

## "No purchase found" when scanning tracking (iOS)

The app looks up the purchase by **tracking number** (e.g. UPS 397954927419). The purchase document in Firebase must have that tracking stored in one of: `tracking`, `trackingNumber`, `tracking_number`, or `shipment.tracking` / `shipment.trackingNumber`.

**If the web (solesmarket.com) still shows the order as "Ordered" / "Not Shipped Yet"** even though you got an "Order Shipped" email with tracking, the purchase was never updated with the shipped status and tracking. The iOS app will then say **"No purchase found"** when you scan that tracking number.

**Fix:** On **solesmarket.com**, open the **Purchases** page and run **Sync Gmail**. That will:

1. Fetch your recent Gmail messages (including the "Order Shipped" email).
2. Parse tracking and status from the shipped email.
3. **Merge** by order number: the existing "Ordered" row is updated with status **Shipped** and the **tracking number**.
4. The by-tracking API can then find that purchase when you scan on iOS.

After syncing, refresh the Purchases table and confirm the row shows **Shipped** and the tracking number. Then scan the same tracking again in the iOS app—it should find the purchase.

---

## Summary

- **Inventory is saved** when you **Assign to bin** in Receiving: the purchase document in Firestore gets `pickLocation`. That’s why the app can tell you “pick from A1” 10 mins (or later)—it reads from those purchase records and matches by product name.
- **To test:** Process inventory by receiving (scan/enter tracking, select purchase) and tapping **Assign to bin**; then open Ready to Ship when you have a pending order with the same product name.
