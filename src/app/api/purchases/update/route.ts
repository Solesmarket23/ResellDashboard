import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, purchaseId, updates } = body;

    console.log('📝 Update request received:', { userId, purchaseId, updates });

    if (!purchaseId) {
      console.error('❌ Missing purchaseId');
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object') {
      console.error('❌ Invalid updates object');
      return NextResponse.json({ error: 'Updates object is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    // First, check if the purchase exists
    const purchaseDoc = await adminDb.collection('purchases').doc(purchaseId).get();
    
    if (!purchaseDoc.exists) {
      console.error(`❌ Purchase not found: ${purchaseId}`);
      return NextResponse.json({ 
        error: 'Purchase not found',
        details: `Document ${purchaseId} does not exist`
      }, { status: 404 });
    }

    // Verify user owns this purchase (if userId provided)
    if (userId) {
      const purchaseData = purchaseDoc.data();
      if (purchaseData?.userId && purchaseData.userId !== userId) {
        console.error(`❌ User ${userId} does not own purchase ${purchaseId}`);
        return NextResponse.json({ 
          error: 'Unauthorized',
          details: 'You do not own this purchase'
        }, { status: 403 });
      }
    }
    
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
    console.error('❌ Error updating purchase:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: 'Failed to update purchase', 
      details: error.message,
      code: error.code
    }, { status: 500 });
  }
}

