# GitHub Actions Setup for 24/7 Monitoring

## Overview
This setup uses GitHub Actions to run your monitoring tasks for free, without needing to keep a browser open or pay for Vercel Pro.

## What's Included

1. **Price Monitor** (runs every 15 minutes)
   - Checks all monitored StockX products for price changes
   - Creates alerts when prices drop
   - Updates price history in Firebase

2. **Gmail Purchase Sync** (runs every hour)
   - Automatically fetches new purchase emails
   - Parses order confirmations
   - Updates your purchase database

## How It Works

1. GitHub Actions runs on GitHub's servers (not your computer)
2. Every 15 minutes, it calls your price monitoring endpoint
3. Every hour, it calls your Gmail sync endpoint
4. Results are saved to Firebase
5. You see updates when you open your dashboard

## Setup Complete! 

The workflows are already configured and will start running automatically after you push to GitHub.

## Monitoring Your Workflows

1. Go to your GitHub repository
2. Click on the "Actions" tab
3. You'll see:
   - "Monitor StockX Prices" - running every 15 minutes
   - "Sync Gmail Purchases" - running every hour

## Manual Triggers

You can also run these manually:
1. Go to Actions tab
2. Click on a workflow
3. Click "Run workflow"
4. Click the green "Run workflow" button

## Checking Logs

1. Click on any workflow run
2. Click on the job name
3. Expand any step to see detailed logs

## Troubleshooting

**Workflows not running?**
- Make sure Actions are enabled in your repo settings
- Check Settings → Actions → General → Actions permissions

**Getting errors?**
- Check if Firebase Admin credentials are set in Vercel
- Ensure your API endpoints are accessible
- Check the workflow logs for specific errors

## Future Upgrades

When you're ready to scale:
- Switch to Vercel Pro for better performance
- Or set up a dedicated server for unlimited monitoring
- Current setup good for up to ~10 users