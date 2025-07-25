# Impact.com Integration Setup

This guide explains how to set up Impact.com affiliate links for StockX in your ResellDashboard.

## Environment Variables

Add the following environment variables to your `.env.local` file (for local development) and to your Vercel environment variables (for production):

```env
IMPACT_ACCOUNT_SID=your_account_sid_here
IMPACT_AUTH_TOKEN=your_auth_token_here
IMPACT_CAMPAIGN_ID=your_campaign_id_here  # Optional - if you have a specific StockX campaign ID
```

## Getting Your Impact.com Credentials

1. **Account SID**: This is your Impact.com account identifier. You can find it in your Impact.com dashboard under Account Settings.

2. **Auth Token**: This is your API authentication token from Impact.com.

3. **Campaign ID** (Optional): If you have a specific campaign ID for StockX, you can add it here. The system will try to auto-detect StockX campaigns if not provided.

## How It Works

The Impact.com integration is now active in two places:

### 1. Share Tweet Button
When users click the "Share" button on the StockX Arbitrage page:
- The system generates an Impact.com affiliate link for the StockX product
- This affiliate link is included in the tweet
- A short URL is created to make the link more user-friendly
- Custom tracking parameters are added (productId, size, source: 'twitter_share')

### 2. View on StockX Button
When users click the "View on StockX" button:
- The system generates an Impact.com affiliate link if one doesn't exist
- The affiliate link is cached to avoid repeated API calls
- Custom tracking parameters are added (productId, size, source: 'view_button')
- Falls back to Sovrn affiliate links if Impact.com fails

## Fallback Behavior

If Impact.com is not configured or fails:
- The system automatically falls back to Sovrn affiliate links
- The original StockX URL is used if both affiliate systems fail
- Error messages are logged to the console for debugging

## Testing

To test the integration:

1. Add your Impact.com credentials to `.env.local`
2. Restart your development server
3. Go to the StockX Arbitrage page
4. Search for products
5. Click either "Share" or "View on StockX" buttons
6. Check the browser console for Impact.com affiliate URL creation logs
7. Verify the generated links redirect to StockX with tracking

## Troubleshooting

If affiliate links aren't working:

1. Check that environment variables are set correctly
2. Look for error messages in the browser console
3. Verify your Impact.com account has access to StockX campaigns
4. Check the network tab to see if the `/api/impact/create-link` endpoint is responding
5. Ensure your Impact.com API credentials have the necessary permissions

## API Endpoints

- `/api/impact/create-link` - Generates Impact.com affiliate links
  - POST body: `{ stockxUrl: string, customParams?: object }`
  - Returns: `{ originalUrl: string, trackingUrl: string, shortUrl?: string }`