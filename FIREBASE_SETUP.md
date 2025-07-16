# Firebase Security Rules Setup Guide

## Steps to Fix Firebase Permissions

### 1. Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with the Google account that owns the Firebase project
3. Select your project (likely named something like "resell-dashboard" or "flip-flow")

### 2. Navigate to Firestore Rules
1. In the left sidebar, click on **Firestore Database**
2. Click on the **Rules** tab at the top

### 3. Update the Security Rules
1. Delete all existing rules in the editor
2. Copy ALL the content from `firebase-rules.txt` 
3. Paste it into the Firebase Rules editor
4. Click **Publish** button

### 4. Verify the Rules
After publishing, you should see a success message. The rules will take effect immediately.

### 5. Test the Application
1. Go back to your app
2. Refresh the page
3. Try adding a failed verification
4. Refresh again - it should now persist!

## What These Rules Do

- **Authenticated Access**: Only logged-in users can access data
- **User Isolation**: Users can only read/write their own data (matched by userId)
- **Collection-Specific**: Each collection has specific rules
- **Secure by Default**: Any collection not explicitly listed is denied access

## Troubleshooting

If you still see permission errors after applying these rules:

1. **Check Authentication**: Make sure you're logged in (you should see your email in the console)
2. **Check User ID**: The data must have a `userId` field that matches your auth ID
3. **Clear Cache**: Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check Console**: Look for specific error messages about which collection is failing

## Need to Find Your Firebase Project?

If you're not sure which Firebase project to use:
1. Check `.env.local` or environment variables for `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
2. Look in `src/lib/firebase/firebase.ts` for the project configuration
3. The project ID is what appears in the Firebase Console URL

## Security Note

These rules ensure that:
- Each user can only access their own data
- No user can read or modify another user's data
- The app remains secure while fixing the permission issues