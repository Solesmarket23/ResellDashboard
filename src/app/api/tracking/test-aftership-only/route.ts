import { NextRequest, NextResponse } from 'next/server';
import { trackingService } from '../../../../lib/tracking/trackingService';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Testing AfterShip-only tracking for: ${trackingNumber}`);
    
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      data: trackingInfo
    });
    
  } catch (error) {
    console.error('❌ Error testing AfterShip tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Test with the FedEx tracking number
    const trackingNumber = '884393693931';
    console.log(`🔍 Testing AfterShip-only tracking for: ${trackingNumber}`);
    
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      data: trackingInfo,
      message: 'AfterShip-only tracking test completed'
    });
    
  } catch (error) {
    console.error('❌ Error testing AfterShip tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
