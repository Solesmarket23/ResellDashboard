import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const variantId = searchParams.get('variantId');
    
    if (!productId || !variantId) {
      return NextResponse.json({ error: 'Product ID and Variant ID are required' }, { status: 400 });
    }

    // Fetch market data for the specific product variant
    const marketDataResponse = await fetch(
      `https://api.stockx.com/v2/catalog/products/${productId}/market-data`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!marketDataResponse.ok) {
      if (marketDataResponse.status === 401) {
        return NextResponse.json({ error: 'Authentication expired' }, { status: 401 });
      }
      throw new Error(`Market data fetch failed: ${marketDataResponse.status}`);
    }

    const marketData = await marketDataResponse.json();
    
    // Find the specific variant's market data
    const variantMarketData = marketData.find((item: any) => item.variantId === variantId);
    
    if (!variantMarketData) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    // Also fetch basic product info
    const productResponse = await fetch(
      `https://api.stockx.com/v2/catalog/products/${productId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let productInfo = {};
    if (productResponse.ok) {
      productInfo = await productResponse.json();
    }

    return NextResponse.json({
      success: true,
      data: {
        productId,
        variantId,
        productInfo,
        marketData: variantMarketData,
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
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { products } = body; // Array of {productId, variantId}
    
    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Products array is required' }, { status: 400 });
    }

    const results = [];
    
    // Process each product (with rate limiting)
    for (const product of products) {
      try {
        const { productId, variantId } = product;
        
        // Fetch market data
        const marketDataResponse = await fetch(
          `https://api.stockx.com/v2/catalog/products/${productId}/market-data`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (marketDataResponse.ok) {
          const marketData = await marketDataResponse.json();
          const variantMarketData = marketData.find((item: any) => item.variantId === variantId);
          
          if (variantMarketData) {
            results.push({
              productId,
              variantId,
              marketData: variantMarketData,
              timestamp: Date.now(),
              success: true
            });
          } else {
            results.push({
              productId,
              variantId,
              error: 'Variant not found',
              success: false
            });
          }
        } else {
          results.push({
            productId,
            variantId,
            error: `API error: ${marketDataResponse.status}`,
            success: false
          });
        }
        
        // Rate limiting - wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        results.push({
          productId: product.productId,
          variantId: product.variantId,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Batch monitor API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 