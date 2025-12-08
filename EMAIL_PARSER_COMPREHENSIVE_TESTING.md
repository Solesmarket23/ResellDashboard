# Email Parser Comprehensive Testing Guide

## 🎯 Overview
This guide covers all edge cases and scenarios to test for maximum parser accuracy beyond the basic 8 sample emails.

---

## ✅ What's Already Tested

### Basic Email Types (8 samples)
- ✅ Order Confirmed (regular)
- ✅ Order Confirmation (regular)
- ✅ Xpress Order Confirmed
- ✅ Order Verified & Shipped (regular)
- ✅ Order Shipped (regular)
- ✅ Xpress Order Shipped
- ✅ Xpress Ship Order Delivered
- ✅ Order Delivered (regular)

### Basic Fields
- ✅ Order number extraction
- ✅ Product name extraction
- ✅ Size extraction
- ✅ Pricing extraction
- ✅ Tracking number extraction (for shipped/delivered)
- ✅ Status detection

---

## 🧪 Additional Tests Needed

### 1. **Size Extraction Edge Cases**

#### Test Cases:
- [ ] **Letter-only sizes** (XS, S, M, L, XL, XXL, XXXL)
  - Test: `Size: US S` (no number)
  - Test: `Size: US XL` (double letter)
  - Test: `Size: US XXXL` (triple letter)

- [ ] **Decimal sizes** (half sizes)
  - Test: `Size: US M 10.5`
  - Test: `Size: US W 8.5`
  - Test: `Size: US 9.5` (no letter)

- [ ] **European sizes**
  - Test: `Size: EU 42`
  - Test: `Size: EU 43.5`
  - Test: `Size: UK 9`

- [ ] **Youth/Kids sizes**
  - Test: `Size: US Y 5`
  - Test: `Size: US GS 6`
  - Test: `Size: US 5Y`

- [ ] **One-size products** (collectibles, accessories)
  - Test: `Size: One Size`
  - Test: `Size: OS`
  - Test: `Size: OSFA`
  - Test: No size field at all (collectibles)

- [ ] **Size in different HTML structures**
  - Test: Size in `<li class="attributes">` (current)
  - Test: Size in `<td>` table cell
  - Test: Size in `<div>` with different classes
  - Test: Size in plain text (no HTML tags)
  - Test: Size with encoded HTML (`class=3D"attributes"`)

- [ ] **Size extraction failures**
  - Test: CSS values that look like sizes (e.g., `width: 10px`)
  - Test: Phone numbers (e.g., `(555) 123-4567`)
  - Test: Dates (e.g., `2024-01-15`)
  - Test: Order numbers that look like sizes

- [ ] **Size with extra text**
  - Test: `Size: US M 10 (Men's)`
  - Test: `Size: US W 8.5 - Women's`
  - Test: `Size: US 10, Color: Black`

---

### 2. **Tracking Number Edge Cases**

#### Test Cases:
- [ ] **UPS tracking formats**
  - Test: `1Z999AA10123456784` (18 chars, starts with 1Z)
  - Test: Tracking in URL: `https://www.ups.com/track?tracknum=1Z999AA10123456784`
  - Test: Tracking in "Track Your Order" button href
  - Test: Multiple UPS tracking numbers (should extract first valid one)

- [ ] **FedEx tracking formats**
  - Test: `123456789012` (exactly 12 digits)
  - Test: Tracking in URL: `https://www.fedex.com/track?tracknumbers=123456789012`
  - Test: Tracking in query params: `?tracknumbers=123456789012`
  - Test: Tracking with dashes (should normalize): `1234-5678-9012`
  - Test: **CRITICAL**: 12-digit numbers starting with `9` (USPS format, NOT FedEx)
    - Test: `912345678901` should NOT be extracted as FedEx
    - Test: Should be rejected or flagged as USPS

- [ ] **USPS tracking formats**
  - Test: `91234567890123456789` (20-22 digits starting with 9)
  - Test: Should be detected as USPS, not FedEx

- [ ] **Tracking in different locations**
  - Test: Tracking in email body text
  - Test: Tracking in URL (most common)
  - Test: Tracking in table cell
  - Test: Tracking in bold/emphasized text
  - Test: Tracking in "Track Your Order" link text

