import { NextRequest, NextResponse } from 'next/server';
import { UPSOAuthService } from '@/lib/tracking/upsOAuth';

export async function GET(request: NextRequest) {
  try {
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

    // Get current token
    const token = oauthService.getToken();

    if (!token) {
      return NextResponse.json(
        { error: 'No OAuth token available. Please authenticate first.' },
        { status: 401 }
      );
    }

    // Return token info (without sensitive data)
    return NextResponse.json({
      token_type: token.token_type,
      expires_in: token.expires_in,
      scope: token.scope,
      status: token.status,
      has_refresh_token: !!token.refresh_token
    });

  } catch (error) {
    console.error('❌ UPS OAuth token info error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get UPS OAuth token info',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code, codeVerifier } = await request.json();

    if (!code || !codeVerifier) {
      return NextResponse.json(
        { error: 'Authorization code and code verifier are required' },
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

    // Exchange code for token
    const token = await oauthService.exchangeCodeForToken(code, codeVerifier, config);

    return NextResponse.json({
      success: true,
      token: {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type,
        expires_in: token.expires_in,
        scope: token.scope
      }
    });

  } catch (error) {
    console.error('❌ UPS OAuth token exchange error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to exchange authorization code for token',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
