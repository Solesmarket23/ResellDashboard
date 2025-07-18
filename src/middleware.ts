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
  '/login',
  '/onboarding',  // Onboarding page
  '/api/auth/verify',
  '/api/user/stockx-keys',  // User API key management
  '/',  // Landing page
  '/landing',  // Landing page route
  '/api/subscribe'  // Email subscription endpoint
];

// Routes that require site password but not Google auth
const SITE_PASSWORD_ONLY_ROUTES = [
  '/google-login'  // Google login page - requires site password but not Google auth
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
  
  // Check if this route only requires site password
  const isSitePasswordOnlyRoute = SITE_PASSWORD_ONLY_ROUTES.some(route => pathname.startsWith(route));
  if (isSitePasswordOnlyRoute) {
    // For these routes, only check site password
    if (authCookie?.value === 'authenticated') {
      return NextResponse.next();
    } else {
      // No site password auth, redirect to login
      console.log('🔐 Middleware: No site password auth for google-login, redirecting to login');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
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
      // No site password auth, redirect to login
      console.log('🔐 Middleware: No site password auth, redirecting to login');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  
  // For other protected routes, site password is sufficient
  if (authCookie?.value === 'authenticated') {
    return NextResponse.next();
  }
  
  // Redirect to login page
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
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