- [ ] **Invalid tracking numbers**
  - Test: Order numbers that look like tracking (e.g., `77272475`)
  - Test: Phone numbers (e.g., `5551234567`)
  - Test: Dates (e.g., `202401151234`)
  - Test: Prices (e.g., `123456789012` in price context)
  - Test: CSS values (e.g., `width: 123456789012px`)

- [ ] **Multiple tracking numbers**
  - Test: Email with both UPS and FedEx tracking (should extract first valid)
  - Test: Email with multiple orders (each with different tracking)

- [ ] **Tracking extraction failures**
  - Test: Order confirmation emails (should NOT extract tracking)
  - Test: Shipped emails without tracking (should handle gracefully)
  - Test: Delivered emails with tracking (should extract)

---

### 3. **Pricing Edge Cases**

#### Test Cases:
- [ ] **Discount codes**
  - Test: `B10-6HRXZ2` format (B + 2 digits + hyphen + 6 alphanumeric)
  - Test: `FREESHIPBF2025DV5DHHV4` format (long promo codes)
  - Test: Multiple discount codes (should extract first valid)
  - Test: Discount codes with special characters
  - Test: Discount amount calculation (negative value)

- [ ] **Price formats**
  - Test: `$1,234.56` (with comma)
  - Test: `$1234.56` (without comma)
  - Test: `$0.00` (zero prices)
  - Test: `$999.99` (high prices)
  - Test: `$1.00` (low prices)

- [ ] **Currency edge cases**
  - Test: USD (`$`)
  - Test: EUR (`€`) - if StockX supports
  - Test: GBP (`£`) - if StockX supports
  - Test: Missing currency symbol (just numbers)

- [ ] **Fee variations**
  - Test: Zero processing fee
  - Test: Zero shipping fee
  - Test: Free shipping (`$0.00`)
  - Test: Xpress shipping vs regular shipping

- [ ] **Total calculation**
  - Test: Total matches sum of parts (purchase + processing + shipping - discount)
  - Test: Total doesn't match (should flag or use email total)
  - Test: Total with asterisk (`$86.90*`)
  - Test: Total in different formats

- [ ] **Price extraction failures**
  - Test: Prices in different table structures
  - Test: Prices with encoded HTML (`class=3D`)
  - Test: Prices in plain text (no HTML)
  - Test: Missing prices (should handle gracefully)

---

### 4. **Product Name Edge Cases**

#### Test Cases:
- [ ] **Special characters**
  - Test: Product names with `&` (e.g., `Nike & Jordan`)
  - Test: Product names with `'` (e.g., `Men's Shoe`)
  - Test: Product names with `"` (e.g., `"Air Max"`)
  - Test: Product names with `-` (e.g., `Air-Max-90`)
  - Test: Product names with `/` (e.g., `Air Max/90`)

- [ ] **Long product names**
  - Test: Very long names (>100 chars)
  - Test: Names with multiple brand names
  - Test: Names with full descriptions

- [ ] **Product name extraction sources**
  - Test: From `<title>` tag
  - Test: From subject line
  - Test: From product image alt text
  - Test: From product name anchor/link
  - Test: From email body text

- [ ] **Product name cleaning**
  - Test: Remove HTML tags (`<div>`, `<span>`, etc.)
  - Test: Remove CSS classes (`class="productName"`)
  - Test: Remove noise phrases (`View Order`, `Estimated Arrival`)
  - Test: Decode HTML entities (`&amp;` → `&`)

- [ ] **Product name failures**
  - Test: Missing product name (should use image alt or default)
  - Test: Product name polluted with HTML/CSS
  - Test: Product name with only brand (e.g., just "Nike")

---

### 5. **Order Number Edge Cases**

#### Test Cases:
- [ ] **Order number formats**
  - Test: `03-PAN6QGRR7B` (Xpress format)
  - Test: `01-S5SA3VAYKT` (Regular format)
  - Test: `77272475` (Numeric only)
  - Test: `01-AEBAWF` (Shorter format)
  - Test: Order numbers with different lengths

- [ ] **Order number extraction locations**
  - Test: In `<li class="attributes">` (current)
  - Test: In subject line
  - Test: In email body text
  - Test: In table cells
  - Test: In URL parameters

