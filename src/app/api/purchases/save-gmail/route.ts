import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const { userId, purchases } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!purchases || !Array.isArray(purchases)) {
      return NextResponse.json({ error: 'Purchases array is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    console.log(`📧 Saving ${purchases.length} Gmail purchases for user ${userId} via API...`);
    
    // Get existing Gmail purchases for this user
    const existingSnapshot = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .where('type', '==', 'gmail')
      .get();
    
    const existingPurchases = existingSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📄 Found ${existingPurchases.length} existing Gmail purchases`);
    
    // Delete old Gmail purchases
    for (const oldPurchase of existingPurchases) {
      await adminDb.collection('purchases').doc(oldPurchase.id).delete();
    }
    
    console.log(`🗑️ Deleted ${existingPurchases.length} old Gmail purchases`);
    
    // Add new purchases
    let savedCount = 0;
    for (const purchase of purchases) {
      // Remove the 'id' field if it exists (it might be set to orderNumber by frontend)
      // Firebase will auto-generate a new document ID
      const purchaseData = { ...purchase };
      delete purchaseData.id; // Remove id field to let Firebase auto-generate it
      
      await adminDb.collection('purchases').add({
        ...purchaseData,
        userId,
        type: 'gmail',
        createdAt: new Date().toISOString(),
        syncedAt: new Date().toISOString()
      });
      savedCount++;
    }
    
    console.log(`✅ Saved ${savedCount} new Gmail purchases`);

    return NextResponse.json({ 
      success: true,
      saved: savedCount,
      deleted: existingPurchases.length
    });
  } catch (error: any) {
    console.error('Error saving Gmail purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to save Gmail purchases', 
      details: error.message 
    }, { status: 500 });
  }
}

