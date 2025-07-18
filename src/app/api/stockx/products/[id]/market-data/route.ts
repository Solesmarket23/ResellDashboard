import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = params.id;
    
    // Get tokens from cookies
    let accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Not authenticated with StockX' },
        { status: 401 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'StockX API key not configured' },
        { status: 500 }
      );
    }

    console.log(`💰 Fetching product market data for: ${productId}`);
    
    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Make API request to get product market data (all variants with pricing)
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    
    let response = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
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
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });
        
        // Store the new access token for response
        accessToken = refreshResult.accessToken;
      } else {
        return NextResponse.json(
          { error: 'Authentication expired. Please re-authenticate with StockX.' },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Failed to fetch product market data:', {
        status: response.status,
        statusText: response.statusText,
        url: marketUrl,
        productId: productId,
        errorData: errorData
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch product market data',
          status: response.status,
          statusText: response.statusText,
          productId: productId,
          url: marketUrl,
          details: errorData
        },
        { status: response.status }
      );
    }

    // Parse the market data response
    const marketData = await response.json();
    const variants = Array.isArray(marketData) ? marketData : [];
    
    console.log(`✅ Product market data response:`, {
      isArray: Array.isArray(marketData),
      variantsCount: variants.length,
      sampleVariant: variants[0] || null,
      responseKeys: Object.keys(marketData || {})
    });

    // Transform market data to variants format
    const transformedVariants = variants.map((variant: any) => ({
      variantId: variant.variantId,
      variantValue: variant.variantValue || variant.size || 'Unknown',
      lowestAsk: variant.lowestAskAmount || 0,
      highestBid: variant.highestBidAmount || 0,
      currencyCode: variant.currencyCode || 'USD',
      productId: variant.productId,
      isFlexEligible: variant.isFlexEligible || false,
      isDirectEligible: variant.isDirectEligible || false
    }));

    // Create success response
    const successResponse = NextResponse.json({
      success: true,
      productId,
      variants: transformedVariants,
      hasVariants: variants.length > 0,
      source: 'market-data'
    });

    // Update tokens if refreshed
    if (accessToken !== request.cookies.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching product market data:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}