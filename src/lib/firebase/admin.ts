// Firebase Admin SDK for server-side operations
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp;
let adminDb;

// Initialize Firebase Admin SDK
if (!adminApp && process.env.FIREBASE_PROJECT_ID) {
  try {
    adminApp = getApps().length ? getApps()[0] : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    
    adminDb = getFirestore(adminApp);
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error);
  }
}

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

export { adminApp, adminDb };