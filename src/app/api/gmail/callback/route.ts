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
    cookieStore.set('gmail_access_token', tokens.access_token || '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600 // 1 hour
    });
    
    if (tokens.refresh_token) {
      cookieStore.set('gmail_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
    }

    // Redirect back to dashboard with success - force localhost to fix cookie issues
    const redirectUrl = request.url.includes('localhost') 
      ? new URL('/?gmail_connected=true', request.url)
      : new URL('http://localhost:3000/?gmail_connected=true');
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const errorUrl = request.url.includes('localhost') 
      ? new URL('/?gmail_error=true', request.url)
      : new URL('http://localhost:3000/?gmail_error=true');
    return NextResponse.redirect(errorUrl);
  }
} 