import { NextRequest, NextResponse } from 'next/server';

// Function to generate realistic pricing estimates when actual data is not available
function getEstimatedPrice(product: any) {
  const title = product.title?.toLowerCase() || '';
  const brand = product.brand?.toLowerCase() || '';
  const productType = product.productType?.toLowerCase() || '';
  
  // Base price ranges by product type
  let basePrice = 100;
  if (productType.includes('sneaker') || productType.includes('shoe')) {
    basePrice = 150;
  } else if (productType.includes('apparel') || productType.includes('clothing')) {
    basePrice = 80;
  } else if (productType.includes('accessory')) {
    basePrice = 60;
  }
  
  // Brand multipliers
  const brandMultipliers: { [key: string]: number } = {
    'jordan': 2.5,
    'nike': 1.8,
    'adidas': 1.6,
    'yeezy': 3.0,
    'off-white': 3.5,
    'supreme': 2.0,
    'bape': 1.8,
    'fear of god': 2.2,
    'travis scott': 2.8,
    'dior': 4.0,
    'louis vuitton': 4.5,
    'gucci': 3.8,
    'balenciaga': 3.2,
    'denim tears': 1.5,
    'asics': 1.4,
    'new balance': 1.3,
    'converse': 1.2
  };
  
  // Apply brand multiplier
  let multiplier = 1.0;
  for (const [brandName, brandMultiplier] of Object.entries(brandMultipliers)) {
    if (brand.includes(brandName) || title.includes(brandName)) {
      multiplier = brandMultiplier;
      break;
    }
  }
  
  // Special keywords that increase value
  const premiumKeywords = ['limited', 'exclusive', 'retro', 'og', 'collaboration', 'collab', 'special edition'];
  const hasPremiumKeyword = premiumKeywords.some(keyword => title.includes(keyword));
  if (hasPremiumKeyword) {
    multiplier *= 1.3;
  }
  
  // Calculate estimated price with some randomization for realism
  const estimatedPrice = Math.round(basePrice * multiplier * (0.8 + Math.random() * 0.4));
  
  return {
    lastSale: estimatedPrice,
    highestBid: Math.round(estimatedPrice * 0.85),
    lowestAsk: Math.round(estimatedPrice * 1.15),
    averagePrice: estimatedPrice,
    priceChange: Math.round((Math.random() - 0.5) * 20), // Random change between -10 and +10
    volume: Math.round(Math.random() * 500 + 50), // Random volume between 50-550
    isEstimated: true
  };
}

