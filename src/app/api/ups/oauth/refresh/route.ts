import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthService } from '@/lib/tracking/upsOAuth';

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    const clientId = process.env.UPS_OAUTH_CLIENT_ID;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_BASE_URL || 'https://wwwcie.ups.com';

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: 'UPS OAuth not configured' },
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

    // Set the current token with refresh token
    oauthService.setToken({
      access_token: '',
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 0,
      expires_at: 0,
      scope: scope,
      client_id: clientId,
      refresh_token_expires_in: 0,
      refresh_token_issued_at: 0,
      refresh_count: '0',
      status: 'active'
    });

    // Refresh the token
    const newToken = await oauthService.refreshToken(config);

    return NextResponse.json({
      success: true,
      token: {
        access_token: newToken.access_token,
        refresh_token: newToken.refresh_token,
        token_type: newToken.token_type,
        expires_in: newToken.expires_in,
        scope: newToken.scope
      }
    });

  } catch (error) {
    console.error('❌ UPS OAuth refresh error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to refresh UPS OAuth token',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
