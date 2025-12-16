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

  // StockX callback URL must match an allowlisted URL in StockX developer settings.
  // In practice, this is almost always the production domain. Starting OAuth on a tunnel
  // (ngrok/trycloudflare) sets cookies on the tunnel domain, but the callback happens on production,
  // causing state/returnTo cookie mismatches.
  //
  // Fix: if this request is NOT already on production, redirect the browser to production to start OAuth there.
  const lowerHost = host.toLowerCase();
  const isProdHost = lowerHost.endsWith('solesmarket.com');
  const isTunnelOrLocal =
    lowerHost.includes('localhost') ||
    lowerHost.includes('127.0.0.1') ||
    lowerHost.includes('ngrok-free.app') ||
    lowerHost.includes('trycloudflare.com');
  if (!isProdHost && isTunnelOrLocal) {
    const safeReturn =
      returnTo && returnTo.startsWith('http')
        ? (() => {
            try {
              const u = new URL(returnTo);
              return `${u.pathname}${u.search}${u.hash}`;
            } catch {
              return '/dashboard';
            }
          })()
        : returnTo || '/dashboard';

    const prodUrl = new URL('https://www.solesmarket.com/api/stockx/auth');
    prodUrl.searchParams.set('returnTo', safeReturn);
    return NextResponse.redirect(prodUrl.toString());
  }
  
  // Build a base URL that matches the *current* request origin (important for ngrok/local dev).
  // If NEXT_PUBLIC_BASE_URL is set for production, we still prefer it unless we're on localhost/ngrok.
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const proto =
    forwardedProto ||
    (request.nextUrl.protocol ? request.nextUrl.protocol.replace(':', '') : undefined) ||
    'https';
  const originFromRequest = host ? `${proto}://${host}` : request.nextUrl.origin;

  const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const isLocalOrTunnel =
    lowerHost.includes('localhost') ||
    lowerHost.includes('127.0.0.1') ||
    lowerHost.includes('ngrok-free.app') ||
    lowerHost.includes('trycloudflare.com');

  let baseUrl = envBaseUrl && !isLocalOrTunnel ? envBaseUrl : originFromRequest;
  
  // Force www version for StockX OAuth compatibility
  if (baseUrl.includes('solesmarket.com') && !baseUrl.includes('www.')) {
    baseUrl = 'https://www.solesmarket.com';
  }
  
  const redirectUri = `${baseUrl}/api/stockx/callback`;
  
  console.log('Auth request from:', {
    host,
    redirectUri,
    returnTo
  });

  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);

  // Create the response to redirect to StockX OAuth
  const response = NextResponse.redirect(
    `https://accounts.stockx.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=openid%20offline_access&audience=gateway.stockx.com`
  );

  // Set the state cookie with secure options
  const isProduction = !host.includes('localhost');
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: 600, // 10 minutes for longer auth flows
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