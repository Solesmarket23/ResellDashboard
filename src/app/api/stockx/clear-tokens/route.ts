import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    
    // Clear all StockX-related cookies
    const cookiesToClear = [
      'stockx_access_token',
      'stockx_refresh_token',
      'stockx_token_expires_at',
      'stockx_api_key'
    ];
    
    cookiesToClear.forEach(cookieName => {
      cookieStore.set(cookieName, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0, // Immediately expire
        path: '/'
      });
    });
    
    console.log('🧹 Cleared all StockX authentication tokens');
    
    return NextResponse.json({ 
      success: true, 
      message: 'All StockX tokens cleared successfully. Please re-authenticate.' 
    });
    
  } catch (error) {
    console.error('❌ Error clearing tokens:', error);
    return NextResponse.json(
      { error: 'Failed to clear tokens' },
      { status: 500 }
    );
  }
} 