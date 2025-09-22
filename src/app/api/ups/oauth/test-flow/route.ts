import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthFlowService } from '@/lib/tracking/upsOAuthFlow';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing UPS OAuth flow following UPS specification...');

    // Check environment variables
    const clientId = process.env.UPS_CLIENT_ID;
    const clientSecret = process.env.UPS_CLIENT_SECRET;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_OAUTH_BASE_URL || 'https://wwwcie.ups.com';

    const config = {
      clientId,
      clientSecret: clientSecret || '',
      redirectUri,
      scope,
      baseUrl
    };

    console.log('📋 OAuth Configuration:');
    console.log(`- Client ID: ${clientId ? clientId.substring(0, 8) + '...' : 'NOT SET'}`);
    console.log(`- Client Secret: ${clientSecret ? 'SET' : 'NOT SET'}`);
    console.log(`- Redirect URI: ${redirectUri || 'NOT SET'}`);
    console.log(`- Scope: ${scope}`);
    console.log(`- Base URL: ${baseUrl}`);

    // Validate configuration
    const missingVars = [];
    if (!clientId) missingVars.push('UPS_CLIENT_ID');
    if (!clientSecret) missingVars.push('UPS_CLIENT_SECRET');
    if (!redirectUri) missingVars.push('UPS_OAUTH_REDIRECT_URI');

    if (missingVars.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required environment variables',
        missing: missingVars,
        config: {
          clientId: clientId ? 'SET' : 'NOT SET',
          clientSecret: clientSecret ? 'SET' : 'NOT SET',
          redirectUri: redirectUri ? 'SET' : 'NOT SET',
          scope,
          baseUrl
        }
      }, { status: 400 });
    }

    // Test the complete OAuth flow
    const flowService = UPSOAuthFlowService.getInstance();
    const testResult = await flowService.testOAuthFlow(config);

    console.log('✅ OAuth flow test completed successfully');

    return NextResponse.json({
      success: true,
      message: 'UPS OAuth flow test completed successfully',
      config: {
        clientId: clientId.substring(0, 8) + '...',
        clientSecret: 'SET',
        redirectUri,
        scope,
        baseUrl
      },
      testResults: testResult,
      upsSpecification: {
        step1: {
          description: 'Call UPS OAuth authorize endpoint',
          url: `${baseUrl}/security/v1/oauth/authorize`,
          method: 'GET',
          parameters: ['client_id', 'redirect_uri', 'response_type', 'state', 'scope', 'code_challenge', 'code_challenge_method']
        },
        step2: {
          description: 'Receive 302 redirect to lasso/signin',
          expectedHeaders: ['location', 'appname', 'displayname'],
          redirectUrl: 'https://www.ups.com/lasso/signin'
        },
        step3: {
          description: 'User enters credentials on UPS login screen',
          userAction: 'Manual login required'
        },
        step4: {
          description: 'UPS redirects back with authorization code',
          callbackUrl: redirectUri,
          parameters: ['code', 'scope']
        },
        step5: {
          description: 'Exchange code for access token',
          url: `${baseUrl}/security/v1/oauth/token`,
          method: 'POST',
          auth: 'Basic (client_id:client_secret)',
          body: ['grant_type=authorization_code', 'code', 'redirect_uri', 'code_verifier']
        },
        step6: {
          description: 'Use access token for API calls',
          header: 'Authorization: Bearer {access_token}'
        },
        step7: {
          description: 'Refresh token when needed',
          url: `${baseUrl}/security/v1/oauth/refresh`,
          method: 'POST',
          auth: 'Basic (client_id:client_secret)',
          body: ['grant_type=refresh_token', 'refresh_token']
        }
      },
      endpoints: {
        authorize: `${baseUrl}/security/v1/oauth/authorize`,
        token: `${baseUrl}/security/v1/oauth/token`,
        refresh: `${baseUrl}/security/v1/oauth/refresh`,
        login: 'https://www.ups.com/lasso/signin'
      },
      nextSteps: [
        '1. Ensure your redirect URI is registered in UPS Developer Console',
        '2. Test the OAuth flow at /ups-oauth-demo',
        '3. Check callback handling at /api/ups/oauth/callback',
        '4. Verify token exchange and refresh functionality',
        '5. Test with actual UPS credentials'
      ]
    });

  } catch (error) {
    console.error('❌ UPS OAuth flow test error:', error);
    return NextResponse.json({
      success: false,
      error: 'UPS OAuth flow test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
