import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

// Initialize Firebase Admin
try {
  if (!getApps().length) {
    // For Vercel deployment, use environment variables
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase Admin credentials not found. Cron jobs will not work.');
      // Return null instead of throwing to allow the app to run
    } else {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      adminDb = getFirestore(adminApp);
      console.log('✅ Firebase Admin initialized successfully');
    }
  } else {
    adminApp = getApps()[0];
    adminDb = getFirestore(adminApp);
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
  // Don't throw - let the app continue without admin features
}

// Export with null checks
export { adminApp, adminDb };