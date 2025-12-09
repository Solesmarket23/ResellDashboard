# Gmail OAuth Setup Guide

## Fixing "This browser or app may not be secure" Error

This error occurs when Google OAuth doesn't recognize your app as secure. Here's how to fix it:

## Step 1: Verify Redirect URI in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Under **Authorized redirect URIs**, make sure you have:
   - `http://localhost:3000/api/gmail/callback` (for local development)
   - `https://www.solesmarket.com/api/gmail/callback` (for production)

## Step 2: Check OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Make sure:
   - **User Type**: Either "External" (for testing) or "Internal" (for workspace)
   - **App name**: Your app name
   - **Authorized domains**: Add `localhost` and your production domain
   - **Scopes**: Should include:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`

## Step 3: Add Test Users (if app is in Testing mode)

If your OAuth consent screen is in **Testing** mode:

1. Go to **OAuth consent screen**
2. Scroll down to **Test users**
3. Click **+ ADD USERS**
4. Add your Gmail address (the one you're trying to connect with)
5. Save

## Step 4: Verify Environment Variables

Make sure your `.env.local` file has:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback
```

## Step 5: Common Issues

### Issue: "Redirect URI mismatch"
- **Solution**: Make sure the redirect URI in your code matches exactly what's in Google Cloud Console
- Check for trailing slashes, http vs https, port numbers

### Issue: "App not verified" (for production)
- **Solution**: For localhost, this shouldn't matter. For production, you may need to verify your app with Google

### Issue: "Access blocked: This app's request is invalid"
- **Solution**: 
  - Make sure your app is in "Testing" mode OR
  - Add your email as a test user
  - Or publish your app (requires verification)

## Quick Fix for Local Development

1. Make sure your OAuth consent screen is set to **Testing** mode
2. Add your Gmail address as a test user
3. Use `http://localhost:3000/api/gmail/callback` as the redirect URI
4. Make sure you're accessing the app via `http://localhost:3000` (not `127.0.0.1`)

## Testing the Connection

After fixing the settings:

1. Clear your browser cookies for localhost
2. Try connecting Gmail again
3. You should see the Google OAuth consent screen
4. Grant permissions
5. You'll be redirected back to your app

## Still Having Issues?

Check the server logs when you try to connect. Look for:
- The redirect URI being used
- Any OAuth errors
- Console logs from `/api/gmail/auth`

The redirect URI should be logged as: `🔐 Gmail Auth - Using redirect URI: http://localhost:3000/api/gmail/callback`




