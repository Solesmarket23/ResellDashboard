import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that should remain public (for affiliate links to work)
const PUBLIC_ROUTES = [
  '/go/',
  '/api/go/',
  '/api/shorten',
  '/api/debug/', // Debug endpoints (safe; no secrets returned)
  '/_next/',
  '/favicon.ico',
  '/password-protect',  // Site password protection page
  '/onboarding',  // Onboarding page
  '/api/auth/verify',
  '/api/user/stockx-keys',  // User API key management
  '/',  // Landing page
  '/landing',  // Landing page route
  '/api/subscribe',  // Email subscription endpoint
  '/stockx-connected',  // OAuth success landing (no cookies when coming from StockX in-app Safari)
];

// Routes that require site password but not Firebase auth
const SITE_PASSWORD_ONLY_ROUTES = [
  '/login',  // Login/signup page - requires site password but not Firebase auth
  '/loading'  // Loading page after Gmail auth
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Log for debugging
  console.log('🔐 Middleware checking path:', pathname);
  
  // Check if user is authenticated via site password (used for conditional redirects even on public routes).
  // Important: browsers can store multiple cookies with the same name but different scopes (host-only vs domain),
  // and the order they are sent can vary. Treat as authenticated if ANY `site-auth` cookie is authenticated.
  const authCookies = request.cookies.getAll('site-auth');
  const isSiteAuthed = authCookies.some(c => c.value === 'authenticated');

  // If the user is already site-authenticated, don't send them back to the public landing page.
  // Keep them "inside" the app by default.
  if ((pathname === '/' || pathname === '/landing') && isSiteAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Check if this is a public route
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  if (isPublicRoute) {
    console.log('✅ Public route, allowing access');
    return NextResponse.next();
  }
  
  console.log('🍪 site-auth cookies:', authCookies.map(c => c.value).join(',') || '(none)');
  
  // Special handling for Gmail and StockX API routes - these should be accessible with site password
  if (pathname.startsWith('/api/gmail') || pathname.startsWith('/api/stockx')) {
    console.log('📧 API route detected:', pathname);
    if (isSiteAuthed) {
      console.log('✅ User has site password, allowing API access');
      return NextResponse.next();
    } else {
      console.log('❌ No site password for API route');
      const passwordUrl = new URL('/password-protect', request.url);
      passwordUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(passwordUrl);
    }
  }
  
  // Check if this route only requires site password
  const isSitePasswordOnlyRoute = SITE_PASSWORD_ONLY_ROUTES.some(route => pathname.startsWith(route));
  if (isSitePasswordOnlyRoute) {
    // For these routes, only check site password
    if (isSiteAuthed) {
      return NextResponse.next();
    } else {
      // No site password auth, redirect to password protection
      console.log('🔐 Middleware: No site password auth for login page, redirecting to password protection');
      const passwordUrl = new URL('/password-protect', request.url);
      passwordUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(passwordUrl);
    }
  }
  
  // For dashboard access, we need both site password AND Google authentication
  if (pathname.startsWith('/dashboard')) {
    // Check if user has site password authentication
    if (isSiteAuthed) {
      // User has site password, let them access the dashboard
      // The dashboard page will handle checking for Google authentication
      return NextResponse.next();
    } else {
      // No site password auth, redirect to password protection
      console.log('🔐 Middleware: No site password auth, redirecting to password protection');
      const passwordUrl = new URL('/password-protect', request.url);
      passwordUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(passwordUrl);
    }
  }
  
  // For other protected routes, site password is sufficient
  if (isSiteAuthed) {
    return NextResponse.next();
  }
  
  // Redirect to password protection page
  const passwordUrl = new URL('/password-protect', request.url);
  passwordUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(passwordUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api routes that should be public
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ],
};

