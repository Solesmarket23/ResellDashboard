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
    const state = searchParams.get('state');

    console.log('🔍 Gmail callback debug:', {
      hasCode: !!code,
      hasState: !!state,
      stateValue: state,
      fullUrl: request.url
    });

    if (!code) {
      return NextResponse.json({ error: 'Authorization code not found' }, { status: 400 });
    }

    // Parse the return URL from the state parameter
    let returnUrl = '/';
    if (state) {
      try {
        const stateData = JSON.parse(state);
        returnUrl = stateData.returnUrl || '/';
        console.log('✅ Parsed state successfully:', stateData);
      } catch (error) {
        console.error('❌ Error parsing state parameter:', error);
        console.log('📝 Raw state value:', state);
        // Default to homepage if state parsing fails
        returnUrl = '/';
      }
    } else {
      console.log('⚠️ No state parameter received');
    }

    console.log('🎯 Will redirect to:', returnUrl);

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
      httpOnly: true, // Changed back to true for security
      secure: false, // Allow localhost
      sameSite: 'lax',
      path: '/',
      maxAge: 3600 // 1 hour
    });
    
    if (tokens.refresh_token) {
      cookieStore.set('gmail_refresh_token', tokens.refresh_token, {
        httpOnly: true, // Changed back to true for security
        secure: false, // Allow localhost
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 // 30 days
      });
    }

    console.log('✅ Gmail tokens stored in cookies successfully');

    // Redirect back to the return URL with success parameter
    const redirectUrl = new URL(`${returnUrl}?gmail_connected=true`, baseUrl);
    console.log('🔄 Final redirect URL:', redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    // Use return URL from state or default to homepage for error redirect
    let errorReturnUrl = '/';
    const state = new URL(request.url).searchParams.get('state');
    if (state) {
      try {
        const stateData = JSON.parse(state);
        errorReturnUrl = stateData.returnUrl || '/';
      } catch (parseError) {
        console.error('Error parsing state for error redirect:', parseError);
      }
    }
    const errorUrl = new URL(`${errorReturnUrl}?gmail_error=true`, baseUrl);
    return NextResponse.redirect(errorUrl);
  }
} 