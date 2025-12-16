import { db } from "./firebaseServer";

// Server-side Firebase utilities
export const getDocumentsServer = async (collectionName: string, options?: {
  where?: Array<{ field: string; operator: any; value: any }>;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
}) => {
  if (!db) {
    console.log("🔧 Firebase not initialized - returning empty array");
    return [];
  }

  try {
    let collectionRef = db.collection(collectionName);

    // Apply where clauses
    if (options?.where) {
      for (const whereClause of options.where) {
        collectionRef = collectionRef.where(whereClause.field, whereClause.operator, whereClause.value);
      }
    }

    // Apply orderBy
    if (options?.orderBy) {
      collectionRef = collectionRef.orderBy(options.orderBy.field, options.orderBy.direction);
    }

    const snapshot = await collectionRef.get();
    const documents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✅ Server: Found ${documents.length} documents in ${collectionName}`);
    return documents;
  } catch (error) {
    console.error(`❌ Server: Error loading documents from ${collectionName}:`, error);
    return [];
  }
};

export const addDocument = async (collectionName: string, data: any) => {
  if (!db) {
    throw new Error("Firebase not initialized");
  }
  try {
    console.log(`➕ Server: Adding document to ${collectionName}`);
    const ref = await db.collection(collectionName).add(data);
    return ref;
  } catch (error) {
    console.error(`❌ Server: Error adding document to ${collectionName}:`, error);
    throw error;
  }
};

// Backwards-compatible alias used by some older routes
export const addDocumentAdmin = addDocument;

export const updateDocument = async (collectionName: string, id: string, data: any) => {
  if (!db) {
    throw new Error("Firebase not initialized");
  }

  try {
    // Ensure ID is a string and not empty
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid document ID');
    }

    console.log(`📝 Server: Updating document ${id} in ${collectionName}`);
    
    const docRef = db.collection(collectionName).doc(id);
    await docRef.update(data);
    
    console.log(`✅ Server: Successfully updated document ${id} in ${collectionName}`);
  } catch (error) {
    console.error(`❌ Server: Error updating document ${id} in ${collectionName}:`, error);
    throw error;
  }
};

export const getDocument = async (collectionName: string, id: string) => {
  if (!db) {
    throw new Error("Firebase not initialized");
  }

  try {
    // Ensure ID is a string and not empty
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid document ID');
    }

    console.log(`📄 Server: Getting document ${id} from ${collectionName}`);
    
    const docRef = db.collection(collectionName).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      console.log(`⚠️ Server: Document ${id} not found in ${collectionName}`);
      return null;
    }
    
    console.log(`✅ Server: Successfully retrieved document ${id} from ${collectionName}`);
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error(`❌ Server: Error getting document ${id} from ${collectionName}:`, error);
    throw error;
  }
};

export const deleteDocument = async (collectionName: string, id: string) => {
  if (!db) {
    throw new Error("Firebase not initialized");
  }

  try {
    // Ensure ID is a string and not empty
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid document ID');
    }

    console.log(`🗑️ Server: Deleting document ${id} from ${collectionName}`);
    
    const docRef = db.collection(collectionName).doc(id);
    await docRef.delete();
    
    console.log(`✅ Server: Successfully deleted document ${id} from ${collectionName}`);
  } catch (error) {
    console.error(`❌ Server: Error deleting document ${id} from ${collectionName}:`, error);
    throw error;
  }
};
