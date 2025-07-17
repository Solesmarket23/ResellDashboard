import { NextResponse } from 'next/server';

export async function POST() {
  // Clear the authentication cookies
  const response = NextResponse.json({ success: true });
  
  // Clear site auth cookie
  response.cookies.set('site-auth', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
  });
  
  // Clear site user ID cookie
  response.cookies.set('site-user-id', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
  });
  
  return response;
}