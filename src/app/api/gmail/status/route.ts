import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ connected: false, reason: 'No access token' }, { status: 401 });
    }

    // Get the current URL to determine the correct redirect URI
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    // Simple test to verify authentication
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Just get the user profile, don't fetch emails
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    return NextResponse.json({ 
      connected: true, 
      email: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal || 0
    });

  } catch (error) {
    console.error('Gmail status check failed:', error);
    return NextResponse.json({ connected: false, reason: 'Authentication failed' }, { status: 401 });
  }
} 