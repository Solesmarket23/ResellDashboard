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
        // Fetch market data using catalog search
        const searchResponse = await fetch(`https://api.stockx.com/v2/catalog/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
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

        if (!searchResponse.ok) {
          console.error(`Search failed for ${productId}:`, searchResponse.status);
          continue;
        }

        const searchData = await searchResponse.json();
        
        if (!searchData.hits || !searchData.hits.hits || searchData.hits.hits.length === 0) {
          console.error(`Product not found: ${productId}`);
          continue;
        }

        const product = searchData.hits.hits[0]._source;
        
        // Find the specific variant's market data
        let variantMarketData = null;
        if (product.market_data && product.market_data.variants) {
          variantMarketData = product.market_data.variants.find((v: any) => v.id === variantId);
        }
        
        if (variantMarketData) {
          results.push({
            productId,
            variantId,
            flexLowestAsk: variantMarketData.flex_lowest_ask_amount ? parseInt(variantMarketData.flex_lowest_ask_amount) : null,
            lowestAsk: variantMarketData.lowest_ask_amount ? parseInt(variantMarketData.lowest_ask_amount) : null,
            highestBid: variantMarketData.highest_bid_amount ? parseInt(variantMarketData.highest_bid_amount) : null,
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

    // Fetch market data using catalog search
    const searchUrl = `https://api.stockx.com/v2/catalog/search`;
    
    console.log(`💰 Fetching market data via search: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
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
    });

    console.log(`📊 Search response status: ${searchResponse.status}`);

    if (!searchResponse.ok) {
      console.log('❌ Search request failed:', searchResponse.status, searchResponse.statusText);
      const errorText = await searchResponse.text();
      console.log('Error details:', errorText);
      
      if (searchResponse.status === 401) {
        return NextResponse.json({ 
          error: 'Authentication failed',
          needAuth: true 
        }, { status: 401 });
      }
      
      return NextResponse.json({ 
        error: `Search request failed: ${searchResponse.status}`,
        details: errorText
      }, { status: searchResponse.status });
    }

    const searchData = await searchResponse.json();
    console.log('✅ Search response:', JSON.stringify(searchData, null, 2));

    // Extract flex ask from market data
    let flexAsk = null;
    
    if (searchData.hits && searchData.hits.hits && searchData.hits.hits.length > 0) {
      const product = searchData.hits.hits[0]._source;
      
      if (product.market_data && product.market_data.variants) {
        const variantData = product.market_data.variants.find((item: any) => item.id === variantId);
        if (variantData) {
          flexAsk = variantData.flex_lowest_ask_amount || variantData.lowest_ask_amount;
          console.log(`💰 Found flex ask for variant ${variantId}: $${flexAsk}`);
        }
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