# FedEx API Setup Guide

This guide will help you set up the FedEx API integration for real-time tracking in your deliveries page.

## 🚀 What You Get

### Real-Time Features:
- **Live tracking data** from FedEx's official API
- **Real-time status updates** with accurate timestamps
- **Detailed tracking history** with locations and descriptions
- **Estimated delivery dates** from FedEx
- **Exception handling** for delivery issues
- **Webhook support** for instant updates

### Business Benefits:
- **Accurate tracking** - No more mock data
- **Real-time updates** - Customers see live status
- **Better customer service** - Accurate delivery information
- **Reduced support calls** - Customers can track themselves

## 📋 Prerequisites

1. **FedEx Developer Account**
   - Go to [FedEx Developer Portal](https://developer.fedex.com)
   - Create an account
   - Request access to Track API

2. **FedEx Shipping Account**
   - You need an active FedEx shipping account
   - Account number for API access

3. **Server Requirements**
   - HTTPS endpoint for webhook callbacks
   - Environment variables configured

## 🔧 Setup Steps

### Step 1: Get FedEx API Credentials

1. **Login to FedEx Developer Portal**
2. **Navigate to "My Apps"**
3. **Create a new application** for Track API
4. **Get your credentials:**
   - API Key (Client ID)
   - Secret Key (Client Secret)
   - Base URL (usually https://apis.fedex.com)

### Step 2: Configure Environment Variables

Add to your `.env.local` file:

```bash
# FedEx API Configuration
FEDEX_API_KEY=your_fedex_api_key_here
FEDEX_SECRET_KEY=your_fedex_secret_key_here
FEDEX_BASE_URL=https://apis.fedex.com

# Optional: For webhook verification
FEDEX_WEBHOOK_SECRET=your_webhook_secret_key
```

### Step 3: Test the Integration

1. **Test API Configuration:**
   ```bash
   curl -X GET https://yourdomain.com/api/tracking/test-fedex
   ```

2. **Test with Real Tracking Number:**
   ```bash
   curl -X POST https://yourdomain.com/api/tracking/test-fedex \
     -H "Content-Type: application/json" \
     -d '{"trackingNumber": "123456789012"}'
   ```

### Step 4: Set Up Webhooks (Optional)

For real-time updates, configure FedEx webhooks:

1. **Webhook Endpoint:**
   ```
   https://yourdomain.com/api/tracking/webhook/fedex
   ```

2. **Register Webhook with FedEx:**
   - Use FedEx Developer Portal
   - Configure webhook URL
   - Select events to receive

## 🧪 Testing

### Test API Configuration
```bash
# Check if FedEx API is properly configured
curl -X GET https://yourdomain.com/api/tracking/test-fedex
```

Expected response:
```json
{
  "success": true,
  "configuration": {
    "canDetectTrackingNumber": true,
    "environmentVariables": {
      "FEDEX_API_KEY": true,
      "FEDEX_SECRET_KEY": true,
      "FEDEX_BASE_URL": "https://apis.fedex.com"
    }
  }
}
```

### Test with Real Tracking Number
```bash
# Test with a real FedEx tracking number
curl -X POST https://yourdomain.com/api/tracking/test-fedex \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber": "123456789012"}'
```

Expected response:
```json
{
  "success": true,
  "trackingInfo": {
    "trackingNumber": "123456789012",
    "carrier": "FedEx",
    "status": "in_transit",
    "estimatedDelivery": "2024-01-15",
    "updates": [
      {
        "timestamp": "2024-01-10T10:30:00Z",
        "location": "Memphis, TN",
        "status": "shipped",
        "description": "Package picked up by FedEx"
      }
    ]
  }
}
```

## 🔍 API Features

### Tracking Information
- **Real-time status** from FedEx
- **Detailed tracking history** with timestamps
- **Location information** for each update
- **Estimated delivery dates**
- **Exception handling** for issues

### Status Mapping
| FedEx Status | Our Status | Description |
|-------------|------------|-------------|
| OC | shipped | Origin scan |
| DP | shipped | Departed origin |
| IT | in_transit | In transit |
| OD | out_for_delivery | Out for delivery |
| DL | delivered | Delivered |
| DE | delivered | Delivered |
| EX | exception | Exception |
| CA | exception | Cancelled |
| SE | exception | Shipment exception |

### Error Handling
- **Automatic fallback** to mock data if API fails
- **Retry logic** for temporary failures
- **Comprehensive error logging**
- **Graceful degradation** for better UX

## 🛠️ Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Check API key and secret key
   - Verify credentials are correct
   - Ensure account is active

2. **API Rate Limits**
   - FedEx has rate limits
   - Implement proper rate limiting
   - Use caching when possible

3. **Tracking Number Format**
   - FedEx tracking numbers are 12-15 digits
   - Ensure proper format validation
   - Check for leading zeros

4. **Network Issues**
   - Check internet connectivity
   - Verify FedEx API is accessible
   - Check firewall settings

### Debug Tools

1. **API Test Endpoint**
   ```bash
   curl -X GET https://yourdomain.com/api/tracking/test-fedex
   ```

2. **Check Logs**
   - Look for FedEx API errors in console
   - Check network requests in browser dev tools
   - Monitor server logs

3. **Environment Check**
   ```bash
   # Check if environment variables are set
   echo $FEDEX_API_KEY
   echo $FEDEX_SECRET_KEY
   ```

## 📊 Monitoring

### Key Metrics
- **API success rate** - % of successful API calls
- **Response time** - Time to get tracking data
- **Error rate** - % of failed API calls
- **Fallback usage** - How often we use mock data

### Alerts
- **API failures** - When FedEx API is down
- **High error rates** - When error rate exceeds threshold
- **Authentication issues** - When credentials are invalid

## 🚀 Production Deployment

### Environment Variables
Make sure to set these in your production environment:
```bash
FEDEX_API_KEY=your_production_api_key
FEDEX_SECRET_KEY=your_production_secret_key
FEDEX_BASE_URL=https://apis.fedex.com
```

### Security
- **Never commit** API keys to version control
- **Use environment variables** for all secrets
- **Rotate keys** regularly
- **Monitor usage** for unusual activity

### Performance
- **Implement caching** for frequently accessed data
- **Use rate limiting** to avoid hitting limits
- **Monitor response times** and optimize
- **Set up monitoring** and alerting

## 📞 Support

- **FedEx Developer Support**: [developer.fedex.com/support](https://developer.fedex.com/support)
- **API Documentation**: [developer.fedex.com/docs](https://developer.fedex.com/docs)
- **Track API Reference**: [developer.fedex.com/api-reference/track](https://developer.fedex.com/api-reference/track)

## 🔗 Related Resources

- [FedEx Developer Portal](https://developer.fedex.com)
- [Track API Documentation](https://developer.fedex.com/docs/track)
- [Webhook Setup Guide](./FEDEX_WEBHOOK_SETUP.md)
- [Deliveries Page Implementation](./src/components/Deliveries.tsx)
