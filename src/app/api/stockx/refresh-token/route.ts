import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
    
    if (!refreshToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No refresh token found' 
      }, { status: 401 });
    }
    
    console.log('🔄 Attempting to refresh StockX tokens...');
    const refreshResult = await refreshStockXTokens(refreshToken);
    
    if (refreshResult.success && refreshResult.accessToken) {
      console.log('✅ StockX tokens refreshed successfully');
      
      // Create response with new tokens
      const response = NextResponse.json({ 
        success: true,
        message: 'Tokens refreshed successfully'
      });
      
      // Set the new tokens as cookies
      setStockXTokenCookies(
        response, 
        refreshResult.accessToken, 
        refreshResult.refreshToken || refreshToken
      );
      
      // Also set the expiration time (assume 1 hour if not provided)
      const expiresIn = 3600; // StockX typically gives 1 hour tokens
      const expiresAt = Date.now() + ((expiresIn - 300) * 1000); // Subtract 5 minutes for buffer
      response.cookies.set('stockx_token_expires_at', expiresAt.toString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 2592000
      });
      
      return response;
    } else {
      console.error('❌ Token refresh failed:', refreshResult.error);
      return NextResponse.json({ 
        success: false, 
        error: refreshResult.error || 'Token refresh failed',
        needsReauth: true
      }, { status: 401 });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal error during token refresh' 
    }, { status: 500 });
  }
}