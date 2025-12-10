import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const { purchaseId, updates } = await request.json();

    if (!purchaseId) {
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Updates object is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    // Update the purchase document
    await adminDb.collection('purchases').doc(purchaseId).update({
      ...updates,
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ Updated purchase ${purchaseId}:`, updates);

    return NextResponse.json({ 
      success: true,
      purchaseId,
      updates
    });
  } catch (error: any) {
    console.error('Error updating purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to update purchase', 
      details: error.message 
    }, { status: 500 });
  }
}

