import { NextRequest, NextResponse } from 'next/server';

// Helper function to get product image URL - since StockX images aren't publicly accessible, use placeholder
function getProductImageUrl(product: any): string {
  // StockX images require authentication and aren't publicly accessible
  // Use placeholder image for now
  return '/placeholder-shoe.png';
}

// Helper function to get product image URL with fallbacks for better reliability
function getProductImageUrlWithFallbacks(product: any): string[] {
  // Since StockX images aren't publicly accessible, return placeholder options
  return [
    '/placeholder-shoe.png'
  ];
}

// Helper function to generate StockX product URL with size
function generateStockXUrl(urlKey: string, size?: string): string {
  if (urlKey) {
    const baseUrl = `https://stockx.com/${urlKey}`;
    if (size && size !== 'One Size' && size !== 'Unknown') {
      // Add size parameter to URL for direct linking to specific size
      return `${baseUrl}?size=${encodeURIComponent(size)}`;
    }
    return baseUrl;
  }
  return 'https://stockx.com';
}

// Helper function to fetch product variants with retry logic
async function fetchProductVariants(productId: string, accessToken: string, apiKey: string, retries = 2) {
  try {
    const variantsUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants`;
    console.log(`📏 Fetching variants: ${variantsUrl}`);
    
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

// Helper function to fetch product market data with retry logic
async function fetchMarketData(productId: string, accessToken: string, apiKey: string, retries = 2) {
  try {
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    console.log(`💰 Fetching market data: ${marketUrl}`);
    
    const response = await fetch(marketUrl, {
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
      console.log(`✅ Market data response:`, data);
      // According to the official API docs, this returns an array of VariantMarketData objects
      return Array.isArray(data) ? data : [];
    } else if (response.status === 429 && retries > 0) {
      console.log(`⚠️ Rate limited, retrying in 2 seconds... (${retries} retries left)`);
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
  const limit = searchParams.get('limit') || '10';
  const streaming = searchParams.get('streaming') === 'true';

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

  // If streaming is requested, use Server-Sent Events
  if (streaming) {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Searching StockX catalog...' 
          })}\n\n`));

          // Step 1: Search for products
          const pageNumber = 1;
          const pageSize = Math.min(parseInt(limit), 20); // Reduce limit since we'll make more API calls
          
          const searchApiParams = new URLSearchParams({
            query: query,
            pageNumber: pageNumber.toString(),
            pageSize: pageSize.toString()
          });

          const searchUrl = `https://api.stockx.com/v2/catalog/search?${searchApiParams.toString()}`;
          console.log(`🔍 Step 1 - Search products: ${searchUrl}`);

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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: 'Failed to search StockX',
              statusCode: searchResponse.status
            })}\n\n`));
            controller.close();
            return;
          }

          const searchData = await searchResponse.json();
          const products = searchData.products || [];
          
          console.log(`✅ Found ${products.length} products in search`);
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'status', 
            message: `Found ${products.length} products, fetching pricing data...` 
          })}\n\n`));

          // Process each product and fetch its market data
          const opportunities = [];
          const processedProducts = Math.min(products.length, 5); // Reduce to 5 to avoid rate limits
          
          for (let i = 0; i < processedProducts; i++) {
            const product = products[i];
            console.log(`📦 Step 2 - Processing ${i+1}/${processedProducts}: ${product.title} (${product.productId})`);
            
            try {
              // Fetch market data and variants in parallel
              const [marketData, variants] = await Promise.all([
                fetchMarketData(product.productId, accessToken, apiKey),
                fetchProductVariants(product.productId, accessToken, apiKey)
              ]);
              
              console.log(`📊 Product ${product.title}: ${marketData?.length || 0} market data entries, ${variants?.length || 0} variants`);
              
              // Create a map of variant IDs to variant info for quick lookup
              const variantMap = new Map();
              if (variants?.length) {
                variants.forEach(variant => {
                  variantMap.set(variant.variantId, {
                    size: variant.variantValue || 'One Size',
                    sizeChart: variant.sizeChart
                  });
                });
              }
              
              // Process market data and match with variants
              if (marketData?.length) {
                console.log(`🔍 Processing ${marketData.length} market entries with ${variants?.length || 0} variants for ${product.title}`);
                
                let productOpportunities = 0;
                
                // Process each market data entry - each contains variantId, bid, and ask
                marketData.forEach(marketEntry => {
                  const bid = parseInt(marketEntry.highestBidAmount) || 0;
                  const ask = parseInt(marketEntry.lowestAskAmount) || 0;
                  
                  if (bid > 0 && ask > 0) {
                    const spread = ask - bid;
                    const spreadPercent = ((spread / bid) * 100).toFixed(2);
                    
                    // Get size from variant mapping
                    const variantInfo = variantMap.get(marketEntry.variantId);
                    const size = variantInfo?.size || 'Unknown';
                    
                    console.log(`💰 Found opportunity: ${product.title} (${size}) - Bid: $${bid}, Ask: $${ask}, Spread: ${spreadPercent}%`);
                    
                    const opportunity = {
                      productId: product.productId,
                      variantId: marketEntry.variantId,
                      title: product.title, // Changed from productTitle to title
                      brand: product.brand,
                      size: size, // Now using actual size from variants
                      imageUrl: getProductImageUrl(product),
                      imageUrls: getProductImageUrlWithFallbacks(product), // Array of fallback image URLs
                      highestBid: bid,
                      lowestAsk: ask,
                      spread: spread,
                      spreadPercent: parseFloat(spreadPercent), // Send as number, not string
                      stockxUrl: generateStockXUrl(product.urlKey, size), // Generate StockX URL with size parameter
                      colorway: product.productAttributes?.colorway || null,
                      releaseDate: product.productAttributes?.releaseDate || null,
                      retailPrice: product.productAttributes?.retailPrice || null
                    };
                    
                    opportunities.push(opportunity);
                    productOpportunities++;
                    
                    // Stream this result immediately
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                      type: 'result', 
                      data: opportunity
                    })}\n\n`));
                  } else {
                    console.log(`❌ Invalid pricing for ${product.title} (${variantInfo?.size || 'Unknown'}): bid=${bid}, ask=${ask}`);
                  }
                });
                
                console.log(`✅ Created ${productOpportunities} opportunities for ${product.title}`);
              } else {
                console.log(`⚠️ No market data found for ${product.title}`);
              }
              
              // Add delay to avoid rate limiting
              if (i < processedProducts - 1) {
                console.log(`⏳ Waiting 1000ms to avoid rate limits...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
            } catch (error) {
              console.log(`❌ Error processing ${product.title}:`, error);
            }
          }
          
          console.log(`🏁 Processing complete: ${opportunities.length} opportunities found with real pricing`);
          
          // Filter opportunities by minimum spread percentage
          const minSpreadPercent = parseInt(searchParams.get('minSpreadPercent') || '10');
          const filteredOpportunities = opportunities.filter(opp => {
            const spreadPercent = parseFloat(opp.spreadPercent);
            return spreadPercent >= minSpreadPercent;
          });
          
          console.log(`🔍 After filtering (min ${minSpreadPercent}%): ${filteredOpportunities.length} opportunities`);
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'complete', 
            totalResults: filteredOpportunities.length,
            message: `Found ${filteredOpportunities.length} arbitrage opportunities with real pricing data`
          })}\n\n`));
          
          controller.close();
          
        } catch (error) {
          console.log(`❌ Stream error:`, error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Search failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Non-streaming response (fallback)
  return NextResponse.json({ 
    message: 'Please use streaming mode for real-time results. Add streaming=true to your request.',
    opportunities: [],
    totalCount: 0,
    searchQuery: query
  });
}
}