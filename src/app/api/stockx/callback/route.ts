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

// Helper function to build redirect URL safely
function buildRedirectUrl(baseUrl: string, returnTo?: string, defaultReturn?: string): string {
  const path = returnTo || defaultReturn || '/dashboard';
  // If returnTo is already a full URL, use it directly
  return returnTo && returnTo.startsWith('http') ? returnTo : `${baseUrl}${path}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Get the current host from the request
    const host = request.headers.get('host') || '';
    
    // Use ngrok URL if available, otherwise use the host
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${host}`;
    
    // Force www version for StockX OAuth compatibility
    if (baseUrl.includes('solesmarket.com') && !baseUrl.includes('www.')) {
      baseUrl = 'https://www.solesmarket.com';
    }

    console.log('=== STOCKX CALLBACK ===');
    console.log('Callback request from:', {
      host,
      baseUrl,
      code: code ? 'present' : 'missing',
      state: state ? 'present' : 'missing',
      error
    });

  // Get stored state and return URL from cookies
  const storedState = request.cookies.get('stockx_state')?.value;
  const returnTo = request.cookies.get('stockx_return_to')?.value;
  
  console.log('Cookie values:', {
    storedState: storedState ? 'present' : 'missing',
    returnTo: returnTo || 'not set',
    cookieCount: request.cookies.size
  });
  
  // Default return URL if none specified
  const defaultReturn = '/dashboard?section=stockx-market-research';

  // Handle OAuth errors
  if (error) {
    console.log('OAuth error:', error);
    const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
    const separator = redirectUrl.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${redirectUrl}${separator}error=oauth_error&message=${encodeURIComponent(error)}`);
  }

  console.log('State validation:', { state, storedState });

  // PRIORITY 1: If we have a fresh authorization code, ALWAYS process it immediately
  // This is a new OAuth flow and should take precedence over any existing tokens
  if (code && state) {
    console.log('🔄 Processing NEW authorization code from StockX OAuth');
    
    // Validate state for security
    if (state !== storedState) {
      console.log('❌ State mismatch - security issue detected');
      const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
      const separator = redirectUrl.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${redirectUrl}${separator}error=state_mismatch`);
    }

    // Exchange the new authorization code for fresh tokens
    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      
      const clientId = process.env.STOCKX_CLIENT_ID;
      const clientSecret = process.env.STOCKX_CLIENT_SECRET;
      
      console.log('OAuth credentials check:', {
        clientId: clientId ? `${clientId.substring(0, 8)}...` : 'missing',
        clientSecret: clientSecret ? 'present' : 'missing',
        redirectUri: `${baseUrl}/api/stockx/callback`
      });
      
      if (!clientId || !clientSecret) {
        console.error('❌ Missing OAuth credentials');
        const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
        const separator = redirectUrl.includes('?') ? '&' : '?';
        return NextResponse.redirect(`${redirectUrl}${separator}error=missing_credentials`);
      }
      
      const tokenRequestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: `${baseUrl}/api/stockx/callback`,
        audience: 'gateway.stockx.com',
      });
      
      console.log('Token request details:', {
        url: 'https://accounts.stockx.com/oauth/token',
        redirect_uri: `${baseUrl}/api/stockx/callback`,
        code_length: code.length,
        body_params: Array.from(tokenRequestBody.keys())
      });

      const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenRequestBody,
      });

      console.log('Token exchange response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('❌ Token exchange failed:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText,
          headers: Object.fromEntries(tokenResponse.headers.entries())
        });
        
        // Try to parse error details
        let errorDetails = 'token_exchange_failed';
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            errorDetails = errorJson.error;
          }
          if (errorJson.error_description) {
            console.error('Error description:', errorJson.error_description);
          }
        } catch (e) {
          // Not JSON, use the raw text
        }
        
        const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
        const separator = redirectUrl.includes('?') ? '&' : '?';
        return NextResponse.redirect(`${redirectUrl}${separator}error=${errorDetails}&details=${encodeURIComponent(errorText.substring(0, 100))}`);
      }

      const tokens = await tokenResponse.json();
      console.log('✅ Fresh tokens received:', {
        access_token: tokens.access_token ? 'present' : 'missing',
        refresh_token: tokens.refresh_token ? 'present' : 'missing',
        expires_in: tokens.expires_in
      });

      // Calculate token expiration time
      const expiresIn = tokens.expires_in || 3600; // Default to 1 hour if not provided
      const expiresAt = Date.now() + ((expiresIn - 300) * 1000); // Subtract 5 minutes for buffer

      // Store the fresh tokens (this will overwrite any existing invalid tokens)
      const isProduction = !host.includes('localhost');
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 2592000 // 30 days in seconds
      };

      const finalRedirect = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
      const separator = finalRedirect.includes('?') ? '&' : '?';
      const response = NextResponse.redirect(`${finalRedirect}${separator}success=true&note=fresh_login`);

      // Clear any existing tokens and set fresh ones
      response.cookies.delete('stockx_access_token');
      response.cookies.delete('stockx_refresh_token');
      response.cookies.delete('stockx_token_expires_at');
      response.cookies.set('stockx_access_token', tokens.access_token, cookieOptions);
      response.cookies.set('stockx_refresh_token', tokens.refresh_token, cookieOptions);
      response.cookies.set('stockx_token_expires_at', expiresAt.toString(), cookieOptions);

      // Clean up temporary OAuth cookies
      response.cookies.delete('stockx_state');
      response.cookies.delete('stockx_return_to');

      // Save tokens to Firebase for server-side cron job access
      try {
        const { getUserIdFromRequest } = await import('@/lib/utils/userApiKeyHelper');
        const { getAdminDb } = await import('@/lib/firebase/admin');
        
        const userId = getUserIdFromRequest(request);
        const adminDb = getAdminDb();
        
        if (adminDb && userId) {
          await adminDb.collection('users').doc(userId).set({
            stockxTokens: {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at: expiresAt,
              updated_at: new Date().toISOString()
            }
          }, { merge: true });
          console.log('✅ StockX tokens saved to Firebase for user:', userId);
        } else if (!userId) {
          console.warn('⚠️ No user ID found, tokens not saved to Firebase');
        } else if (!adminDb) {
          console.warn('⚠️ Firebase Admin not initialized, tokens not saved');
        }
      } catch (error) {
        console.error('❌ Failed to save tokens to Firebase:', error);
        // Don't fail the OAuth flow if Firebase save fails
      }

      console.log('✅ Fresh tokens stored successfully, redirecting to:', finalRedirect);
      return response;

    } catch (error) {
      console.error('❌ Token exchange error:', error);
      const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
      const separator = redirectUrl.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${redirectUrl}${separator}error=token_exchange_error`);
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
      const finalRedirect = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
      const separator = finalRedirect.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${finalRedirect}${separator}success=true&note=existing_valid`);
    } else {
      console.log('❌ Existing tokens are invalid - need fresh login');
      const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
      const separator = redirectUrl.includes('?') ? '&' : '?';
      return NextResponse.redirect(`${redirectUrl}${separator}error=invalid_tokens&need_reauth=true`);
    }
  }

  // PRIORITY 3: No valid tokens found at all
  console.log('❌ No valid tokens found - need authentication');
  const redirectUrl = buildRedirectUrl(baseUrl, returnTo, defaultReturn);
  const separator = redirectUrl.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${redirectUrl}${separator}error=no_tokens&need_reauth=true`);
  
  } catch (error: any) {
    console.error('❌ StockX callback error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return a proper error response instead of throwing
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error.message || 'Failed to process StockX callback',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 