import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, updateDoc, doc, where, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { VerificationStatus } from '@/types/failed-verification';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    console.log('🔄 Starting migration for user:', userId);
    
    const verificationsRef = collection(db, 'user_failed_verifications');
    const q = query(verificationsRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    const batch = [];
    let migratedCount = 0;
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      // Only migrate if missing new fields
      if (!data.statusHistory) {
        const updateData = {
          status: 'needs_review' as VerificationStatus,
          statusHistory: [{
            status: 'needs_review' as VerificationStatus,
            timestamp: data.createdAt || new Date().toISOString(),
            note: 'Initial status'
          }],
          lastStatusUpdate: data.createdAt || new Date().toISOString()
        };
        
        batch.push(updateDoc(doc(db, 'user_failed_verifications', docSnap.id), updateData));
        migratedCount++;
      }
    }
    
    // Execute all updates
    await Promise.all(batch);
    
    console.log(`✅ Migrated ${migratedCount} documents out of ${snapshot.docs.length} total`);
    
    return NextResponse.json({
      success: true,
      totalDocuments: snapshot.docs.length,
      migratedDocuments: migratedCount
    });
    
  } catch (error) {
    console.error('❌ Error migrating failed verifications:', error);
    return NextResponse.json(
      { error: 'Failed to migrate verifications' },
      { status: 500 }
    );
  }
}