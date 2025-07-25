/**
 * StockX Token Manager
 * Handles token storage with expiration tracking
 */

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp when token expires
  issuedAt: number; // Unix timestamp when token was issued
}

/**
 * Calculate token expiration time
 * @param expiresIn - Seconds until expiration (from OAuth response)
 * @returns Unix timestamp when token expires
 */
export function calculateTokenExpiration(expiresIn: number): number {
  // StockX typically returns expires_in in seconds (e.g., 3600 for 1 hour)
  // We'll be conservative and expire 5 minutes early to ensure we refresh before actual expiry
  const bufferSeconds = 300; // 5 minutes
  const actualExpirySeconds = Math.max(0, expiresIn - bufferSeconds);
  return Date.now() + (actualExpirySeconds * 1000);
}

/**
 * Check if token is expired or about to expire
 * @param expiresAt - Unix timestamp when token expires
 * @returns true if token needs refresh
 */
export function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

/**
 * Create token data object from OAuth response
 */
export function createTokenData(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): TokenData {
  return {
    accessToken,
    refreshToken,
    expiresAt: calculateTokenExpiration(expiresIn),
    issuedAt: Date.now()
  };
}

/**
 * Get time until token expires in human-readable format
 */
export function getTokenTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;
  
  if (remaining <= 0) return 'Expired';
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Cookie options for token storage
 */
export const TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 2592000 // 30 days - cookie lifetime, not token lifetime
};