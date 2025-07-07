import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const variantId = searchParams.get('variantId');

  if (!productId || !variantId) {
    return NextResponse.json({ error: 'productId and variantId are required' }, { status: 400 });
  }

  try {
    const stockxApiKey = process.env.STOCKX_API_KEY;
    if (!stockxApiKey) {
      return NextResponse.json({ error: 'StockX API key not configured' }, { status: 500 });
    }

    const searchUrl = `https://api.stockx.com/v2/catalog/search`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stockxApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'StockX/2.0'
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
    });

    if (!response.ok) {
      console.error('StockX API error:', response.status, response.statusText);
      return NextResponse.json({ error: 'Failed to fetch market data' }, { status: response.status });
    }

    const searchData = await response.json();
    
    if (!searchData.hits || !searchData.hits.hits || searchData.hits.hits.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const product = searchData.hits.hits[0]._source;
    
    // Get market data for the specific variant
    if (!product.market_data || !product.market_data.variants) {
      return NextResponse.json({ error: 'Market data not available' }, { status: 404 });
    }

    const variantData = product.market_data.variants.find((variant: any) => variant.id === variantId);
    
    if (!variantData) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    // Return the specific variant data
    return NextResponse.json({
      productId: productId,
      variantId: variantId,
      highestBidAmount: variantData.highest_bid_amount,
      lowestAskAmount: variantData.lowest_ask_amount,
      flexLowestAskAmount: variantData.flex_lowest_ask_amount,
      currencyCode: variantData.currency_code || 'USD'
    });

  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 