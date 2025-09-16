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
