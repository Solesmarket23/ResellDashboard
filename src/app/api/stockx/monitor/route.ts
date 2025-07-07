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

    // Fetch market data using catalog search
    const searchResponse = await fetch(
      `https://api.stockx.com/v2/catalog/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            bool: {
              must: [
                {
                  term: {
                    "product_id": productId
                  }
                }
              ]
            }
          },
          size: 1
        })
      }
    );

    if (!searchResponse.ok) {
      if (searchResponse.status === 401) {
        return NextResponse.json({ error: 'Authentication expired' }, { status: 401 });
      }
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.hits || !searchData.hits.hits || searchData.hits.hits.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const product = searchData.hits.hits[0]._source;
    
    // Find the specific variant's market data
    let variantMarketData = null;
    if (product.market_data && product.market_data.variants) {
      variantMarketData = product.market_data.variants.find((variant: any) => variant.id === variantId);
    }
    
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
        
        // Fetch market data using catalog search
        const searchResponse = await fetch(
          `https://api.stockx.com/v2/catalog/search`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: {
                bool: {
                  must: [
                    {
                      term: {
                        "product_id": productId
                      }
                    }
                  ]
                }
              },
              size: 1
            })
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          
          if (searchData.hits && searchData.hits.hits && searchData.hits.hits.length > 0) {
            const product = searchData.hits.hits[0]._source;
            let variantMarketData = null;
            
            if (product.market_data && product.market_data.variants) {
              variantMarketData = product.market_data.variants.find((variant: any) => variant.id === variantId);
            }
            
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
              error: 'Product not found',
              success: false
            });
          }
        } else {
          results.push({
            productId,
            variantId,
            error: `API error: ${searchResponse.status}`,
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