# Sample Email Files for Parser Testing

This folder contains sample StockX emails for testing the Gmail parser.

## Instructions:

1. Go to Gmail and search: `from:stockx.com`
2. Open an email
3. Click the **⋮** (three dots) menu
4. Select **"Show original"**
5. Copy ALL the content
6. Paste it into one of the template files below

## Files to Create:

### Order Confirmation Emails:
- `order-confirmed-1.eml` - Example of "Order Confirmed:" email
- `order-confirmation-1.eml` - Example of "Order Confirmation:" email  
- `xpress-order-confirmed-1.eml` - Example of "Xpress Order Confirmed:" email

### Shipping Emails:
- `order-verified-shipped-1.eml` - Example of "Order Verified & Shipped:" email
- `order-shipped-1.eml` - Example of "Order Shipped:" email
- `xpress-order-shipped-1.eml` - Example of "Xpress Order Shipped:" email

### Delivery Emails:
- `order-delivered-1.eml` - Example of "Order Delivered:" email
- `xpress-ship-order-delivered-1.eml` - Example of "Xpress Ship Order Delivered:" email

## What We'll Test:

For each email, we'll verify the parser extracts:
- ✅ Product name
- ✅ Size
- ✅ Price breakdown (purchase price, fees, shipping, total)
- ✅ Order number
- ✅ Tracking number (for shipped/delivered emails)
- ✅ Purchase date
- ✅ Estimated delivery date
- ✅ Product image URL
- ✅ Status (Ordered/Shipped/Delivered)

## Priority:

**Most important to add first:**
1. `order-confirmed-1.eml` - To verify product/price extraction
2. `order-shipped-1.eml` - To verify tracking extraction
3. `order-delivered-1.eml` - To verify final status

Once you add these files, let me know and I'll test the parser against them!


