# 🤖 Auto-Repricing Guide

## Overview

Your StockX listings can now be automatically repriced at intervals **YOU control** - from every 5 minutes to every 24 hours!

---

## 🎯 How It Works

1. **Vercel Cron** runs every 5 minutes (always)
2. **Checks your interval** setting (5 min, 15 min, 30 min, 1 hour, etc.)
3. **Only reprices** if enough time has passed based on YOUR preference
4. **Tracks last repricing** time to avoid unnecessary API calls

---

## 🖥️ **Option 1: Use the Web UI (Easiest)**

### Access the Settings Page:
Go to: **https://solesmarket.com/auto-repricing-settings**

### What You Can Do:
- ✅ Enable/Disable auto-repricing with a toggle
- ✅ Choose from preset intervals (5, 15, 30, 60, 120 minutes)
- ✅ Set custom interval (any value from 5-1440 minutes)
- ✅ See when last repriced
- ✅ See when next repricing will happen
- ✅ View current strategy settings

### Steps:
1. Toggle "Auto-Repricing" ON
2. Select your desired interval
3. Click "Save Settings"
4. Done! ✅

---

## 💻 **Option 2: Use Command Line**

### Enable with Specific Interval:

```bash
# Syntax: npm run enable-repricing-now [strategy] [interval-in-minutes]

# Every 5 minutes (aggressive)
npm run enable-repricing-now competitive 5

# Every 15 minutes (moderate)
npm run enable-repricing-now competitive 15

# Every 30 minutes (balanced)
npm run enable-repricing-now competitive 30

# Every hour (conservative)
npm run enable-repricing-now competitive 60

# Every 2 hours (very conservative)
npm run enable-repricing-now competitive 120
```

### Available Strategies:
- `competitive` - Price $1 below lowest ask
- `margin` - Maintain 15% minimum profit
- `velocity` - Reduce prices on slow-moving items
- `hybrid` - Balanced approach

### Disable Auto-Repricing:

```bash
npm run disable-repricing
```

---

## 📊 Interval Recommendations

| Interval | Best For | API Calls/Day | Responsiveness |
|----------|----------|---------------|----------------|
| **5 min** | High-volume sellers, fast-moving items | 288 | Maximum |
| **15 min** | Active market monitoring | 96 | High |
| **30 min** | Balanced approach | 48 | Moderate |
| **1 hour** | Stable pricing strategy | 24 | Low |
| **2 hours** | Conservative, minimal changes | 12 | Very Low |

---

## 🔍 Monitoring Your Repricing

### Check Firebase Logs:
1. Go to: https://console.firebase.google.com/project/flip-flow-4d55c/firestore
2. Navigate to: `repricing_logs` collection
3. View your repricing history with timestamps

### Check Your User Settings:
1. Go to: https://console.firebase.google.com/project/flip-flow-4d55c/firestore/data/users/pPK6LZ0u8Qcsdxqj21yra3esJ493
2. Look for:
   - `stockxAutoRepricingEnabled`: true/false
   - `stockxAutoRepricingConfig.intervalMinutes`: your interval
   - `lastRepricedAt`: timestamp of last repricing

### Check Vercel Logs:
1. Go to: https://vercel.com/dashboard
2. Click your project
3. Go to: **Logs** tab
4. Filter by: `/api/cron/auto-reprice`

---

## 🎛️ Configuration Fields

Your Firebase user document contains:

```javascript
{
  stockxAutoRepricingEnabled: true,  // Master on/off switch
  stockxAutoRepricingConfig: {
    strategy: "competitive",          // Repricing strategy
    intervalMinutes: 15,              // YOUR custom interval
    competitiveBuffer: 1,             // $1 below lowest ask
    maxReduction: 20,                 // Max 20% price reduction
    minProfitMargin: 5,               // Min 5% profit
    enabled: true
  },
  lastRepricedAt: "2025-11-25T06:30:00.000Z"  // Last repricing timestamp
}
```

---

## 🚀 Quick Start

### For New Users:

1. **Enable with default settings** (5 minutes, competitive):
   ```bash
   npm run enable-repricing-now competitive 5
   ```

2. **Or use the web UI**:
   - Go to: https://solesmarket.com/auto-repricing-settings
   - Toggle ON
   - Choose interval
   - Save

3. **Wait for first repricing** (up to 5 minutes)

4. **Check logs** to confirm it's working

### For Existing Users:

1. **Change interval via UI**:
   - Go to: https://solesmarket.com/auto-repricing-settings
   - Select new interval
   - Save

2. **Or via command line**:
   ```bash
   npm run enable-repricing-now competitive 30
   ```

---

## ❓ FAQ

### Q: Can I change the interval without disabling repricing?
**A:** Yes! Just update the interval in the UI or run the enable command again with a new interval.

### Q: What happens if I set a very long interval (e.g., 24 hours)?
**A:** The cron still runs every 5 minutes, but it will only reprice once every 24 hours. No wasted API calls!

### Q: Can I have different intervals for different strategies?
**A:** Currently, the interval applies to your active strategy. To change strategies, run the enable command with a different strategy name.

### Q: How do I know if it's working?
**A:** Check:
1. Firebase `repricing_logs` collection for new entries
2. `lastRepricedAt` field in your user document updates
3. Your StockX listings show updated prices

### Q: What if I want to pause repricing temporarily?
**A:** Toggle OFF in the UI or run `npm run disable-repricing`. Your settings are saved and you can toggle back ON anytime.

### Q: Does this cost extra?
**A:** No! Your Vercel Pro plan ($20/month) includes unlimited cron jobs. The only limit is StockX API rate limits.

---

## 🛠️ Troubleshooting

### Repricing Not Running:

1. **Check if enabled**:
   ```bash
   # View your Firebase user document
   # stockxAutoRepricingEnabled should be true
   ```

2. **Check StockX connection**:
   - Make sure you have valid StockX OAuth tokens
   - Try logging into your app and reconnecting StockX

3. **Check Vercel logs**:
   - Look for errors in `/api/cron/auto-reprice`

4. **Verify interval hasn't passed**:
   - If `lastRepricedAt` was 10 minutes ago and your interval is 30 minutes, it won't run yet

### Interval Not Respected:

1. **Clear browser cache** if using the UI
2. **Verify Firebase** shows the correct `intervalMinutes` value
3. **Wait for next cron cycle** (up to 5 minutes)

---

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check Firebase repricing_logs
3. Verify your StockX OAuth tokens are valid
4. Check that `CRON_SECRET` is set in Vercel environment variables

---

## 🎉 You're All Set!

Your automated repricing system is now running with **YOUR custom interval**. Sit back and let the system optimize your prices automatically! 🚀

