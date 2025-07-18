import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const variantId = searchParams.get('variantId');

  if (!productId || !variantId) {
    return NextResponse.json({ error: 'productId and variantId are required' }, { status: 400 });
  }

  try {
    // Get access token from cookies (same as search route)
    let accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;

    if (!accessToken) {
      return NextResponse.json(
        { 
          error: 'No access token found', 
          message: 'Please authenticate with StockX first',
          authRequired: true
        },
        { status: 401 }
      );
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'StockX API key not configured' }, { status: 500 });
    }

    // Use the same endpoint structure as the working search route
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    console.log(`💰 Fetching market data: ${marketUrl}`);
    
    let response = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        response = await fetch(marketUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
          }
        });
        
        // Store the new access token for later use
        accessToken = refreshResult.accessToken;
      } else {
        return NextResponse.json(
          { 
            error: 'Authentication failed', 
            message: 'Please re-authenticate with StockX',
            authRequired: true
          },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      console.error('StockX API error:', response.status, response.statusText);
      return NextResponse.json({ error: 'Failed to fetch market data' }, { status: response.status });
    }

    const marketData = await response.json();
    console.log(`✅ Market data response:`, marketData);
    
    // Find the specific variant data
    const variantData = Array.isArray(marketData) 
      ? marketData.find((item: any) => item.variantId === variantId)
      : null;

    if (!variantData) {
      return NextResponse.json({ error: 'Variant not found in market data' }, { status: 404 });
    }

    // Return the specific variant data in the expected format
    const successResponse = NextResponse.json({
      productId: productId,
      variantId: variantId,
      highestBidAmount: variantData.highestBidAmount,
      lowestAskAmount: variantData.lowestAskAmount,
      flexLowestAskAmount: variantData.flexLowestAskAmount,
      currencyCode: variantData.currencyCode || 'USD'
    });

    // If we refreshed the token, set the new cookies
    if (accessToken !== request.cookies.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken!);
    }

    return successResponse;

  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 