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
    
    console.log(`🔍 Testing FedEx OAuth flow with sandbox`);
    
    // Step 1: Get OAuth access token (following official FedEx documentation)
    const authUrl = 'https://apis-sandbox.fedex.com/oauth/token';
    
    console.log(`- Auth URL: ${authUrl}`);
    console.log(`- API Key: ${apiKey.substring(0, 8)}...`);
    console.log(`- Secret Key: ${secretKey.substring(0, 8)}...`);
    console.log(`- Using form-encoded body parameters (not Basic Auth)`);
    
    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    });
    
    console.log(`- Auth Response Status: ${authResponse.status}`);
    console.log(`- Auth Response Headers:`, Object.fromEntries(authResponse.headers.entries()));
    
    const authText = await authResponse.text();
    console.log(`- Auth Response Body: ${authText}`);
    
    if (!authResponse.ok) {
      return NextResponse.json({
        success: false,
        error: 'OAuth authentication failed',
        details: {
          status: authResponse.status,
          headers: Object.fromEntries(authResponse.headers.entries()),
          body: authText
        }
      });
    }
    
    const authData = JSON.parse(authText);
    console.log(`✅ OAuth successful! Token: ${authData.access_token?.substring(0, 20)}...`);
    
    // Step 2: Test Basic Integrated Visibility API
    const trackingUrl = 'https://apis-sandbox.fedex.com/track/v1/trackingnumbers';
    
    const trackingResponse = await fetch(trackingUrl, {
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
    
    console.log(`- Tracking Response Status: ${trackingResponse.status}`);
    const trackingText = await trackingResponse.text();
    console.log(`- Tracking Response Body: ${trackingText}`);
    
    return NextResponse.json({
      success: true,
      oauth: {
        status: authResponse.status,
        tokenType: authData.token_type,
        expiresIn: authData.expires_in,
        tokenLength: authData.access_token?.length || 0
      },
      tracking: {
        status: trackingResponse.status,
        data: trackingText ? JSON.parse(trackingText) : null
      },
      message: 'FedEx OAuth flow completed successfully'
    });
    
  } catch (error) {
    console.error('❌ FedEx OAuth test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
