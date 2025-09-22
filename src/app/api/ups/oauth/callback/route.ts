import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthFlowService } from '@/lib/tracking/upsOAuthFlow';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('❌ UPS OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/ups-oauth-error?error=${error}&description=${errorDescription}`, request.url)
      );
    }

    if (!code) {
      console.error('❌ No authorization code received');
      return NextResponse.redirect(
        new URL('/ups-oauth-error?error=no_code&description=No authorization code received', request.url)
      );
    }

    // Get OAuth configuration from environment
    const clientId = process.env.UPS_CLIENT_ID;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_OAUTH_BASE_URL || 'https://wwwcie.ups.com';

    if (!clientId || !redirectUri) {
      console.error('❌ UPS OAuth not configured');
      return NextResponse.redirect(
        new URL('/ups-oauth-error?error=not_configured&description=UPS OAuth not configured', request.url)
      );
    }

    // For PKCE flow, we need to retrieve the code_verifier from session storage
    // In a real implementation, you'd store this in a secure session store
    // For now, we'll use a simple approach with URL parameters
    const codeVerifier = searchParams.get('code_verifier');
    
    if (!codeVerifier) {
      console.error('❌ No code verifier found');
      return NextResponse.redirect(
        new URL('/ups-oauth-error?error=no_verifier&description=No code verifier found', request.url)
      );
    }

    console.log('🔐 Step 3: Processing UPS OAuth callback...');
    console.log(`- Code: ${code.substring(0, 10)}...`);
    console.log(`- State: ${state}`);
    console.log(`- Client ID: ${clientId.substring(0, 8)}...`);

    // Exchange authorization code for access token using UPS flow service
    const flowService = UPSOAuthFlowService.getInstance();
    const token = await flowService.handleCallback(
      code,
      codeVerifier,
      {
        clientId,
        clientSecret: process.env.UPS_CLIENT_SECRET || '',
        redirectUri,
        scope,
        baseUrl
      }
    );

    console.log('✅ UPS OAuth token exchange successful!');
    console.log(`- Access Token: ${token.access_token.substring(0, 20)}...`);
    console.log(`- Refresh Token: ${token.refresh_token.substring(0, 20)}...`);
    console.log(`- Expires In: ${token.expires_in}s`);
    console.log(`- Scope: ${token.scope}`);

    // Redirect to success page with token info
    const successUrl = new URL('/ups-oauth-success', request.url);
    successUrl.searchParams.set('access_token', token.access_token.substring(0, 20) + '...');
    successUrl.searchParams.set('expires_in', token.expires_in.toString());
    successUrl.searchParams.set('scope', token.scope);

    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('❌ UPS OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/ups-oauth-error?error=callback_error&description=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}