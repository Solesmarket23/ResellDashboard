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

// Helper function to parse StockX category URLs
function parseStockXUrl(url: string): {
  isStockXUrl: boolean;
  category?: string;
  sortBy?: string;
  searchTerms?: string[];
} {
  try {
    const parsedUrl = new URL(url);
    
    // Check if it's a StockX URL
    if (!parsedUrl.hostname.includes('stockx.com')) {
      return { isStockXUrl: false };
    }
    
    // Parse category from path like /category/apparel or /browse/sneakers
    const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);
    let category = '';
    
    if (pathParts[0] === 'category' && pathParts[1]) {
      category = pathParts[1].toLowerCase();
    } else if (pathParts[0] === 'browse' && pathParts[1]) {
      category = pathParts[1].toLowerCase();
    } else if (pathParts[0] === 'sneakers' || pathParts[0] === 'apparel' || pathParts[0] === 'accessories') {
      category = pathParts[0].toLowerCase();
    }
    
    // Get sort parameter
    const sortBy = parsedUrl.searchParams.get('sort');
    
    // Map categories to search terms based on what's actually trending on StockX
    const categoryMapping: Record<string, { 'most-active': string[]; 'default': string[] }> = {
      'apparel': {
        'most-active': ['Fear of God Essentials', 'BAPE', 'Supreme', 'Off-White', 'Stussy', 'Kith', 'Chrome Hearts'],
        'default': ['hoodie', 'sweatshirt', 't-shirt', 'jacket', 'pants', 'shorts']
      },
      'sneakers': {
        'most-active': ['Jordan 1', 'Jordan 4', 'Nike Dunk', 'Travis Scott', 'Yeezy 350', 'Air Force 1'],
        'default': ['nike', 'jordan', 'adidas', 'yeezy', 'dunk', 'air force', 'air max']
      },
      'shoes': {
        'most-active': ['Jordan 1', 'Jordan 4', 'Nike Dunk', 'Travis Scott', 'Yeezy 350', 'Air Force 1'],
        'default': ['nike', 'jordan', 'adidas', 'yeezy', 'dunk', 'air force', 'air max']
      },
      'accessories': {
        'most-active': ['Supreme', 'Louis Vuitton', 'Chrome Hearts', 'Rolex', 'Cartier'],
        'default': ['hat', 'cap', 'bag', 'backpack', 'belt', 'watch', 'jewelry']
      },
      'streetwear': {
        'most-active': ['Supreme', 'Off-White', 'BAPE', 'Fear of God', 'Essentials', 'Chrome Hearts'],
        'default': ['supreme', 'off-white', 'bape', 'kith', 'fear of god', 'essentials']
      },
      'collectibles': {
        'most-active': ['Pokemon', 'Funko Pop', 'Trading Cards'],
        'default': ['trading cards', 'pokemon', 'funko', 'figures', 'toys']
      },
      'electronics': {
        'most-active': ['iPhone', 'MacBook', 'PlayStation', 'AirPods'],
        'default': ['iphone', 'macbook', 'playstation', 'xbox', 'airpods']
      },
      'handbags': {
        'most-active': ['Louis Vuitton', 'Gucci', 'Chanel', 'Hermès', 'Dior'],
        'default': ['louis vuitton', 'gucci', 'chanel', 'prada', 'hermès']
      },
      'watches': {
        'most-active': ['Rolex', 'Omega', 'Cartier', 'Patek Philippe', 'Audemars Piguet'],
        'default': ['rolex', 'omega', 'cartier', 'patek philippe', 'audemars piguet']
      },
      'jewelry': {
        'most-active': ['Tiffany', 'Cartier', 'Chrome Hearts', 'Van Cleef'],
        'default': ['tiffany', 'cartier', 'chrome hearts', 'david yurman']
      },
      'trading-cards': {
        'most-active': ['Pokemon', 'Topps', 'Panini'],
        'default': ['pokemon', 'yugioh', 'magic', 'topps', 'panini']
      }
    };
    
    // Get search terms based on category and sort parameter
    let searchTerms: string[] = [];
    if (category && categoryMapping[category]) {
      const categoryData = categoryMapping[category];
      if (sortBy === 'most-active' && categoryData['most-active']) {
        searchTerms = categoryData['most-active'];
      } else {
        searchTerms = categoryData['default'] || categoryData['most-active'] || [category];
      }
    } else if (category) {
      searchTerms = [category];
    }
    
    return {
      isStockXUrl: true,
      category,
      sortBy,
      searchTerms
    };
  } catch (error) {
    console.log('URL parsing error:', error);
    return { isStockXUrl: false };
  }
}

