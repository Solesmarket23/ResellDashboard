import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber') || '1ZR1H0140329378751';
    
    console.log(`🧪 Testing UPS tracking for: ${trackingNumber}`);
    
    // For now, return a mock response to test the system
    const mockResponse = {
      trackingNumber,
      carrier: 'UPS',
      status: 'in_transit',
      lastUpdate: new Date().toISOString(),
      updates: [
        {
          timestamp: new Date().toISOString(),
          location: 'Louisville, KY',
          status: 'In Transit',
          description: 'Package is in transit'
        }
      ],
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      result: mockResponse,
      message: 'UPS tracking test completed (mock data)'
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
