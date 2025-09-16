# Live Tracking Setup Guide

This guide will help you set up live tracking for your deliveries page using various carrier APIs.

## Overview

The live tracking system integrates with multiple carrier APIs to provide real-time delivery updates for your purchases. It supports:

- **AfterShip API** (Universal tracking service - recommended)
- **UPS API** (Direct integration)
- **FedEx API** (Direct integration)
- **USPS API** (Direct integration)

## Quick Start

1. **Choose a tracking service** (AfterShip is recommended for ease of use)
2. **Get API credentials** from your chosen service
3. **Add environment variables** to your `.env.local` file
4. **Restart your development server**

## AfterShip Setup (Recommended)

AfterShip is a universal tracking service that supports 1000+ carriers worldwide.

### 1. Sign up for AfterShip
- Go to [AfterShip.com](https://www.aftership.com)
- Create a free account
- Navigate to Settings > API Keys
- Generate a new API key

### 2. Add to Environment Variables
Add to your `.env.local` file:
```bash
AFTERSHIP_API_KEY=your_aftership_api_key_here
```

### 3. Test the Integration
- Go to your deliveries page
- Toggle "Live Tracking ON"
- You should see live tracking data for your packages

## Direct Carrier APIs

### UPS API Setup

1. **Get UPS Developer Account**
   - Go to [UPS Developer Portal](https://developer.ups.com)
   - Create an account and request API access
   - Get your API key, username, and password

2. **Add Environment Variables**
   ```bash
   UPS_API_KEY=your_ups_api_key
   UPS_API_USERNAME=your_ups_username
   UPS_API_PASSWORD=your_ups_password
   ```

### FedEx API Setup

1. **Get FedEx Developer Account**
   - Go to [FedEx Developer Portal](https://developer.fedex.com)
   - Create an account and request API access
   - Get your API key and secret key

2. **Add Environment Variables**
   ```bash
   FEDEX_API_KEY=your_fedex_api_key
   FEDEX_SECRET_KEY=your_fedex_secret_key
   ```

### USPS API Setup

1. **Get USPS Web Tools Account**
   - Go to [USPS Web Tools](https://www.usps.com/business/web-tools-apis/)
   - Register for a Web Tools account
   - Get your API key

2. **Add Environment Variables**
   ```bash
   USPS_API_KEY=your_usps_api_key
   ```

## Features

### Live Tracking Indicators
- **🟢 LIVE** - Real-time tracking is active
- **🔴 ERROR** - Tracking API error occurred
- **⚪ OFF** - Live tracking is disabled

### Real-time Updates
- Automatic refresh every 60 seconds
- Manual refresh button
- Toggle live tracking on/off
- Error handling and retry logic

### Supported Statuses
- **Shipped** - Package has been picked up
- **In Transit** - Package is moving through the network
- **Out for Delivery** - Package is out for final delivery
- **Delivered** - Package has been delivered
- **Exception** - Delivery issue occurred
- **Unknown** - Status cannot be determined

## API Rate Limits

### AfterShip
- Free tier: 100 requests/month
- Paid tiers: Higher limits available

### UPS
- Varies by plan
- Typically 1000+ requests/day

### FedEx
- Varies by plan
- Typically 1000+ requests/day

### USPS
- Free tier: 5000 requests/month
- Paid tiers: Higher limits available

## Troubleshooting

### Common Issues

1. **No Live Tracking Data**
   - Check if API keys are correctly set
   - Verify tracking numbers are valid
   - Check browser console for errors

2. **API Rate Limit Exceeded**
   - Reduce refresh frequency
   - Upgrade your API plan
   - Use caching to reduce requests

3. **Tracking Number Not Recognized**
   - Ensure tracking number format is correct
   - Try different carrier APIs
   - Use AfterShip as fallback

### Debug Information

The deliveries page includes a debug panel that shows:
- Live tracking status
- API errors
- Last update time
- Number of tracking numbers
- Live tracking info count

## Cost Considerations

### AfterShip (Recommended)
- **Free**: 100 requests/month
- **Starter**: $9/month for 1,000 requests
- **Professional**: $29/month for 10,000 requests

### Direct Carrier APIs
- **UPS**: Free for basic usage, paid for commercial
- **FedEx**: Free for basic usage, paid for commercial
- **USPS**: Free for basic usage, paid for commercial

## Best Practices

1. **Start with AfterShip** - Easiest to set up and most reliable
2. **Use caching** - Store tracking data to reduce API calls
3. **Handle errors gracefully** - Show fallback data when APIs fail
4. **Monitor usage** - Keep track of API request counts
5. **Update regularly** - Refresh tracking data periodically

## Next Steps

1. Set up your chosen tracking API
2. Test with a few tracking numbers
3. Monitor API usage and costs
4. Consider upgrading plans as needed
5. Add more carriers as your business grows

## Support

If you need help setting up tracking APIs:
1. Check the debug panel on the deliveries page
2. Review API documentation for your chosen service
3. Check browser console for error messages
4. Verify environment variables are set correctly
