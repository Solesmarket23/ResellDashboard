import { NextRequest, NextResponse } from 'next/server';
import { UPSApiService } from '@/lib/tracking/upsApiService';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing UPS API with OAuth access token...');

    // Get OAuth configuration from environment
    const clientId = process.env.UPS_CLIENT_ID;
    const clientSecret = process.env.UPS_CLIENT_SECRET;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_OAUTH_BASE_URL || 'https://wwwcie.ups.com';

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { 
          error: 'UPS OAuth not configured',
          details: 'Missing UPS_CLIENT_ID, UPS_CLIENT_SECRET, or UPS_OAUTH_REDIRECT_URI environment variables'
        },
        { status: 500 }
      );
    }

    const config = {
      clientId,
      clientSecret,
      redirectUri,
      scope,
      baseUrl
    };

    // Test UPS API connection
    const apiService = UPSApiService.getInstance();
    const result = await apiService.testConnection(config);

    console.log('✅ UPS API test completed');

    return NextResponse.json({
      success: result.success,
      message: result.message,
      config: {
        clientId: clientId.substring(0, 8) + '...',
        redirectUri,
        scope,
        baseUrl
      },
      tokenInfo: result.tokenInfo,
      availableMethods: [
        'trackPackage(trackingNumber) - Track UPS packages',
        'getShippingRates(rateRequest) - Get shipping rates',
        'createShippingLabel(shipRequest) - Create shipping labels',
        'testConnection() - Test API connection'
      ],
      usage: {
        description: 'Use the access token to make UPS API calls on behalf of the user',
        example: `
// Get access token
const oauthService = UPSOAuthService.getInstance();
const accessToken = await oauthService.getValidToken(config);

// Make UPS API call
const response = await fetch('https://wwwcie.ups.com/api/v1/track', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${accessToken}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ /* UPS API data */ })
});
        `
      }
    });

  } catch (error) {
    console.error('❌ UPS API test error:', error);
    return NextResponse.json({
      success: false,
      error: 'UPS API test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
