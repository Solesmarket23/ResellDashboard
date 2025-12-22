import { NextRequest, NextResponse } from 'next/server';
import { getStockXApiCredentials, getUserIdFromRequest, validateApiCredentials } from '@/lib/utils/userApiKeyHelper';

function intOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function computeVerifyTtlSeconds(upstreamStatus: number): number {
  // Reduce upstream hammering by caching "verification" results.
  // - 200: stable → cache longer
  // - 403/429: likely bot protection/rate limiting → cache longer to cool down
  // - 5xx: transient → cache briefly
  if (upstreamStatus === 200) return 20 * 60; // 20 minutes
  if (upstreamStatus === 403 || upstreamStatus === 429) return 30 * 60; // 30 minutes
  if (upstreamStatus >= 500) return 2 * 60; // 2 minutes
  return 10 * 60; // 10 minutes default
}

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

    // ---- Verification cache (prevents hammering StockX) ----
    // Some UIs poll this route frequently. Cache the result so we don't trigger PerimeterX/429s.
    const cachedAtMs = intOrNull(request.cookies.get('stockx_auth_verified_at')?.value);
    const cachedTtlS = intOrNull(request.cookies.get('stockx_auth_verified_ttl_s')?.value);
    const cachedUpstreamStatus = intOrNull(request.cookies.get('stockx_auth_verified_upstream_status')?.value);
    const cachedOk = request.cookies.get('stockx_auth_verified_ok')?.value === '1';
    const cachedWarning = request.cookies.get('stockx_auth_verified_warning')?.value === '1';
    const cachedMessage = request.cookies.get('stockx_auth_verified_message')?.value || '';
    const nowMs = Date.now();
    if (cachedAtMs && cachedTtlS && nowMs - cachedAtMs < cachedTtlS * 1000) {
      return NextResponse.json({
        isAuthenticated: true,
        verified: cachedOk ? true : cachedWarning ? false : undefined,
        warning: cachedWarning || undefined,
        message: cachedMessage || (cachedOk ? 'Authentication valid (cached)' : 'Connected (cached verification)'),
        upstreamStatusCode: cachedUpstreamStatus ?? undefined,
        cached: true,
        cachedAtMs,
        cachedTtlSeconds: cachedTtlS,
        credentialsSource: credentials.source,
        userId: userId || 'anonymous',
        hasRefreshToken: !!refreshToken,
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
    }

    // Make a simple API call to verify the token is still valid.
    // IMPORTANT: treat non-401 upstream failures as "verification failed" (not "logged out"),
    // otherwise transient 429/5xx issues will make the UI think StockX disconnected.
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
        const ttlS = computeVerifyTtlSeconds(200);
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax' as const,
          path: '/',
          maxAge: ttlS
        };
        const res = NextResponse.json({
          isAuthenticated: true,
          verified: true,
          message: 'Authentication valid',
          credentialsSource: credentials.source,
          userId: userId || 'anonymous',
          hasRefreshToken: !!refreshToken,
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
          cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 },
          cached: false,
          verificationTtlSeconds: ttlS
        });
        res.cookies.set('stockx_auth_verified_at', String(Date.now()), cookieOptions);
        res.cookies.set('stockx_auth_verified_ttl_s', String(ttlS), cookieOptions);
        res.cookies.set('stockx_auth_verified_upstream_status', '200', cookieOptions);
        res.cookies.set('stockx_auth_verified_ok', '1', cookieOptions);
        res.cookies.set('stockx_auth_verified_warning', '0', cookieOptions);
        res.cookies.set('stockx_auth_verified_message', 'Authentication valid (cached)', cookieOptions);
        return res;
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
        // Upstream returned a non-401 error (common: 429 rate limit, 403 bot protection, 5xx).
        // The presence of a token cookie means the user is still "connected" from our POV.
        // We report connected=true but mark verification as failed so the UI can warn.
        const status = response.status;
        const isRateLimited = status === 429;
        const isBlocked = status === 403;
        const isServerError = status >= 500;
        const ttlS = computeVerifyTtlSeconds(status);
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax' as const,
          path: '/',
          maxAge: ttlS
        };
        const message = isRateLimited
          ? 'Connected, but StockX verification was rate-limited (429)'
          : isBlocked
            ? 'Connected, but StockX verification was blocked (403)'
            : isServerError
              ? `Connected, but StockX verification failed (${status})`
              : `Connected, but StockX verification returned ${status}`;

        const res = NextResponse.json({
          isAuthenticated: true,
          verified: false,
          message,
          warning: true,
          upstreamStatusCode: status,
          needsReauth: false,
          hasRefreshToken: !!refreshToken,
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
          cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 },
          cached: false,
          verificationTtlSeconds: ttlS
        });
        // Cache warning result so frequent polling won't keep hitting StockX while blocked/limited.
        res.cookies.set('stockx_auth_verified_at', String(Date.now()), cookieOptions);
        res.cookies.set('stockx_auth_verified_ttl_s', String(ttlS), cookieOptions);
        res.cookies.set('stockx_auth_verified_upstream_status', String(status), cookieOptions);
        res.cookies.set('stockx_auth_verified_ok', '0', cookieOptions);
        res.cookies.set('stockx_auth_verified_warning', '1', cookieOptions);
        res.cookies.set('stockx_auth_verified_message', message, cookieOptions);
        return res;
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      const ttlS = computeVerifyTtlSeconds(500);
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: ttlS
      };
      const res = NextResponse.json({
        // Network / transient errors verifying with StockX should not flip the UI to "disconnected"
        // when we still have a token cookie.
        isAuthenticated: true,
        verified: false,
        warning: true,
        message: 'Connected, but failed to verify StockX authentication (network/transient error)',
        error: error instanceof Error ? error.message : 'Unknown error',
        needsReauth: false,
        hasRefreshToken: !!refreshToken,
        credentialsSource: credentials.source,
        userId: userId || 'anonymous',
        cookie: { maxAgeSeconds: cookieMaxAgeSeconds, maxAgeDays: cookieMaxAgeSeconds / 86400 },
        cached: false,
        verificationTtlSeconds: ttlS
      });
      // Cache transient failures briefly to avoid tight retry loops from the client.
      res.cookies.set('stockx_auth_verified_at', String(Date.now()), cookieOptions);
      res.cookies.set('stockx_auth_verified_ttl_s', String(ttlS), cookieOptions);
      res.cookies.set('stockx_auth_verified_upstream_status', '0', cookieOptions);
      res.cookies.set('stockx_auth_verified_ok', '0', cookieOptions);
      res.cookies.set('stockx_auth_verified_warning', '1', cookieOptions);
      res.cookies.set('stockx_auth_verified_message', 'Connected, but failed to verify StockX authentication (cached)', cookieOptions);
      return res;
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