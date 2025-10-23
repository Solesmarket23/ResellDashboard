import { NextRequest, NextResponse } from 'next/server';
import { getStockXApiCredentials, getUserIdFromRequest, validateApiCredentials } from '@/lib/utils/userApiKeyHelper';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

// Helper function to get product image URL
function getProductImageUrl(product: any): string {
  // Try to use the actual product image from StockX
  if (product.media?.imageUrl) {
    return product.media.imageUrl;
  }
  if (product.media?.thumbUrl) {
    return product.media.thumbUrl;
  }
  if (product.imageUrl) {
    return product.imageUrl;
  }
  if (product.thumbUrl) {
    return product.thumbUrl;
  }
  // Fallback to placeholder
  return '/placeholder-shoe.png';
}

// Helper function to get product image URL with fallbacks
function getProductImageUrlWithFallbacks(product: any): string[] {
  const urls = [];
  
  // Add all possible image URLs
  if (product.media?.imageUrl) urls.push(product.media.imageUrl);
  if (product.media?.thumbUrl) urls.push(product.media.thumbUrl);
  if (product.imageUrl) urls.push(product.imageUrl);
  if (product.thumbUrl) urls.push(product.thumbUrl);
  
  // Add placeholder as final fallback
  if (urls.length === 0) {
    urls.push('/placeholder-shoe.png');
  }
  
  return urls;
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

// Helper function to parse StockX category URLs and product URLs
function parseStockXUrl(url: string): {
  isStockXUrl: boolean;
  isProductUrl?: boolean;
  productUrlKey?: string;
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
    
    // Check if it's a product page (single path part that's not a known category)
    const knownCategories = ['category', 'browse', 'sneakers', 'apparel', 'accessories', 'streetwear', 'collectibles', 'electronics', 'handbags', 'watches', 'jewelry', 'trading-cards'];
    
    if (pathParts.length === 1 && !knownCategories.includes(pathParts[0])) {
      // This looks like a product URL (e.g., /air-jordan-3-retro-og-rare-air)
      return {
        isStockXUrl: true,
        isProductUrl: true,
        productUrlKey: pathParts[0]
      };
    }
    
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
function getSearchQuery(query: string, pageNumber: number = 1): { searchQuery: string; isUrlSearch: boolean; isProductUrl?: boolean; categoryInfo?: any } {
  // Check if query looks like a URL
  if (query.includes('stockx.com') || query.startsWith('http')) {
    const urlInfo = parseStockXUrl(query);
    
    // Handle individual product URLs
    if (urlInfo.isStockXUrl && urlInfo.isProductUrl && urlInfo.productUrlKey) {
      console.log(`🔗 Detected StockX product URL: ${query}`);
      console.log(`📦 Product URL key: ${urlInfo.productUrlKey}`);
      console.log(`🔍 Searching for product by URL key: ${urlInfo.productUrlKey}`);
      
      return {
        searchQuery: urlInfo.productUrlKey.replace(/-/g, ' '), // Convert URL slug to searchable text
        isUrlSearch: true,
        isProductUrl: true,
        categoryInfo: urlInfo
      };
    }
    
    // Handle category URLs
    if (urlInfo.isStockXUrl && urlInfo.searchTerms?.length) {
      // Rotate through different search terms based on page number for variety
      const searchTermIndex = (pageNumber - 1) % urlInfo.searchTerms.length;
      const searchQuery = urlInfo.searchTerms[searchTermIndex];
      console.log(`🔗 Detected StockX category URL: ${query}`);
      console.log(`📂 Category: ${urlInfo.category}, Sort: ${urlInfo.sortBy || 'none'}`);
      console.log(`🔍 Using search term: ${searchQuery} (${searchTermIndex + 1}/${urlInfo.searchTerms.length} - Page ${pageNumber})`);
      
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
        'X-API-Key': apiKey,
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
        'X-API-Key': apiKey,
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

// Helper function to get estimated price for products without market data
function getEstimatedPrice(product: any): number {
  // Try to get price from various sources
  if (product.market?.lastSale) return product.market.lastSale;
  if (product.market?.averagePrice) return product.market.averagePrice;
  if (product.retailPrice) return product.retailPrice * 1.5; // Estimate 50% markup
  if (product.productAttributes?.retailPrice) return product.productAttributes.retailPrice * 1.5;
  
  // Default fallback price
  return 150;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawQuery = searchParams.get('query') || '';
  const limit = searchParams.get('limit') || '10';
  const streaming = searchParams.get('streaming') === 'true';
  const excludeBrands = searchParams.get('excludeBrands') || '';
  
  // Parse excluded brands into array for filtering
  const excludedBrandsList = excludeBrands
    .split(',')
    .map(brand => brand.trim().toLowerCase())
    .filter(brand => brand.length > 0);
  
  // Parse the query to handle StockX URLs
  const pageNumber = parseInt(searchParams.get('page') || '1');
  const { searchQuery: query, isUrlSearch, isProductUrl, categoryInfo } = getSearchQuery(rawQuery, pageNumber);

  // Get user ID from request
  const userId = getUserIdFromRequest(request);
  
  // Get API credentials (user-specific or global)
  const credentials = await getStockXApiCredentials(userId);
  const validation = validateApiCredentials(credentials);
  
  if (!validation.isValid) {
    return NextResponse.json(
      { 
        error: 'API credentials not configured',
        message: validation.error || 'Please configure your StockX API credentials',
        authRequired: true,
        needsApiKeys: true
      },
      { status: 401 }
    );
  }

  // Get access token from cookies
  let accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;

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

  console.log(`🔑 Using ${credentials.source} API credentials for user: ${userId || 'anonymous'}`);

  // If streaming is requested, use Server-Sent Events
  if (streaming) {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          const statusMessage = isProductUrl
            ? `Searching for specific product: ${query}...`
            : isUrlSearch 
            ? `Searching StockX ${categoryInfo?.category || 'category'} for ${query}${excludedBrandsList.length > 0 ? ` (excluding ${excludedBrandsList.join(', ')})` : ''}...`
            : `Searching StockX catalog${excludedBrandsList.length > 0 ? ` (excluding ${excludedBrandsList.join(', ')})` : ''}...`;
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'status', 
            message: statusMessage,
            searchType: isProductUrl ? 'product' : (isUrlSearch ? 'url' : 'text'),
            category: categoryInfo?.category,
            originalQuery: rawQuery,
            excludedBrands: excludedBrandsList
          })}\n\n`));

          // Step 1: Search for products
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
              'X-API-Key': credentials.apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'FlipFlow/1.0'
            }
          });

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.log(`❌ Search failed with status ${searchResponse.status}:`, errorText);
            
            // Add specific handling for 401 errors
            if (searchResponse.status === 401) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: 'Authentication failed - please re-authenticate with StockX',
                statusCode: searchResponse.status,
                authRequired: true
              })}\n\n`));
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: `Failed to search StockX (Status: ${searchResponse.status})`,
                statusCode: searchResponse.status,
                details: errorText
              })}\n\n`));
            }
            controller.close();
            return;
          }

          const searchData = await searchResponse.json();
          let products = searchData.products || [];
          
          console.log(`✅ Found ${products.length} products in search`);
          
          // Filter out excluded brands if specified
          if (excludedBrandsList.length > 0) {
            const originalCount = products.length;
            products = products.filter(product => {
              const productBrand = (product.brand || '').toLowerCase();
              const isExcluded = excludedBrandsList.some(excludedBrand => 
                productBrand.includes(excludedBrand) || excludedBrand.includes(productBrand)
              );
              if (isExcluded) {
                console.log(`🚫 Excluding ${product.title} (brand: ${product.brand})`);
              }
              return !isExcluded;
            });
            console.log(`🔍 Brand filtering: ${originalCount} → ${products.length} products (excluded ${originalCount - products.length} products)`);
          }
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'status', 
            message: `Found ${products.length} products${excludedBrandsList.length > 0 ? ` (after brand filtering)` : ''}, fetching pricing data...` 
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
                fetchMarketData(product.productId, accessToken, credentials.apiKey),
                fetchProductVariants(product.productId, accessToken, credentials.apiKey)
              ]);
              
              console.log(`📊 Product ${product.title}: ${marketData?.length || 0} market data entries, ${variants?.length || 0} variants`);
              
              // Debug: Log first few variants to understand structure
              if (variants?.length > 0) {
                console.log(`🔍 First 3 variants for ${product.title}:`);
                variants.slice(0, 3).forEach((variant, index) => {
                  console.log(`Variant ${index + 1}:`, {
                    variantId: variant.variantId,
                    variantValue: variant.variantValue,
                    size: variant.size,
                    sizeValue: variant.sizeValue,
                    displaySize: variant.displaySize,
                    shoeSize: variant.shoeSize,
                    traits: variant.traits,
                    variantTraits: variant.variantTraits
                  });
                });
              }
              
              // Create a map of variant IDs to variant info for quick lookup
              const variantMap = new Map();
              if (variants?.length) {
                variants.forEach(variant => {
                  // Use robust size extraction logic (same as market-data API)
                  let sizeValue = variant.variantValue || 
                                 variant.size || 
                                 variant.sizeValue || 
                                 variant.displaySize || 
                                 variant.shoeSize;
                  
                  // Try to extract size from traits if available
                  if (!sizeValue && variant.traits) {
                    const sizeTraits = variant.traits.find((trait: any) => 
                      trait.name?.toLowerCase().includes('size') || 
                      trait.filterId?.toLowerCase().includes('size')
                    );
                    if (sizeTraits && sizeTraits.value) {
                      sizeValue = sizeTraits.value;
                    }
                  }
                  
                  // Try to extract size from variantTraits if available
                  if (!sizeValue && variant.variantTraits) {
                    const sizeTraits = variant.variantTraits.find((trait: any) => 
                      trait.name?.toLowerCase().includes('size') || 
                      trait.filterId?.toLowerCase().includes('size')
                    );
                    if (sizeTraits && sizeTraits.value) {
                      sizeValue = sizeTraits.value;
                    }
                  }
                  
                  // If still no size, use fallback
                  if (!sizeValue || sizeValue === 'Unknown') {
                    sizeValue = 'One Size';
                  }
                  
                  // Debug: Log size extraction
                  console.log(`📏 Size extraction for variant ${variant.variantId}: "${sizeValue}"`);
                  
                  variantMap.set(variant.variantId, {
                    size: sizeValue,
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
                  // Get size from variant mapping (move this outside the conditional)
                  const variantInfo = variantMap.get(marketEntry.variantId);
                  const size = variantInfo?.size || 'Unknown';
                  
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
                      
                      // Calculate enhanced metrics
                      const bidAskVolume = calculateBidAskVolume(marketEntry, product);
                      const velocityScore = calculateVelocityScore(product, marketEntry, size);
                      const riskScore = calculateRiskScore(product, marketEntry, spread, spreadPercent);
                      const volatilityScore = calculateVolatilityScore(product, marketEntry);
                      const priceHistory = generateMockPriceHistory(ask / 100, 7); // Mock 7-day history
                      const trendDirection = calculateTrendDirection(priceHistory);
                      const estimatedSellTime = calculateSellTime(velocityScore, bidAskVolume);

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
                        retailPrice: product.productAttributes?.retailPrice || null,
                        
                        // Enhanced analytics
                        category: product.productType || 'Sneakers',
                        bidAskVolume,
                        velocityScore,
                        riskScore,
                        volatilityScore,
                        priceHistory,
                        trendDirection,
                        estimatedSellTime,
                        lastSalePrice: ask / 100, // Mock last sale price
                        salesVolume24h: Math.floor(bidAskVolume / 10) // Estimate daily volume
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
            page: pageNumber,
            hasMore: products.length >= pageSize, // If we got a full page, there might be more
            message: `Found ${opportunities.length} profitable opportunities with ${minSpreadPercent}%+ profit margin${excludedBrandsList.length > 0 ? ` (excluding ${excludedBrandsList.join(', ')})` : ''}${products.length >= pageSize ? ' - Load more to see additional results' : ''}`
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

  // Non-streaming response for backward compatibility (used by StockXMarketResearch component)
  try {
    console.log('🔍 Non-streaming search for:', query);
    
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}&pageNumber=1&pageSize=${limit}`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': credentials.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('StockX search error:', searchResponse.status, errorText);
      
      if (searchResponse.status === 401) {
        return NextResponse.json(
          { 
            error: 'Authentication failed',
            message: 'Please re-authenticate with StockX',
            authRequired: true,
            statusCode: 401
          },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Search failed',
          message: `StockX API error (${searchResponse.status})`,
          statusCode: searchResponse.status
        },
        { status: searchResponse.status }
      );
    }

    const searchData = await searchResponse.json();
    const products = searchData.products || [];
    
    // For market research, return products with basic market data (no detailed pricing needed)
    const enrichedProducts = products.map((product: any) => {
      // Generate estimated pricing if not available
      const estimatedPrice = getEstimatedPrice(product);
      
      return {
        ...product,
        market: {
          lastSale: product.market?.lastSale || estimatedPrice,
          averagePrice: product.market?.averagePrice || estimatedPrice,
          highestBid: product.market?.highestBid || Math.floor(estimatedPrice * 0.85),
          lowestAsk: product.market?.lowestAsk || Math.floor(estimatedPrice * 1.15),
          priceChange: product.market?.priceChange || (Math.random() * 10 - 5),
          volume: product.market?.volume || Math.floor(Math.random() * 500) + 50,
          isEstimated: !product.market?.lastSale
        },
        hasRealPricing: !!product.market?.lastSale,
        pricingSource: product.market?.lastSale ? 'stockx' : 'estimated'
      };
    });
    
    return NextResponse.json({
      success: true,
      data: {
        products: enrichedProducts
      },
      totalCount: products.length,
      searchQuery: query
    });
    
  } catch (error) {
    console.error('Non-streaming search error:', error);
    return NextResponse.json(
      { 
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Enhanced analytics calculation functions

function calculateBidAskVolume(marketEntry: any, product: any): number {
  // Estimate volume based on bid-ask spread and product popularity
  const spread = Math.abs((marketEntry.lowestAskAmount || 0) - (marketEntry.highestBidAmount || 0));
  const relativeSpread = spread / (marketEntry.lowestAskAmount || 1);
  
  let baseVolume = 50; // Base volume
  
  // Popular brands get higher volume
  const brand = product.brand?.toLowerCase() || '';
  if (brand.includes('jordan') || brand.includes('nike')) baseVolume *= 2;
  if (brand.includes('yeezy') || brand.includes('off-white')) baseVolume *= 2.5;
  if (brand.includes('travis scott') || brand.includes('fragment')) baseVolume *= 3;
  
  // Tighter spreads indicate higher liquidity
  if (relativeSpread < 0.05) baseVolume *= 1.5; // <5% spread
  if (relativeSpread > 0.2) baseVolume *= 0.7;   // >20% spread
  
  // Add some randomness
  const randomFactor = 0.8 + Math.random() * 0.4;
  
  return Math.floor(baseVolume * randomFactor);
}

function calculateVelocityScore(product: any, marketEntry: any, size: string): number {
  // Velocity score: 0-100 (higher = sells faster)
  let score = 50; // Base score
  
  const brand = product.brand?.toLowerCase() || '';
  const title = product.title?.toLowerCase() || '';
  
  // Brand velocity factors
  if (brand.includes('jordan') || title.includes('jordan')) score += 20;
  if (brand.includes('yeezy') || title.includes('yeezy')) score += 25;
  if (brand.includes('off-white')) score += 30;
  if (brand.includes('travis scott') || title.includes('travis scott')) score += 35;
  if (brand.includes('nike') && !title.includes('jordan')) score += 10;
  if (brand.includes('adidas') && !title.includes('yeezy')) score += 8;
  
  // Size popularity (most popular sizes sell faster)
  const popularSizes = ['9', '9.5', '10', '10.5', '11'];
  if (popularSizes.includes(size)) score += 15;
  if (size === '10' || size === '10.5') score += 5; // Most popular
  
  // Price point affects velocity
  const askPrice = (marketEntry.lowestAskAmount || 0) / 100;
  if (askPrice < 200) score += 10;  // Affordable items move faster
  if (askPrice > 1000) score -= 15; // Expensive items move slower
  
  // Flex availability indicates higher demand/velocity
  if (marketEntry.flexLowestAskAmount && marketEntry.flexLowestAskAmount > 0) {
    score += 10;
  }
  
  // Recent releases tend to have higher velocity
  if (product.productAttributes?.releaseDate) {
    const releaseDate = new Date(product.productAttributes.releaseDate);
    const monthsOld = (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld < 3) score += 15;  // Less than 3 months old
    if (monthsOld < 1) score += 10;  // Less than 1 month old
  }
  
  // Bid-ask ratio (higher ratio = more demand = higher velocity)
  const bidAskRatio = (marketEntry.highestBidAmount || 0) / (marketEntry.lowestAskAmount || 1);
  if (bidAskRatio > 0.9) score += 10; // Very close bid/ask
  if (bidAskRatio > 0.95) score += 5; // Extremely close
  
  return Math.min(100, Math.max(0, score));
}

function calculateRiskScore(product: any, marketEntry: any, spread: number, spreadPercent: string): number {
  // Risk score: 0-100 (higher = more risky)
  let risk = 30; // Base risk
  
  const askPrice = (marketEntry.lowestAskAmount || 0) / 100;
  const spreadPercentNum = parseFloat(spreadPercent);
  
  // High spread % = higher risk
  if (spreadPercentNum > 50) risk += 20;
  if (spreadPercentNum > 30) risk += 10;
  if (spreadPercentNum < 15) risk -= 5;
  
  // Price level risk
  if (askPrice > 1000) risk += 15; // Expensive = harder to sell
  if (askPrice < 100) risk += 10;  // Too cheap = authenticity concerns
  
  // Brand reliability
  const brand = product.brand?.toLowerCase() || '';
  if (brand.includes('jordan') || brand.includes('nike')) risk -= 10;
  if (brand.includes('yeezy')) risk -= 8;
  if (brand.includes('off-white')) risk -= 5;
  
  // Market liquidity (tighter spreads = lower risk)
  const bidAskSpread = Math.abs((marketEntry.lowestAskAmount || 0) - (marketEntry.highestBidAmount || 0));
  const relativeSpread = bidAskSpread / (marketEntry.lowestAskAmount || 1);
  if (relativeSpread > 0.3) risk += 15; // Wide spread = illiquid = risky
  if (relativeSpread < 0.1) risk -= 10; // Tight spread = liquid = safer
  
  // Flex availability reduces risk (more selling options)
  if (marketEntry.flexLowestAskAmount && marketEntry.flexLowestAskAmount > 0) {
    risk -= 5;
  }
  
  return Math.min(100, Math.max(0, risk));
}

function calculateVolatilityScore(product: any, marketEntry: any): number {
  // Volatility score: 0-100 (higher = more price swings)
  let volatility = 25; // Base volatility
  
  const brand = product.brand?.toLowerCase() || '';
  const title = product.title?.toLowerCase() || '';
  
  // Hype brands tend to be more volatile
  if (brand.includes('off-white') || title.includes('travis scott')) volatility += 30;
  if (brand.includes('yeezy')) volatility += 20;
  if (brand.includes('jordan') && (title.includes('retro') || title.includes('og'))) volatility += 15;
  
  // Recent releases are more volatile
  if (product.productAttributes?.releaseDate) {
    const releaseDate = new Date(product.productAttributes.releaseDate);
    const monthsOld = (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld < 1) volatility += 25;
    if (monthsOld < 6) volatility += 15;
  }
  
  // Price level affects volatility
  const askPrice = (marketEntry.lowestAskAmount || 0) / 100;
  if (askPrice > 500) volatility += 10; // Expensive items more volatile
  if (askPrice < 150) volatility -= 10; // Cheaper items more stable
  
  return Math.min(100, Math.max(0, volatility));
}

function generateMockPriceHistory(currentPrice: number, days: number): any[] {
  const history = [];
  const now = Date.now();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = now - (i * 24 * 60 * 60 * 1000);
    const trend = Math.sin(i / 3) * 10; // Some trending pattern
    const noise = (Math.random() - 0.5) * 20; // Random daily variation
    const price = Math.max(currentPrice * 0.8, currentPrice + trend + noise);
    
    history.push({
      timestamp: date,
      price: Math.round(price),
      type: 'sale'
    });
  }
  
  return history;
}

function calculateTrendDirection(priceHistory: any[]): 'up' | 'down' | 'stable' {
  if (priceHistory.length < 2) return 'stable';
  
  const recent = priceHistory.slice(-3); // Last 3 data points
  const older = priceHistory.slice(0, 3); // First 3 data points
  
  const recentAvg = recent.reduce((sum, p) => sum + p.price, 0) / recent.length;
  const olderAvg = older.reduce((sum, p) => sum + p.price, 0) / older.length;
  
  const change = (recentAvg - olderAvg) / olderAvg;
  
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
}

function calculateSellTime(velocityScore: number, volume: number): string {
  // Estimate how long it will take to sell based on velocity and volume
  if (velocityScore > 80 && volume > 100) return '1-2 days';
  if (velocityScore > 70 && volume > 80) return '2-3 days';
  if (velocityScore > 60 && volume > 60) return '3-5 days';
  if (velocityScore > 50 && volume > 40) return '1 week';
  if (velocityScore > 40) return '1-2 weeks';
  if (velocityScore > 30) return '2-4 weeks';
  return '1+ months';
} 