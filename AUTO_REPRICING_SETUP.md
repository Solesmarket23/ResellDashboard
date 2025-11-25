# 🤖 Automated Repricing Setup Guide

## ✅ What's Already Done

I've set up your automated repricing system that runs **every 5 minutes** on Vercel!

### Files Created/Updated:
1. ✅ `vercel.json` - Vercel cron configuration
2. ✅ `/api/cron/auto-reprice/route.ts` - Auto-repricing cron endpoint
3. ✅ All repricing APIs are ready

---

## 🚀 How to Activate

### Step 1: Deploy to Vercel

```bash
git add .
git commit -m "Add automated repricing cron"
git push
```

Vercel will automatically deploy and activate the cron jobs.

### Step 2: Set Environment Variables in Vercel

Go to your Vercel dashboard → Settings → Environment Variables and add:

```
CRON_SECRET=your-super-secret-key-here
STOCKX_API_KEY=your-stockx-api-key
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### Step 3: Enable Auto-Repricing for Your Account

In Firebase, update your user document:

```javascript
{
  stockxAutoRepricingEnabled: true,
  stockxAutoRepricingConfig: {
    strategy: "competitive",        // or "margin", "velocity", "hybrid"
    competitiveBuffer: 1,            // Price $1 below lowest ask
    maxReduction: 20,                // Never reduce more than 20%
    minProfitMargin: 5,              // Always maintain 5% profit
    enabled: true
  }
}
```

---

## ⚙️ Repricing Strategies

### 1. **Competitive** (Recommended for fast sales)
```javascript
strategy: "competitive"
competitiveBuffer: 1  // Price $1 below lowest ask
```
- Prices just below the current lowest ask
- Best for high-velocity sales
- Example: Lowest ask is $200 → Your price: $199

### 2. **Margin-Based** (Recommended for profit protection)
```javascript
strategy: "margin"
minProfitMargin: 15  // Maintain 15% profit minimum
```
- Maintains minimum profit margins
- Never goes below your cost + margin
- Best for protecting profitability

### 3. **Velocity-Based** (Recommended for clearing inventory)
```javascript
strategy: "velocity"
maxDaysListed: 30  // Reduce after 30 days
```
- Reduces prices on slow-moving items
- Aggressive on old inventory
- Best for seasonal clearance

### 4. **Hybrid** (Balanced approach)
```javascript
strategy: "hybrid"
```
- Combines all strategies
- Weighted approach for balance
- Best for overall optimization

---

## 🕐 Cron Schedule

Your repricing runs **every 5 minutes**:

```
*/5 * * * * = Every 5 minutes
```

This means:
- ✅ Prices update automatically throughout the day
- ✅ You stay competitive 24/7
- ✅ No manual intervention needed

---

## 📊 How It Works

### Every 5 Minutes:
1. **Check Active Users** - Finds users with auto-repricing enabled
2. **Fetch Listings** - Gets all active StockX listings
3. **Analyze Market** - Compares your prices to current market
4. **Calculate New Prices** - Uses your chosen strategy
5. **Update Prices** - Applies changes via StockX API
6. **Log Results** - Saves repricing history to Firebase

### Safety Features:
- ✅ **Maximum Reduction Limit** - Never reduce more than 20%
- ✅ **Minimum Profit Protection** - Always maintain profit margin
- ✅ **Cost Basis Validation** - Never price below cost
- ✅ **Rate Limiting** - Respects StockX API limits
- ✅ **Error Handling** - Graceful failure recovery

---

## 🔍 Monitoring

### Check Cron Status:
Visit: `https://your-domain.com/api/cron/status`

### View Repricing Logs:
Check Firebase collection: `repricing_logs`

### Manual Trigger (for testing):
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-domain.com/api/cron/auto-reprice
```

---

## 💰 Cost Breakdown

### Vercel Pro Plan: $20/month
- ✅ Unlimited cron jobs
- ✅ Runs every 5 minutes (288 times/day)
- ✅ No additional cost

### What You Get:
- **Automated repricing** every 5 minutes
- **Price monitoring** every 5 minutes
- **24/7 operation** with no manual work
- **Competitive advantage** over manual sellers

---

## 🎯 Recommended Settings

### For Maximum Sales Velocity:
```javascript
{
  strategy: "competitive",
  competitiveBuffer: 1,
  maxReduction: 20,
  minProfitMargin: 5
}
```

### For Maximum Profit:
```javascript
{
  strategy: "margin",
  minProfitMargin: 20,
  maxReduction: 10,
  competitiveBuffer: 5
}
```

### For Balanced Approach:
```javascript
{
  strategy: "hybrid",
  competitiveBuffer: 2,
  maxReduction: 15,
  minProfitMargin: 10
}
```

---

## 🚨 Troubleshooting

### Repricing Not Running?
1. Check `CRON_SECRET` is set in Vercel
2. Verify `stockxAutoRepricingEnabled: true` in Firebase
3. Check Vercel logs for errors
4. Ensure StockX access token is valid

### Prices Not Updating?
1. Check StockX API rate limits
2. Verify listings are active
3. Check repricing logs in Firebase
4. Ensure market data is available

### Too Aggressive/Conservative?
1. Adjust `competitiveBuffer` (higher = less aggressive)
2. Modify `maxReduction` (lower = more conservative)
3. Increase `minProfitMargin` (higher = more protective)

---

## 📈 Expected Results

### With Auto-Repricing Enabled:
- ✅ **Faster Sales** - Always priced competitively
- ✅ **Better Profits** - Automatic margin protection
- ✅ **Time Savings** - No manual price checking
- ✅ **24/7 Operation** - Works while you sleep
- ✅ **Competitive Edge** - React to market changes instantly

### Without Auto-Repricing:
- ❌ Manual price updates required
- ❌ Miss overnight market changes
- ❌ Slower sales velocity
- ❌ Time-consuming monitoring

---

## 🎉 You're All Set!

Once you:
1. ✅ Deploy to Vercel
2. ✅ Set environment variables
3. ✅ Enable in Firebase

Your repricing will run automatically every 5 minutes! 🚀

**Questions?** Check the logs or test manually first with the dashboard interface.

