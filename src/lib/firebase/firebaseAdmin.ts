import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin for server-side operations
const initializeFirebaseAdmin = () => {
  try {
    // Check if already initialized
    if (getApps().length > 0) {
      return getFirestore();
    }

    // Initialize with service account
    const serviceAccount = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };

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