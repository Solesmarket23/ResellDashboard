import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin for server-side operations
const initializeFirebaseAdmin = () => {
  try {
    // Check if already initialized
    if (getApps().length > 0) {
      return getFirestore();
    }

    // Initialize with service account (prefer server vars, fall back to NEXT_PUBLIC for projectId)
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
    const privateKey = rawPrivateKey?.includes('\n') ? rawPrivateKey : rawPrivateKey?.replace(/\\n/g, '\n');

    if (!projectId) {
      throw new Error('Missing FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)');
    }
    if (!clientEmail) {
      throw new Error('Missing FIREBASE_CLIENT_EMAIL');
    }
    if (!privateKey) {
      throw new Error('Missing FIREBASE_PRIVATE_KEY');
    }

    const serviceAccount = {
      projectId,
      clientEmail,
      privateKey
    } as { projectId: string; clientEmail: string; privateKey: string };

    initializeApp({
      credential: cert(serviceAccount)
    });

    console.log('✅ Firebase Admin initialized successfully');
    return getFirestore();
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error);
    throw error;
  }
};

// Get Firestore instance with lazy initialization
let adminDb: ReturnType<typeof getFirestore>;
export const getAdminDb = () => {
  if (!adminDb) {
    adminDb = initializeFirebaseAdmin();
  }
  return adminDb;
};

export const addAdminDocument = async (collection: string, data: any) => {
  const db = getAdminDb();
  const docRef = await db.collection(collection).add(data);
  return docRef.id;
};

export const updateAdminDocument = async (collection: string, id: string, data: any) => {
  const db = getAdminDb();
  await db.collection(collection).doc(id).update(data);
};

export const getAdminDocuments = async (collection: string) => {
  const db = getAdminDb();
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id
  }));
};