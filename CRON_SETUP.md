# Vercel Cron Setup Guide

## Overview
This guide explains how to set up the cron jobs for 24/7 monitoring of StockX prices and auto-syncing Gmail purchases.

## What Cron Jobs Do

1. **Price Monitor** (runs every 15 minutes)
   - Checks all monitored products for price changes
   - Creates alerts when prices drop below thresholds
   - Updates price history
   - Works for all users automatically

2. **Purchase Sync** (runs every hour)
   - Auto-fetches new purchase emails from Gmail
   - Parses order confirmations
   - Updates purchase database
   - No manual syncing needed

## Setup Steps

### 1. Get Firebase Admin Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Save the downloaded JSON file

### 2. Add Environment Variables to Vercel

Go to your Vercel project settings and add these environment variables:

```
FIREBASE_CLIENT_EMAIL=<from-service-account-json>
FIREBASE_PRIVATE_KEY=<from-service-account-json>
CRON_SECRET=<generate-a-random-string>
```

**Important**: For `FIREBASE_PRIVATE_KEY`, copy the entire private key including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts.

### 3. Deploy to Vercel

```bash
git add .
git commit -m "Add Vercel cron jobs"
git push
```

Vercel will automatically detect the `vercel.json` file and set up the cron jobs.

### 4. Verify Crons Are Running

After deployment:
1. Go to your Vercel dashboard
2. Click on your project
3. Go to the "Functions" tab
4. You should see:
   - `/api/cron/monitor-prices` (runs every 15 min)
   - `/api/cron/sync-purchases` (runs every hour)

### 5. Check Cron Status

Visit: `https://your-app.vercel.app/api/cron/status`

## How It Works

- Crons run on Vercel's infrastructure (not your computer)
- They work 24/7 even when your app is closed
- Price checks respect rate limits (1 req/sec)
- Only checks products that haven't been checked in 5+ minutes
- Creates alerts that appear when you open the app

## Monitoring

To see if crons are working:
1. Check Vercel Functions logs
2. Look for new alerts in your app
3. Check "last checked" timestamps on products

## Troubleshooting

**Crons not running?**
- Check environment variables are set correctly
- Verify Firebase service account has proper permissions
- Check Vercel Functions logs for errors

**No alerts appearing?**
- Ensure products have price drop thresholds set
- Check that monitoring is enabled for users
- Verify StockX authentication is valid

**Rate limit errors?**
- Crons automatically handle rate limits
- Products are checked in batches with delays
- Each user's products are checked separately