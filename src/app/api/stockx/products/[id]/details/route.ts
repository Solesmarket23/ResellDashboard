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

    console.log(`🔍 Fetching product details for: ${productId}`);
    
    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Make API request to get product details
    const productUrl = `https://api.stockx.com/v2/catalog/products/${productId}`;
    
    let response = await fetch(productUrl, {
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
        response = await fetch(productUrl, {
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
      console.error('❌ Failed to fetch product details:', {
        status: response.status,
        statusText: response.statusText,
        url: productUrl,
        productId: productId,
        errorData: errorData
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch product details',
          status: response.status,
          statusText: response.statusText,
          productId: productId,
          url: productUrl,
          details: errorData
        },
        { status: response.status }
      );
    }

    // Parse the product details response
    const productData = await response.json();
    console.log('✅ Product details retrieved:', {
      productId: productData.productId,
      productType: productData.productType,
      title: productData.title,
      hasSizeChart: !!productData.sizeChart,
      availableConversions: productData.sizeChart?.availableConversions?.length || 0
    });

    // Create success response
    const successResponse = NextResponse.json({
      success: true,
      productId,
      productData: {
        productId: productData.productId,
        productType: productData.productType,
        title: productData.title,
        brand: productData.brand,
        urlKey: productData.urlKey,
        styleId: productData.styleId,
        sizeChart: productData.sizeChart,
        productAttributes: productData.productAttributes,
        // Check if this product should have variants
        shouldHaveVariants: productData.productType === 'sneakers' || 
                          productData.productType === 'shoes' || 
                          productData.productType === 'apparel' ||
                          (productData.sizeChart?.availableConversions?.length > 0),
        hasVariants: productData.sizeChart?.availableConversions?.length > 0
      }
    });

    // Update tokens if refreshed
    if (accessToken !== request.cookies.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching product details:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}