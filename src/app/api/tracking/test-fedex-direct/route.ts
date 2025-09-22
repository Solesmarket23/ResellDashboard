import { NextRequest, NextResponse } from 'next/server';
import { FedExTrackingAPI } from '../../../../lib/tracking/fedexApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber') || '393296943542';
    
    console.log(`🧪 Testing FedEx API with tracking: ${trackingNumber}`);
    
    // Check if credentials are configured
    const apiKey = process.env.FEDEX_API_KEY;
    const secretKey = process.env.FEDEX_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({
        success: false,
        error: 'FedEx credentials not configured',
        details: {
          hasApiKey: !!apiKey,
          hasSecretKey: !!secretKey
        }
      }, { status: 500 });
    }
    
    // Test the FedEx API
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
      }
    });
    
  } catch (error) {
    console.error('❌ FedEx API test error:', error);
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
