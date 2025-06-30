# 🔥 Firebase Setup Guide

Your app is showing a **Firebase authentication error** because the environment variables aren't configured.

## 🚀 Quick Fix Steps

### 1. Get Your Firebase Configuration
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click the **⚙️ Settings** gear icon → **Project settings**
4. Scroll down to "Your apps" section
5. Click the **</>** Web app icon
6. Copy the `firebaseConfig` object values

### 2. Update Your Environment File
Edit `template-2/.env.local` and replace the placeholder values:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyA...your-actual-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com  
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-actual-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

### 3. Restart Your Development Server
```bash
npm run dev
```

## 🎯 Once Firebase is Working

The **QuickTrackingFix** component will work and you can:
1. Click "Fix Both Orders" button
2. See the tracking numbers update from:
   - `01-95H9NC36ST`: `888327774362` → `1Z24WA430206362750`
   - `01-B56RWN58RD`: `882268115454` → `1Z24WA430227721340`

## 🔧 Alternative: Manual Database Fix

If you can't access Firebase config, use the Firebase Admin Console:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → **Firestore Database**
3. Find the `purchases` collection
4. Search for orders `01-95H9NC36ST` and `01-B56RWN58RD`
5. Update their `trackingNumber` fields manually

## 📞 Need Help?

If you're still stuck, share your Firebase project ID and I can provide more specific guidance! 