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

    const marketDataUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    
    const response = await fetch(marketDataUrl, {
      headers: {
        'Authorization': `Bearer ${stockxApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'StockX/2.0'
      }
    });

    if (!response.ok) {
      console.error('StockX API error:', response.status, response.statusText);
      return NextResponse.json({ error: 'Failed to fetch market data' }, { status: response.status });
    }

    const marketData = await response.json();
    
    // Find the specific variant data
    const variantData = marketData.find((item: any) => item.variantId === variantId);
    
    if (!variantData) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    // Return the specific variant data
    return NextResponse.json({
      productId: variantData.productId,
      variantId: variantData.variantId,
      highestBidAmount: variantData.highestBidAmount,
      lowestAskAmount: variantData.lowestAskAmount,
      flexLowestAskAmount: variantData.flexLowestAskAmount,
      currencyCode: variantData.currencyCode
    });

  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 