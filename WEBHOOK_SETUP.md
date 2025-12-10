# Gmail Webhooks + Cron Jobs Setup Guide

## ✅ What's Been Done

### Code Implementation:
1. ✅ **Gmail Webhook Endpoint** (`/api/gmail/webhook/route.ts`)
   - Receives push notifications from Gmail
   - Triggers purchase sync automatically when new emails arrive
   
2. ✅ **Gmail Watch API** (`/api/gmail/watch/route.ts`)
   - Registers Gmail push notifications for users
   - Check/stop watching endpoints
   
3. ✅ **Webhook Renewal Cron** (`/api/cron/renew-gmail-watches/route.ts`)
   - Automatically renews watches before they expire (7-day expiry)
   - Runs every 12 hours
   
4. ✅ **Purchase Sync Cron** (`/api/cron/sync-purchases/route.ts`)
   - Backup sync that runs every 15 minutes
   - Catches anything webhooks might miss
   
5. ✅ **Auto-Registration** in `GmailConnector.tsx`
   - Automatically registers webhook when Gmail connects
   
6. ✅ **Vercel Cron Configuration** in `vercel.json`
   - `/api/cron/sync-purchases` - Every 15 minutes
   - `/api/cron/renew-gmail-watches` - Every 12 hours

---

## 🔧 Required Setup (Google Cloud Console)

### Step 1: Enable Gmail API
1. Go to: https://console.cloud.google.com
2. Select your project (or create one)
3. Go to **APIs & Services** → **Library**
4. Search for "Gmail API"
5. Click **Enable**

### Step 2: Create Pub/Sub Topic
1. In Google Cloud Console, go to **Pub/Sub** → **Topics**
2. Click **CREATE TOPIC**
3. **Topic ID**: `gmail-notifications`
4. Leave other settings as default
5. Click **CREATE**
6. **Copy the full topic name**, it will look like:
   ```
   projects/YOUR_PROJECT_ID/topics/gmail-notifications
   ```

### Step 3: Create Pub/Sub Subscription
1. In the topic you just created, click **CREATE SUBSCRIPTION**
2. **Subscription ID**: `gmail-webhook-subscription`
3. **Delivery type**: Push
4. **Endpoint URL**: `https://resell-dashboard-zeta.vercel.app/api/gmail/webhook`
   (or your custom domain: `https://www.solesmarket.com/api/gmail/webhook`)
5. Click **CREATE**

### Step 4: Grant Gmail Permission to Publish
1. Still in your Pub/Sub topic, click the **PERMISSIONS** tab
2. Click **ADD PRINCIPAL**
3. **New principals**: `gmail-api-push@system.gserviceaccount.com`
4. **Role**: Pub/Sub Publisher
5. Click **SAVE**

---

## 🔑 Environment Variables

Add these to Vercel (already done for CRON_SECRET):

### 1. GMAIL_PUBSUB_TOPIC
```
projects/YOUR_PROJECT_ID/topics/gmail-notifications
```
Replace `YOUR_PROJECT_ID` with your actual Google Cloud project ID.

### 2. CRON_SECRET (Already Added ✅)
```
a0c60b2c87809bcfea155e3ef9bf9f8971d0b04507feb82f4ed216ed64c6feae
```

---

## 📊 How It Works

### Real-Time Flow (Webhooks):
1. 👤 User connects Gmail
2. 📬 App registers Gmail watch with Google
3. 📧 New email arrives in user's inbox
4. ⚡ Gmail → Pub/Sub → Your webhook endpoint (instant!)
5. 🔄 Webhook triggers purchase sync
6. ✅ New purchase appears in dashboard (< 5 seconds)

### Backup Flow (Cron Jobs):
1. ⏰ Every 15 minutes, cron runs
2. 🔍 Checks all users with Gmail connected
3. 📧 Syncs last 20 emails for each user
4. ✅ Catches anything webhooks missed

