import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check for StockX tokens in cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    
    // Simple check - if tokens exist, consider authenticated
    // In a production app, you might want to validate the token with StockX
    const isAuthenticated = !!(accessToken && refreshToken);
    
    return NextResponse.json({
      authenticated: isAuthenticated,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken
    });
    
  } catch (error) {
    console.error('Error checking StockX auth status:', error);
    return NextResponse.json(
      { 
        authenticated: false,
        error: 'Failed to check authentication status' 
      },
      { status: 500 }
    );
  }
}