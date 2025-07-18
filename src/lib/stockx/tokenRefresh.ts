import { NextResponse } from 'next/server';

interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export async function refreshStockXTokens(refreshToken: string): Promise<TokenRefreshResult> {
  try {
    const clientId = process.env.STOCKX_CLIENT_ID;
    const clientSecret = process.env.STOCKX_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return {
        success: false,
        error: 'Missing OAuth credentials'
      };
    }
    
    const refreshResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        audience: 'gateway.stockx.com'
      })
    });

    if (refreshResponse.ok) {
      const tokenData = await refreshResponse.json();
      
      return {
        success: true,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken // Some providers don't return new refresh token
      };
    } else {
      const errorText = await refreshResponse.text();
      console.error('Token refresh failed:', errorText);
      
      return {
        success: false,
        error: `Token refresh failed: ${refreshResponse.status}`
      };
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    return {
      success: false,
      error: 'Token refresh exception'
    };
  }
}

// Cookie options for consistent token storage
export const STOCKX_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 2592000 // 30 days in seconds
};

// Helper to set tokens with consistent options
export function setStockXTokenCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken?: string
) {
  response.cookies.set('stockx_access_token', accessToken, STOCKX_COOKIE_OPTIONS);
  
  if (refreshToken) {
    response.cookies.set('stockx_refresh_token', refreshToken, STOCKX_COOKIE_OPTIONS);
  }
  
  return response;
}