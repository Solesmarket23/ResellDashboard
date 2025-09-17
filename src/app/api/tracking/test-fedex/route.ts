import { NextRequest, NextResponse } from 'next/server';
import { FedExTrackingAPI } from '../../../../lib/tracking/fedexApi';

// Test endpoint for FedEx API integration
export async function POST(request: NextRequest) {
  try {
    const { trackingNumber } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }

    console.log(`🧪 Testing FedEx API with tracking number: ${trackingNumber}`);
    
    const fedexApi = new FedExTrackingAPI();
    const trackingInfo = await fedexApi.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ FedEx API test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// GET endpoint to check FedEx API configuration
export async function GET() {
  try {
    const fedexApi = new FedExTrackingAPI();
    
    // Check if we can detect a sample tracking number
    const sampleTrackingNumber = '123456789012';
    const canDetect = fedexApi.detectTrackingNumber(sampleTrackingNumber);
    
    return NextResponse.json({
      success: true,
      configuration: {
        canDetectTrackingNumber: canDetect,
        environmentVariables: {
          FEDEX_API_KEY: !!process.env.FEDEX_API_KEY,
          FEDEX_SECRET_KEY: !!process.env.FEDEX_SECRET_KEY,
          FEDEX_BASE_URL: process.env.FEDEX_BASE_URL || 'https://apis.fedex.com'
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ FedEx configuration check error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
