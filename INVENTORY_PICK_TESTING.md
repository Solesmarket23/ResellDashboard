# Inventory & Pick Testing Guide

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
2. Tap **“Assign to bin”** (or print SKU label first, then assign).
3. In the sheet, pick a slot (e.g. **C12** or tap A1–H5) and tap **Save**.
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

## Summary

- **Your system (A–H, C12-style slots) is a good system.** Use it as the “location” in Pick locations (e.g. C12, A1, H5).
- **For testing:** Add Pick locations manually (style ID → C12). No need to scan/process items first.
- **Assigning location when receiving** (so “item 5” is stored in C12 and the app tells you to pick from C12 when you sell it) would be a later, unit-level feature; for now the manual map is enough to test end-to-end.