### Watch Renewal Flow:
1. ⏰ Every 12 hours, renewal cron runs
2. 🔍 Checks all active watches
3. 🔄 Renews watches expiring within 2 days
4. ✅ Ensures webhooks keep working

---

## 🧪 Testing

### Test Webhook Endpoint:
```bash
curl https://resell-dashboard-zeta.vercel.app/api/gmail/webhook
```
Expected: `{"status":"ok","endpoint":"gmail-webhook","message":"Gmail push notifications webhook is running"}`

### Test Watch Registration:
```bash
curl -X POST https://resell-dashboard-zeta.vercel.app/api/gmail/watch \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID","accessToken":"YOUR_TOKEN"}'
```

### Test Cron Jobs (Local):
```bash
# Test purchase sync
curl http://localhost:3000/api/cron/sync-purchases

# Test watch renewal
curl http://localhost:3000/api/cron/renew-gmail-watches
```

---

## 📝 Deployment Checklist

- [x] Code deployed to Vercel
- [x] `CRON_SECRET` added to Vercel
- [ ] Gmail API enabled in Google Cloud
- [ ] Pub/Sub topic created
- [ ] Pub/Sub subscription created with your webhook URL
- [ ] Gmail service account granted Pub/Sub Publisher role
- [ ] `GMAIL_PUBSUB_TOPIC` added to Vercel
- [ ] Test webhook endpoint is accessible
- [ ] Test by connecting Gmail and sending a test email

---

## 🎯 Benefits

### With Webhooks:
- ⚡ **Real-time updates** (< 5 seconds)
- 💰 **Efficient** (only processes when emails arrive)
- 🎯 **Precise** (uses historyId for incremental sync)

### With Cron Backup:
- 🛡️ **Reliable** (catches missed notifications)
- 🔄 **Consistent** (checks every 15 minutes)
- 📊 **Predictable** (scheduled processing)

### Both Together:
- 🚀 **Best of both worlds**
- ⚡ Real-time updates from webhooks
- 🛡️ Reliability from cron backup
- 🔄 Watch renewal keeps webhooks alive

---

## 🔍 Monitoring

### Vercel Function Logs:
1. Go to Vercel dashboard
2. Select your project
3. Click **Deployments** → Latest deployment
4. Click **Functions** tab
5. Look for:
   - `/api/gmail/webhook` - Webhook calls
   - `/api/cron/sync-purchases` - Backup sync
   - `/api/cron/renew-gmail-watches` - Watch renewals

### Check Watch Status:
```bash
curl "https://resell-dashboard-zeta.vercel.app/api/gmail/watch?userId=YOUR_USER_ID"
```

---

## ⚠️ Important Notes

1. **Gmail Watches Expire After 7 Days**
   - The renewal cron handles this automatically
   - Runs every 12 hours to check and renew

2. **Pub/Sub Authentication**
   - Webhook endpoint is public (Pub/Sub can't send auth headers)
   - Security: Only Google's Pub/Sub can trigger it
   - Always returns 200 to prevent retries

3. **Rate Limits**
   - Gmail API: 250 quota units/second per user
   - Pub/Sub: High throughput, no issues expected
   - Webhooks are more efficient than polling

4. **First-Time Setup**
   - User must connect Gmail at least once
   - Watch registration happens automatically
   - Watches renew automatically via cron

---

## 🆘 Troubleshooting

### Webhook not receiving notifications:
1. Check Pub/Sub subscription is active
2. Verify endpoint URL is correct
3. Check Gmail service account has Publisher role
4. Look at Pub/Sub delivery logs in Google Cloud Console

### Watch expired:
- Wait for renewal cron (runs every 12 hours)
- Or manually reconnect Gmail (auto-registers watch)

### Cron not running:
- Check Vercel function logs
- Verify `CRON_SECRET` is set
- Check `vercel.json` cron configuration

---

## 📚 Resources

- [Gmail Push Notifications Docs](https://developers.google.com/gmail/api/guides/push)
- [Google Cloud Pub/Sub](https://cloud.google.com/pubsub/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

