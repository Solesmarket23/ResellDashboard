import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const variantId = searchParams.get('variantId');

  if (!productId || !variantId) {
    return NextResponse.json({ error: 'productId and variantId are required' }, { status: 400 });
  }

  try {
    // Get access token from cookies (same as search route)
    const accessToken = request.cookies.get('stockx_access_token')?.value;
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
    
    const response = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (!response.ok) {
      console.error('StockX API error:', response.status, response.statusText);
      
      if (response.status === 401) {
        return NextResponse.json(
          { 
            error: 'Authentication failed', 
            message: 'Please re-authenticate with StockX',
            authRequired: true
          },
          { status: 401 }
        );
      }
      
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
    return NextResponse.json({
      productId: productId,
      variantId: variantId,
      highestBidAmount: variantData.highestBidAmount,
      lowestAskAmount: variantData.lowestAskAmount,
      flexLowestAskAmount: variantData.flexLowestAskAmount,
      currencyCode: variantData.currencyCode || 'USD'
    });

  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 