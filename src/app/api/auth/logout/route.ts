import { NextResponse } from 'next/server';

export async function POST() {
  // Clear the authentication cookie
  const response = NextResponse.json({ success: true });
  response.cookies.set('site-auth', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
  });
  return response;
}