# Sample Email Files for Parser Testing

This folder contains sample StockX emails for testing and improving the Gmail parser.

## 📧 How to Add Email Samples

### Option 1: From Gmail (Recommended)
1. Go to Gmail and search: `from:stockx.com`
2. Open an email with one of the subject lines below
3. Click the **⋮** (three dots) menu
4. Select **"Show original"**
5. Copy ALL the content (Ctrl+A / Cmd+A, then Ctrl+C / Cmd+C)
6. Paste it into the corresponding `.eml` file below

### Option 2: HTML Content Only
If you only have the HTML content (not full email headers), you can:
1. Create a `.html` file instead (e.g., `order-confirmed-1.html`)
2. Paste the HTML content directly
3. The parser can handle both formats

## 📁 File Structure

### Order Confirmation Emails (Status: "ordered")
1. **`01-order-confirmed.eml`** - Subject: "Order Confirmed:"
   - Example: "Order Confirmed: Nike Air Max 90"
   - Status: ordered
   - Type: regular

2. **`02-order-confirmation.eml`** - Subject: "Order Confirmation:"
   - Example: "Order Confirmation: Jordan 1 Retro"
   - Status: ordered
   - Type: regular

3. **`03-xpress-order-confirmed.eml`** - Subject: "Xpress Order Confirmed:"
   - Example: "Xpress Order Confirmed: Yeezy Boost 350"
   - Status: ordered
   - Type: xpress

### Shipping Emails (Status: "shipped")
4. **`04-order-verified-shipped.eml`** - Subject: "Order Verified & Shipped:"
   - Example: "Order Verified & Shipped: Nike Dunk Low"
   - Status: shipped
   - Type: regular
   - **Should contain tracking number**

5. **`05-order-shipped.eml`** - Subject: "Order Shipped:"
   - Example: "Order Shipped: Adidas Samba"
   - Status: shipped
   - Type: regular
   - **Should contain tracking number**

6. **`06-xpress-order-shipped.eml`** - Subject: "Xpress Order Shipped:"
   - Example: "Xpress Order Shipped: New Balance 550"
   - Status: shipped
   - Type: xpress
   - **Should contain tracking number**

### Delivery Emails (Status: "delivered")
7. **`07-xpress-ship-order-delivered.eml`** - Subject: "Xpress Ship Order Delivered:"
   - Example: "Xpress Ship Order Delivered: Converse Chuck 70"
   - Status: delivered
   - Type: xpress

8. **`08-order-delivered.eml`** - Subject: "Order Delivered:"
   - Example: "Order Delivered: Vans Old Skool"
   - Status: delivered
   - Type: regular

## ✅ What We'll Test & Extract

For each email, we'll verify the parser correctly extracts:

### Required Fields:
- ✅ **Order Number** - StockX order ID (e.g., "77272475")
- ✅ **Product Name** - Full product name (e.g., "Nike Air Max 90")
- ✅ **Size** - Product size (e.g., "US M 11.5", "US 10")
- ✅ **Status** - ordered / shipped / delivered
- ✅ **Order Type** - regular / xpress

### Pricing Fields:
- ✅ **Purchase Price** - Item price before fees
- ✅ **Processing Fee** - StockX processing fee
- ✅ **Shipping Fee** - Shipping cost
- ✅ **Total Amount** - Final total paid

### Additional Fields:
- ✅ **Tracking Number** - For shipped/delivered emails
- ✅ **Carrier** - UPS, FedEx, USPS, etc.
- ✅ **Purchase Date** - When order was placed
- ✅ **Estimated Delivery** - Delivery date range
- ✅ **Product Image URL** - Product image
- ✅ **Style ID** - Product style code (e.g., "CZ4099-800")
- ✅ **Condition** - New, Used, etc.

## 🎯 Testing Priority

**Start with these 3 files for quick wins:**
1. `01-order-confirmed.eml` - Tests basic order extraction
2. `05-order-shipped.eml` - Tests tracking extraction
3. `08-order-delivered.eml` - Tests delivery status

**Then add the remaining 5 files for comprehensive testing:**
4. `02-order-confirmation.eml`
5. `03-xpress-order-confirmed.eml`
6. `04-order-verified-shipped.eml`
7. `06-xpress-order-shipped.eml`
8. `07-xpress-ship-order-delivered.eml`

## 📝 Notes

- Files can be `.eml` (full email) or `.html` (HTML content only)
- You can add multiple examples: `01-order-confirmed-1.eml`, `01-order-confirmed-2.eml`, etc.
- The more samples we have, the better the parser will be!
- All files are gitignored (won't be committed to repo)

## 🚀 Next Steps

1. Add your email samples to the files above
2. Let me know when they're ready
3. I'll analyze the HTML structure and improve extraction patterns
4. We'll test accuracy and iterate until we reach 100%!


