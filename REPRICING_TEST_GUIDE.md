# 🧪 StockX Repricing System - Testing Guide

## Quick Start Testing

### 1. **Live UI Testing** (Recommended)
Navigate to: **https://www.solesmarket.com/dashboard?section=stockx-repricing**

This is the main repricing interface where you can:
- ✅ View all your active listings
- ✅ Test pricing strategies in dry-run mode
- ✅ Apply pricing rules to selected listings
- ✅ Try the "Market Peek" feature (10x price discovery)
- ✅ Set up auto-repricing schedules

---

## Testing Methods

### Method 1: Manual Dry-Run Testing (Safest)

1. **Load Your Listings**
   - Go to `/dashboard?section=stockx-repricing`
   - Click "Refresh Listings" to load your active StockX listings
   - Verify all listings appear with current prices

2. **Select Test Listings**
   - Check 1-2 listings you want to test with
   - Choose listings that have market data (Lowest Ask visible)

3. **Apply Pricing Rule (DRY RUN)**
   - Select a pricing strategy:
     - "Beat Lowest Ask by $1" (safest for testing)
     - "Match Lowest Ask"
     - "5% Below Market"
   - Click "Apply Rule" button
   - Review the modal showing proposed changes
   - **Enable "Dry Run Mode"** (toggle ON)
   - Click "Confirm Repricing"

4. **Review Results**
   - Check the results table
   - Verify the "New Price" calculations are correct
   - Ensure no actual price changes occurred (dry run)

**Expected Output:**
```
✅ Dry Run Complete
Current Price: $100 → New Price: $95
Action: would update (but skipped in dry run)
```

---

### Method 2: Market Peek Testing

The **Market Peek** feature temporarily raises your listing to 10x price to discover the true lowest ask.

**How it Works:**
1. Raise your price to 10x current market price
2. Wait 15 seconds
3. Fetch market data (your listing removed from lowest ask)
4. Lower price to discovered_lowest_ask - $1

**To Test:**
1. Go to repricing page
2. Find a listing with Market Peek enabled
3. Look for "Peek Now" button in the pricing strategy column
4. Click "Peek Now" (manual trigger)
5. Watch the real-time status:
   - 🔄 Raising price...
   - ⏳ Waiting 15s...
   - 💰 Fetching market data...
   - ✅ Price updated!

**Safety Notes:**
- Only runs once every 2 hours per listing
- Enforces min/max price boundaries
- Groups duplicate listings together
- Automatically reverts if any step fails

---

### Method 3: Auto-Repricing (Cron) Testing

Test the automated repricing that runs on a schedule.

**Setup:**
1. Go to repricing page
2. Scroll to "Auto-Repricing Settings"
3. Toggle "Enable Auto-Repricing" ON
4. Set interval (e.g., 60 minutes)
5. Configure which listings to reprice automatically
6. Save settings

**Manual Trigger Test:**
```bash
# Test the cron endpoint directly
curl -X GET "https://www.solesmarket.com/api/cron/auto-reprice"
```

**What it Does:**
- Fetches all users with auto-repricing enabled
- Gets their active listings from Firebase
- Calls the repricing API with their saved strategies
- Updates prices automatically
- Logs all actions

**Check Logs:**
- Open browser console
- Look for: `🤖 Auto-repricing executed`
- Verify: listings were repriced based on their individual strategies

---

### Method 4: API Endpoint Testing

Test the repricing API directly with custom data.

**Test Script:**
```bash
# File: scripts/test-reprice-api.js
node scripts/test-reprice-api.js
```

**Or use cURL:**
```bash
curl -X POST "https://www.solesmarket.com/api/stockx/repricing" \
  -H "Content-Type: application/json" \
  -H "x-user-id: YOUR_USER_ID" \
  -d '{
    "listings": [
      {
        "listingId": "test-123",
        "productId": "your-product-id",
        "variantId": "your-variant-id",
        "currentPrice": 100,
        "lowestAsk": 95,
        "pricingStrategy": {
          "type": "beat_lowest",
          "value": 1
        },
        "minPrice": 80,
        "maxPrice": 150
      }
    ],
    "dryRun": true,
    "useIndividualStrategies": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "results": [
    {
      "listingId": "test-123",
      "currentPrice": 100,
      "newPrice": 94,
      "action": "would update",
      "reason": "Price set to $1 below lowest ask ($95)"
    }
  ],
  "summary": {
    "total": 1,
    "updated": 0,
    "skipped": 0,
    "errors": 0
  }
}
```

---

