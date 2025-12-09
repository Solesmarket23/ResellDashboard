# Test Tracking Extraction Script

This script tests the tracking number extraction for a specific order.

## Usage

### Prerequisites
1. Make sure your Next.js dev server is running:
   ```bash
   npm run dev
   ```

2. Make sure you are authenticated with Gmail (the app should have Gmail access)

### Run the test

```bash
node scripts/test-tracking-extraction.js
```

Or if you want to test against a different server:

```bash
API_URL=http://localhost:3000/api/gmail/extract-tracking-via-gmail node scripts/test-tracking-extraction.js
```

## What it tests

- **Order Number**: `14797812286991753494`
- **Expected Tracking**: `886737858181`
- **Process**:
  1. Searches Gmail for "Order Verified & Shipped:" email
  2. Extracts "Track your order" link
  3. Navigates to StockX order page
  4. Clicks "Track Order" button
  5. Extracts tracking number from FedEx URL

## Expected Output

If successful, you should see:
```
✅ SUCCESS!
===========
Tracking Number: 886737858181
Carrier: FedEx
Extracted Via: gmail-api-stockx-fedex

🎉 CORRECT! Extracted tracking number matches expected value!
```

## Troubleshooting

If the test fails:

1. **"Gmail not connected"**: Make sure you've connected Gmail in the app
2. **"Could not find shipped email"**: The order might not have a shipped email yet, or the order number format might be different
3. **"Could not find Track Order button"**: StockX page structure might have changed
4. **"Request timeout"**: The page might be loading slowly, or Cloudflare protection might be blocking Puppeteer




