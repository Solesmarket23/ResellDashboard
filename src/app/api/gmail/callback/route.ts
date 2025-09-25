import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Get the current URL to determine the correct redirect URI
    const url = new URL(request.url);
    let baseUrl = `${url.protocol}//${url.host}`;
    
    // Fix for 0.0.0.0 - convert to localhost for OAuth
    if (baseUrl.includes('0.0.0.0')) {
      baseUrl = baseUrl.replace('0.0.0.0', 'localhost');
    }
    
    // Check if we're running locally (localhost, 127.0.0.1)
    const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
    
    // Get the return URL from state parameter
    const returnUrl = url.searchParams.get('state') || '/dashboard';
    
    console.log('🔐 Gmail Callback - State parameter:', url.searchParams.get('state'));
    console.log('🔐 Gmail Callback - Return URL:', returnUrl);
    
    // Use environment variable if set, otherwise auto-detect
    let redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    if (!redirectUri) {
      // Always use the current base URL to auto-detect the port
      redirectUri = `${baseUrl}/api/gmail/callback`;
    }
    
    console.log('🔐 Gmail Callback - Using redirect URI:', redirectUri);
    console.log('🔐 Gmail Callback - Is local:', isLocal);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { searchParams } = url;
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Authorization code not found' }, { status: 400 });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('🔐 Received tokens from Google:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      accessTokenLength: tokens.access_token?.length || 0
    });

    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }
    
    // Create response with redirect to the original page
    // Use the current port for local development
    const redirectBaseUrl = isLocal ? `http://localhost:${url.port || '3000'}` : baseUrl;
    
    // Handle the return URL properly - if it starts with /, append to base URL
    let redirectUrl;
    if (returnUrl.startsWith('/')) {
      redirectUrl = new URL(returnUrl, redirectBaseUrl);
    } else {
      redirectUrl = new URL(returnUrl);
    }
    
    console.log('🔐 Gmail Callback - Redirect base URL:', redirectBaseUrl);
    console.log('🔐 Gmail Callback - Final redirect URL before params:', redirectUrl.toString());
    
    // Add gmail_connected parameter properly
    redirectUrl.searchParams.set('gmail_connected', 'true');
    
    console.log('🔐 Gmail Callback - Final redirect URL after params:', redirectUrl.toString());
    const response = NextResponse.redirect(redirectUrl, { status: 302 });
    // Add a refresh header as a fallback to ensure navigation in dev
    try {
      response.headers.set('Refresh', `0;url=${redirectUrl.toString()}`);
    } catch {}
    
    // Determine if we're in production (Vercel) or development
    const isProduction = baseUrl.includes('vercel.app') || baseUrl.includes('resell-dashboard');
    
    // Set cookies with extended duration for better user experience
    const httpOnlyCookieOptions = {
      httpOnly: true, // Server-side only for security
      secure: isProduction, // Use secure cookies in production
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days for access token
      domain: isLocal ? undefined : (isProduction ? '.vercel.app' : undefined) // No domain for localhost
    };

    const clientCookieOptions = {
      httpOnly: false, // Allow client-side access for status checking
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days client-visible marker
      domain: isLocal ? undefined : (isProduction ? '.vercel.app' : undefined)
    };
    
    console.log('🍪 Setting cookies with options:', { httpOnly: httpOnlyCookieOptions, client: clientCookieOptions });
    
    // Set access token as httpOnly for server-side access
    response.cookies.set('gmail_access_token', tokens.access_token, httpOnlyCookieOptions);
    
    if (tokens.refresh_token) {
      response.cookies.set('gmail_refresh_token', tokens.refresh_token, {
        ...httpOnlyCookieOptions,
        maxAge: 90 * 24 * 60 * 60 // 90 days for refresh token
      });
    }
    
    // Also store in a more accessible format for immediate use
    response.cookies.set('gmail_connected', 'true', clientCookieOptions);
    
    // Store connection timestamp for 7-day expiry tracking
    response.cookies.set('gmail_connected_at', Date.now().toString(), clientCookieOptions);

    console.log('✅ Gmail tokens stored in response cookies');
    console.log('🔄 Redirecting to:', redirectUrl.toString());
    
    // Debug: Log cookie details for troubleshooting
    console.log('🍪 CALLBACK: Cookie details:', {
      isProduction,
      baseUrl,
      httpOnlyCookieOptions,
      clientCookieOptions,
      hasRefreshToken: !!tokens.refresh_token
    });

    return response;
    
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('0.0.0.0');
    const redirectBaseUrl = isLocal ? `http://localhost:${url.port || '3000'}` : baseUrl;
    const returnUrl = url.searchParams.get('state') || '/dashboard';
    const errorUrl = new URL(returnUrl, redirectBaseUrl);
    errorUrl.searchParams.set('gmail_error', 'true');
    return NextResponse.redirect(errorUrl);
  }
} 