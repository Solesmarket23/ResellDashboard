import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument } from '@/lib/firebase/firebaseServerUtils';

export async function DELETE(request: NextRequest) {
  try {
    const { purchaseId, userId } = await request.json();
    
    if (!purchaseId) {
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    console.log(`🗑️ Deleting purchase ${purchaseId} for user ${userId}`);

    // Delete the purchase document
    await deleteDocument('purchases', purchaseId);

    console.log(`✅ Successfully deleted purchase ${purchaseId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Purchase deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to delete purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
