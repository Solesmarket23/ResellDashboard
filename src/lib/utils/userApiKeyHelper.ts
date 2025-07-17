import { getUserStockXKeys } from '@/lib/firebase/userApiKeys';

/**
 * Get API credentials for StockX API calls
 * Priority: User-specific keys > Global environment variables
 */
export async function getStockXApiCredentials(userId?: string): Promise<{
  apiKey: string;
  clientId?: string;
  clientSecret?: string;
  source: 'user' | 'global' | 'none';
}> {
  // If no userId provided, use global credentials
  if (!userId) {
    const globalApiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;
    return {
      apiKey: globalApiKey || '',
      clientId: process.env.STOCKX_CLIENT_ID,
      clientSecret: process.env.STOCKX_CLIENT_SECRET,
      source: globalApiKey ? 'global' : 'none'
    };
  }

  try {
    // Try to get user-specific API keys first
    const userKeys = await getUserStockXKeys(userId);
    
    if (userKeys.isConfigured && userKeys.apiKey) {
      return {
        apiKey: userKeys.apiKey,
        clientId: userKeys.clientId,
        clientSecret: userKeys.clientSecret,
        source: 'user'
      };
    }
  } catch (error) {
    console.warn('Failed to get user API keys, falling back to global:', error);
  }

  // Fallback to global environment variables
  const globalApiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;
  return {
    apiKey: globalApiKey || '',
    clientId: process.env.STOCKX_CLIENT_ID,
    clientSecret: process.env.STOCKX_CLIENT_SECRET,
    source: globalApiKey ? 'global' : 'none'
  };
}

/**
 * Get user ID from request cookies or headers
 */
export function getUserIdFromRequest(request: Request): string | undefined {
  // Try to get from cookies first
  const cookies = request.headers.get('cookie');
  if (cookies) {
    const siteUserIdMatch = cookies.match(/site-user-id=([^;]+)/);
    if (siteUserIdMatch) {
      return decodeURIComponent(siteUserIdMatch[1]);
    }
  }

  // Try to get from headers (for API calls)
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return userId;
  }

  return undefined;
}

/**
 * Validate that we have valid API credentials
 */
export function validateApiCredentials(credentials: {
  apiKey: string;
  source: 'user' | 'global' | 'none';
}): { isValid: boolean; error?: string } {
  if (!credentials.apiKey) {
    return {
      isValid: false,
      error: credentials.source === 'none' 
        ? 'No StockX API credentials configured' 
        : 'Invalid API credentials'
    };
  }

  return { isValid: true };
} 