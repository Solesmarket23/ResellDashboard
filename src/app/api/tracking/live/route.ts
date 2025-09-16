import { NextRequest, NextResponse } from 'next/server';
import { trackingService, TrackingInfo } from '../../../../lib/tracking/trackingService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber');
    const carrier = searchParams.get('carrier');
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Fetching live tracking data for: ${trackingNumber} (${carrier || 'auto-detect'})`);
    
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber, carrier || undefined);
    
    return NextResponse.json({
      success: true,
      data: trackingInfo
    });
    
  } catch (error) {
    console.error('❌ Error fetching live tracking data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { trackingNumbers } = await request.json();
    
    if (!trackingNumbers || !Array.isArray(trackingNumbers)) {
      return NextResponse.json({ 
        success: false, 
        error: 'trackingNumbers array is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Fetching live tracking data for ${trackingNumbers.length} tracking numbers`);
    
    const trackingInfos = await trackingService.getBulkTrackingInfo(trackingNumbers);
    
    return NextResponse.json({
      success: true,
      data: trackingInfos
    });
    
  } catch (error) {
    console.error('❌ Error fetching bulk live tracking data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
