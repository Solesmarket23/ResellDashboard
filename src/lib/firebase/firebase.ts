import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableNetwork, disableNetwork, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:demo",
};

// Only initialize Firebase if we have real config values and we're in the browser
const hasValidConfig = process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
                      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const isClientSide = typeof window !== 'undefined';

let app, auth, db, storage;

if (hasValidConfig && isClientSide) {
  try {
    // Initialize Firebase with real config (client-side only)
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    
    // Enable network on initialization for proper sync
    enableNetwork(db).catch(err => {
      console.warn("⚠️ Firebase network enable failed:", err);
    });
    
    console.log("✅ Firebase initialized successfully");
  } catch (error) {
    console.error("❌ Firebase initialization failed:", error);
    app = null;
    auth = null;
    db = null;
    storage = null;
  }
} else {
  // Use mock/demo Firebase for development or server-side rendering
  if (!isClientSide) {
    console.log("🔧 Firebase not initialized - server-side rendering");
  } else {
    console.log("🔧 Firebase not configured - using demo mode");
  }
  app = null;
  auth = null;
  db = null;
  storage = null;
}

// Connection state monitoring
export const enableFirebaseNetwork = async () => {
  if (db) {
    try {
      await enableNetwork(db);
      console.log("🌐 Firebase network enabled");
    } catch (error) {
      console.error("❌ Failed to enable Firebase network:", error);
    }
  }
};

export const disableFirebaseNetwork = async () => {
  if (db) {
    try {
      await disableNetwork(db);
      console.log("🔌 Firebase network disabled");
    } catch (error) {
      console.error("❌ Failed to disable Firebase network:", error);
    }
  }
};

// 🚨 FIREBASE AUTH DOMAIN ERROR FIX:
// If you're getting "auth/unauthorized-domain" errors, follow these steps:
// 
// 1. Go to Firebase Console: https://console.firebase.google.com/
// 2. Select your project: flip-flow-4d55c
// 3. Go to Authentication → Settings → Authorized domains
// 4. Add these domains:
//    - resell-dashboard-rkmlvtc8g-michaels-projects-d8c652ad.vercel.app
//    - localhost (for development)
//    - 127.0.0.1 (for development)
//
// 5. Save changes and redeploy your app

export { app, auth, db, storage };
