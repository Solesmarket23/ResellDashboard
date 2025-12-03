import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

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
    
    // Check if this is a Vercel preview URL (should use production domain)
    const isVercelPreview = baseUrl.includes('vercel.app') || baseUrl.includes('vercel.app');
    
    // Force production URL to solesmarket.com if not local
    if (!isLocal) {
      // Always use solesmarket.com for production (including Vercel previews)
      const productionBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.solesmarket.com';
      baseUrl = productionBaseUrl;
      console.log('🌐 Production detected - using base URL:', baseUrl);
      if (isVercelPreview) {
        console.log('🌐 Vercel preview detected - forcing production domain');
      }
    }
    
    // Get the return URL from query parameters
    const returnUrl = url.searchParams.get('returnUrl') || '/dashboard';
    
    // ALWAYS use solesmarket.com for production (ignore GOOGLE_REDIRECT_URI if it's a Vercel URL)
    let redirectUri: string;
    
    if (isLocal) {
      // For local development, use localhost
      redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:3000/api/gmail/callback`;
    } else {
      // For production, ALWAYS use solesmarket.com (never use Vercel preview URLs)
      redirectUri = 'https://www.solesmarket.com/api/gmail/callback';
      console.log('🔐 Gmail Auth - FORCING production redirect URI (ignoring any Vercel URLs)');
    }
    
    console.log('🔐 Gmail Auth - Using redirect URI:', redirectUri);
    console.log('🔐 Gmail Auth - Base URL:', baseUrl);
    console.log('🔐 Gmail Auth - Is local:', isLocal);
    console.log('🔐 Gmail Auth - Request URL:', request.url);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      include_granted_scopes: true,
      state: returnUrl // Pass the return URL as state
    });

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
} 