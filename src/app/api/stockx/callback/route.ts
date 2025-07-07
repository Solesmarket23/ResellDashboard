import { NextRequest, NextResponse } from 'next/server';

// Function to validate if StockX tokens are still valid
async function validateTokens(accessToken: string): Promise<boolean> {
  try {
    const testResponse = await fetch('https://api.stockx.com/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return testResponse.ok;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Get the current host from the request
  const host = request.headers.get('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  console.log('=== STOCKX CALLBACK ===');
  console.log('Callback request from:', {
    host,
    baseUrl,
    code: code ? 'present' : 'missing',
    state: state ? 'present' : 'missing',
    error
  });

  // Handle OAuth errors
  if (error) {
    console.log('OAuth error:', error);
    return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=oauth_error&message=${encodeURIComponent(error)}`);
  }

  // Get stored state and return URL from cookies
  const storedState = request.cookies.get('stockx_state')?.value;
  const returnTo = request.cookies.get('stockx_return_to')?.value;

  console.log('State validation:', { state, storedState });

  // PRIORITY 1: If we have a fresh authorization code, ALWAYS process it immediately
  // This is a new OAuth flow and should take precedence over any existing tokens
  if (code && state) {
    console.log('🔄 Processing NEW authorization code from StockX OAuth');
    
    // Validate state for security
    if (state !== storedState) {
      console.log('❌ State mismatch - security issue detected');
      return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=state_mismatch`);
    }

    // Exchange the new authorization code for fresh tokens
    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      
      const clientId = process.env.STOCKX_CLIENT_ID;
      const clientSecret = process.env.STOCKX_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        console.error('❌ Missing OAuth credentials');
        return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=missing_credentials`);
      }
      
      const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: `${baseUrl}/api/stockx/callback`,
          audience: 'gateway.stockx.com',
        }),
      });

      console.log('Token exchange response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ Token exchange failed:', errorText);
        return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=token_exchange_failed`);
      }

      const tokens = await tokenResponse.json();
      console.log('✅ Fresh tokens received:', {
        access_token: tokens.access_token ? 'present' : 'missing',
        refresh_token: tokens.refresh_token ? 'present' : 'missing',
        expires_in: tokens.expires_in
      });

      // Store the fresh tokens (this will overwrite any existing invalid tokens)
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'none' as const,
        path: '/',
      };

      const finalRedirect = returnTo || `${baseUrl}/dashboard?view=stockx-arbitrage`;
      const response = NextResponse.redirect(`${finalRedirect}${finalRedirect.includes('?') ? '&' : '?'}success=true&note=fresh_login`);

      // Clear any existing tokens and set fresh ones
      response.cookies.delete('stockx_access_token');
      response.cookies.delete('stockx_refresh_token');
      response.cookies.set('stockx_access_token', tokens.access_token, cookieOptions);
      response.cookies.set('stockx_refresh_token', tokens.refresh_token, cookieOptions);

      // Clean up temporary OAuth cookies
      response.cookies.delete('stockx_state');
      response.cookies.delete('stockx_return_to');

      console.log('✅ Fresh tokens stored successfully, redirecting to:', finalRedirect);
      return response;

    } catch (error) {
      console.error('❌ Token exchange error:', error);
      return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=token_exchange_error`);
    }
  }

  // PRIORITY 2: If no new authorization code, check for existing tokens
  // This only happens if someone visits the callback URL directly without OAuth
  console.log('🔍 No new authorization code - checking existing tokens');
  
  const existingAccessToken = request.cookies.get('stockx_access_token')?.value;
  const existingRefreshToken = request.cookies.get('stockx_refresh_token')?.value;
  
  if (existingAccessToken && existingRefreshToken) {
    console.log('🔍 Found existing tokens - validating them');
    
    const tokensValid = await validateTokens(existingAccessToken);
    
    if (tokensValid) {
      console.log('✅ Existing tokens are valid');
      const finalRedirect = returnTo || `${baseUrl}/dashboard?view=stockx-arbitrage`;
      return NextResponse.redirect(`${finalRedirect}${finalRedirect.includes('?') ? '&' : '?'}success=true&note=existing_valid`);
    } else {
      console.log('❌ Existing tokens are invalid - need fresh login');
      return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=invalid_tokens&need_reauth=true`);
    }
  }

  // PRIORITY 3: No valid tokens found at all
  console.log('❌ No valid tokens found - need authentication');
  return NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&error=no_tokens&need_reauth=true`);
} 