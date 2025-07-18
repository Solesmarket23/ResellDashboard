import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from './tokenRefresh';
import { NextResponse } from 'next/server';

interface StockXApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

interface StockXApiResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  authRequired?: boolean;
  tokenRefreshed?: boolean;
}

/**
 * Makes authenticated requests to StockX API with automatic token refresh
 */
export async function stockXApiRequest<T = any>(
  url: string,
  options: StockXApiOptions = {}
): Promise<StockXApiResult<T>> {
  const cookieStore = cookies();
  let accessToken = cookieStore.get('stockx_access_token')?.value;
  const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

  if (!accessToken || !refreshToken) {
    return {
      success: false,
      error: 'No authentication tokens found',
      authRequired: true
    };
  }

  if (!apiKey) {
    return {
      success: false,
      error: 'Missing StockX API key'
    };
  }

  // Default headers
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'FlipFlow/1.0',
    ...options.headers
  };

  try {
    // First attempt with current access token
    let response = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    // If unauthorized, try refreshing the token
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Access token expired, attempting refresh...');
      
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        console.log('✅ Token refreshed successfully');
        
        // Update the access token for retry
        accessToken = refreshResult.accessToken;
        headers['Authorization'] = `Bearer ${accessToken}`;
        
        // Retry the request with new token
        response = await fetch(url, {
          ...options,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (response.ok) {
          const data = await response.json();
          
          return {
            success: true,
            data,
            tokenRefreshed: true
          };
        }
      } else {
        console.error('❌ Token refresh failed');
        return {
          success: false,
          error: 'Token refresh failed',
          authRequired: true
        };
      }
    }

    // Handle response
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data
      };
    } else {
      const errorText = await response.text();
      console.error(`StockX API Error (${response.status}):`, errorText);
      
      return {
        success: false,
        error: `API request failed: ${response.status}`,
        authRequired: response.status === 401
      };
    }
  } catch (error) {
    console.error('StockX API request error:', error);
    return {
      success: false,
      error: 'Network or server error'
    };
  }
}

/**
 * Creates a NextResponse with updated token cookies if needed
 */
export function createResponseWithTokens(
  data: any,
  tokenRefreshed?: boolean,
  newTokens?: { accessToken: string; refreshToken?: string }
): NextResponse {
  const response = NextResponse.json(data);
  
  if (tokenRefreshed && newTokens?.accessToken) {
    setStockXTokenCookies(response, newTokens.accessToken, newTokens.refreshToken);
  }
  
  return response;
}