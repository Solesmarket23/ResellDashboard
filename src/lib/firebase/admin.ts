import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Server-side Firebase Admin configuration for API routes
let adminApp;
let adminDb;

try {
  // Check if we already have an admin app initialized
  const existingApps = getApps();
  adminApp = existingApps.length > 0 ? existingApps[0] : null;

  if (!adminApp) {
    // Initialize Firebase Admin with service account (for API routes)
    const serviceAccount: ServiceAccount = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };

    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  adminDb = getFirestore(adminApp);
  console.log('✅ Firebase Admin initialized for server-side operations');
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error);
  console.log('🔧 Falling back to client-side Firebase (may not work in API routes)');
  
  // Fallback: try to import client-side firebase for development
  try {
    const { db } = require('./firebase');
    adminDb = db;
  } catch (fallbackError) {
    console.error('❌ Client-side Firebase fallback also failed:', fallbackError);
    adminDb = null;
  }
}

export { adminApp, adminDb };
