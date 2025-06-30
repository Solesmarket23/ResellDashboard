import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  try {
    // Get the current URL to determine the correct redirect URI
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    // Get the return URL from query parameters (where user should go after auth)
    const returnUrl = url.searchParams.get('returnUrl') || '/';

    console.log('🔍 Gmail auth debug:', {
      returnUrl: returnUrl,
      fullUrl: request.url,
      searchParams: Object.fromEntries(url.searchParams)
    });

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const stateData = { returnUrl };
    console.log('📦 Setting OAuth state:', stateData);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      // Include return URL in state parameter
      state: JSON.stringify(stateData)
    });

    console.log('🚀 Generated auth URL with state');

    // Return JSON with authUrl as expected by the frontend
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
} 