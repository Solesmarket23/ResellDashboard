import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Get the current host from the request
  const host = request.headers.get('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  console.log('Callback request from:', {
    host,
    baseUrl,
    code: code ? 'present' : 'missing',
    state: state ? 'present' : 'missing',
    error
  });

  if (error) {
    console.log('OAuth error:', error);
    return NextResponse.redirect(`${baseUrl}/dashboard?error=oauth_error&message=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    console.log('Missing code or state in callback');
    return NextResponse.redirect(`${baseUrl}/dashboard?error=missing_params`);
  }

  // Get stored state from cookies
  const storedState = request.cookies.get('stockx_state')?.value;
  const returnTo = request.cookies.get('stockx_return_to')?.value;

  console.log('State validation:', { state, storedState });

  if (!storedState) {
    console.log('No stored state found');
    return NextResponse.redirect(`${baseUrl}/dashboard?error=no_stored_state`);
  }

  if (state !== storedState) {
    console.log('State validation failed - redirecting with error');
    // Check if we have existing valid tokens
    const existingAccessToken = request.cookies.get('stockx_access_token')?.value;
    const existingRefreshToken = request.cookies.get('stockx_refresh_token')?.value;
    
    if (existingAccessToken && existingRefreshToken) {
      console.log('Found existing tokens - redirecting to success despite state mismatch');
      const finalRedirect = returnTo || `${baseUrl}/dashboard?view=stockx-arbitrage`;
      return NextResponse.redirect(`${finalRedirect}${finalRedirect.includes('?') ? '&' : '?'}success=true&note=existing_tokens`);
    }
    
    return NextResponse.redirect(`${baseUrl}/dashboard?error=state_mismatch`);
  }

  // Exchange code for tokens
  try {
    const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.STOCKX_CLIENT_ID,
        client_secret: process.env.STOCKX_CLIENT_SECRET,
        code: code,
        redirect_uri: `${baseUrl}/api/stockx/callback`,
      }),
    });

    console.log('Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(`${baseUrl}/dashboard?error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();
    console.log('Tokens received:', {
      access_token: tokens.access_token ? 'present' : 'missing',
      refresh_token: tokens.refresh_token ? 'present' : 'missing',
      expires_in: tokens.expires_in
    });

    // Store tokens in cookies
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      path: '/',
    };

    const response = NextResponse.redirect(
      returnTo || `${baseUrl}/dashboard?view=stockx-arbitrage&success=true`
    );

    response.cookies.set('stockx_access_token', tokens.access_token, cookieOptions);
    response.cookies.set('stockx_refresh_token', tokens.refresh_token, cookieOptions);

    // Clean up temporary cookies
    response.cookies.delete('stockx_state');
    response.cookies.delete('stockx_return_to');

    console.log('Tokens stored in cookies:', {
      accessTokenSet: !!tokens.access_token,
      refreshTokenSet: !!tokens.refresh_token,
      cookieOptions
    });

    return response;

  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.redirect(`${baseUrl}/dashboard?error=token_exchange_error`);
  }
} 