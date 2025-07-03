import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Get the base URL for redirects - use the ngrok URL when available
  let baseUrl;
  const ngrokUrl = process.env.STOCKX_REDIRECT_URI?.replace('/api/stockx/callback', '');
  
  if (ngrokUrl) {
    baseUrl = ngrokUrl;
  } else if (request.nextUrl.protocol && request.nextUrl.host && !request.nextUrl.host.includes('0.0.0.0')) {
    baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  } else {
    // Fallback to localhost
    baseUrl = 'http://localhost:3002';
  }

  console.log('Callback baseUrl:', baseUrl);
  console.log('Headers:', Object.fromEntries(request.headers.entries()));
  console.log('NextUrl:', request.nextUrl);

  // Check for OAuth error
  if (error) {
    console.log('OAuth error:', error);
    return NextResponse.redirect(new URL(`/dashboard/stockx-test?error=${encodeURIComponent(error)}`, baseUrl));
  }

  // Validate state parameter
  const storedState = request.cookies.get('stockx_state')?.value;
  const allCookies = Object.fromEntries(
    Array.from(request.cookies.getAll()).map(cookie => [cookie.name, cookie.value])
  );
  console.log('State validation:', { state, storedState });
  console.log('All cookies:', allCookies);
  
  if (!state || state !== storedState) {
    console.log('State validation failed - redirecting with error');
    // If tokens already exist, might be a re-authentication attempt
    if (allCookies.stockx_access_token) {
      console.log('Found existing tokens - redirecting to success despite state mismatch');
      return NextResponse.redirect(new URL(`/dashboard/stockx-test?success=true&note=existing_tokens`, baseUrl));
    }
    return NextResponse.redirect(new URL(`/dashboard/stockx-test?error=invalid_state&debug=state_mismatch`, baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/dashboard/stockx-test?error=no_code`, baseUrl));
  }

  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;
  const redirectUri = process.env.STOCKX_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL(`/dashboard/stockx-test?error=missing_credentials`, baseUrl));
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(new URL(`/dashboard/stockx-test?error=token_exchange_failed&details=${encodeURIComponent(errorText)}`, baseUrl));
    }

    const tokenData = await tokenResponse.json();
    
    // In a real application, you would securely store these tokens
    // For now, we'll redirect back with success and token info
    const response = NextResponse.redirect(new URL(`/dashboard/stockx-test?success=true`, baseUrl));
    
    // Store tokens in httpOnly cookies (in production, use proper session management)
    // Set cookies that work on both ngrok and localhost
    const cookieOptions = {
      httpOnly: true,
      secure: redirectUri.startsWith('https://'),
      sameSite: 'none' as const, // Allow cross-site cookies for better ngrok/localhost compatibility
      path: '/'
    };

    response.cookies.set('stockx_access_token', tokenData.access_token, {
      ...cookieOptions,
      maxAge: 43200 // 12 hours (token expiry)
    });

    if (tokenData.refresh_token) {
      response.cookies.set('stockx_refresh_token', tokenData.refresh_token, {
        ...cookieOptions,
        maxAge: 86400 * 30 // 30 days
      });
    }

    console.log('Tokens stored in cookies:', {
      accessTokenSet: !!tokenData.access_token,
      refreshTokenSet: !!tokenData.refresh_token,
      cookieOptions
    });

    // Clear the state cookie
    response.cookies.delete('stockx_state');

    return response;

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL(`/dashboard/stockx-test?error=callback_error&details=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, baseUrl));
  }
} 