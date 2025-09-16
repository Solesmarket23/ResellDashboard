# FedEx Advanced Integrated Visibility Setup Guide

This guide will help you set up **FedEx Advanced Integrated Visibility** for real-time tracking updates via webhooks.

## 🚀 What You Get

### Real-Time Features:
- **Near real-time updates** (seconds, not minutes)
- **Picture proof of delivery** - actual photos of delivery
- **GPS coordinates** of where packages were delivered
- **Exception notifications** for delays and issues
- **Estimated delivery time windows**
- **Branded notifications** for your customers

### Business Benefits:
- **Reduce customer service calls** (WISMO - "Where Is My Order")
- **Enhance customer experience** with proactive notifications
- **Build your brand** with custom tracking experiences
- **Streamline operations** with automated updates

## 📋 Prerequisites

1. **FedEx Developer Account**
   - Go to [FedEx Developer Portal](https://developer.fedex.com)
   - Create an account
   - Request access to Advanced Integrated Visibility

2. **FedEx Shipping Account**
   - You need an active FedEx shipping account
   - Account number for webhook registration

3. **Server Requirements**
   - HTTPS endpoint for webhook callbacks
   - Ability to handle POST requests
   - Webhook signature verification

## 🔧 Setup Steps

### Step 1: Get FedEx API Credentials

1. **Login to FedEx Developer Portal**
2. **Navigate to "My Apps"**
3. **Create a new application** for Advanced Integrated Visibility
4. **Get your credentials:**
   - API Key
   - Secret Key
   - Account Number

### Step 2: Configure Environment Variables

Add to your `.env.local` file:

```bash
# FedEx Advanced Integrated Visibility
FEDEX_API_KEY=your_fedex_api_key
FEDEX_SECRET_KEY=your_fedex_secret_key
FEDEX_ACCOUNT_NUMBER=your_fedex_account_number
FEDEX_WEBHOOK_SECRET=your_webhook_secret_key
```

### Step 3: Set Up Webhook Endpoint

Your webhook endpoint is already configured at:
```
https://yourdomain.com/api/tracking/webhook/fedex
```

### Step 4: Register Webhooks with FedEx

Use the webhook management interface or API:

```bash
# Register a webhook for specific tracking number
curl -X POST https://yourdomain.com/api/tracking/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "carrier": "fedex",
    "trackingNumber": "1234567890",
    "events": ["status_update", "delivery", "exception"]
  }'

# Register account-wide webhook
curl -X POST https://yourdomain.com/api/tracking/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "carrier": "fedex",
    "accountNumber": "your_account_number",
    "events": ["status_update", "delivery", "exception"]
  }'
```

### Step 5: Test the Integration

1. **Create a test shipment** with FedEx
2. **Register the tracking number** for webhook updates
3. **Monitor the webhook endpoint** for incoming events
4. **Check your deliveries page** for real-time updates

## 📊 Webhook Event Types

### Status Updates
- `PICKED_UP` - Package picked up
- `IN_TRANSIT` - Package in transit
- `OUT_FOR_DELIVERY` - Out for delivery
- `DELIVERED` - Package delivered

### Exception Events
- `EXCEPTION` - Delivery exception
- `DELAYED` - Delivery delayed
- `RETURNED` - Package returned
- `DAMAGED` - Package damaged

### Special Events
- `PICTURE_PROOF_OF_DELIVERY` - Photo proof of delivery
- `GPS_DELIVERY` - GPS coordinates of delivery
- `SIGNATURE_REQUIRED` - Signature required for delivery

## 🔍 Webhook Payload Example

```json
{
  "trackingNumber": "1234567890",
  "eventType": "DELIVERED",
  "timestamp": "2024-01-15T14:30:00Z",
  "location": "New York, NY",
  "description": "Package delivered successfully",
  "status": "DELIVERED",
  "metadata": {
    "deliveryPhoto": "https://fedex.com/photos/delivery123.jpg",
    "gpsCoordinates": {
      "latitude": 40.7128,
      "longitude": -74.0060
    },
    "signature": "John Doe",
    "deliveryTime": "2024-01-15T14:30:00Z"
  }
}
```

## 🛠️ Implementation Details

### Webhook Security
- **Signature verification** to ensure webhooks come from FedEx
- **HTTPS only** for webhook endpoints
- **Rate limiting** to prevent abuse

### Error Handling
- **Retry logic** for failed webhook processing
- **Dead letter queue** for failed events
- **Monitoring and alerting** for webhook failures

### Database Updates
- **Real-time updates** to your purchases collection
- **Tracking history** stored for each package
- **Status mapping** from FedEx to your internal statuses

## 💰 Pricing

### FedEx Advanced Integrated Visibility
- **Free Trial**: Available for testing
- **Paid Plans**: Contact FedEx for pricing
- **Volume Discounts**: Available for high-volume shippers

### Features by Plan
| Feature | Basic | Advanced |
|---------|-------|----------|
| Shipment tracking status | ✅ | ✅ |
| Estimated delivery date | ✅ | ✅ |
| Real-time webhooks | ❌ | ✅ |
| Picture proof of delivery | ❌ | ✅ |
| GPS coordinates | ❌ | ✅ |
| Exception notifications | ❌ | ✅ |

## 🔧 Troubleshooting

### Common Issues

1. **Webhook Not Receiving Events**
   - Check webhook URL is accessible
   - Verify HTTPS certificate
   - Check FedEx webhook registration

2. **Invalid Signature Errors**
   - Verify webhook secret key
   - Check signature verification logic
   - Ensure proper header parsing

3. **Database Update Failures**
   - Check Firebase connection
   - Verify tracking number matching
   - Review error logs

### Debug Tools

1. **Webhook Management Interface**
   - View all registered webhooks
   - Check webhook status
   - Monitor last event times

2. **Debug Panel**
   - Real-time webhook event logging
   - Error tracking and reporting
   - Performance metrics

## 📈 Monitoring and Analytics

### Key Metrics
- **Webhook delivery rate** - % of successful webhook calls
- **Event processing time** - Time to process each event
- **Error rate** - % of failed webhook processing
- **Update frequency** - How often packages are updated

### Alerts
- **Webhook failures** - Immediate alerts for failed webhooks
- **High error rates** - Alerts when error rate exceeds threshold
- **Missing updates** - Alerts for packages without recent updates

## 🚀 Next Steps

1. **Set up FedEx developer account**
2. **Configure environment variables**
3. **Test with a single tracking number**
4. **Scale to all your shipments**
5. **Monitor and optimize**

## 📞 Support

- **FedEx Developer Support**: [developer.fedex.com/support](https://developer.fedex.com/support)
- **Documentation**: [developer.fedex.com/docs](https://developer.fedex.com/docs)
- **API Reference**: [developer.fedex.com/api-reference](https://developer.fedex.com/api-reference)

## 🔗 Related Resources

- [FedEx Advanced Integrated Visibility](https://www.fedex.com/en-us/shipping/advanced-integrated-visibility.html)
- [Webhook Best Practices](https://webhooks.fyi/)
- [Real-time Tracking Implementation Guide](./TRACKING_SETUP.md)
