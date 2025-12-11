import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  
  try {
    const { productId, variantId } = await request.json();
    
    if (!productId || !variantId) {
      return NextResponse.json({
        success: false,
        error: 'Both productId and variantId are required',
        logs: ['❌ Missing productId or variantId']
      });
    }

    logs.push(`🔍 Testing Market Data:`);
    logs.push(`   Product ID: ${productId}`);
    logs.push(`   Variant ID: ${variantId}`);
    logs.push('');

    // Get StockX credentials
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

    if (!accessToken) {
      logs.push('❌ No StockX access token found');
      return NextResponse.json({
        success: false,
        error: 'Not authenticated with StockX',
        logs
      });
    }

    if (!apiKey) {
      logs.push('❌ No StockX API key configured');
      return NextResponse.json({
        success: false,
        error: 'StockX API key not configured',
        logs
      });
    }

    logs.push('✅ StockX credentials found');
    logs.push('');

    // Test the variant-specific market data endpoint
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`;
    
    logs.push(`💰 Fetching variant market data:`);
    logs.push(`   ${marketUrl}`);

    const marketResponse = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    logs.push(`📡 API response: ${marketResponse.status} ${marketResponse.statusText}`);

    if (!marketResponse.ok) {
      const errorText = await marketResponse.text();
      logs.push(`❌ Request failed: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `API returned ${marketResponse.status}: ${errorText}`,
        logs
      });
    }

    const marketData = await marketResponse.json();
    logs.push('✅ Market data received!');
    logs.push('');

    // Extract pricing data
    const lowestAskCents = parseInt(marketData.lowestAskAmount) || 0;
    const flexAskCents = parseInt(marketData.flexLowestAskAmount) || 0;
    const bidCents = parseInt(marketData.highestBidAmount) || 0;
    const lastSaleCents = parseInt(marketData.lastSaleAmount) || 0;

    const lowestAsk = lowestAskCents / 100;
    const flexAsk = flexAskCents / 100;
    const highestBid = bidCents / 100;
    const lastSale = lastSaleCents / 100;

    logs.push('📊 Pricing Data:');
    logs.push(`   Lowest Ask: $${lowestAsk}`);
    logs.push(`   Flex Ask: $${flexAsk}`);
    logs.push(`   Highest Bid: $${highestBid}`);
    logs.push(`   Last Sale: $${lastSale}`);
    logs.push('');
    logs.push(`✅ Best price to use: $${Math.min(lowestAsk, flexAsk) || lowestAsk}`);

    return NextResponse.json({
      success: true,
      productId,
      variantId,
      pricing: {
        lowestAsk,
        flexAsk,
        highestBid,
        lastSale,
        bestPrice: Math.min(lowestAsk, flexAsk) || lowestAsk
      },
      rawData: marketData,
      logs
    });

  } catch (error) {
    console.error('Test market data error:', error);
    logs.push(`❌ Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      logs
    }, { status: 500 });
  }
}

