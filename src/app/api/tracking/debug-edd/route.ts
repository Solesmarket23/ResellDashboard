import { NextRequest, NextResponse } from 'next/server';

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
    
    console.log(`🔍 Debugging EDD for: ${trackingNumber}`);
    
    // Get the raw AfterShip data
    const apiKey = process.env.AFTERSHIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AFTERSHIP_API_KEY not configured'
      }, { status: 500 });
    }
    
    const response = await fetch(`https://api.aftership.com/tracking/2025-07/trackings/${trackingNumber}`, {
      headers: {
        'as-api-key': apiKey,
        'as-api-version': '2025-07'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({
        success: false,
        error: `AfterShip API error: ${response.status}`,
        details: errorData
      }, { status: response.status });
    }
    
    const data = await response.json();
    const tracking = data.data.tracking;
    
    // Extract all possible EDD fields
    const eddData = {
      courier_estimated_delivery_date: tracking.courier_estimated_delivery_date,
      estimated_delivery_date: tracking.estimated_delivery_date,
      expected_delivery_date: tracking.expected_delivery_date,
      aftership_estimated_delivery_date: tracking.aftership_estimated_delivery_date,
      latest_estimated_delivery: tracking.latest_estimated_delivery,
      first_estimated_delivery: tracking.first_estimated_delivery,
      order_promised_delivery_date: tracking.order_promised_delivery_date,
      expected_delivery: tracking.expected_delivery,
      // Check checkpoints for delivery estimates
      checkpoints: tracking.checkpoints?.map((cp: any) => ({
        message: cp.message,
        location: cp.location,
        timestamp: cp.timestamp,
        status: cp.status,
        status_details: cp.status_details
      })) || []
    };
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      carrier: tracking.slug,
      status: tracking.tag,
      eddData,
      rawTracking: tracking
    });
    
  } catch (error) {
    console.error('❌ Error debugging EDD:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
