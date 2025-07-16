import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    console.log('🔍 Checking for duplicate failed verifications for user:', userId);

    // Get all failed verifications for the user
    const failedVerificationsRef = collection(db, 'user_failed_verifications');
    const q = query(failedVerificationsRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    const failures = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`📊 Found ${failures.length} total failures`);

    // Group by order number to find duplicates
    const failuresByOrderNumber = new Map();
    
    failures.forEach(failure => {
      const key = failure.orderNumber;
      if (!failuresByOrderNumber.has(key)) {
        failuresByOrderNumber.set(key, []);
      }
      failuresByOrderNumber.get(key).push(failure);
    });

    // Find and remove duplicates (keep the oldest one)
    let duplicatesRemoved = 0;
    const deletePromises = [];

    for (const [orderNumber, duplicates] of failuresByOrderNumber) {
      if (duplicates.length > 1) {
        console.log(`🔄 Found ${duplicates.length} entries for order ${orderNumber}`);
        
        // Sort by creation date (keep oldest)
        duplicates.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.emailDate || 0);
          const dateB = new Date(b.createdAt || b.emailDate || 0);
          return dateA.getTime() - dateB.getTime();
        });

        // Delete all but the first (oldest) entry
        for (let i = 1; i < duplicates.length; i++) {
          console.log(`🗑️ Deleting duplicate: ${duplicates[i].id}`);
          deletePromises.push(deleteDoc(doc(db, 'user_failed_verifications', duplicates[i].id)));
          duplicatesRemoved++;
        }
      }
    }

    // Execute all deletions
    await Promise.all(deletePromises);

    console.log(`✅ Removed ${duplicatesRemoved} duplicate entries`);

    return NextResponse.json({
      success: true,
      totalFailures: failures.length,
      duplicatesRemoved,
      uniqueFailures: failuresByOrderNumber.size
    });

  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to remove duplicates' },
      { status: 500 }
    );
  }
}