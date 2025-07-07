import { NextRequest, NextResponse } from 'next/server';

// Helper function to fetch product variants with retry logic
async function fetchProductVariants(productId: string, accessToken: string, apiKey: string, retries = 2) {
  try {
    const variantsUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants`;
    console.log(`📏 Fetching variants for ${productId}: ${variantsUrl}`);
    
    const response = await fetch(variantsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Variants response for ${productId}:`, data.length > 0 ? `${data.length} variants` : 'no variants');
      return Array.isArray(data) ? data : (data.variants || []);
    } else if (response.status === 429 && retries > 0) {
      console.log(`⚠️ Variants rate limited, retrying in 2 seconds... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await fetchProductVariants(productId, accessToken, apiKey, retries - 1);
    } else {
      console.log(`❌ Variants failed: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.log(`❌ Variants error:`, error);
    return [];
  }
}

// Helper function to fetch market data for pricing
async function fetchMarketData(productId: string, accessToken: string, apiKey: string, retries = 2) {
  try {
    const marketDataUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    console.log(`💰 Fetching market data for ${productId}: ${marketDataUrl}`);
    
    const response = await fetch(marketDataUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Market data response for ${productId}:`, data.length > 0 ? `${data.length} market entries` : 'no market data');
      return Array.isArray(data) ? data : (data.market || []);
    } else if (response.status === 429 && retries > 0) {
      console.log(`⚠️ Market data rate limited, retrying in 2 seconds... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await fetchMarketData(productId, accessToken, apiKey, retries - 1);
    } else {
      console.log(`❌ Market data failed: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.log(`❌ Market data error:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || '';
  const limit = parseInt(searchParams.get('limit') || '10');

  console.log(`🔍 Catalog search for: ${query}`);

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

  if (!query.trim()) {
    return NextResponse.json(
      { error: 'Query parameter required' },
      { status: 400 }
    );
  }

  try {
    // Step 1: Search for products
    const searchApiParams = new URLSearchParams({
      query: query,
      pageNumber: '1',
      pageSize: Math.min(limit, 20).toString()
    });

    const searchUrl = `https://api.stockx.com/v2/catalog/search?${searchApiParams.toString()}`;
    console.log(`🔍 Searching: ${searchUrl}`);

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log(`❌ Search failed:`, errorText);
      return NextResponse.json(
        { 
          error: 'Search failed', 
          message: 'Failed to search StockX catalog',
          statusCode: searchResponse.status
        },
        { status: searchResponse.status }
      );
    }

    const searchData = await searchResponse.json();
    let products = searchData.products || [];
    
    console.log(`✅ Found ${products.length} products in search`);

    if (products.length === 0) {
      return NextResponse.json({
        products: [],
        totalCount: 0,
        message: `No products found for "${query}"`
      });
    }

    // Step 2: Fetch variants and market data for each product
    const enrichedProducts = [];
    const processLimit = Math.min(products.length, 5); // Limit to avoid rate limits

    for (let i = 0; i < processLimit; i++) {
      const product = products[i];
      console.log(`📦 Processing ${i+1}/${processLimit}: ${product.title}`);

      try {
        // Fetch variants and market data in parallel
        const [variants, marketData] = await Promise.all([
          fetchProductVariants(product.productId, accessToken, apiKey),
          fetchMarketData(product.productId, accessToken, apiKey)
        ]);

        // Create variant map for market data lookup
        const variantMap = new Map();
        if (variants?.length) {
          variants.forEach(variant => {
            variantMap.set(variant.variantId, {
              id: variant.variantId,
              size: variant.variantValue || 'One Size',
              sizeChart: variant.sizeChart
            });
          });
        }

        // Create market data map for pricing lookup
        const marketMap = new Map();
        if (marketData?.length) {
          marketData.forEach(market => {
            marketMap.set(market.variantId, {
              lowestAsk: parseInt(market.lowestAskAmount) || 0,
              flexLowestAsk: parseInt(market.flexLowestAskAmount) || 0,
              highestBid: parseInt(market.highestBidAmount) || 0
            });
          });
        }

        // Combine variants with market data
        const enrichedVariants = [];
        if (variants?.length) {
          variants.forEach(variant => {
            const market = marketMap.get(variant.variantId) || {};
            enrichedVariants.push({
              id: variant.variantId,
              size: variant.variantValue || 'One Size',
              sizeChart: variant.sizeChart,
              lowestAsk: market.lowestAsk || 0,
              flexLowestAsk: market.flexLowestAsk || 0,
              highestBid: market.highestBid || 0
            });
          });
        }

        // Create enriched product with variants and pricing
        const enrichedProduct = {
          id: product.productId,
          productId: product.productId,
          name: product.title,
          title: product.title,
          brand: product.brand,
          urlKey: product.urlKey,
          category: product.category,
          description: product.description,
          image: product.image || '/placeholder-shoe.png',
          variants: enrichedVariants,
          // Product-level attributes
          colorway: product.productAttributes?.colorway || null,
          releaseDate: product.productAttributes?.releaseDate || null,
          retailPrice: product.productAttributes?.retailPrice || null
        };

        enrichedProducts.push(enrichedProduct);

        // Add delay to avoid rate limiting
        if (i < processLimit - 1) {
          console.log(`⏳ Waiting 1000ms to avoid rate limits...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Error processing ${product.title}:`, error);
        // Add product without variants if there's an error
        enrichedProducts.push({
          id: product.productId,
          productId: product.productId,
          name: product.title,
          title: product.title,
          brand: product.brand,
          urlKey: product.urlKey,
          category: product.category,
          description: product.description,
          image: product.image || '/placeholder-shoe.png',
          variants: [],
          colorway: product.productAttributes?.colorway || null,
          releaseDate: product.productAttributes?.releaseDate || null,
          retailPrice: product.productAttributes?.retailPrice || null
        });
      }
    }

    console.log(`✅ Catalog search response: { products: ${enrichedProducts.length}, totalPages: ${searchData.totalPages}, totalCount: ${searchData.totalCount} }`);

    return NextResponse.json({
      products: enrichedProducts,
      totalCount: searchData.totalCount || enrichedProducts.length,
      totalPages: searchData.totalPages,
      message: `Found ${enrichedProducts.length} products for "${query}"`
    });

  } catch (error) {
    console.error('❌ Catalog search error:', error);
    return NextResponse.json(
      { 
        error: 'Search failed', 
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
} 