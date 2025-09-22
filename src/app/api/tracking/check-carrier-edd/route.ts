import { NextRequest, NextResponse } from 'next/server';
import { trackingService } from '../../../../lib/tracking/trackingService';

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
    
    console.log(`🔍 Checking Carrier EDD for: ${trackingNumber}`);
    
    // Get tracking info with detailed logging
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber);
    
    // Extract raw AfterShip data for debugging
    const afterShipData = await trackingService.getAfterShipTrackingData(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      carrier: trackingInfo.carrier,
      estimatedDelivery: trackingInfo.estimatedDelivery,
      afterShipData: {
        slug: afterShipData?.slug,
        courier_estimated_delivery_date: afterShipData?.courier_estimated_delivery_date,
        estimated_delivery_date: afterShipData?.estimated_delivery_date,
        expected_delivery_date: afterShipData?.expected_delivery_date,
        aftership_estimated_delivery_date: afterShipData?.aftership_estimated_delivery_date,
        latest_estimated_delivery: afterShipData?.latest_estimated_delivery,
        first_estimated_delivery: afterShipData?.first_estimated_delivery,
        order_promised_delivery_date: afterShipData?.order_promised_delivery_date,
        expected_delivery: afterShipData?.expected_delivery
      },
      message: 'Check the console logs for detailed EDD extraction process'
    });
    
  } catch (error) {
    console.error('❌ Error checking Carrier EDD:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
