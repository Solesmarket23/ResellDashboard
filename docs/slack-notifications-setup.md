# Slack Notifications Setup for StockX Price Monitor

This guide will help you set up Slack notifications for price drop alerts.

## Step 1: Create a Slack Webhook

1. Go to your Slack workspace
2. Visit https://api.slack.com/apps
3. Click "Create New App" → "From scratch"
4. Name your app (e.g., "StockX Price Monitor")
5. Select your workspace
6. Go to "Incoming Webhooks" in the sidebar
7. Toggle "Activate Incoming Webhooks" to ON
8. Click "Add New Webhook to Workspace"
9. Select the channel where you want alerts (e.g., #stockx-alerts)
10. Copy the webhook URL (looks like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`)

## Step 2: Configure in ResellDashboard

1. Go to the StockX Price Monitor page
2. Click the "Slack Alerts" button (purple button with Slack logo)
3. Toggle "Enable Slack Notifications" to ON
4. Paste your webhook URL
5. Click "Send Test Notification" to verify it works
6. Click "Save Settings"

## What You'll Get

When a monitored product hits your price thresholds, you'll receive a Slack message with:

- 🚨 **Price Drop Alert** header
- Product name and size
- Old price → New price
- Drop percentage
- Profit potential
- "View on StockX" button

### Alert Types:
- **Ask Drop**: When the lowest ask price drops by your threshold %
- **Flex Ask Drop**: When the flex (fast shipping) price drops
- **Target Hit**: When price hits your specific target
- **Bid Rise**: When highest bid increases significantly

## Tips

1. **Set Reasonable Thresholds**: 10-20% drops are common for catching good deals
2. **Create a Dedicated Channel**: Keep alerts organized in a #stockx-deals channel
3. **Mobile Notifications**: Enable Slack mobile notifications for instant alerts
4. **Multiple Workspaces**: You can only use one webhook URL at a time

## Troubleshooting

- **Test notification not working?** Check that your webhook URL is correct
- **Not getting alerts?** Make sure monitoring is active (green "Monitoring Active" badge)
- **Too many alerts?** Increase your price drop threshold percentages

## Security Note

Your Slack webhook URL is stored locally in your browser. It's never sent to our servers except when sending notifications.