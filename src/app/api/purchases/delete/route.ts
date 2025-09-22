import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument, getDocument } from '@/lib/firebase/firebaseServerUtils';

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
    console.log(`📊 Purchase ID type: ${typeof purchaseId}, length: ${purchaseId?.length}`);

    // Get the purchase data before deleting to extract tracking number
    const purchaseData = await getDocument('purchases', purchaseId);
    console.log(`📄 Purchase data found:`, purchaseData ? 'Yes' : 'No');
    const trackingNumber = purchaseData?.tracking;

    // Delete the purchase document
    await deleteDocument('purchases', purchaseId);

    // Track the deletion if there was a tracking number
    if (trackingNumber) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tracking/track-deletion`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackingNumber,
            userId,
            deletedAt: new Date().toISOString()
          })
        });
        console.log(`📝 Deletion tracked for tracking number: ${trackingNumber}`);
      } catch (trackingError) {
        console.error('⚠️ Failed to track deletion (non-critical):', trackingError);
      }
    }

    console.log(`✅ Successfully deleted purchase ${purchaseId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Purchase deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting purchase:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to delete purchase';
    if (error instanceof Error) {
      if (error.message.includes('Invalid document ID')) {
        errorMessage = 'Invalid purchase ID format';
      } else if (error.message.includes('not found')) {
        errorMessage = 'Purchase not found';
      } else if (error.message.includes('Firebase not initialized')) {
        errorMessage = 'Database connection error';
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
