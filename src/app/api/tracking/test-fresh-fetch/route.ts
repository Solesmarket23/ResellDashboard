import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsAdmin } from '../../../../lib/firebase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber');
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`🧪 Testing fresh fetch for: ${trackingNumber}`);
    
    // Check deletion records
    const deletionRecords = await getDocumentsAdmin('tracking_deletions');
    const deletionRecord = deletionRecords.find(d => d.trackingNumber === trackingNumber);
    
    const wasRecentlyDeleted = deletionRecord && 
      deletionRecord.status === 'deleted' &&
      new Date(deletionRecord.deletedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      deletionRecord,
      wasRecentlyDeleted,
      wouldTriggerFreshFetch: wasRecentlyDeleted,
      message: wasRecentlyDeleted 
        ? 'This tracking number was recently deleted and would trigger a fresh fetch'
        : 'This tracking number was not recently deleted'
    });
    
  } catch (error) {
    console.error('❌ Error testing fresh fetch:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
