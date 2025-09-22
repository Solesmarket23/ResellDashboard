import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthService } from '@/lib/tracking/upsOAuth';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing UPS OAuth configuration...');

    // Check environment variables
    const clientId = process.env.UPS_OAUTH_CLIENT_ID;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_OAUTH_BASE_URL || 'https://wwwcie.ups.com';

    const config = {
      clientId,
      redirectUri,
      scope,
      baseUrl
    };

    console.log('📋 OAuth Configuration:');
    console.log(`- Client ID: ${clientId ? clientId.substring(0, 8) + '...' : 'NOT SET'}`);
    console.log(`- Redirect URI: ${redirectUri || 'NOT SET'}`);
    console.log(`- Scope: ${scope}`);
    console.log(`- Base URL: ${baseUrl}`);

    // Validate configuration
    const missingVars = [];
    if (!clientId) missingVars.push('UPS_OAUTH_CLIENT_ID');
    if (!redirectUri) missingVars.push('UPS_OAUTH_REDIRECT_URI');

    if (missingVars.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required environment variables',
        missing: missingVars,
        config: {
          clientId: clientId ? 'SET' : 'NOT SET',
          redirectUri: redirectUri ? 'SET' : 'NOT SET',
          scope,
          baseUrl
        }
      }, { status: 400 });
    }

    // Test PKCE generation
    console.log('🔐 Testing PKCE generation...');
    const oauthService = UPSOAuthService.getInstance();
    const { codeVerifier, codeChallenge } = oauthService.generatePKCE();
    
    console.log(`- Code Verifier: ${codeVerifier.substring(0, 10)}...`);
    console.log(`- Code Challenge: ${codeChallenge.substring(0, 10)}...`);

    // Test authorization URL generation
    console.log('🌐 Testing authorization URL generation...');
    const { url } = oauthService.generateAuthUrl(config, 'test-state');
    
    console.log(`- Authorization URL: ${url}`);

    // Validate URL components
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    const validation = {
      baseUrl: urlObj.origin + urlObj.pathname,
      clientId: params.get('client_id'),
      redirectUri: params.get('redirect_uri'),
      responseType: params.get('response_type'),
      scope: params.get('scope'),
      codeChallenge: params.get('code_challenge'),
      codeChallengeMethod: params.get('code_challenge_method'),
      state: params.get('state')
    };

    console.log('✅ URL Validation:');
    console.log(validation);

    // Test token refresh endpoint (if we had a token)
    console.log('🔄 Testing token refresh endpoint...');
    const refreshUrl = `${baseUrl}/security/v1/oauth/refresh`;
    console.log(`- Refresh URL: ${refreshUrl}`);

    return NextResponse.json({
      success: true,
      message: 'UPS OAuth configuration is valid',
      config: {
        clientId: clientId.substring(0, 8) + '...',
        redirectUri,
        scope,
        baseUrl
      },
      pkce: {
        codeVerifier: codeVerifier.substring(0, 10) + '...',
        codeChallenge: codeChallenge.substring(0, 10) + '...'
      },
      authorizationUrl: url,
      validation,
      endpoints: {
        // Authorization Code Flow (User Authentication)
        authorize: `${baseUrl}/security/v1/oauth/authorize`,
        token: `${baseUrl}/security/v1/oauth/token`,
        refresh: `${baseUrl}/security/v1/oauth/refresh`,
        // Client Credentials Flow (Server-to-Server)
        clientCredentialsToken: 'https://onlinetools.ups.com/security/v1/oauth/token'
      },
      nextSteps: [
        '1. Ensure your redirect URI is registered in UPS Developer Console',
        '2. Test the OAuth flow at /ups-oauth-demo',
        '3. Check callback handling at /api/ups/oauth/callback',
        '4. Verify token exchange and refresh functionality'
      ]
    });

  } catch (error) {
    console.error('❌ UPS OAuth test error:', error);
    return NextResponse.json({
      success: false,
      error: 'UPS OAuth test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
