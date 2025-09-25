import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthFlowService } from '@/lib/tracking/upsOAuthFlow';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'ups.track ups.ship';
    const state = searchParams.get('state') || crypto.randomBytes(16).toString('hex');

    // Get OAuth configuration from environment (prefer UPS_OAUTH_* vars)
    const clientId = process.env.UPS_OAUTH_CLIENT_ID || process.env.UPS_CLIENT_ID;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const baseUrl = process.env.UPS_OAUTH_BASE_URL || process.env.UPS_BASE_URL || 'https://wwwcie.ups.com';

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { 
          error: 'UPS OAuth not configured',
      details: 'Missing UPS_OAUTH_CLIENT_ID (or UPS_CLIENT_ID) or UPS_OAUTH_REDIRECT_URI environment variables'
        },
        { status: 500 }
      );
    }

    console.log('🔐 Initiating UPS OAuth flow following UPS specification...');
    console.log(`- Client ID: ${clientId.substring(0, 8)}...`);
    console.log(`- Redirect URI: ${redirectUri}`);
    console.log(`- Scope: ${scope}`);
    console.log(`- State: ${state}`);

    // Use the UPS OAuth Flow Service that follows the exact specification
    const flowService = UPSOAuthFlowService.getInstance();
    const result = await flowService.initiateOAuthFlow({
      clientId,
      clientSecret: process.env.UPS_OAUTH_CLIENT_SECRET || process.env.UPS_CLIENT_SECRET || '',
      redirectUri,
      scope,
      baseUrl
    }, state);

    console.log(`- Final Authorization URL: ${result.authorizationUrl}`);
    console.log(`- Code Verifier: ${result.codeVerifier.substring(0, 10)}...`);

    // In a production app, you'd store the code_verifier in a secure session store
    // For this demo, we'll include it in the redirect URL as a parameter
    const urlWithVerifier = new URL(result.authorizationUrl);
    urlWithVerifier.searchParams.set('code_verifier', result.codeVerifier);

    return NextResponse.json({
      success: true,
      authorization_url: urlWithVerifier.toString(),
      code_verifier: result.codeVerifier,
      state: result.state,
      client_id: clientId.substring(0, 8) + '...',
      redirect_uri: redirectUri,
      scope,
      flow_type: 'UPS OAuth Authorization Code Flow with PKCE',
      steps: [
        '1. User redirected to UPS login (lasso/signin)',
        '2. User enters UPS credentials',
        '3. UPS redirects back with authorization code',
        '4. Exchange code for access token using Basic Auth',
        '5. Use access token for API calls',
        '6. Refresh token when needed'
      ]
    });

  } catch (error) {
    console.error('❌ UPS OAuth initiation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to initiate UPS OAuth',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