- [ ] **Order number validation**
  - Test: Valid order numbers (should extract)
  - Test: Invalid formats (should reject)
  - Test: Order numbers that look like tracking numbers

- [ ] **Order type detection**
  - Test: Xpress orders (subject contains "Xpress")
  - Test: Regular orders (no "Xpress" in subject)
  - Test: Order type mismatch (subject says Xpress but number format suggests regular)

---

### 6. **Email Format Edge Cases**

#### Test Cases:
- [ ] **HTML encoding**
  - Test: Quoted-printable encoded (`class=3D"attributes"`)
  - Test: Base64 encoded HTML
  - Test: UTF-8 encoded
  - Test: ISO-8859-1 encoded
  - Test: Windows-1252 encoded

- [ ] **Email structure**
  - Test: Multipart emails (HTML + plain text)
  - Test: Nested multipart structures
  - Test: Emails with attachments
  - Test: Emails with inline images
  - Test: Emails with multiple HTML parts

- [ ] **Malformed HTML**
  - Test: Missing closing tags
  - Test: Unclosed tags
  - Test: Invalid HTML structure
  - Test: HTML with JavaScript
  - Test: HTML with CSS in `<style>` tags

- [ ] **Email headers**
  - Test: Missing `From` header
  - Test: Missing `Subject` header
  - Test: Missing `Date` header
  - Test: Encoded headers (RFC 2047)
  - Test: Headers with special characters

- [ ] **Email boundaries**
  - Test: MIME boundaries
  - Test: Multiple boundaries
  - Test: Missing boundaries
  - Test: Incorrect boundary markers

---

### 7. **Status Detection Edge Cases**

#### Test Cases:
- [ ] **Status from subject line**
  - Test: `Order Confirmed:` → `ordered`
  - Test: `Order Confirmation:` → `ordered`
  - Test: `Xpress Order Confirmed:` → `ordered`
  - Test: `Order Verified & Shipped:` → `shipped`
  - Test: `Order Shipped:` → `shipped`
  - Test: `Xpress Order Shipped:` → `shipped`
  - Test: `Xpress Ship Order Delivered:` → `delivered`
  - Test: `Order Delivered:` → `delivered`
  - Test: `Refund Issued:` → `refunded`

- [ ] **Status from email content**
  - Test: Status keywords in body (`has been shipped`, `has been delivered`)
  - Test: Status emojis (✅ for shipped, 🎉 for delivered)
  - Test: Status in different HTML structures

- [ ] **Status edge cases**
  - Test: Ambiguous status (both "shipped" and "delivered" mentioned)
  - Test: Missing status indicators (should default to "ordered")
  - Test: Status mismatch (subject says shipped but content says delivered)

---

### 8. **Date Extraction Edge Cases**

#### Test Cases:
- [ ] **Purchase date formats**
  - Test: `January 15, 2024`
  - Test: `Jan 15, 2024`
  - Test: `01/15/2024`
  - Test: `2024-01-15`
  - Test: `15-Jan-2024`

- [ ] **Delivery date formats**
  - Test: Date ranges (`January 15, 2024 - January 20, 2024`)
  - Test: Single dates (`January 15, 2024`)
  - Test: Relative dates (`within 5-7 business days`)

- [ ] **Date extraction locations**
  - Test: In email body text
  - Test: In table cells
  - Test: In list items
  - Test: Near "Estimated Arrival" or "Delivery Date" labels

---

### 9. **Image Extraction Edge Cases**

#### Test Cases:
- [ ] **Product image URLs**
  - Test: `https://images.stockx.com/images/...` (standard)
  - Test: Images with query parameters (should strip)
  - Test: Images with different dimensions
  - Test: Missing images (should handle gracefully)

- [ ] **Image alt text**
  - Test: Alt text with product name
  - Test: Alt text with size information
  - Test: Missing alt text
  - Test: Alt text as fallback for product name

- [ ] **Image extraction failures**
  - Test: Multiple product images (should extract first)
  - Test: No product images
  - Test: Images that aren't product images (logos, etc.)

---

### 10. **Multi-Email Scenarios**

#### Test Cases:
- [ ] **Email consolidation**
  - Test: Order confirmation + shipping email (same order number)
  - Test: Order confirmation + delivery email (same order number)
  - Test: Multiple emails for same order (should consolidate)
  - Test: Different orders (should NOT consolidate)

