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
  getDoc,
  limit,
  orderBy,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, uploadString } from "firebase/storage";

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

const snapshotToDocs = (querySnapshot: any): any[] => {
  return querySnapshot.docs.map((docSnap: any) => {
    const data = docSnap.data();
    // Remove any internal 'id' field from the document data to prevent conflicts
    const { id: internalId, ...cleanData } = data || {};

    // Always use Firebase document ID, never the internal id field
    return {
      ...cleanData,
      id: docSnap.id,
    };
  });
};

/**
 * Read all documents in a collection.
 *
 * IMPORTANT: If you pass `userId`, the query will be scoped to `where('userId', '==', userId)`
 * to avoid accidentally reading the entire collection (which can be very expensive on Blaze).
 */
export const getDocuments = async (collectionName: string, userId?: string): Promise<any[]> => {
  if (!db) {
    console.warn('🔧 Firebase not initialized - returning empty array');
    return [];
  }
  
  try {
    const q = userId
      ? query(collection(db, collectionName), where('userId', '==', userId))
      : collection(db, collectionName);

    const querySnapshot = await getDocs(q as any);
    const documents = snapshotToDocs(querySnapshot);
    
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
    const documents = snapshotToDocs(querySnapshot);
    
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

// ===== EMAIL PARSING FUNCTIONS =====

// Save raw email to Firebase Storage
export const saveRawEmailToStorage = async (input: {
  messageId: string;
  threadId?: string;
  rawHtml: string;
  plainText?: string;
  rawHeaders?: Record<string, string>;
  receivedAt: string;
}): Promise<string> => {
  if (!storage) {
    throw new Error('Firebase Storage not initialized');
  }

  try {
    const { messageId, threadId, rawHtml, plainText, rawHeaders, receivedAt } = input;
    
    // Create folder structure: emails/{messageId}/
    const htmlPath = `emails/${messageId}/email.html`;
    const headersPath = `emails/${messageId}/headers.json`;
    const textPath = `emails/${messageId}/text.txt`;
    
    // Upload HTML
    const htmlRef = ref(storage, htmlPath);
    await uploadString(htmlRef, rawHtml, 'raw');
    
    // Upload headers if provided
    if (rawHeaders) {
      const headersRef = ref(storage, headersPath);
      await uploadString(headersRef, JSON.stringify(rawHeaders, null, 2), 'raw');
    }
    
    // Upload plain text if provided
    if (plainText) {
      const textRef = ref(storage, textPath);
      await uploadString(textRef, plainText, 'raw');
    }
    
    console.log(`📧 Saved raw email to storage: ${messageId}`);
    return htmlPath;
    
  } catch (error) {
    console.error('❌ Error saving raw email to storage:', error);
    throw error;
  }
};

// Order management functions
export const findOrderByOrderId = async (orderId: string): Promise<any | null> => {
  if (!db) {
    console.warn('🔧 Firebase not initialized - returning null');
    return null;
  }
  
  try {
    const q = query(
      collection(db, 'orders'),
      where('order_id', '==', orderId),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
    
  } catch (error) {
    console.error('❌ Error finding order by order_id:', error);
    throw error;
  }
};

export const findOrderByTracking = async (trackingNumbers: string[]): Promise<any | null> => {
  if (!db || trackingNumbers.length === 0) {
    return null;
  }
  
  try {
    // Note: This is a simplified query. For production, you might want to use
    // a more sophisticated approach for array queries
    const q = query(
      collection(db, 'orders'),
      where('tracking', 'array-contains-any', trackingNumbers),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
    
  } catch (error) {
    console.error('❌ Error finding order by tracking:', error);
    throw error;
  }
};

export const findOrderByThreadId = async (threadId: string): Promise<any | null> => {
  if (!db) {
    return null;
  }
  
  try {
    const q = query(
      collection(db, 'orders'),
      where('source.threadId', '==', threadId),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
    
  } catch (error) {
    console.error('❌ Error finding order by thread_id:', error);
    throw error;
  }
};

export const createOrder = async (orderData: any): Promise<any> => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  
  try {
    const docRef = await addDoc(collection(db, 'orders'), {
      ...orderData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    console.log(`📦 Created order: ${docRef.id}`);
    return { id: docRef.id, ...orderData };
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    throw error;
  }
};

export const updateOrder = async (orderId: string, updates: any): Promise<void> => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    
    console.log(`📦 Updated order: ${orderId}`);
    
  } catch (error) {
    console.error('❌ Error updating order:', error);
    throw error;
  }
};

export const appendTimelineEntry = async (
  orderId: string,
  entry: { status: string; messageId: string; at: string; [key: string]: any }
): Promise<void> => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status_timeline: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    });
    
    console.log(`📦 Appended timeline entry to order: ${orderId}`);
    
  } catch (error) {
    console.error('❌ Error appending timeline entry:', error);
    throw error;
  }
};

export const setOrderStatus = async (
  orderId: string,
  status: string,
  additionalData?: { tracking?: any[]; updatedAt?: string; [key: string]: any }
): Promise<void> => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  
  try {
    const updateData: any = {
      status,
      updatedAt: serverTimestamp(),
      ...additionalData,
    };
    
    await updateDoc(doc(db, 'orders', orderId), updateData);
    
    console.log(`📦 Set order ${orderId} status to ${status}`);
    
  } catch (error) {
    console.error('❌ Error setting order status:', error);
    throw error;
  }
};

// Email event storage
export const saveEmailEvent = async (eventData: any): Promise<string> => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  
  try {
    const docRef = await addDoc(collection(db, 'email_events'), {
      ...eventData,
      processedAt: serverTimestamp(),
    });
    
    console.log(`📧 Saved email event: ${docRef.id}`);
    return docRef.id;
    
  } catch (error) {
    console.error('❌ Error saving email event:', error);
    throw error;
  }
};

// Get orders by status
export const getOrdersByStatus = async (status: string): Promise<any[]> => {
  if (!db) {
    return [];
  }
  
  try {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', status),
      orderBy('updatedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
  } catch (error) {
    console.error('❌ Error getting orders by status:', error);
    throw error;
  }
};

// Get orders needing review
export const getOrdersNeedingReview = async (): Promise<any[]> => {
  if (!db) {
    return [];
  }
  
  try {
    const q = query(
      collection(db, 'orders'),
      where('needs_review', '==', true),
      orderBy('updatedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
  } catch (error) {
    console.error('❌ Error getting orders needing review:', error);
    throw error;
  }
};

// Get order status history
export const getOrderStatusHistory = async (orderId: string): Promise<any[]> => {
  if (!db) {
    return [];
  }
  
  try {
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    
    if (!orderDoc.exists()) {
      return [];
    }
    
    const data = orderDoc.data();
    return data.status_timeline || [];
    
  } catch (error) {
    console.error('❌ Error getting order status history:', error);
    throw error;
  }
};
