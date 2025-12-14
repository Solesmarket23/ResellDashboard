import { NextRequest, NextResponse } from 'next/server';
import { getStockXApiCredentials, getUserIdFromRequest, validateApiCredentials } from '@/lib/utils/userApiKeyHelper';

export async function GET(request: NextRequest) {
  try {
    // Check for access token in cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const tokenExpiresAt = request.cookies.get('stockx_token_expires_at')?.value;
    const cookieMaxAgeSeconds = 2592000; // 30 days (cookie lifetime, not token lifetime)
    
    if (!accessToken) {
      return NextResponse.json({
        isAuthenticated: false,
        message: 'No access token found',
        hasRefreshToken: !!refreshToken,
        cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 }
      });
    }
    
    // Check if token is expired based on stored expiration time
    if (tokenExpiresAt) {
      const expiresAt = parseInt(tokenExpiresAt);
      if (Date.now() >= expiresAt) {
        return NextResponse.json({
          isAuthenticated: false,
          message: 'Token expired based on stored expiration time',
          needsReauth: false,
          hasRefreshToken: !!refreshToken,
          tokenExpired: true,
          token: {
            expiresAtMs: expiresAt,
            expiresAtIso: new Date(expiresAt).toISOString(),
            secondsRemaining: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
          },
          cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 }
        });
      }
    }

    // Get user ID from request
    const userId = getUserIdFromRequest(request);
    
    // Get API credentials (user-specific or global)
    const credentials = await getStockXApiCredentials(userId);
    const validation = validateApiCredentials(credentials);
    
    if (!validation.isValid) {
      return NextResponse.json({
        isAuthenticated: false,
        message: 'API credentials not configured',
        needsApiKeys: true
      });
    }

    // Make a simple API call to verify the token is still valid
    try {
      const response = await fetch('https://api.stockx.com/v2/catalog/search?query=test&limit=1', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-API-Key': credentials.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'FlipFlow/1.0'
        }
      });

      if (response.ok) {
        return NextResponse.json({
          isAuthenticated: true,
          message: 'Authentication valid',
          credentialsSource: credentials.source,
          userId: userId || 'anonymous',
          token: tokenExpiresAt
            ? (() => {
                const expiresAt = parseInt(tokenExpiresAt);
                return {
                  expiresAtMs: Number.isFinite(expiresAt) ? expiresAt : undefined,
                  expiresAtIso: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : undefined,
                  secondsRemaining: Number.isFinite(expiresAt) ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : undefined
                };
              })()
            : undefined,
          cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 }
        });
      } else if (response.status === 401) {
        // Token might be expired
        return NextResponse.json({
          isAuthenticated: false,
          message: 'Token expired or invalid',
          needsReauth: true,
          hasRefreshToken: !!refreshToken,
          cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 }
        });
      } else {
        return NextResponse.json({
          isAuthenticated: false,
          message: `API error: ${response.status}`,
          statusCode: response.status,
          cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 }
        });
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      return NextResponse.json({
        isAuthenticated: false,
        message: 'Failed to verify authentication',
        error: error instanceof Error ? error.message : 'Unknown error',
        cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 }
      });
    }

  } catch (error) {
    console.error('Auth status check error:', error);
    return NextResponse.json({
      isAuthenticated: false,
      message: 'Internal error checking authentication',
      error: error instanceof Error ? error.message : 'Unknown error',
      cookie: { maxAgeSeconds: 2592000, maxAgeDays: 2592000 / 86400 }
    });
  }
}