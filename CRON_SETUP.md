# CRON Job Setup for Real-Time Delivery Tracking

This guide explains how to set up automated CRON jobs to keep your delivery tracking data up-to-date in real-time.

## 🎯 **What CRON Jobs Do**

- **Auto-sync deliveries**: Every 5 minutes, sync all purchases with tracking numbers to the deliveries page
- **Live tracking updates**: Fetch real-time tracking data from AfterShip API
- **Status updates**: Update delivery statuses (shipped, in_transit, out_for_delivery, delivered)
- **Estimated delivery dates**: Get accurate delivery estimates from carriers

## 🚀 **Setup Options**

### **Option 1: Vercel Cron Jobs (Recommended)**

If you're using Vercel, add this to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-deliveries",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### **Option 2: External CRON Service**

Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

**URL**: `https://your-domain.com/api/cron/sync-deliveries`
**Schedule**: Every 5 minutes (`*/5 * * * *`)
**Method**: GET
**Headers**: 
```
Authorization: Bearer YOUR_CRON_SECRET
```

### **Option 3: Server CRON (VPS/Dedicated)**

Add to your server's crontab:

```bash
# Edit crontab
crontab -e

# Add this line (runs every 5 minutes)
*/5 * * * * curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/cron/sync-deliveries
```

## 🔧 **Environment Variables**

Add these to your `.env.local`:

```bash
# CRON Secret (for security)
CRON_SECRET=your-super-secret-cron-key-here

# AfterShip API Key (for live tracking)
AFTERSHIP_API_KEY=your-aftership-api-key

# App URL (for internal API calls)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## 📊 **Monitoring**

### **Check CRON Status**

Visit: `https://your-domain.com/api/cron/sync-deliveries`

**Success Response**:
```json
{
  "success": true,
  "message": "Delivery sync completed",
  "results": {
    "totalUsers": 5,
    "successfulSyncs": 5,
    "failedSyncs": 0,
    "totalDeliveries": 23,
    "liveTrackingUpdates": 18,
    "errors": []
  },
  "timestamp": "2025-01-17T19:30:00.000Z"
}
```

### **Manual Trigger**

You can manually trigger a sync:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-domain.com/api/cron/sync-deliveries
```

## ⚡ **Real-Time Features**

### **Automatic Updates**
- **Every 5 minutes**: CRON job syncs all deliveries
- **Live tracking**: AfterShip API provides real-time status
- **Status changes**: Automatically updates delivery statuses
- **Delivery dates**: Gets accurate estimates from carriers

### **User Experience**
- **Real-time indicators**: Shows "Last sync" timestamp
- **Live status**: Green WiFi icon when synced
- **Error handling**: Red WiFi icon when sync fails
- **Auto-refresh**: Page refreshes every minute for live data

## 🔍 **Troubleshooting**

### **Common Issues**

1. **CRON not running**
   - Check `CRON_SECRET` environment variable
   - Verify URL is accessible
   - Check server logs

2. **No live tracking data**
   - Verify `AFTERSHIP_API_KEY` is set
   - Check AfterShip API permissions
   - Ensure tracking numbers are registered

3. **Sync errors**
   - Check Firebase connection
   - Verify user authentication
   - Check API rate limits

### **Debug Commands**

```bash
# Test CRON endpoint
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-domain.com/api/cron/sync-deliveries

# Check environment variables
echo $CRON_SECRET
echo $AFTERSHIP_API_KEY

# View logs (if using PM2 or similar)
pm2 logs your-app-name
```

## 📈 **Performance**

### **Optimization**
- **Batch processing**: Processes all users in one request
- **Rate limiting**: 1-second delay between users
- **Error handling**: Continues processing if one user fails
- **Deduplication**: Removes duplicate tracking numbers

### **Scaling**
- **Multiple users**: Handles unlimited users
- **Large datasets**: Processes thousands of deliveries
- **API limits**: Respects AfterShip rate limits
- **Memory efficient**: Processes data in batches

## 🎉 **Benefits**

✅ **Real-time updates**: Always current delivery status  
✅ **Automatic sync**: No manual intervention needed  
✅ **Live tracking**: AfterShip API integration  
✅ **Error handling**: Graceful failure recovery  
✅ **Scalable**: Handles growing user base  
✅ **Secure**: CRON secret protection  

## 🔄 **Next Steps**

1. **Set up CRON job** using one of the options above
2. **Configure environment variables** in `.env.local`
3. **Test the endpoint** manually first
4. **Monitor the logs** for any issues
5. **Enjoy real-time delivery tracking!** 🚀

---

**Need help?** Check the logs or create an issue in the repository.