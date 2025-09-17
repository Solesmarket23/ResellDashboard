import { auth, db, storage } from "./firebase";
import {
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  deleteField,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Auth functions
export const logoutUser = () => signOut(auth);

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

// Firestore functions
export const addDocument = async (collectionName: string, data: any) => {
  if (!db) {
    console.warn('🔧 Firebase not initialized - cannot add document');
    throw new Error('Firebase not initialized');
  }
  
  try {
    return await addDoc(collection(db, collectionName), data);
  } catch (error) {
    console.error('❌ Error adding document:', error);
    throw error;
  }
};

export const getDocuments = async (collectionName: string): Promise<any[]> => {
  if (!db) {
    console.warn('🔧 Firebase not initialized - returning empty array');
    return [];
  }
  
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    const documents = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Remove any internal 'id' field from the document data to prevent conflicts
      const { id: internalId, ...cleanData } = data;
      
      // Always use Firebase document ID, never the internal id field
      return {
        ...cleanData,
        id: doc.id, // Firebase document ID always takes precedence
      };
    });
    
    console.log(`📄 getDocuments: Loaded ${documents.length} documents from ${collectionName}`);
    return documents;
  } catch (error) {
    console.error(`❌ Error loading documents from ${collectionName}:`, error);
    throw error;
  }
};

export const updateDocument = (collectionName: string, id: string, data: any, merge: boolean = false) => {
  if (merge) {
    // Use set with merge option to only update specified fields
    return setDoc(doc(db, collectionName, id), data, { merge: true });
  }
  return updateDoc(doc(db, collectionName, id), data);
};

export const deleteDocument = async (collectionName: string, id: string) => {
  try {
    // Ensure ID is a string and not empty
    if (!id || typeof id !== 'string') {
      throw new Error(`Invalid document ID: ${id} (type: ${typeof id}). Must be a non-empty string.`);
    }
    
    console.log(`🔥 Deleting document from ${collectionName} with ID: "${id}" (type: ${typeof id})`);
    
    await deleteDoc(doc(db, collectionName, id));
    console.log(`✅ Document deleted successfully from ${collectionName}`);
  } catch (error) {
    console.error(`❌ Error deleting document from ${collectionName}:`, error);
    console.error('Document ID:', id, 'Type:', typeof id);
    console.error('Collection:', collectionName);
    throw error;
  }
};

// Storage functions
export const uploadFile = async (file: File, path: string) => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

// Query functions
export const getDocumentsWhere = async (
  collectionName: string, 
  fieldPath: string, 
  operator: any, 
  value: any
): Promise<any[]> => {
  if (!db) {
    console.warn('🔧 Firebase not initialized - returning empty array');
    return [];
  }
  
  try {
    const q = query(collection(db, collectionName), where(fieldPath, operator, value));
    const querySnapshot = await getDocs(q);
    const documents = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));
    
    console.log(`📄 getDocumentsWhere: Loaded ${documents.length} documents from ${collectionName}`);
    return documents;
  } catch (error) {
    console.error(`❌ Error loading documents with query from ${collectionName}:`, error);
    throw error;
  }
};

// Real-time listener
export const subscribeToCollection = (
  collectionName: string,
  userId: string | null,
  callback: (documents: any[]) => void
): Unsubscribe | null => {
  if (!db || !userId) {
    console.warn('🔧 Firebase not initialized or no user ID - skipping subscription');
    return null;
  }

  try {
    const q = query(collection(db, collectionName), where('userId', '==', userId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const documents = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      }));
      console.log(`📄 Real-time update: ${documents.length} documents from ${collectionName}`);
      callback(documents);
    });

    return unsubscribe;
  } catch (error) {
    console.error(`❌ Error subscribing to ${collectionName}:`, error);
    return null;
  }
};

// Export deleteField for use in other components
export { deleteField };
