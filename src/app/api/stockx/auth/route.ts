import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const clientId = process.env.STOCKX_CLIENT_ID;
  const redirectUri = process.env.STOCKX_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Missing StockX OAuth credentials' },
      { status: 500 }
    );
  }

  // Get the request origin to determine if we're on localhost or ngrok
  const origin = request.headers.get('origin') || '';
  const host = request.headers.get('host') || '';
  
  console.log('Auth request from:', { origin, host, redirectUri });

  // Generate a random state for security
  const state = Math.random().toString(36).substring(2, 15);
  
  // Build the authorization URL
  const authUrl = new URL('https://accounts.stockx.com/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'offline_access openid');
  authUrl.searchParams.set('audience', 'gateway.stockx.com');
  authUrl.searchParams.set('state', state);

  // Store state in session/cookie for validation (in production, use proper session management)
  const response = NextResponse.redirect(authUrl.toString());
  
  // Set cookie with proper domain for ngrok - make it work across domains
  const cookieOptions = {
    httpOnly: true,
    secure: redirectUri.startsWith('https://'), // Use secure if redirect URI is https
    sameSite: 'none' as const, // Allow cross-site cookies
    maxAge: 300, // 5 minutes
    path: '/' // Ensure path is set
  };
  
  console.log('Setting state cookie:', state, 'with options:', cookieOptions);
  response.cookies.set('stockx_state', state, cookieOptions);

  return response;
} 