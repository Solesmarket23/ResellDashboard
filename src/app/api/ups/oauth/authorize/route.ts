import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthService } from '@/lib/tracking/upsOAuth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state') || undefined;

    const clientId = process.env.UPS_OAUTH_CLIENT_ID;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_BASE_URL || 'https://wwwcie.ups.com';

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: 'UPS OAuth not configured (need UPS_OAUTH_CLIENT_ID and UPS_OAUTH_REDIRECT_URI)' },
        { status: 500 }
      );
    }

    const oauthService = UPSOAuthService.getInstance();
    const config = {
      clientId,
      redirectUri,
      scope,
      baseUrl
    };

    const { url, codeVerifier } = oauthService.generateAuthUrl(config, state);

    // Store code verifier in session/cookie for later use
    const response = NextResponse.redirect(url);
    
    // Store code verifier in httpOnly cookie
    response.cookies.set('ups_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600 // 10 minutes
    });

    // Store state for verification
    if (state) {
      response.cookies.set('ups_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600 // 10 minutes
      });
    }

    return response;

  } catch (error) {
    console.error('❌ UPS OAuth authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate UPS OAuth flow' },
      { status: 500 }
    );
  }
}
