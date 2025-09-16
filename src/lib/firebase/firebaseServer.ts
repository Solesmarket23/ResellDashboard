import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Server-side Firebase Admin initialization
let app, db;

// Check if we have valid Firebase config
const hasValidConfig = process.env.FIREBASE_PROJECT_ID && 
                      process.env.FIREBASE_CLIENT_EMAIL &&
                      process.env.FIREBASE_PRIVATE_KEY;

if (hasValidConfig) {
  try {
    // Initialize Firebase Admin SDK
    app = getApps().length ? getApp() : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    db = getFirestore(app);
    console.log("✅ Firebase Admin server initialized successfully");
  } catch (error) {
    console.error("❌ Firebase Admin server initialization failed:", error);
    app = null;
    db = null;
  }
} else {
  console.log("🔧 Firebase Admin not configured - using demo mode");
  app = null;
  db = null;
}

export { app, db };
