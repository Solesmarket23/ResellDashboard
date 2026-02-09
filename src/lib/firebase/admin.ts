// Firebase Admin SDK for server-side operations
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

let adminApp;
let adminDb;
let adminAuth: Auth | null = null;
let adminMessaging: Messaging | null = null;

// Lazy initialization function - only runs when actually needed
function initializeAdmin() {
  if (adminDb) {
    return adminDb; // Already initialized
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('⚠️ Firebase Admin SDK cannot initialize - missing credentials');
    console.error(`  - projectId: ${projectId ? '✓' : '✗'}`);
    console.error(`  - clientEmail: ${clientEmail ? '✓' : '✗'}`);
    console.error(`  - privateKey: ${privateKey ? '✓' : '✗'}`);
    return null;
  }

  try {
    adminApp = getApps().length ? getApps()[0] : initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
    
    adminDb = getFirestore(adminApp);
    adminAuth = getAuth(adminApp);
    adminMessaging = getMessaging(adminApp);
    console.log('✅ Firebase Admin SDK initialized successfully');
    return adminDb;
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error);
    return null;
  }
}

// Export getAdminDb function for lazy initialization
export const getAdminDb = () => {
  return initializeAdmin();
};

export const getAdminAuth = (): Auth | null => {
  if (adminAuth) return adminAuth;
  initializeAdmin();
  return adminAuth;
};

export const getAdminMessaging = (): Messaging | null => {
  if (adminMessaging) return adminMessaging;
  initializeAdmin();
  return adminMessaging;
};

// Export adminApp and adminDb (adminDb will be null until getAdminDb() is called)
export { adminApp, adminDb };

// Server-side Firestore functions
export const addDocumentAdmin = async (collectionName: string, data: any) => {
  if (!adminDb) {
    throw new Error('Firebase Admin not initialized');
  }
  
  try {
    const docRef = await adminDb.collection(collectionName).add(data);
    return { id: docRef.id };
  } catch (error) {
    console.error('❌ Error adding document with Admin SDK:', error);
    throw error;
  }
};

export const getDocumentsAdmin = async (collectionName: string): Promise<any[]> => {
  if (!adminDb) {
    console.warn('🔧 Firebase Admin not initialized - returning empty array');
    return [];
  }
  
  try {
    const snapshot = await adminDb.collection(collectionName).get();
    const documents = snapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data };
    });
    return documents;
  } catch (error) {
    console.error('❌ Error getting documents with Admin SDK:', error);
    return [];
  }
};

export const updateDocumentAdmin = async (collectionName: string, docId: string, data: any) => {
  if (!adminDb) {
    throw new Error('Firebase Admin not initialized');
  }
  
  try {
    await adminDb.collection(collectionName).doc(docId).update(data);
  } catch (error) {
    console.error('❌ Error updating document with Admin SDK:', error);
    throw error;
  }
};