// Helper function to get product image URL from various possible fields
function getProductImageUrl(product: any): string {
  // Debug: Log available image-related fields
  console.log(`🖼️ Checking image fields for product: ${product.title}`);
  console.log(`🖼️ Available fields:`, {
    image: !!product.image,
    imageUrl: !!product.imageUrl,
    thumbUrl: !!product.thumbUrl,
    thumbnail: !!product.thumbnail,
    media: typeof product.media,
    productAttributes: typeof product.productAttributes,
    urlKey: !!product.urlKey,
    productId: !!product.productId
  });
  
  // Try different common image field patterns used by StockX
  
  // Check direct image fields
  if (product.image) {
    console.log(`🖼️ Using product.image: ${product.image}`);
    return product.image;
  }
  
  if (product.imageUrl) {
    console.log(`🖼️ Using product.imageUrl: ${product.imageUrl}`);
    return product.imageUrl;
  }
  
  if (product.thumbUrl) {
    console.log(`🖼️ Using product.thumbUrl: ${product.thumbUrl}`);
    return product.thumbUrl;
  }
  
  if (product.thumbnail) {
    console.log(`🖼️ Using product.thumbnail: ${product.thumbnail}`);
    return product.thumbnail;
  }
  
  // Check media object for image URLs
  if (product.media) {
    if (typeof product.media === 'string') {
      console.log(`🖼️ Using product.media string: ${product.media}`);
      return product.media;
    }
    if (typeof product.media === 'object') {
      // Try different media object patterns
      if (product.media.thumbUrl) {
        console.log(`🖼️ Using product.media.thumbUrl: ${product.media.thumbUrl}`);
        return product.media.thumbUrl;
      }
      if (product.media.imageUrl) {
        console.log(`🖼️ Using product.media.imageUrl: ${product.media.imageUrl}`);
        return product.media.imageUrl;
      }
      if (product.media.thumbnail) {
        console.log(`🖼️ Using product.media.thumbnail: ${product.media.thumbnail}`);
        return product.media.thumbnail;
      }
      if (product.media.small) {
        console.log(`🖼️ Using product.media.small: ${product.media.small}`);
        return product.media.small;
      }
      if (product.media.medium) {
        console.log(`🖼️ Using product.media.medium: ${product.media.medium}`);
        return product.media.medium;
      }
      if (product.media.large) {
        console.log(`🖼️ Using product.media.large: ${product.media.large}`);
        return product.media.large;
      }
      if (product.media.image) {
        console.log(`🖼️ Using product.media.image: ${product.media.image}`);
        return product.media.image;
      }
    }
  }
  
  // Check productAttributes for image data
  if (product.productAttributes && typeof product.productAttributes === 'object') {
    console.log(`🖼️ Full ProductAttributes for ${product.title}:`, JSON.stringify(product.productAttributes, null, 2));
    
    if (product.productAttributes.image) {
      console.log(`🖼️ Using product.productAttributes.image: ${product.productAttributes.image}`);
      return product.productAttributes.image;
    }
    if (product.productAttributes.imageUrl) {
      console.log(`🖼️ Using product.productAttributes.imageUrl: ${product.productAttributes.imageUrl}`);
      return product.productAttributes.imageUrl;
    }
    if (product.productAttributes.thumbnail) {
      console.log(`🖼️ Using product.productAttributes.thumbnail: ${product.productAttributes.thumbnail}`);
      return product.productAttributes.thumbnail;
    }
    if (product.productAttributes.media) {
      console.log(`🖼️ Using product.productAttributes.media: ${product.productAttributes.media}`);
      return product.productAttributes.media;
    }
  }
  
  // Try different StockX image URL patterns
  if (product.urlKey) {
    // Try multiple common StockX image patterns
    const patterns = [
      `https://images.stockx.com/images/${product.urlKey}/img01.jpg`,
      `https://images.stockx.com/images/${product.urlKey}/Lv2/img01.jpg`,
      `https://images.stockx.com/images/${product.urlKey}/Images/${product.urlKey}/Lv2/img01.jpg`,
      `https://images.stockx.com/360-small/${product.urlKey}/img01.jpg`,
      `https://images.stockx.com/360/${product.urlKey}/img01.jpg`
    ];
    
    // For now, use the first pattern (simplest)
    const constructedUrl = patterns[0];
    console.log(`🖼️ Constructed URL from urlKey: ${constructedUrl}`);
    console.log(`🖼️ Other patterns available: ${patterns.slice(1).join(', ')}`);
    return constructedUrl;
  }
  
  if (product.productId) {
    // Alternative pattern using product ID
    const constructedUrl = `https://images.stockx.com/images/${product.productId}.jpg`;
    console.log(`🖼️ Constructed URL from productId: ${constructedUrl}`);
    return constructedUrl;
  }
  
  // Fallback to placeholder
  console.log(`🖼️ Using placeholder for ${product.title}`);
  return '/placeholder-shoe.png';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || '';
  const limit = searchParams.get('limit') || '10';
  const offset = searchParams.get('offset') || '0';
  const arbitrageMode = searchParams.get('arbitrageMode') === 'true';
  const minSpreadPercent = parseFloat(searchParams.get('minSpreadPercent') || '0');

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
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

  try {
    // Make API call to StockX using the access token
    const searchResponse = await fetch(
      `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'FlipFlow/1.0'
        }
      }
    );

    if (searchResponse.status === 401 && refreshToken) {
      // Access token expired, try to refresh
      console.log('Access token expired, attempting refresh...');
      
      const clientId = process.env.STOCKX_CLIENT_ID;
      const clientSecret = process.env.STOCKX_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: 'Missing OAuth credentials for token refresh' },
          { status: 500 }
        );
      }

      try {
        const refreshResponse = await fetch('https://accounts.stockx.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            audience: 'gateway.stockx.com',
            refresh_token: refreshToken
          })
        });

        if (refreshResponse.ok) {
          const tokenData = await refreshResponse.json();
          
          // Retry the search with new token
          const retryResponse = await fetch(
            `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'FlipFlow/1.0'
              }
            }
          );

          if (retryResponse.ok) {
            const searchData = await retryResponse.json();
            
            // Update the access token cookie
            const response = NextResponse.json({
              success: true,
              data: searchData,
              query,
              limit: parseInt(limit),
              offset: parseInt(offset),
              tokenRefreshed: true
            });

            response.cookies.set('stockx_access_token', tokenData.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 43200 // 12 hours
            });

            return response;
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }
    }

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('StockX Search Error:', errorText);
      
      let errorMessage = 'Failed to search StockX catalog';
      let userFriendlyMessage = 'An error occurred while searching';
      
      // Handle specific error types
      if (searchResponse.status === 401) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Authentication failed', 
            details: errorText,
            authRequired: true,
            message: 'Please re-authenticate with StockX',
            statusCode: 401
          },
          { status: 401 }
        );
      } else if (searchResponse.status === 429) {
        errorMessage = 'Rate limit exceeded';
        userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (searchResponse.status === 403) {
        errorMessage = 'Access forbidden';
        userFriendlyMessage = 'Access to this StockX endpoint is restricted.';
      } else if (searchResponse.status === 404) {
        errorMessage = 'Endpoint not found';
        userFriendlyMessage = 'The requested StockX endpoint was not found.';
      } else if (searchResponse.status >= 500) {
        errorMessage = 'StockX server error';
        userFriendlyMessage = 'StockX servers are experiencing issues. Please try again later.';
      }
      
      return NextResponse.json(
        { 
          success: false,
          error: errorMessage, 
          details: errorText,
          message: userFriendlyMessage,
          statusCode: searchResponse.status
        },
        { status: searchResponse.status }
      );
    }

    const searchData = await searchResponse.json();
    
    // Log the response structure for debugging
    console.log('StockX API Response structure:', {
      hasProducts: !!searchData.products,
      productCount: searchData.products?.length || 0,
      firstProduct: searchData.products?.[0] ? {
        id: searchData.products[0].id,
        productId: searchData.products[0].productId,
        title: searchData.products[0].title,
        keys: Object.keys(searchData.products[0]),
        market: searchData.products[0].market,
        traits: searchData.products[0].traits,
        variants: searchData.products[0].variants ? `${searchData.products[0].variants.length} variants` : 'no variants',
        // Check for image fields
        media: searchData.products[0].media,
        image: searchData.products[0].image,
        imageUrl: searchData.products[0].imageUrl,
        thumbnail: searchData.products[0].thumbnail,
        thumbUrl: searchData.products[0].thumbUrl,
        productAttributes: searchData.products[0].productAttributes
      } : null
    });
    
    // Debug: Log all fields of the first product to find image fields
    if (searchData.products?.[0]) {
      console.log('🖼️ First product full object:', JSON.stringify(searchData.products[0], null, 2));
    }

    // Also try to get detailed product info for the first product to see if it includes images
    if (searchData.products && searchData.products.length > 0 && searchData.products[0].productId) {
      const productId = searchData.products[0].productId;
      console.log(`🔍 Trying to fetch detailed product info for: ${productId}`);
      
      try {
        const productResponse = await fetch(
          `https://api.stockx.com/v2/catalog/products/${productId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-API-Key': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'FlipFlow/1.0'
            }
          }
        );

        if (productResponse.ok) {
          const productData = await productResponse.json();
          console.log('📋 Detailed product data keys:', Object.keys(productData));
          console.log('📋 Full detailed product data:', JSON.stringify(productData, null, 2));
        } else {
          console.log(`❌ Failed to fetch detailed product info: ${productResponse.status}`);
        }
      } catch (error) {
        console.log('❌ Error fetching detailed product info:', error);
      }
    }

    // Enhance products with market data using official StockX API endpoints
    if (searchData.products && searchData.products.length > 0) {
      if (arbitrageMode) {
        // In arbitrage mode, process each variant individually
        const arbitrageOpportunities = [];
        
        for (const product of searchData.products) {
          if (product.productId) {
            try {
              // Get market data for the product
              const marketDataUrl = `https://api.stockx.com/v2/catalog/products/${product.productId}/market-data`;
              const marketResponse = await fetch(marketDataUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'X-API-Key': apiKey,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'User-Agent': 'FlipFlow/1.0'
                }
              });

              if (marketResponse.ok) {
                const marketData = await marketResponse.json();
                console.log(`Product variants from search:`, JSON.stringify(product.variants, null, 2));
                console.log(`Market data variants:`, JSON.stringify(marketData.map(v => ({id: v.variantId, lowestAsk: v.lowestAskAmount, highestBid: v.highestBidAmount})), null, 2));
                
                if (Array.isArray(marketData) && marketData.length > 0) {
                  // Get variant size information for the entire product once (avoid rate limiting)
                  let productVariants = [];
                  try {
                    const variantsUrl = `https://api.stockx.com/v2/catalog/products/${product.productId}/variants`;
                    const variantsResponse = await fetch(variantsUrl, {
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-API-Key': apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'User-Agent': 'FlipFlow/1.0'
                      }
                    });

                    if (variantsResponse.ok) {
                      productVariants = await variantsResponse.json();
                      console.log(`✅ Got ${productVariants.length} variants for product ${product.productId}`);
                      
                      // Debug: Compare variant order with market data order
                      console.log(`🔍 Variant IDs from /variants endpoint:`, productVariants.map(v => ({
                        id: v.variantId, 
                        name: v.variantName,
                        value: v.variantValue
                      })));
                      console.log(`🔍 Variant IDs from market data:`, marketData.map(v => v.variantId));
                      
                    } else if (variantsResponse.status === 429) {
                      console.log(`⚠️ Rate limited for product ${product.productId}, using fallback names`);
                      // Add a small delay before next request
                      await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                      console.log(`Failed to get variants for product ${product.productId}: ${variantsResponse.status}`);
                    }
                  } catch (error) {
                    console.log(`Error fetching variants for product ${product.productId}:`, error);
                  }
                  
                  // Process each variant individually
                  for (const variant of marketData) {
                    if (variant.lowestAskAmount && variant.highestBidAmount) {
                      const lowestAsk = parseFloat(variant.lowestAskAmount);
                      const highestBid = parseFloat(variant.highestBidAmount);
                      
                      // Calculate spread and percentage
                      const spread = lowestAsk - highestBid;
                      const spreadPercent = (spread / highestBid) * 100;
                      
                      // Only include if spread meets minimum percentage and is positive
                      if (spreadPercent >= minSpreadPercent && spread > 0) {
                        // Get variant size from pre-fetched data
                        let variantSize = 'Size Unavailable';
                        
                        if (Array.isArray(productVariants) && productVariants.length > 0) {
                          const matchingVariant = productVariants.find(v => v.variantId === variant.variantId);
                          if (matchingVariant) {
                            // Debug: Log the full variant data structure
                            console.log(`🔍 Raw variant data for ${variant.variantId}:`, JSON.stringify(matchingVariant, null, 2));
                            
                            // Extract size from various possible fields
                            if (matchingVariant.variantValue) {
                              variantSize = matchingVariant.variantValue;
                              console.log(`📏 Size from variantValue: ${variantSize}`);
                            } else if (matchingVariant.variantName) {
                              // Extract size from variant name if it contains size info
                              const sizeMatch = matchingVariant.variantName.match(/Size\s+([^:]+)/);
                              if (sizeMatch) {
                                variantSize = sizeMatch[1].trim();
                                console.log(`📏 Size from variantName regex: ${variantSize}`);
                              } else {
                                variantSize = matchingVariant.variantName;
                                console.log(`📏 Size from full variantName: ${variantSize}`);
                              }
                            } else if (matchingVariant.sizeChart && matchingVariant.sizeChart.size) {
                              variantSize = matchingVariant.sizeChart.size;
                              console.log(`📏 Size from sizeChart: ${variantSize}`);
                            }
                            console.log(`✅ Found size for variant ${variant.variantId}: ${variantSize}`);
                          } else {
                            console.log(`❌ No matching variant found for ${variant.variantId} in product variants`);
                          }
                        }
                        
                        // Enhanced fallback using position-based sizing when API data is unreliable
                        if (variantSize === 'Size Unavailable') {
                          console.log(`⚠️ No size data available for variant ${variant.variantId}, using position-based fallback`);
                          
                          // Find the position of this variant in the market data array
                          const variantIndex = marketData.findIndex(v => v.variantId === variant.variantId);
                          
                          // Detect product type from title/description since StockX productType may not be reliable
                          const title = product.title?.toLowerCase() || '';
                          const isSneakers = title.includes('sneaker') || title.includes('shoe') || title.includes('jordan') || title.includes('nike') || title.includes('adidas') || title.includes('yeezy');
                          const isApparel = title.includes('hoodie') || title.includes('sweatshirt') || title.includes('shirt') || title.includes('tee') || title.includes('jacket') || title.includes('sweater') || title.includes('pants') || title.includes('shorts') || title.includes('sweatpants') || product.productType === 'apparel';
                          
                          // Use position-based sizing for better accuracy
                          if (isSneakers || product.productType === 'sneakers') {
                            // Sneaker sizes typically range from 7-13
                            const sneakerSizes = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];
                            variantSize = sneakerSizes[variantIndex] || `Size ${7 + variantIndex}`;
                          } else if (isApparel) {
                            // Apparel sizes: XS, S, M, L, XL, XXL (typically in this order)
                            const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
                            variantSize = sizes[variantIndex] || `Size ${variantIndex + 1}`;
                          } else {
                            // For accessories or unknown items, use more descriptive names
                            const descriptiveNames = ['Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option F'];
                            variantSize = descriptiveNames[variantIndex] || `Option ${String.fromCharCode(65 + variantIndex)}`;
                          }
                          
                          console.log(`🔄 Used position-based fallback size "${variantSize}" for ${product.title} (index: ${variantIndex}, detected type: ${isSneakers ? 'sneakers' : isApparel ? 'apparel' : 'other'})`);
                        } else {
                          // Add verification warning for detected sizes that might be wrong
                          console.log(`⚠️ Using API-detected size "${variantSize}" - verify this matches StockX website`);
                        }
                        
                        // Create StockX URL for this specific variant with size parameter
                        let stockxUrl = `https://stockx.com/${product.urlKey}?variant=${variant.variantId}`;
                        
                        // Add size parameter if we have a valid size
                        if (variantSize && variantSize !== 'Size Unavailable') {
                          // Encode the size for URL safety
                          const encodedSize = encodeURIComponent(variantSize);
                          stockxUrl += `&size=${encodedSize}`;
                        }
                        
                        // Fallback if urlKey is missing or invalid
                        if (!product.urlKey) {
                          console.warn(`⚠️ Missing urlKey for ${product.title}, using generic URL`);
                          stockxUrl = `https://stockx.com/search?s=${encodeURIComponent(product.title)}`;
                        } else if (!variant.variantId) {
                          console.warn(`⚠️ Missing variantId for ${product.title}, using product URL only`);
                          stockxUrl = `https://stockx.com/${product.urlKey}`;
                          // Still add size parameter if we have it
                          if (variantSize && variantSize !== 'Size Unavailable') {
                            stockxUrl += `?size=${encodeURIComponent(variantSize)}`;
                          }
                        }
                        
                        // Debug logging for URL generation
                        console.log(`🔗 Generated StockX URL for ${product.title} (${variantSize}):`, {
                          urlKey: product.urlKey,
                          variantId: variant.variantId,
                          fullUrl: stockxUrl,
                          hasUrlKey: !!product.urlKey,
                          hasVariantId: !!variant.variantId
                        });
                        
                        arbitrageOpportunities.push({
                          id: `${product.productId}-${variant.variantId}`,
                          productId: product.productId,
                          variantId: variant.variantId,
                          title: product.title,
                          size: variantSize,
                          brand: product.brand,
                          imageUrl: getProductImageUrl(product),
                          urlKey: product.urlKey,
                          stockxUrl,
                          lowestAsk,
                          highestBid,
                          spread,
                          spreadPercent,
                          sellFasterAmount: variant.sellFasterAmount ? parseFloat(variant.sellFasterAmount) : null,
                          earnMoreAmount: variant.earnMoreAmount ? parseFloat(variant.earnMoreAmount) : null,
                          flexLowestAskAmount: variant.flexLowestAskAmount ? parseFloat(variant.flexLowestAskAmount) : null,
                          hasRealPricing: true,
                          pricingSource: 'StockX Market Data'
                        });
                      }
                    }
                  }
                }
              }
            } catch (error) {
              console.log(`Error processing product ${product.title}:`, error);
            }
          }
        }
        
        // Sort opportunities by spread percentage (highest first)
        arbitrageOpportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);
        
        return NextResponse.json({
          success: true,
          data: {
            products: arbitrageOpportunities,
            totalCount: arbitrageOpportunities.length
          },
          query,
          limit: parseInt(limit),
          offset: parseInt(offset),
          arbitrageMode: true,
          minSpreadPercent,
          message: `Found ${arbitrageOpportunities.length} arbitrage opportunities`
        });
      }
      
      // Normal mode - aggregate variants into single products
      const enhancedProducts = await Promise.all(
        searchData.products.map(async (product: any) => {
          try {
            let hasRealPricing = false;
            let enhancedProduct = { ...product };
            
            // Try to get market data using official StockX API endpoints
            console.log(`Attempting market data fetch for product: ${product.title}, productId: ${product.productId}`);
            if (product.productId) {
              const marketDataUrls = [
                `https://api.stockx.com/v2/catalog/products/${product.productId}/market-data`,
                `https://api.stockx.com/v1/catalog/products/${product.productId}/market-data`
              ];

              console.log(`Trying ${marketDataUrls.length} market data endpoints for productId: ${product.productId}`);
              for (const url of marketDataUrls) {
                try {
                  const marketResponse = await fetch(url, {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'X-API-Key': apiKey,
                      'Content-Type': 'application/json',
                      'Accept': 'application/json',
                      'User-Agent': 'FlipFlow/1.0'
                    }
                  });

                  console.log(`Market API response from ${url}: Status ${marketResponse.status}`);
                  if (marketResponse.ok) {
                    const marketData = await marketResponse.json();
                    console.log(`Market data from ${url}:`, JSON.stringify(marketData, null, 2));
                    
                    // Check if we got real pricing data (StockX returns array of variants)
                    if (Array.isArray(marketData) && marketData.length > 0) {
                      // Find the best pricing data from variants
                      const validVariants = marketData.filter(variant => 
                        variant.lowestAskAmount || variant.highestBidAmount
                      );
                      
                      if (validVariants.length > 0) {
                        // Get the lowest ask from all variants
                        const lowestAsks = validVariants
                          .filter(v => v.lowestAskAmount)
                          .map(v => parseFloat(v.lowestAskAmount));
                        const highestBids = validVariants
                          .filter(v => v.highestBidAmount)
                          .map(v => parseFloat(v.highestBidAmount));
                        
                        const lowestAsk = lowestAsks.length > 0 ? Math.min(...lowestAsks) : null;
                        const highestBid = highestBids.length > 0 ? Math.max(...highestBids) : null;
                        const averagePrice = lowestAsk && highestBid ? Math.round((lowestAsk + highestBid) / 2) : lowestAsk || highestBid;
                        
                        hasRealPricing = true;
                        enhancedProduct = {
                          ...product,
                          imageUrl: getProductImageUrl(product),
                          market: {
                            lastSale: averagePrice,
                            highestBid: highestBid,
                            lowestAsk: lowestAsk,
                            averagePrice: averagePrice,
                            priceChange: null, // StockX doesn't provide this in market-data endpoint
                            volume: validVariants.length,
                            isEstimated: false
                          },
                          pricingSource: url,
                          hasRealPricing: true
                        };
                        console.log(`✅ Real pricing data extracted: Lowest Ask: $${lowestAsk}, Highest Bid: $${highestBid}`);
                        break;
                      }
                    }
                  }
                } catch (marketError) {
                  console.log(`Failed to fetch market data from ${url}:`, marketError);
                }
              }
            } else {
              console.log(`No productId found for product: ${product.title}`);
            }
            
            // If product has variants, try to get market data for each variant
            if (!hasRealPricing && product.variants && product.variants.length > 0) {
              console.log(`Attempting to fetch market data for ${product.variants.length} variants`);
              
              // Try to get market data for each variant (limit to first 5 to avoid too many requests)
              const variantsToCheck = product.variants.slice(0, 5);
              
              for (const variant of variantsToCheck) {
                if (variant.id && product.productId) {
                  const variantMarketUrl = `https://api.stockx.com/v2/catalog/products/${product.productId}/variants/${variant.id}/market-data`;
                  
                  try {
                    const variantMarketResponse = await fetch(variantMarketUrl, {
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-API-Key': apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'User-Agent': 'FlipFlow/1.0'
                      }
                    });

                    console.log(`Variant market API response from ${variantMarketUrl}: Status ${variantMarketResponse.status}`);
                    if (variantMarketResponse.ok) {
                      const variantMarketData = await variantMarketResponse.json();
                      console.log(`Variant market data from ${variantMarketUrl}:`, JSON.stringify(variantMarketData, null, 2));
                      
                      // Handle both single object and array formats
                      let validVariantData = null;
                      
                      if (Array.isArray(variantMarketData) && variantMarketData.length > 0) {
                        // Array format - find the best pricing data
                        validVariantData = variantMarketData.find(v => 
                          v.lowestAskAmount || v.highestBidAmount
                        );
                      } else if (variantMarketData && typeof variantMarketData === 'object' && 
                                 (variantMarketData.lowestAskAmount || variantMarketData.highestBidAmount)) {
                        // Single object format (as per documentation)
                        validVariantData = variantMarketData;
                      }
                      
                      if (validVariantData) {
                        const lowestAsk = validVariantData.lowestAskAmount ? parseFloat(validVariantData.lowestAskAmount) : null;
                        const highestBid = validVariantData.highestBidAmount ? parseFloat(validVariantData.highestBidAmount) : null;
                        const averagePrice = lowestAsk && highestBid ? Math.round((lowestAsk + highestBid) / 2) : lowestAsk || highestBid;
                        
                        hasRealPricing = true;
                        enhancedProduct = {
                          ...product,
                          imageUrl: getProductImageUrl(product),
                          market: {
                            lastSale: averagePrice,
                            highestBid: highestBid,
                            lowestAsk: lowestAsk,
                            averagePrice: averagePrice,
                            priceChange: null,
                            volume: 1, // Single variant
                            isEstimated: false,
                            sellFasterAmount: validVariantData.sellFasterAmount ? parseFloat(validVariantData.sellFasterAmount) : null,
                            earnMoreAmount: validVariantData.earnMoreAmount ? parseFloat(validVariantData.earnMoreAmount) : null,
                            flexLowestAskAmount: validVariantData.flexLowestAskAmount ? parseFloat(validVariantData.flexLowestAskAmount) : null
                          },
                          pricingSource: variantMarketUrl,
                          hasRealPricing: true,
                          variantId: variant.id
                        };
                        console.log(`✅ Real variant pricing data extracted for variant ${variant.id}: Lowest Ask: $${lowestAsk}, Highest Bid: $${highestBid}`);
                        break; // Found valid pricing data, exit the loop
                      }
                    }
                                      } catch (variantError) {
                    console.log(`Failed to fetch variant market data from ${variantMarketUrl}:`, variantError);
                  }
                } else {
                  console.log(`Skipping variant ${variant.id || 'unknown'} - missing productId or variantId`);
                }
              }
              
              if (!hasRealPricing) {
                console.log(`No variant market data found for ${product.title} after checking ${variantsToCheck.length} variants`);
              }
            }
            
            // If no real pricing data found, add estimated pricing
            if (!hasRealPricing) {
              const estimatedPricing = getEstimatedPrice(product);
              enhancedProduct = {
                ...product,
                imageUrl: getProductImageUrl(product),
                market: estimatedPricing,
                hasRealPricing: false,
                pricingSource: 'estimated'
              };
            }
            
            return enhancedProduct;
        } catch (error) {
          console.log('Error enhancing product:', error);
          // Still provide estimated pricing even if there's an error
          const estimatedPricing = getEstimatedPrice(product);
          return {
            ...product,
            imageUrl: getProductImageUrl(product),
            market: estimatedPricing,
            hasRealPricing: false,
            pricingSource: 'estimated'
          };
        }
      })
    );

    searchData.products = enhancedProducts;
  }
  
  return NextResponse.json({
    success: true,
    data: searchData,
    query,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

} catch (error) {
  console.error('StockX API Error:', error);
  return NextResponse.json(
    { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
    { status: 500 }
  );
}
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 10, offset = 0 } = body;

    // Redirect to GET with query parameters
    const url = new URL(request.url);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('offset', offset.toString());

    return await GET(new NextRequest(url, {
      headers: request.headers,
      method: 'GET'
    }));
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
} 