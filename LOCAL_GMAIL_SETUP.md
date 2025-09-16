# Gmail Local Testing Setup

## What I Fixed

I've updated your Gmail integration to automatically detect when you're running locally and adjust the OAuth redirect URI accordingly. The changes include:

1. **Auto-detection**: Routes now detect if you're running on `localhost:3000` vs production
2. **Dynamic redirect URI**: Uses `http://localhost:3000/api/gmail/callback` for local development
3. **Cookie handling**: Fixed cookie domain settings for localhost
4. **Environment flexibility**: Falls back to auto-detection if `GOOGLE_REDIRECT_URI` isn't set

## How to Test Gmail Locally

### Step 1: Set up Google OAuth (if not already done)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set **Authorized redirect URIs** to include:
   - `http://localhost:3000/api/gmail/callback` (for local testing)
   - `https://resell-dashboard-michaels-projects-d8c652ad.vercel.app/api/gmail/callback` (for production)

### Step 2: Set Environment Variables

Create a `.env.local` file in your project root with:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

### Step 3: Test Locally

1. **Start your local server**: `npm run dev`
2. **Visit**: http://localhost:3000
3. **Connect Gmail**: The OAuth will now redirect to `localhost:3000` instead of Vercel
4. **Check logs**: You'll see console logs showing the redirect URI being used

### Step 4: Verify It's Working

- Gmail status should return 200 instead of 401
- Dashboard should load completely without "Loading..." state
- Cookies should be set for localhost domain

## Debugging

If you still see issues:

1. **Check console logs** for redirect URI detection
2. **Verify Google OAuth** has localhost in authorized redirects
3. **Clear browser cookies** and try again
4. **Check network tab** for cookie setting

## Production vs Local

- **Local**: Uses `http://localhost:3000/api/gmail/callback`
- **Production**: Uses `https://resell-dashboard-michaels-projects-d8c652ad.vercel.app/api/gmail/callback`

The system automatically detects which environment you're in and uses the appropriate redirect URI.
