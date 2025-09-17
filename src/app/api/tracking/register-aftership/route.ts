import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber, carrier } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
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

    console.log(`📦 Registering tracking with AfterShip: ${trackingNumber}`);

    // Register tracking with AfterShip using the correct API version
    const response = await fetch('https://api.aftership.com/v4/trackings', {
      method: 'POST',
      headers: {
        'as-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tracking_number: trackingNumber,
        slug: carrier?.toLowerCase() || 'fedex'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Tracking number registered with AfterShip',
        data: data.data
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `AfterShip registration failed: ${data.meta?.message || 'Unknown error'}`,
        details: data
      }, { status: response.status });
    }

  } catch (error) {
    console.error('❌ Error registering tracking with AfterShip:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
