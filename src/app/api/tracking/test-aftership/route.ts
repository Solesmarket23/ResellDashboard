import { NextRequest, NextResponse } from 'next/server';
import { trackingService } from '../../../../lib/tracking/trackingService';

// Test endpoint for AfterShip API integration
export async function POST(request: NextRequest) {
  try {
    const { trackingNumber } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }

    console.log(`🧪 Testing AfterShip API with tracking number: ${trackingNumber}`);
    
    // Note: trackingService currently supports FedEx/UPS via their native APIs.
    // This endpoint is kept for debugging; it uses the unified tracking service.
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AfterShip API test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// GET endpoint to check AfterShip API configuration
export async function GET() {
  try {
    // This endpoint now reports the status of supported carriers in trackingService.
    // (AfterShip-specific integration is not present in the current codebase.)
    const fedexConfigured = Boolean(process.env.FEDEX_API_KEY && process.env.FEDEX_SECRET_KEY);
    const upsConfigured = Boolean(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET && process.env.UPS_ACCOUNT_NUMBER);
    return NextResponse.json({
      success: true,
      configuration: {
        fedexConfigured,
        upsConfigured,
        supportedCarriers: ['FedEx', 'UPS'],
        lastTested: new Date().toISOString(),
      }
    });
    
  } catch (error) {
    console.error('❌ AfterShip configuration check error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
