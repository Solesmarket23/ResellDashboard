import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.FEDEX_API_KEY;
    const secretKey = process.env.FEDEX_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({
        success: false,
        error: 'FedEx credentials not configured'
      });
    }
    
    console.log(`🔍 Testing FedEx API with official format`);
    
    // Step 1: Get OAuth token (using official FedEx format)
    const authResponse = await fetch('https://apis-sandbox.fedex.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    });
    
    if (!authResponse.ok) {
      const authError = await authResponse.text();
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        authStatus: authResponse.status,
        authError: authError
      });
    }
    
    const authData = await authResponse.json();
    console.log(`✅ Auth successful, token: ${authData.access_token?.substring(0, 20)}...`);
    
    // Step 2: Test tracking API
    const trackingResponse = await fetch('https://apis-sandbox.fedex.com/track/v1/trackingnumbers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
        'x-locale': 'en_US'
      },
      body: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: [
          {
            trackingNumberInfo: [
              {
                trackingNumber: '123456789012'
              }
            ]
          }
        ]
      })
    });
    
    const trackingData = await trackingResponse.json();
    
    return NextResponse.json({
      success: true,
      auth: {
        status: authResponse.status,
        tokenLength: authData.access_token?.length || 0
      },
      tracking: {
        status: trackingResponse.status,
        data: trackingData
      },
      note: 'This should show virtualized response from FedEx sandbox'
    });
    
  } catch (error) {
    console.error('❌ FedEx test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