### Method 5: Debug Endpoint Testing

Use the debug endpoint to test with real user data:

```bash
curl -X GET "https://www.solesmarket.com/api/debug/test-reprice-call"
```

This endpoint:
- Fetches your stored StockX tokens
- Creates a test repricing request
- Calls the repricing API with your credentials
- Returns detailed logs

---

## Pricing Strategies Explained

### 1. Beat Lowest Ask
```typescript
newPrice = lowestAsk - value
// Example: lowestAsk=$100, value=$1 → newPrice=$99
```

### 2. Match Lowest Ask
```typescript
newPrice = lowestAsk
// Example: lowestAsk=$100 → newPrice=$100
```

### 3. Percentage Below/Above
```typescript
newPrice = lowestAsk * (1 - value/100)
// Example: lowestAsk=$100, value=5% → newPrice=$95
```

### 4. Market Peek
```typescript
step1: raisePrice = lowestAsk * 10
step2: wait 15 seconds
step3: discoveredLowest = fetchMarketData()
step4: newPrice = discoveredLowest - 1
```

### 5. Manual Price
```typescript
newPrice = manualPrice
// You set the exact price
```

---

## Safety Features

✅ **Min/Max Price Boundaries**
- Prices will never go below your min or above your max

✅ **Profit Margin Protection**
- Option to set minimum profit margin
- Prevents repricing below cost basis + margin

✅ **Dry Run Mode**
- Preview all changes before applying
- No actual price updates occur

✅ **Rate Limiting**
- 500ms delay between API calls
- Prevents hitting StockX rate limits

✅ **Token Refresh**
- Automatically refreshes expired tokens
- Continues repricing after refresh

✅ **Error Recovery**
- Individual listing failures don't stop batch
- Detailed error logging per listing

---

## Troubleshooting

### Issue: "No listings found"
**Solution:**
1. Check if you're authenticated with StockX
2. Click "Re-authenticate with StockX" if needed
3. Ensure you have active listings on StockX
4. Check browser console for auth errors

### Issue: "Market data unavailable"
**Solution:**
1. Click "Refresh Market Prices"
2. Wait for market data to load
3. Verify product has active market on StockX
4. Check if product/variant IDs are correct

### Issue: Market Peek fails
**Solution:**
1. Ensure 2 hours have passed since last peek
2. Check min/max price settings aren't too restrictive
3. Verify listing is not part of a group (or is the group leader)
4. Check console logs for specific error

### Issue: Auto-repricing not working
**Solution:**
1. Verify auto-repricing toggle is ON
2. Check that you have listings with pricing strategies set
3. Ensure StockX tokens are valid
4. Check cron logs: `/api/cron/auto-reprice`

---

## Testing Checklist

- [ ] Load listings successfully
- [ ] Market data displays correctly
- [ ] Dry run mode works (no actual changes)
- [ ] Beat lowest by $1 calculation is accurate
- [ ] Match lowest calculation is accurate
- [ ] Percentage calculations are accurate
- [ ] Min price boundary enforced
- [ ] Max price boundary enforced
- [ ] Market peek completes full cycle
- [ ] Market peek respects 2-hour cooldown
- [ ] Grouped listings update together
- [ ] Auto-repricing toggle saves
- [ ] Individual strategies persist after refresh
- [ ] Token refresh works on 401 errors
- [ ] Error messages are clear and helpful

---

## Production Usage Tips

### Best Practices:
1. **Start with Dry Run** - Always test with dry run first
2. **Set Safety Boundaries** - Configure min/max prices on all listings
3. **Use Conservative Strategies** - Start with "Beat by $1" or "Match Lowest"
4. **Monitor Closely** - Check repricing results regularly
5. **Gradual Rollout** - Test on 5-10 listings before enabling for all
6. **Market Peek Wisely** - Use for high-value items where $1-5 matters
7. **Auto-Repricing Interval** - 60 minutes is recommended (not too aggressive)

### Recommended Settings:
- **Min Price**: Cost + $5 minimum profit
- **Max Price**: Original listing price
- **Strategy**: Beat lowest by $1 (most sales)
- **Auto-Reprice Interval**: 60 minutes
- **Market Peek Frequency**: Balanced (6 hours)

---

## Need Help?

1. Check browser console for detailed logs
2. Review the API response in Network tab
3. Check Firebase for saved settings
4. Verify StockX credentials are valid
5. Test with a single listing first

**Debug Mode:**
- Open browser console
- Look for logs starting with: 🔄, ✅, ❌, 💰
- Copy error messages for troubleshooting

