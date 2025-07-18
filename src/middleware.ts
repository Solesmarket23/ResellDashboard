import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple password protection
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'solesmarket2024';

// Routes that should remain public (for affiliate links to work)
const PUBLIC_ROUTES = [
  '/go/',
  '/api/go/',
  '/api/shorten',
  '/_next/',
  '/favicon.ico',
  '/password-protect',  // Site password protection page
  '/onboarding',  // Onboarding page
  '/api/auth/verify',
  '/api/user/stockx-keys',  // User API key management
  '/',  // Landing page
  '/landing',  // Landing page route
  '/api/subscribe'  // Email subscription endpoint
];

// Routes that require site password but not Firebase auth
const SITE_PASSWORD_ONLY_ROUTES = [
  '/login',  // Login/signup page - requires site password but not Firebase auth
  '/loading'  // Loading page after Gmail auth
];

// API routes that should be accessible with just site password (for authenticated users)
const AUTHENTICATED_API_ROUTES = [
  '/api/gmail/',  // All Gmail API routes
  '/api/stockx/',  // All StockX API routes
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if this is a public route
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  if (isPublicRoute) {
    return NextResponse.next();
  }
  
  // Check if user is authenticated via site password
  const authCookie = request.cookies.get('site-auth');
  
  // Check if this is an authenticated API route
  const isAuthenticatedApiRoute = AUTHENTICATED_API_ROUTES.some(route => pathname.startsWith(route));
  if (isAuthenticatedApiRoute) {
    // For API routes, only require site password
    if (authCookie?.value === 'authenticated') {
      return NextResponse.next();
    } else {
      // No site password auth, redirect to password protection
      console.log('🔐 Middleware: No site password auth for API route, redirecting to password protection');
      const passwordUrl = new URL('/password-protect', request.url);
      passwordUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(passwordUrl);
    }
  }
  
  // Check if this route only requires site password
  const isSitePasswordOnlyRoute = SITE_PASSWORD_ONLY_ROUTES.some(route => pathname.startsWith(route));
  if (isSitePasswordOnlyRoute) {
    // For these routes, only check site password
    if (authCookie?.value === 'authenticated') {
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
    if (authCookie?.value === 'authenticated') {
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
  if (authCookie?.value === 'authenticated') {
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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};