// Helper function to get search query based on category or regular search
function getSearchQuery(query: string): { searchQuery: string; isUrlSearch: boolean; categoryInfo?: any } {
  // Check if query looks like a URL
  if (query.includes('stockx.com') || query.startsWith('http')) {
    const urlInfo = parseStockXUrl(query);
    
    if (urlInfo.isStockXUrl && urlInfo.searchTerms?.length) {
      // Use the first search term for the category
      const searchQuery = urlInfo.searchTerms[0];
      console.log(`🔗 Detected StockX URL: ${query}`);
      console.log(`📂 Category: ${urlInfo.category}, Sort: ${urlInfo.sortBy || 'none'}`);
      console.log(`🔍 Using search term: ${searchQuery} (${urlInfo.searchTerms.length} terms available)`);
      
      return {
        searchQuery,
        isUrlSearch: true,
        categoryInfo: urlInfo
      };
    }
  }
  
  // Regular text search  
  return {
    searchQuery: query,
    isUrlSearch: false
  };
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
  const rawQuery = searchParams.get('query') || '';
  const limit = searchParams.get('limit') || '10';
  const streaming = searchParams.get('streaming') === 'true';
  
  // Parse the query to handle StockX URLs
  const { searchQuery: query, isUrlSearch, categoryInfo } = getSearchQuery(rawQuery);

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
          const statusMessage = isUrlSearch 
            ? `Searching StockX ${categoryInfo?.category || 'category'} for ${query}...`
            : 'Searching StockX catalog...';
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'status', 
            message: statusMessage,
            searchType: isUrlSearch ? 'url' : 'text',
            category: categoryInfo?.category,
            originalQuery: rawQuery
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
                  // Use best available pricing for arbitrage calculations
                  const rawBid = parseInt(marketEntry.highestBidAmount) || 0;
                  const standardAsk = parseInt(marketEntry.lowestAskAmount) || 0;
                  const flexAsk = parseInt(marketEntry.flexLowestAskAmount) || 0;
                  
                  // For bids, use sellFasterAmount/earnMoreAmount if available (includes fees/taxes)
                  const adjustedBid = parseInt(marketEntry.sellFasterAmount) || parseInt(marketEntry.earnMoreAmount) || rawBid;
                  
                  // For asks, use the lowest ask price between standard and flex
                  let bestAsk = 0;
                  if (standardAsk > 0 && flexAsk > 0) {
                    bestAsk = Math.min(standardAsk, flexAsk);
                  } else if (standardAsk > 0) {
                    bestAsk = standardAsk;
                  } else if (flexAsk > 0) {
                    bestAsk = flexAsk;
                  }
                  
                  const bid = adjustedBid > 0 ? adjustedBid : rawBid;
                  const ask = bestAsk;
                  
                  // Debug: Show which ask price was chosen
                  if (standardAsk > 0 && flexAsk > 0) {
                    console.log(`🔍 Price comparison for ${product.title}: Standard Ask: $${standardAsk}, Flex Ask: $${flexAsk}, Using: $${ask}`);
                  }
                  
                  if (bid > 0 && ask > 0) {
                    // Get size from variant mapping
                    const variantInfo = variantMap.get(marketEntry.variantId);
                    const size = variantInfo?.size || 'Unknown';
                    
                    // Estimate buyer fees based on typical StockX fee structure
                    const estimatedProcessingFee = Math.round(rawBid * 0.08); // 8% processing fee
                    const estimatedShippingFee = 14.95; // Fixed $14.95 shipping fee
                    const estimatedTotalBuyerCost = rawBid + estimatedProcessingFee + estimatedShippingFee;
                    
                    // Calculate actual profit after all fees
                    const spread = Math.round((ask - estimatedTotalBuyerCost) * 100) / 100; // Round to 2 decimal places
                    const spreadPercent = ((spread / estimatedTotalBuyerCost) * 100).toFixed(2);
                    
                    // Only process opportunities that are profitable and meet minimum threshold
                    const minSpreadPercent = parseInt(searchParams.get('minSpreadPercent') || '10');
                    const spreadPercentNum = parseFloat(spreadPercent);
                    
                    if (spreadPercentNum >= minSpreadPercent) {
                      console.log(`💰 Found profitable opportunity: ${product.title} (${size}) - Best Ask: $${ask}, Total Cost: $${estimatedTotalBuyerCost.toFixed(2)}, Profit: $${spread.toFixed(2)} (${spreadPercent}%)`);
                      
                      const opportunity = {
                        productId: product.productId,
                        variantId: marketEntry.variantId,
                        title: product.title, // Changed from productTitle to title
                        brand: product.brand,
                        size: size, // Now using actual size from variants
                        imageUrl: getProductImageUrl(product),
                        imageUrls: getProductImageUrlWithFallbacks(product), // Array of fallback image URLs
                        highestBid: bid, // Using adjusted bid that includes fees
                        lowestAsk: ask, // Using adjusted ask 
                        rawBid: rawBid, // Also include raw values for reference
                        rawAsk: standardAsk,
                        sellFasterAmount: parseInt(marketEntry.sellFasterAmount) || null,
                        earnMoreAmount: parseInt(marketEntry.earnMoreAmount) || null,
                        flexLowestAskAmount: parseInt(marketEntry.flexLowestAskAmount) || null,
                        // Add estimated buyer fees (since API doesn't provide exact fees)
                        estimatedProcessingFee: estimatedProcessingFee,
                        estimatedShippingFee: estimatedShippingFee,
                        estimatedTotalBuyerCost: estimatedTotalBuyerCost,
                        spread: spread,
                        spreadPercent: parseFloat(spreadPercent), // Send as number, not string
                        stockxUrl: generateStockXUrl(product.urlKey, size), // Generate StockX URL with size parameter
                        colorway: product.productAttributes?.colorway || null,
                        releaseDate: product.productAttributes?.releaseDate || null,
                        retailPrice: product.productAttributes?.retailPrice || null
                      };
                      
                      opportunities.push(opportunity);
                      productOpportunities++;
                      
                      // Stream this profitable result immediately
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                        type: 'result', 
                        data: opportunity
                      })}\n\n`));
                    } else {
                      console.log(`❌ Unprofitable opportunity filtered out: ${product.title} (${size}) - Ask: $${ask}, Total Cost: $${estimatedTotalBuyerCost.toFixed(2)}, Loss: $${spread.toFixed(2)} (${spreadPercent}%)`);
                    }
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
          
          console.log(`🏁 Processing complete: ${opportunities.length} profitable opportunities found (after filtering)`);
          
          const minSpreadPercent = parseInt(searchParams.get('minSpreadPercent') || '10');
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'complete', 
            totalResults: opportunities.length,
            message: `Found ${opportunities.length} profitable opportunities with ${minSpreadPercent}%+ profit margin (after fees)`
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