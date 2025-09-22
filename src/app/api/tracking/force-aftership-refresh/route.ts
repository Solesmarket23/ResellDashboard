import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    const apiKey = process.env.AFTERSHIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AFTERSHIP_API_KEY not configured'
      }, { status: 500 });
    }
    
    console.log(`🔄 Force refreshing AfterShip data for: ${trackingNumber}`);
    
    // Step 1: Force retrack to get fresh data
    const retrackResponse = await fetch(`https://api.aftership.com/tracking/2025-07/trackings/${trackingNumber}/retrack`, {
      method: 'POST',
      headers: {
        'as-api-key': apiKey,
        'as-api-version': '2025-07',
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`- Retrack Status: ${retrackResponse.status}`);
    
    if (!retrackResponse.ok) {
      const retrackError = await retrackResponse.text();
      console.log(`- Retrack Error: ${retrackError}`);
    } else {
      console.log(`✅ Retrack successful for: ${trackingNumber}`);
    }
    
    // Step 2: Get updated tracking data
    const trackingResponse = await fetch(`https://api.aftership.com/tracking/2025-07/trackings/${trackingNumber}`, {
      headers: {
        'as-api-key': apiKey,
        'as-api-version': '2025-07'
      }
    });
    
    if (!trackingResponse.ok) {
      const errorData = await trackingResponse.json();
      return NextResponse.json({
        success: false,
        error: `Failed to fetch tracking data: ${trackingResponse.status}`,
        details: errorData
      }, { status: trackingResponse.status });
    }
    
    const data = await trackingResponse.json();
    const tracking = data.data.tracking;
    
    // Extract EDD information
    const eddInfo = {
      courier_estimated_delivery_date: tracking.courier_estimated_delivery_date?.estimated_delivery_date,
      estimated_delivery_date: tracking.estimated_delivery_date,
      expected_delivery_date: tracking.expected_delivery_date,
      aftership_estimated_delivery_date: tracking.aftership_estimated_delivery_date?.estimated_delivery_date,
      latest_estimated_delivery: tracking.latest_estimated_delivery?.datetime,
      first_estimated_delivery: tracking.first_estimated_delivery?.datetime,
      order_promised_delivery_date: tracking.order_promised_delivery_date,
      expected_delivery: tracking.expected_delivery
    };
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      carrier: tracking.slug,
      status: tracking.tag,
      eddInfo,
      message: 'AfterShip force refresh completed'
    });
    
  } catch (error) {
    console.error('❌ Error force refreshing AfterShip:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
