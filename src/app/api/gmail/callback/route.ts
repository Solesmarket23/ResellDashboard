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
    
    // Store tokens securely (in production, use a secure database)
    const cookieStore = cookies();
    
    console.log('🍪 Setting cookies with tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      accessTokenLength: tokens.access_token?.length || 0
    });
    
    cookieStore.set('gmail_access_token', tokens.access_token || '', {
      httpOnly: false, // Allow frontend access for debugging
      secure: false, // Allow localhost
      sameSite: 'lax',
      path: '/',
      maxAge: 3600 // 1 hour
    });
    
    if (tokens.refresh_token) {
      cookieStore.set('gmail_refresh_token', tokens.refresh_token, {
        httpOnly: false, // Allow frontend access for debugging
        secure: false, // Allow localhost
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
    }

    console.log('✅ Gmail tokens stored in cookies successfully');

    // Redirect back to dashboard with success - use dynamic base URL
    const redirectUrl = new URL('/?gmail_connected=true', baseUrl);
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const errorUrl = new URL('/?gmail_error=true', baseUrl);
    return NextResponse.redirect(errorUrl);
  }
} 