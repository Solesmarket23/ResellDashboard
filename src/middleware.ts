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
  '/google-login',  // Google login page
  '/onboarding',  // Onboarding page
  '/api/auth/verify',
  '/api/user/stockx-keys',  // User API key management
  '/',  // Landing page
  '/landing',  // Landing page route
  '/api/subscribe'  // Email subscription endpoint
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
  
  // For dashboard access, we need both site password AND Google authentication
  if (pathname.startsWith('/dashboard')) {
    // If user has site password but no Google auth, redirect to Google login
    if (authCookie?.value === 'authenticated') {
      // Let the client-side handle the Google auth check
      return NextResponse.next();
    } else {
      // No site password auth, redirect to login
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