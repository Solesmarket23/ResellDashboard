import { NextRequest, NextResponse } from 'next/server';
import { trackingService } from '../../../../lib/tracking/trackingService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber') || '123456789012';
    
    console.log(`🧪 Testing integrated tracking service with: ${trackingNumber}`);
    
    // Test the integrated tracking service
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      trackingInfo,
      testDetails: {
        isFedExFormat: /^[0-9]{12,15}$/.test(trackingNumber),
        hasFedExAPI: !!process.env.FEDEX_API_KEY && !!process.env.FEDEX_SECRET_KEY
      }
    });
    
  } catch (error) {
    console.error('❌ Integrated tracking test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
