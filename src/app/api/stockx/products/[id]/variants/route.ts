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

    console.log(`🔍 Fetching variants for product: ${productId}`);

    // Make API request to get product variants
    const variantsUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants`;
    
    let response = await fetch(variantsUrl, {
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
        response = await fetch(variantsUrl, {
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
      console.error('❌ Failed to fetch variants:', response.status, errorData);
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch product variants',
          status: response.status,
          details: errorData
        },
        { status: response.status }
      );
    }

    // Parse the variants response
    const data = await response.json();
    console.log(`✅ Retrieved variants response`);

    // Parse the variants response - it's an array directly
    const variants = Array.isArray(data) ? data : (data.variants || []);
    console.log(`✅ Raw variants data:`, variants);
    
    // Transform variants to match our expected format
    const transformedVariants = variants.map((variant: any) => ({
      variantId: variant.variantId,
      variantValue: variant.variantValue || variant.variantName || 'Unknown',
      lowestAsk: variant.market?.lowestAsk || 0,
      highestBid: variant.market?.highestBid || 0,
      lastSale: variant.market?.lastSale || 0,
      salesLast72Hours: variant.market?.salesLast72Hours || 0,
      isFlexEligible: variant.isFlexEligible || false,
      isDirectEligible: variant.isDirectEligible || false
    }));

    // Create success response
    const successResponse = NextResponse.json({
      success: true,
      productId,
      variants: transformedVariants
    });

    // Update tokens if refreshed
    if (accessToken !== request.cookies.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching variants:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}