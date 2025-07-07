import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const { productIds } = await request.json();
  
  // Get access token from cookies
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
    return NextResponse.json(
      { error: 'Missing StockX API key' },
      { status: 500 }
    );
  }

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json(
      { error: 'Invalid product IDs' },
      { status: 400 }
    );
  }

  try {
    const results = [];
    
    for (const product of productIds) {
      const { productId, variantId } = product;
      
      try {
        // Fetch market data for this specific product
        const marketResponse = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}/market-data`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
          }
        });

        if (!marketResponse.ok) {
          console.error(`Market data failed for ${productId}:`, marketResponse.status);
          continue;
        }

        const marketData = await marketResponse.json();
        
        // Find the specific variant's market data
        const variantMarketData = marketData.find((v: any) => v.variantId === variantId);
        
        if (variantMarketData) {
          results.push({
            productId,
            variantId,
            flexLowestAsk: variantMarketData.flexLowestAskAmount ? parseInt(variantMarketData.flexLowestAskAmount) : null,
            lowestAsk: variantMarketData.lowestAskAmount ? parseInt(variantMarketData.lowestAskAmount) : null,
            highestBid: variantMarketData.highestBidAmount ? parseInt(variantMarketData.highestBidAmount) : null,
            timestamp: Date.now()
          });
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error fetching data for ${productId}:`, error);
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Flex monitor error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Flex Ask Monitor API called');
    
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const variantId = searchParams.get('variantId');
    
    if (!productId || !variantId) {
      return NextResponse.json({ 
        error: 'Missing productId or variantId parameters' 
      }, { status: 400 });
    }

    console.log(`📊 Fetching flex ask for product ${productId}, variant ${variantId}`);

    // Get stored tokens
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;

    if (!accessToken) {
      console.log('❌ No access token found');
      return NextResponse.json({ 
        error: 'Authentication required',
        needAuth: true 
      }, { status: 401 });
    }

    if (!apiKey) {
      console.log('❌ No API key configured');
      return NextResponse.json({ 
        error: 'API key not configured' 
      }, { status: 500 });
    }

    // First, get the market data for this specific variant
    const marketDataUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data?variants=${variantId}&currencyCode=USD`;
    
    console.log(`💰 Fetching market data: ${marketDataUrl}`);
    
    const marketResponse = await fetch(marketDataUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      }
    });

    console.log(`📊 Market data response status: ${marketResponse.status}`);

    if (!marketResponse.ok) {
      console.log('❌ Market data request failed:', marketResponse.status, marketResponse.statusText);
      const errorText = await marketResponse.text();
      console.log('Error details:', errorText);
      
      if (marketResponse.status === 401) {
        return NextResponse.json({ 
          error: 'Authentication failed',
          needAuth: true 
        }, { status: 401 });
      }
      
      return NextResponse.json({ 
        error: `Market data request failed: ${marketResponse.status}`,
        details: errorText
      }, { status: marketResponse.status });
    }

    const marketData = await marketResponse.json();
    console.log('✅ Market data response:', JSON.stringify(marketData, null, 2));

    // Extract flex ask from market data
    let flexAsk = null;
    
    if (marketData && Array.isArray(marketData) && marketData.length > 0) {
      const variantData = marketData.find(item => item.variantId === variantId);
      if (variantData) {
        flexAsk = variantData.flexLowestAskAmount || variantData.lowestAskAmount;
        console.log(`💰 Found flex ask for variant ${variantId}: $${flexAsk}`);
      }
    }

    if (!flexAsk) {
      console.log('⚠️ No flex ask found for this variant');
      return NextResponse.json({ 
        flexAsk: null,
        message: 'No flex ask available for this variant'
      });
    }

    return NextResponse.json({
      flexAsk: parseFloat(flexAsk),
      productId,
      variantId,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Flex monitor error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 