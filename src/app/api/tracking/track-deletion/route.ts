import { NextRequest, NextResponse } from 'next/server';
import { addDocument } from '../../../../lib/firebase/firebaseServerUtils';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber, userId, deletedAt } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`📝 Tracking deletion of: ${trackingNumber}`);
    
    // Record the deletion for potential re-addition detection
    const deletionRecord = {
      trackingNumber,
      userId: userId || 'unknown',
      deletedAt: deletedAt || new Date().toISOString(),
      status: 'deleted'
    };
    
    await addDocument('tracking_deletions', deletionRecord);
    
    console.log(`✅ Deletion recorded for tracking: ${trackingNumber}`);
    
    return NextResponse.json({
      success: true,
      message: 'Deletion tracked successfully'
    });
    
  } catch (error) {
    console.error('❌ Error tracking deletion:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
