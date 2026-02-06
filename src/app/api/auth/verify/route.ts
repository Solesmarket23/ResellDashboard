import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { password, remember } = await request.json();
    
    // Get password from environment variable (do not hardcode secrets in the repo)
    const sitePassword = process.env.SITE_PASSWORD;
    if (!sitePassword) {
      return NextResponse.json(
        { error: 'SITE_PASSWORD is not configured on the server' },
        { status: 500 }
      );
    }
    
    if (password === sitePassword) {
      // Generate a unique user ID based on the site password
      // This ensures the same "user" across all password-protected sessions
      const userId = createHash('sha256')
        .update(`solesmarket-user-${sitePassword}`)
        .digest('hex')
        .substring(0, 28); // Firebase UIDs are typically 28 chars
      
      // Set authentication cookie with user info
      const response = NextResponse.json({ 
        success: true,
        userId: userId,
        email: `user@solesmarket.com` // Default email for password-protected users
      });
      
      const shouldRemember = remember !== false;
      // Ensure cookies work across both `solesmarket.com` and `www.solesmarket.com` in production.
      const cookieDomain = process.env.NODE_ENV === 'production' ? '.solesmarket.com' : undefined;

      response.cookies.set('site-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain ? { domain: cookieDomain } : {}),
        ...(shouldRemember ? { maxAge: 60 * 60 * 24 * 30 } : {}), // 30 days or session
      });
      
      // Also set a user ID cookie that can be read client-side
      response.cookies.set('site-user-id', userId, {
        httpOnly: false, // Allow client-side access
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain ? { domain: cookieDomain } : {}),
        ...(shouldRemember ? { maxAge: 60 * 60 * 24 * 30 } : {}), // 30 days or session
      });
      
      return response;
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}