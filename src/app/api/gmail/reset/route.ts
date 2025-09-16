import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    
    // Clear all Gmail-related cookies
    const cookiesToDelete = [
      'gmail_access_token',
      'gmail_refresh_token', 
      'gmail_connected',
      'gmail_connected_at',
      'gmail_email'
    ];

    const response = NextResponse.json({ 
      success: true, 
      message: 'Gmail connection reset successfully' 
    });

    // Delete each cookie
    cookiesToDelete.forEach(cookieName => {
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    });

    return response;

  } catch (error) {
    console.error('Error resetting Gmail connection:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset Gmail connection' },
      { status: 500 }
    );
  }
}
