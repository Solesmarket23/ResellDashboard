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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Log for debugging
  console.log('🔐 Middleware checking path:', pathname);
  
  // Check if this is a public route
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));
  if (isPublicRoute) {
    console.log('✅ Public route, allowing access');
    return NextResponse.next();
  }
  
  // Check if user is authenticated via site password
  const authCookie = request.cookies.get('site-auth');
  console.log('🍪 Auth cookie:', authCookie?.value);
  
  // Special handling for Gmail and StockX API routes - these should be accessible with site password
  if (pathname.startsWith('/api/gmail') || pathname.startsWith('/api/stockx')) {
    console.log('📧 API route detected:', pathname);
    if (authCookie?.value === 'authenticated') {
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