# 🚀 Deploy Auto-Repricing to Vercel

## Step 1: Commit and Push

Run these commands in your terminal:

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "Add automated repricing system with 5-minute cron"

# Push to your main branch (Vercel will auto-deploy)
git push origin main
```

## Step 2: Set Environment Variable in Vercel

1. Go to: https://vercel.com/dashboard
2. Click on your project
3. Go to: **Settings** → **Environment Variables**
4. Add this variable:
   - **Name:** `CRON_SECRET`
   - **Value:** `your-super-secret-key-here` (generate a random string)
   - **Environment:** Production, Preview, Development
5. Click **Save**

### Generate a Secure Secret:

You can generate a secure secret with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use this one (change it for security):
```
cron_secret_abc123xyz789_change_this_value
```

## Step 3: Verify Deployment

After pushing, Vercel will automatically deploy. Check:

1. **Deployment Status**: https://vercel.com/dashboard (should show "Ready")
2. **Cron Status**: Visit `https://your-domain.com/api/cron/status`
3. **Check Logs**: Vercel Dashboard → Your Project → Logs

## Step 4: Enable Auto-Repricing

Run the setup script:
```bash
npm run enable-repricing
```

Or manually update Firebase (see AUTO_REPRICING_SETUP.md)

---

## ✅ Checklist

- [ ] Committed changes to git
- [ ] Pushed to main branch
- [ ] Vercel deployed successfully
- [ ] Added CRON_SECRET environment variable
- [ ] Ran enable-repricing script
- [ ] Verified cron status endpoint

Once all checked, your auto-repricing is live! 🎉

