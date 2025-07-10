import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Get the current URL to determine the correct redirect URI
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

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
    
    // Create response with redirect
    const redirectUrl = new URL('/dashboard?gmail_connected=true', baseUrl);
    const response = NextResponse.redirect(redirectUrl);
    
    // Determine if we're in production (Vercel) or development
    const isProduction = baseUrl.includes('vercel.app') || baseUrl.includes('resell-dashboard');
    
    // Set cookies with extended duration for better user experience
    const cookieOptions = {
      httpOnly: false, // Allow client-side access for status checking
      secure: isProduction, // Use secure cookies in production
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days for access token
      domain: undefined // Let browser handle domain automatically
    };
    
    console.log('🍪 Setting cookies with options:', cookieOptions);
    
    // Set cookies on the response object
    response.cookies.set('gmail_access_token', tokens.access_token, cookieOptions);
    
    if (tokens.refresh_token) {
      response.cookies.set('gmail_refresh_token', tokens.refresh_token, {
        ...cookieOptions,
        maxAge: 90 * 24 * 60 * 60 // 90 days for refresh token
      });
    }
    
    // Also store in a more accessible format for immediate use
    response.cookies.set('gmail_connected', 'true', {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 days to match access token
    });
    
    // Store connection timestamp for 7-day expiry tracking
    response.cookies.set('gmail_connected_at', Date.now().toString(), {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    console.log('✅ Gmail tokens stored in response cookies');
    console.log('🔄 Redirecting to:', redirectUrl.toString());
    
    // Debug: Log cookie details for troubleshooting
    console.log('🍪 CALLBACK: Cookie details:', {
      isProduction,
      baseUrl,
      cookieOptions,
      hasRefreshToken: !!tokens.refresh_token
    });

    return response;
    
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const errorUrl = new URL('/dashboard?gmail_error=true', baseUrl);
    return NextResponse.redirect(errorUrl);
  }
} 