- [ ] **Data reconciliation**
  - Test: Conflicting data between emails (which takes precedence?)
  - Test: Missing data in one email, present in another
  - Test: Updated tracking number in later email

---

### 11. **Error Handling & Edge Cases**

#### Test Cases:
- [ ] **Empty/missing fields**
  - Test: Email with no order number
  - Test: Email with no product name
  - Test: Email with no size
  - Test: Email with no pricing
  - Test: Email with no tracking (for shipped emails)

- [ ] **Invalid data**
  - Test: Invalid order number format
  - Test: Invalid size format
  - Test: Invalid price format (negative, too high, etc.)
  - Test: Invalid tracking number format

- [ ] **Parser failures**
  - Test: Completely malformed HTML
  - Test: Empty email content
  - Test: Email that's not from StockX
  - Test: Email that's not an order email (marketing, etc.)

- [ ] **Performance**
  - Test: Very large emails (>1MB)
  - Test: Emails with lots of HTML
  - Test: Emails with many images
  - Test: Processing time for complex emails

---

### 12. **Real-World Edge Cases**

#### Test Cases:
- [ ] **International orders**
  - Test: Orders from different countries
  - Test: Different currency formats
  - Test: Different date formats
  - Test: Different size formats (EU, UK, etc.)

- [ ] **Refund emails**
  - Test: Refund issued emails
  - Test: Partial refunds
  - Test: Full refunds
  - Test: Refund status detection

- [ ] **Verification failure emails**
  - Test: Order verification failed emails
  - Test: Product didn't pass verification
  - Test: Different failure reasons

- [ ] **Order updates**
  - Test: Price adjustments
  - Test: Shipping method changes
  - Test: Delivery date updates

---

## 📋 Testing Checklist

### Quick Tests (High Priority)
- [ ] Test size extraction with all size formats
- [ ] Test tracking extraction (UPS, FedEx, USPS)
- [ ] Test discount code extraction
- [ ] Test product name cleaning
- [ ] Test order number validation

### Medium Priority
- [ ] Test email encoding (quoted-printable, base64)
- [ ] Test malformed HTML handling
- [ ] Test multi-email consolidation
- [ ] Test date extraction formats

### Low Priority (Edge Cases)
- [ ] Test international formats
- [ ] Test refund emails
- [ ] Test verification failure emails
- [ ] Test performance with large emails

---

## 🎯 Recommended Test Strategy

1. **Start with high-priority edge cases** (size formats, tracking numbers)
2. **Test with real email samples** (not just the 8 basic samples)
3. **Create test fixtures** for each edge case
4. **Automate tests** where possible
5. **Manual review** for complex edge cases
6. **Monitor production** for new edge cases

---

## 📝 Test Data Collection

### How to Collect Test Emails:
1. **From Gmail**: Export actual StockX emails
2. **From different order types**: Regular, Xpress, refunds, etc.
3. **From different time periods**: Old emails, new emails
4. **From different products**: Shoes, apparel, collectibles
5. **From different statuses**: Ordered, shipped, delivered, refunded

### Test Email Storage:
- Store in `sample-emails/` directory
- Name files descriptively: `size-letter-only.eml`, `tracking-ups-url.eml`, etc.
- Document what each test email tests

---

## 🚀 Next Steps

1. **Create test fixtures** for each edge case category
2. **Run automated tests** against all fixtures
3. **Fix any failures** found
4. **Add new test cases** as they're discovered
5. **Monitor production** for new edge cases

---

## 💡 Tips for Maximum Accuracy

1. **Test with real emails** - Don't just test with perfect examples
2. **Test edge cases first** - They're where bugs hide
3. **Test error handling** - What happens when things go wrong?
4. **Test performance** - Large emails, complex HTML
5. **Test continuously** - Add tests as you find new edge cases

---

## 📊 Success Metrics

- **Extraction accuracy**: % of fields correctly extracted
- **False positive rate**: % of invalid data extracted
- **False negative rate**: % of valid data missed
- **Error handling**: % of emails that don't crash the parser
- **Performance**: Average parsing time per email

---

This comprehensive testing guide should help you achieve **very, very accurate** email parsing! 🎯



