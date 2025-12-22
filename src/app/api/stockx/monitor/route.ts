import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getStockXApiCredentials, getUserIdFromRequest, validateApiCredentials } from '@/lib/utils/userApiKeyHelper';

function pickNumber(val: any): number | null {
  const n = typeof val === 'string' ? Number(val) : typeof val === 'number' ? val : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_PRICE_MONITOR === 'true') {
      return NextResponse.json(
        { error: 'Price Monitor is temporarily disabled' },
        { status: 503 }
      );
    }
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const variantId = searchParams.get('variantId');
    
    if (!productId || !variantId) {
      return NextResponse.json({ error: 'Product ID and Variant ID are required' }, { status: 400 });
    }

    const userId = getUserIdFromRequest(request);
    const credentials = await getStockXApiCredentials(userId);
    const validation = validateApiCredentials(credentials);
    if (!validation.isValid) {
      return NextResponse.json({ error: 'API credentials not configured', needsApiKeys: true }, { status: 400 });
    }

    const marketDataUrl = `https://api.stockx.com/v2/catalog/products/market-data?productId=${encodeURIComponent(
      productId
    )}&variantId=${encodeURIComponent(variantId)}`;
    let mdResponse = await fetch(marketDataUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': credentials.apiKey,
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    // Handle token refresh if needed
    if (mdResponse.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        mdResponse = await fetch(marketDataUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'X-API-Key': credentials.apiKey,
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
          }
        });

        const response = NextResponse.json({
          success: mdResponse.ok,
          data: mdResponse.ok ? await mdResponse.json() : null,
          status: mdResponse.status,
          timestamp: Date.now()
        });
        // Update tokens (even if market-data failed after refresh, we still want to persist refreshed cookies)
        setStockXTokenCookies(response, refreshResult.accessToken, refreshResult.refreshToken);
        return response;
      } else {
        return NextResponse.json({ error: 'Authentication expired' }, { status: 401 });
      }
    }

    if (!mdResponse.ok) {
      if (mdResponse.status === 401) {
        return NextResponse.json({ error: 'Authentication expired' }, { status: 401 });
      }
      throw new Error(`Market data failed: ${mdResponse.status}`);
    }

    const raw = await mdResponse.json();
    const variant = Array.isArray((raw as any)?.variants) ? (raw as any).variants[0] : null;
    const marketData = {
      lowestAskAmount: pickNumber(variant?.lowestAskAmount ?? (raw as any)?.lowestAskAmount),
      highestBidAmount: pickNumber(variant?.highestBidAmount ?? (raw as any)?.highestBidAmount),
      flexLowestAskAmount: pickNumber(variant?.flexLowestAskAmount ?? (raw as any)?.flexLowestAskAmount)
    };

    return NextResponse.json({
      success: true,
      data: {
        productId,
        variantId,
        marketData,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    console.error('Monitor API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_DISABLE_PRICE_MONITOR === 'true') {
      return NextResponse.json(
        { error: 'Price Monitor is temporarily disabled' },
        { status: 503 }
      );
    }
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { products } = body; // Array of {productId, variantId}
    
    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Products array is required' }, { status: 400 });
    }

    const userId = getUserIdFromRequest(request);
    const credentials = await getStockXApiCredentials(userId);
    const validation = validateApiCredentials(credentials);
    if (!validation.isValid) {
      return NextResponse.json({ error: 'API credentials not configured', needsApiKeys: true }, { status: 400 });
    }

    const results = [];
    let tokenRefreshed = false;
    let newAccessToken = accessToken;
    let newRefreshToken = refreshToken;
    const marketDataBaseUrl = 'https://api.stockx.com/v2/catalog/products/market-data';
    
    // Process each product (with rate limiting)
    for (const product of products) {
      try {
        const { productId, variantId } = product;

        const mdUrl = `${marketDataBaseUrl}?productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(
          variantId
        )}`;
        let mdResponse = await fetch(mdUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${newAccessToken}`,
            'X-API-Key': credentials.apiKey,
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
          }
        });

        // Handle token refresh on first 401
        if (mdResponse.status === 401 && refreshToken && !tokenRefreshed) {
          console.log('🔄 Token expired during batch, attempting refresh...');
          const refreshResult = await refreshStockXTokens(refreshToken);
          
          if (refreshResult.success && refreshResult.accessToken) {
            tokenRefreshed = true;
            newAccessToken = refreshResult.accessToken;
            newRefreshToken = refreshResult.refreshToken || refreshToken;
            
            // Retry with new token
            mdResponse = await fetch(mdUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${newAccessToken}`,
                'X-API-Key': credentials.apiKey,
                'Accept': 'application/json',
                'User-Agent': 'FlipFlow/1.0'
              }
            });
          }
        }

        if (mdResponse.ok) {
          const raw = await mdResponse.json();
          const variant = Array.isArray((raw as any)?.variants) ? (raw as any).variants[0] : null;
          const marketData = {
            lowestAskAmount: pickNumber(variant?.lowestAskAmount ?? (raw as any)?.lowestAskAmount),
            highestBidAmount: pickNumber(variant?.highestBidAmount ?? (raw as any)?.highestBidAmount),
            flexLowestAskAmount: pickNumber(variant?.flexLowestAskAmount ?? (raw as any)?.flexLowestAskAmount)
          };

          results.push({
            productId,
            variantId,
            marketData,
            timestamp: Date.now(),
            success: true
          });
        } else {
          results.push({
            productId,
            variantId,
            error: `API error: ${mdResponse.status}`,
            success: false
          });
        }
        
        // Rate limiting - wait 100ms between requests for faster processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.push({
          productId: product.productId,
          variantId: product.variantId,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    const response = NextResponse.json({
      success: true,
      results,
      timestamp: Date.now(),
      tokenRefreshed
    });

    // Update tokens if refreshed
    if (tokenRefreshed && newAccessToken) {
      setStockXTokenCookies(response, newAccessToken, newRefreshToken);
    }

    return response;

  } catch (error) {
    console.error('Batch monitor API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}