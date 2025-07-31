# StockX Payout Refresh System - Testing Guide

## Overview
The new StockX payout refresh system allows users to:
1. Import all sales quickly with calculated payouts (fast)
2. Run a background process to fetch accurate payouts from StockX (slow but accurate)
3. See real-time progress as payouts are updated

## Testing the System

### 1. Direct API Testing (Original UI)
Navigate to: `/stockx-sales`

- Click "Load Sales Data" to fetch sales directly from API
- Click "Refresh Payouts" button to show the payout refresher
- Start the background refresh process

### 2. Firebase-based Testing (Recommended)
Navigate to: `/stockx-sales-v2`

This uses the Firebase-cached data approach:
- **Import All Sales**: Quickly imports all sales with calculated payouts
- **Refresh Payouts**: Background process to get accurate payouts
- Real-time progress updates as each order is processed

## How It Works

### API Endpoints

1. **`/api/stockx/sales`**
   - Fetches sales from StockX API
   - With `skipDetails=true`: Returns calculated payouts (fast)
   - Without `skipDetails`: Fetches accurate payouts for ≤10 orders

2. **`/api/stockx/refresh-payouts`**
   - Server-Sent Events (SSE) endpoint
   - Processes orders one by one (1-2 per second)
   - Updates Firebase with accurate payout data
   - Returns real-time progress updates

### Components

1. **`StockXPayoutRefresher`**
   - Manages the background refresh process
   - Shows real-time progress with progress bar
   - Displays recently updated orders
   - Estimates remaining time

2. **`StockXSalesFromFirebase`**
   - Uses the `useStockXSales` hook
   - Displays cached sales from Firebase
   - Integrates with payout refresher
   - Handles bulk import + background refresh workflow

## Implementation Details

### Rate Limiting
- Processes 1-2 orders per second (750ms delay between requests)
- Prevents StockX API rate limit errors
- Continues processing even if individual orders fail

### Progress Updates
The SSE stream sends these event types:
- `connected`: Initial connection established
- `total`: Total number of orders to process
- `progress`: Update for each order (success/error)
- `complete`: Process finished with summary
- `error`: Fatal error occurred

### Firebase Storage
Sales are stored in the `stockxSales` collection with:
- `saleData`: The full StockX sale object
- `payoutRefreshedAt`: Timestamp of last payout refresh
- `userId`: User who owns the sale

## User Workflow

### Recommended Flow:
1. **Connect StockX** - Authenticate with StockX OAuth
2. **Import All Sales** - Quick import with calculated payouts (~5 seconds)
3. **Refresh Payouts** - Background process for accurate data (~8-17 minutes for 1000 sales)
4. **Monitor Progress** - Watch real-time updates as payouts are fetched

### Benefits:
- Users can see their sales immediately (no waiting)
- Accurate payout data is fetched in the background
- No timeout errors or rate limiting issues
- Progress is visible and can be cancelled

## Testing Scenarios

1. **Small Dataset** (< 50 sales)
   - Should complete in under 1 minute
   - Test cancellation mid-process

2. **Large Dataset** (500+ sales)
   - Monitor memory usage
   - Verify progress updates remain smooth
   - Test browser refresh (progress should resume)

3. **Error Handling**
   - Disconnect network mid-process
   - Test with expired tokens
   - Verify individual failures don't stop the process

## Future Enhancements

1. **Resume Capability**
   - Track which orders have been refreshed
   - Allow resuming from last position

2. **Batch Processing**
   - Group similar orders for efficiency
   - Parallel processing with rate limit management

3. **Scheduled Refreshes**
   - Automatic nightly payout updates
   - Email notifications when complete