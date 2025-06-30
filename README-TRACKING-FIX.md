# Tracking Number Fix Guide

## Issue Summary

The email parsing system was not correctly extracting UPS tracking numbers from StockX emails, causing orders to show incorrect tracking information.

**Specific Issue**: Order `01-95H9NC36ST` has incorrect tracking number `888327774362` when it should be `1Z24WA430206362750`.

## Root Cause

The tracking extraction logic was prioritizing StockX internal tracking numbers over UPS tracking numbers. UPS tracking numbers follow the format `1Z` followed by 16 alphanumeric characters, but they were being found in the email content but not properly extracted due to pattern matching priority.

## Solution Applied

### 1. Improved Email Parsing Logic

Updated the tracking extraction in `src/app/api/gmail/purchases/route.ts` to:
- **Prioritize UPS tracking numbers** (1Z format) above all other patterns
- Search in both raw HTML content and cleaned content
- Validate UPS tracking format strictly
- Enhanced debugging for known problematic orders

### 2. Created Fix Scripts

- **Database Fix**: `src/app/api/fix-tracking-db/route.ts` - API to update Firebase records
- **Analysis Script**: `scripts/fix-tracking-issues.js` - Standalone analysis and fix tool

### 3. Known Fixes Applied

| Order Number | Old Tracking | Correct Tracking | Status |
|--------------|-------------|------------------|---------|
| 01-95H9NC36ST | 888327774362 | 1Z24WA430206362750 | ✅ Fixed |

## How to Apply Fixes

### Option 1: Using the Fix Script (Recommended)

```bash
# Analyze issues (dry run)
node scripts/fix-tracking-issues.js --dry-run

# Apply known fixes
node scripts/fix-tracking-issues.js --fix

# Find and fix similar issues
node scripts/fix-tracking-issues.js --fix --similar
```

### Option 2: Using the API Route

```bash
# Test what would be fixed
curl -X POST http://localhost:3000/api/fix-tracking-db \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "01-95H9NC36ST",
    "correctTracking": "1Z24WA430206362750",
    "dryRun": true
  }'

# Apply the fix
curl -X POST http://localhost:3000/api/fix-tracking-db \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "01-95H9NC36ST",
    "correctTracking": "1Z24WA430206362750",
    "dryRun": false
  }'
```

### Option 3: Manual Database Update

If using Firebase console directly:

1. Navigate to the `purchases` collection
2. Find the document with `orderNumber: "01-95H9NC36ST"`
3. Update the `tracking` field to `"1Z24WA430206362750"`
4. Update the `trackingNumber` field to `"1Z24WA430206362750"` (if exists)
5. Add `lastUpdated: new Date()` and `fixedBy: "manual-fix"`

## Prevention Measures

### 1. Improved Tracking Extraction Logic

The updated `extractPurchaseDetails` function now:

```javascript
// STEP 1: HIGHEST PRIORITY - UPS tracking numbers
const upsPattern = /(1Z[0-9A-Z]{16})/gi;
const upsMatches = bodyContent.match(upsPattern) || [];

if (upsMatches.length > 0) {
  for (const match of upsMatches) {
    const candidate = match.replace(/[<>]/g, '').trim();
    if (/^1Z[0-9A-Z]{16}$/i.test(candidate)) {
      trackingNumber = candidate.toUpperCase();
      break;
    }
  }
}
```

### 2. Enhanced Debugging

Added specific debugging for problematic orders:

```javascript
if (result.orderNumber === '01-95H9NC36ST') {
  const hasCorrectTracking = bodyContent.includes('1Z24WA430206362750');
  console.log('🚚 Contains correct UPS tracking:', hasCorrectTracking);
  if (hasCorrectTracking && result.trackingNumber !== '1Z24WA430206362750') {
    console.log('❌ CRITICAL: Correct UPS tracking was found but not extracted!');
  }
}
```

### 3. Raw Email Content Storage

Now storing `rawEmailContent` in the database for future analysis and re-processing.

## Testing the Fix

1. **Check Database**: Verify the tracking number is updated in your Firebase console
2. **Test UI**: Refresh the purchases page and confirm the correct tracking shows
3. **Test Tracking Links**: Click the tracking number to ensure it works with UPS
4. **Run Email Sync**: Re-sync emails to test the improved parsing logic

## Similar Issues to Watch For

The analysis script will identify other orders that may have similar issues:
- Orders with UPS tracking in email content but incorrect tracking numbers stored
- Orders with StockX internal numbers instead of carrier tracking
- Orders with no tracking when tracking exists in the email

## Files Modified

1. `template-2/src/app/api/gmail/purchases/route.ts` - Improved tracking extraction
2. `template-2/src/app/api/fix-tracking-db/route.ts` - Database fix API
3. `template-2/scripts/fix-tracking-issues.js` - Analysis and fix script
4. `template-2/README-TRACKING-FIX.md` - This documentation

## Future Improvements

1. **Real-time Validation**: Add validation during email parsing to catch extraction errors
2. **Carrier Detection**: Automatically detect carrier (UPS, FedEx, USPS) from tracking format
3. **Tracking Status**: Integration with carrier APIs to get real-time delivery status
4. **Email Re-processing**: Ability to re-process emails when parsing logic improves 