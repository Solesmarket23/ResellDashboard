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
export const addDocument = (collectionName: string, data: any) =>
  addDoc(collection(db, collectionName), data);

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

export const updateDocument = (collectionName: string, id: string, data: any) =>
  updateDoc(doc(db, collectionName, id), data);

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
