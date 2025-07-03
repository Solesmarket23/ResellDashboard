import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const clientId = process.env.STOCKX_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: 'Missing StockX OAuth credentials' },
      { status: 500 }
    );
  }

  // Get the returnTo URL from query params
  const returnTo = request.nextUrl.searchParams.get('returnTo');

  // Get the current host from the request
  const host = request.headers.get('host') || '';
  
  // Build redirect URI dynamically based on current host
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/stockx/callback`;
  
  console.log('Auth request from:', {
    host,
    redirectUri,
    returnTo
  });

  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);

  // Create the response to redirect to StockX OAuth
  const response = NextResponse.redirect(
    `https://accounts.stockx.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=openid%20offline_access`
  );

  // Set the state cookie with secure options
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    maxAge: 300, // 5 minutes
    path: '/',
  };

  response.cookies.set('stockx_state', state, cookieOptions);

  // Set the returnTo cookie if provided
  if (returnTo) {
    response.cookies.set('stockx_return_to', returnTo, cookieOptions);
  }

  console.log('Setting state cookie:', state, 'with options:', cookieOptions);

  return response;
} 