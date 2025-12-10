# Vercel Cron Job Setup for Automatic Gmail Syncing

## ✅ What's Been Done

1. **Cron Job Created**: `/api/cron/sync-purchases/route.ts` already exists
2. **Vercel Config Updated**: Added the cron to `vercel.json` to run every 15 minutes
3. **Auto-Sync UI Added**: `AutoEmailSync` component added to Purchases page for manual control

## 🔧 Setup Required (One-Time)

### 1. Generate a CRON_SECRET

Run this in your terminal to generate a secure random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Add to Vercel Environment Variables

Go to your Vercel dashboard:
1. Navigate to your project: https://vercel.com/your-username/reselldashboard
2. Go to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `CRON_SECRET`
   - **Value**: (paste the secret you generated)
   - **Environments**: Production, Preview, Development (select all)
4. Click **Save**

### 3. Deploy to Vercel

Push your changes to GitHub (the cron job will be activated on deploy):

```bash
git add .
git commit -m "Add automatic Gmail sync cron job"
git push origin main
```

## 📋 How It Works

### Cron Schedule
- **Frequency**: Every 15 minutes (`*/15 * * * *`)
- **What it does**: 
  - Checks all users who have Gmail connected
  - Syncs new purchase emails for each user
  - Only syncs users who haven't been synced in the last 30 minutes
  - Automatically updates delivery status

### The Cron Job Will:
1. ✅ Run 24/7 in the background (even when app is closed)
2. ✅ Process all users with Gmail connected
3. ✅ Fetch new purchase emails (last 20 emails per user)
4. ✅ Parse and save new purchases to Firebase
5. ✅ Update the last sync timestamp for each user
6. ✅ Skip users who were synced in the last 30 minutes

### Security
- Cron endpoint is protected by `CRON_SECRET`
- Only Vercel's cron service can trigger it
- Each user's Gmail tokens are used securely

## 🎯 Schedule Options

Current: `*/15 * * * *` (every 15 minutes)

You can change the frequency by editing `vercel.json`:
- `*/5 * * * *` - Every 5 minutes (more frequent)
- `*/30 * * * *` - Every 30 minutes (less frequent)  
- `0 * * * *` - Every hour (on the hour)
- `0 */2 * * *` - Every 2 hours

## 📊 Monitoring

Check cron execution logs in Vercel:
1. Go to your project dashboard
2. Click on **Deployments** → Select your deployment
3. Click on **Functions** tab
4. Look for `/api/cron/sync-purchases` logs

## 🔍 Testing

You can manually test the cron job (in development):

```bash
curl http://localhost:3000/api/cron/sync-purchases
```

Or test in production:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/sync-purchases
```

## 💡 Benefits

1. **Always Up-to-Date**: Purchases sync automatically every 15 minutes
2. **No Manual Work**: Don't need to click "Sync Gmail" anymore
3. **Scales**: Works for all users automatically
4. **Reliable**: Runs even when you're offline
5. **Efficient**: Only syncs users who need it (30-min cooldown)

## ⚙️ In-App Auto Sync vs Cron Job

- **In-App (AutoEmailSync component)**: Runs while browser is open, user-controlled
- **Cron Job**: Runs 24/7 on the server, works for all users automatically

Both can work together! The cron provides background syncing, while the in-app component gives users manual control and real-time feedback.
