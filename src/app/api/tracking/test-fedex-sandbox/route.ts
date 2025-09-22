import { NextRequest, NextResponse } from 'next/server';
import { FedExTrackingAPI } from '../../../../lib/tracking/fedexApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber') || '123456789012';
    
    console.log(`🧪 Testing FedEx Sandbox with tracking: ${trackingNumber}`);
    
    // Check if credentials are configured
    const apiKey = process.env.FEDEX_API_KEY;
    const secretKey = process.env.FEDEX_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({
        success: false,
        error: 'FedEx credentials not configured'
      }, { status: 500 });
    }
    
    // Test the FedEx API with sandbox
    const fedexApi = new FedExTrackingAPI();
    const trackingInfo = await fedexApi.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      fedexData: trackingInfo,
      credentials: {
        hasApiKey: !!apiKey,
        hasSecretKey: !!secretKey,
        apiKeyLength: apiKey?.length || 0,
        secretKeyLength: secretKey?.length || 0
      },
      note: 'FedEx sandbox uses virtualized responses - this is expected behavior'
    });
    
  } catch (error) {
    console.error('❌ FedEx sandbox test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        hasApiKey: !!process.env.FEDEX_API_KEY,
        hasSecretKey: !!process.env.FEDEX_SECRET_KEY
      }
    }, { status: 500 });
  }
}
