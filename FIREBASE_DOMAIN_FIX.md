# Firebase Domain Authorization Fix

## Problem
You're getting `auth/unauthorized-domain` errors when trying to sign in with Google on your deployed Vercel app.

## Root Cause
Firebase doesn't recognize your Vercel deployment domain as authorized for authentication.

## Solution

### Step 1: Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **flip-flow-4d55c**

### Step 2: Navigate to Authentication Settings
1. In the left sidebar, click **Authentication**
2. Click the **Settings** tab
3. Click **Authorized domains**

### Step 3: Add Your Domains
Add these domains to the authorized list:

**Production Domain:**
```
resell-dashboard-rkmlvtc8g-michaels-projects-d8c652ad.vercel.app
```

**Development Domains:**
```
localhost
127.0.0.1
```

**Optional: Custom Domain (if you have one):**
```
your-custom-domain.com
```

### Step 4: Save Changes
1. Click **Add domain** for each domain
2. Click **Save** 

### Step 5: Redeploy (Optional)
You may need to redeploy your Vercel app for changes to take effect:
```bash
vercel --prod
```

## Alternative: Use Custom Domain
If you want a cleaner URL, you can:
1. Set up a custom domain in Vercel
2. Add that custom domain to Firebase authorized domains
3. Use the custom domain instead of the Vercel-generated URL

## Verification
After adding the domains:
1. Go to your deployed app
2. Try signing in with Google
3. The error should be resolved

## Notes
- Changes may take a few minutes to propagate
- Make sure to add both `localhost` and `127.0.0.1` for local development
- The Vercel domain format is: `your-app-name-hash-username.vercel.app`

## Current Status
✅ Firebase is properly configured in your `.env.local`  
✅ Error handling has been improved  
❌ Domain needs to be authorized in Firebase Console  

## Next Steps
1. Follow the steps above to authorize your domain
2. Test the authentication flow
3. Consider setting up a custom domain for a cleaner URL 