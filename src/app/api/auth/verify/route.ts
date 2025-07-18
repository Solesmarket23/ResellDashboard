import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    // Get password from environment variable or use default
    const sitePassword = process.env.SITE_PASSWORD || 'solesmarket2024';
    
    if (password === sitePassword) {
      // Generate a unique user ID based on the site password
      // This ensures the same "user" across all password-protected sessions
      const userId = createHash('sha256')
        .update(`solesmarket-user-${process.env.SITE_PASSWORD || 'default'}`)
        .digest('hex')
        .substring(0, 28); // Firebase UIDs are typically 28 chars
      
      // Set authentication cookie with user info
      const response = NextResponse.json({ 
        success: true,
        userId: userId,
        email: `user@solesmarket.com` // Default email for password-protected users
      });
      
      response.cookies.set('site-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      
      // Also set a user ID cookie that can be read client-side
      response.cookies.set('site-user-id', userId, {
        httpOnly: false, // Allow client-side access
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      
      return response;
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}