import { NextRequest, NextResponse } from 'next/server';
import { UPSTrackingAPI } from '@/lib/tracking/upsApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber') || '1Z999AA1234567890';
    
    console.log(`🧪 Testing UPS tracking for: ${trackingNumber}`);
    
    const upsAPI = new UPSTrackingAPI();
    const result = await upsAPI.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      result,
      message: 'UPS tracking test completed'
    });
  } catch (error) {
    console.error('❌ UPS tracking test failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        message: 'UPS tracking test failed'
      },
      { status: 500 }
    );
  }
}
