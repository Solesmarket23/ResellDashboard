import { NextRequest, NextResponse } from 'next/server';

interface EbayListing {
  title: string;
  price: number;
  currency: string;
  image: string;
  url: string;
  seller: string;
  condition: string;
  source: string;
  itemId: string;
  shipping?: number;
  bidsCount?: number;
  endTime?: string;
  buyItNowPrice?: number;
}

interface StockXPriceData {
  lowestAsk: number;
  highestBid: number;
  lastSale: number;
  productId: string;
  variantId: string;
  size: string;
}

interface ArbitrageOpportunity {
  ebayListing: EbayListing;
  stockxData: StockXPriceData | null;
  profit: number;
  profitMargin: number;
  totalCost: number;
  netRevenue: number;
  roi: number;
  matchedProduct?: string;
  confidence: number; // 0-100 confidence in the match
}

// Generate eBay application token from App ID and Cert ID
async function getEbayApplicationToken(appId: string, certId: string): Promise<string | null> {
  try {
    const credentials = `${appId}:${certId}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    console.log(`🔐 eBay credentials: App ID length ${appId.length}, Cert ID length ${certId.length}`);
    
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encodedCredentials}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ eBay token error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('✅ eBay token generated successfully');
    return data.access_token;
  } catch (error) {
    console.error('❌ eBay token generation error:', error);
    return null;
  }
}

// Enhanced eBay search with better product parsing
async function searchEbayForShoes(query: string, limit: number = 100): Promise<EbayListing[]> {
  const ebayAppId = process.env.EBAY_APP_ID;
  const ebayClientSecret = process.env.EBAY_CLIENT_SECRET;
  
  console.log(`🔍 eBay search called with query: "${query}"`);
  console.log(`🔑 eBay App ID configured: ${ebayAppId ? 'YES' : 'NO'}`);
  console.log(`🔑 eBay Client Secret configured: ${ebayClientSecret ? 'YES' : 'NO'}`);
  
  if (!ebayAppId || !ebayClientSecret) {
    console.log('❌ CRITICAL: Missing eBay credentials in environment variables');
    console.log('❌ Required: EBAY_APP_ID and EBAY_CLIENT_SECRET');
    throw new Error('eBay credentials not configured - need both EBAY_APP_ID and EBAY_CLIENT_SECRET');
  }

  try {
    // Get application token
    const accessToken = await getEbayApplicationToken(ebayAppId, ebayClientSecret);
    
    if (!accessToken) {
      console.log('❌ CRITICAL: Could not get eBay access token');
      throw new Error('Failed to authenticate with eBay API - check your credentials');
    }

      const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search`;
      
      // For style codes, search broadly without category restrictions
      const isStyleCode = query.match(/^[A-Z]{2}\d{4}-\d{3}$/i);
      
      const params = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        sort: 'price', // Sort by price ascending to find deals
        fieldgroups: 'MATCHING_ITEMS,EXTENDED'
      });

      // Only add category filter for non-style code searches
      if (!isStyleCode) {
        // Search in sneakers category only (eBay allows max 1 category)
        params.append('category_ids', '15709');
        params.append('filter', 'conditions:{NEW,USED_EXCELLENT,USED_VERY_GOOD}');
      }
      
      console.log(`🎯 Search type: ${isStyleCode ? 'Style Code' : 'Product Name'}`);
      console.log(`📋 Category filter: ${isStyleCode ? 'None (broad search)' : 'Sneakers & Athletic Shoes'}`);
      console.log(`🔍 Condition filter: ${isStyleCode ? 'All conditions' : 'NEW,USED_EXCELLENT,USED_VERY_GOOD'}`)

    console.log(`🌐 eBay API URL: ${apiUrl}?${params}`);
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    console.log(`📡 eBay API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ eBay API error:', response.status, errorText);
      throw new Error(`eBay API failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`📦 eBay API raw response:`, JSON.stringify(data, null, 2));
    
    const mappedResults = (data.itemSummaries || []).map((item: any) => ({
      title: item.title,
      price: parseFloat(item.price?.value || '0'),
      currency: item.price?.currency || 'USD',
      image: item.image?.imageUrl || '/placeholder-shoe.png',
      url: item.itemWebUrl,
      seller: item.seller?.username || 'Unknown',
      condition: item.condition || 'New',
      source: 'eBay',
      itemId: item.itemId,
      shipping: parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || '0'),
      bidsCount: item.bidCount || 0,
      endTime: item.itemEndDate,
      buyItNowPrice: item.buyItNowPrice ? parseFloat(item.buyItNowPrice.value) : undefined
    }));
    
    console.log(`✅ eBay search successful: Found ${mappedResults.length} listings for "${query}"`);
    console.log(`📝 Sample listing:`, mappedResults[0] || 'None');
    
    return mappedResults;

  } catch (error) {
    console.error('❌ eBay search error:', error);
    throw error; // Don't fall back to mock data
  }
}

// Parse shoe details from eBay listing title
function parseShoeDetails(title: string): { brand?: string; model?: string; size?: string; styleCode?: string; possibleSizes: string[] } {
  const normalizedTitle = title.toLowerCase();
  
  // Extract style code - look for common Nike/Adidas style patterns
  const styleCodePatterns = [
    /\b([A-Z]{2}\d{4}-\d{3})\b/i,  // Nike pattern: DJ0950-101
    /\b([A-Z]\d{5})\b/i,           // Adidas pattern: H01234
    /\b([A-Z]{2}\d{4})\b/i,        // Alternative Nike: DJ0950
    /\b(\d{6}-\d{3})\b/i,          // Numeric: 123456-789
    /\b([A-Z]{1,3}\d{3,5}-?\d{0,3})\b/i // General pattern
  ];
  
  let styleCode = undefined;
  for (const pattern of styleCodePatterns) {
    const match = title.match(pattern);
    if (match) {
      styleCode = match[1].toUpperCase();
      console.log(`🏷️ Found style code in eBay title: ${styleCode}`);
      break;
    }
  }
  
  // Common shoe brands
  const brands = ['nike', 'jordan', 'adidas', 'yeezy', 'new balance', 'vans', 'converse', 'puma', 'reebok', 'asics', 'supreme', 'off-white', 'fear of god'];
  const brand = brands.find(b => normalizedTitle.includes(b));
  
  // Extract sizes (US shoe sizes)
  const sizeRegex = /\b(?:size\s+)?(\d+(?:\.\d+)?)\b/gi;
  const sizeMatches = title.match(sizeRegex) || [];
  const possibleSizes = sizeMatches
    .map(match => match.replace(/size\s+/i, '').trim())
    .filter(size => {
      const num = parseFloat(size);
      return num >= 3 && num <= 18; // Reasonable shoe size range
    });
  
  // Try to extract the main size (first valid size mentioned)
  const size = possibleSizes[0];
  
  // Extract model (everything after brand, before size)
  let model = '';
  if (brand) {
    const brandIndex = normalizedTitle.indexOf(brand);
    let afterBrand = title.substring(brandIndex + brand.length).trim();
    
    // Remove size info from model
    if (size) {
      afterBrand = afterBrand.replace(new RegExp(`\\b(?:size\\s+)?${size}\\b`, 'gi'), '').trim();
    }
    
    // Clean up the model name
    model = afterBrand
      .replace(/\b(men|women|mens|womens|male|female|gs|ps|td)\b/gi, '')
      .replace(/\b(new|used|authentic|deadstock|ds)\b/gi, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .substring(0, 50); // Limit length
  }
  
  return { brand, model, size, styleCode, possibleSizes };
}

// Extract GTIN (UPC/EAN) from eBay listing title or description
function extractGTINFromTitle(title: string): string | undefined {
  // Look for UPC (12 digits) or EAN (13 digits)
  const upcMatch = title.match(/\b(\d{12})\b/);
  if (upcMatch) return upcMatch[1];
  
  const eanMatch = title.match(/\b(\d{13})\b/);
  if (eanMatch) return eanMatch[1];
  
  return undefined;
}

// Extract colorway from eBay listing title
function extractColorway(title: string): string | undefined {
  const normalizedTitle = title.toLowerCase();
  
  // Look for quoted colorways first
  const quotedMatch = title.match(/"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];
  
  // Common sneaker colorways
  const colorways = [
    'panda', 'bred', 'chicago', 'royal', 'shadow', 'pine green', 'court purple', 
    'obsidian', 'unc', 'fragment', 'travis scott', 'off white', 'triple white', 
    'triple black', 'core black', 'cloud white', 'zebra', 'butter', 'sesame', 
    'cream', 'bred toe', 'shattered backboard', 'game royal', 'storm blue'
  ];
  
  for (const colorway of colorways) {
    if (normalizedTitle.includes(colorway)) {
      return colorway.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
  }
  
  // Look for basic color combinations
  const colorMatch = title.match(/\b(black|white|red|blue|green|yellow|orange|purple|pink|grey|gray|brown)\s+(black|white|red|blue|green|yellow|orange|purple|pink|grey|gray|brown)\b/i);
  if (colorMatch) {
    return colorMatch[0];
  }
  
  return undefined;
}

// Generate multiple StockX search queries from eBay listing - try different variations
function generateStockXQueries(ebayTitle: string, parsedDetails: { brand?: string; model?: string; styleCode?: string }): string[] {
  const { brand, model, styleCode } = parsedDetails;
  const queries: string[] = [];
  const title = ebayTitle.toLowerCase();
  
  // Priority 1: Use style code if available (most accurate)
  if (styleCode) {
    queries.push(styleCode);
    console.log(`🎯 Style code query: ${styleCode}`);
  }
  
  // Priority 2: Specific Nike product patterns
  if (title.includes('nike')) {
    // Nike Dunk Low patterns
    if (title.includes('dunk') && title.includes('low')) {
      if (title.includes('panda') || (title.includes('black') && title.includes('white'))) {
        queries.push('Nike Dunk Low Panda');
        queries.push('Nike Dunk Low White Black');
        queries.push('Dunk Low Panda');
      } else {
        queries.push('Nike Dunk Low');
        queries.push('Dunk Low');
      }
    }
    // Nike Dunk High
    else if (title.includes('dunk') && title.includes('high')) {
      queries.push('Nike Dunk High');
      queries.push('Dunk High');
    }
    // Air Jordan patterns
    else if (title.includes('air jordan') || title.includes('jordan')) {
      if (title.includes('bred toe')) {
        queries.push('Air Jordan 1 Bred Toe');
        queries.push('Jordan 1 Bred Toe');
      } else if (title.includes('jordan 1')) {
        queries.push('Air Jordan 1');
        queries.push('Jordan 1');
      } else if (title.includes('jordan 4')) {
        queries.push('Air Jordan 4');
        queries.push('Jordan 4');
      } else if (title.includes('jordan')) {
        const jordanMatch = title.match(/jordan\s+(\d+)/);
        if (jordanMatch) {
          queries.push(`Air Jordan ${jordanMatch[1]}`);
          queries.push(`Jordan ${jordanMatch[1]}`);
        }
      }
    }
    // Nike Air Force 1
    else if (title.includes('air force') || title.includes('af1')) {
      queries.push('Nike Air Force 1');
      queries.push('Air Force 1');
    }
    // Nike Blazer
    else if (title.includes('blazer')) {
      queries.push('Nike Blazer');
      queries.push('Blazer');
    }
  }
  
  // Priority 3: Adidas patterns
  if (title.includes('adidas')) {
    if (title.includes('yeezy')) {
      if (title.includes('350')) {
        queries.push('Adidas Yeezy Boost 350');
        queries.push('Yeezy 350');
      } else if (title.includes('700')) {
        queries.push('Adidas Yeezy Boost 700');
        queries.push('Yeezy 700');
      } else {
        queries.push('Adidas Yeezy');
        queries.push('Yeezy');
      }
    }
    else if (title.includes('ultraboost')) {
      queries.push('Adidas Ultraboost');
      queries.push('Ultraboost');
    }
  }
  
  // Priority 4: Use brand + model if available
  if (brand && model) {
    const cleanModel = model.replace(/["]/g, '').trim();
    queries.push(`${brand} ${cleanModel}`);
  }
  
  // Priority 5: Extract key sneaker terms only
  const sneakerKeywords = ['nike', 'adidas', 'jordan', 'dunk', 'yeezy', 'boost', 'air', 'force', 'blazer', 'cortez'];
  const words = ebayTitle.split(' ').filter(word => {
    const w = word.toLowerCase();
    return w.length > 2 && 
           !['size', 'new', 'used', 'mens', 'womens', 'men', 'women', 'box', 'only', 'shoe', 'shoes'].includes(w) &&
           sneakerKeywords.some(keyword => w.includes(keyword) || ebayTitle.toLowerCase().includes(keyword));
  });
  
  if (words.length >= 2) {
    queries.push(words.slice(0, 3).join(' ')); // First 3 meaningful sneaker words
  }
  
  // Priority 6: Brand only as last resort (only for major sneaker brands)
  if (brand && ['nike', 'adidas', 'jordan'].includes(brand.toLowerCase()) && queries.length === 0) {
    queries.push(brand);
  }
  
  // Remove duplicates and return
  const uniqueQueries = [...new Set(queries)];
  console.log(`🔍 Generated ${uniqueQueries.length} queries for "${ebayTitle}": ${uniqueQueries.join(', ')}`);
  return uniqueQueries;
}

// Enhanced query generation using all available identifiers
function generateEnhancedStockXQueries(productDetails: any): string[] {
  const queries: string[] = [];
  
  // Priority 1: GTIN (most accurate if available)
  if (productDetails.gtin) {
    queries.push(productDetails.gtin);
    console.log(`🎯 Added GTIN query: ${productDetails.gtin}`);
  }
  
  // Priority 2: Style code
  if (productDetails.styleCode) {
    queries.push(productDetails.styleCode);
    console.log(`🎯 Added style code query: ${productDetails.styleCode}`);
  }
  
  // Priority 3: Brand + Model + Colorway combinations
  if (productDetails.brand && productDetails.model) {
    const baseQuery = `${productDetails.brand} ${productDetails.model}`;
    queries.push(baseQuery);
    
    if (productDetails.colorway) {
      queries.push(`${baseQuery} ${productDetails.colorway}`);
      queries.push(`${productDetails.brand} ${productDetails.model} "${productDetails.colorway}"`);
      // Try colorway first (some StockX listings lead with colorway)
      queries.push(`${productDetails.brand} ${productDetails.colorway} ${productDetails.model}`);
    }
  }
  
  // Priority 4: Use the original enhanced pattern matching
  const originalQueries = generateStockXQueries(productDetails.originalTitle, productDetails);
  queries.push(...originalQueries);
  
  // Remove duplicates and return
  const uniqueQueries = [...new Set(queries)];
  console.log(`🔍 Enhanced query generation for "${productDetails.originalTitle}": ${uniqueQueries.join(', ')}`);
  return uniqueQueries;
}

// Generate StockX search query from eBay listing - supports both style codes and product names
function generateStockXQuery(ebayTitle: string, parsedDetails: { brand?: string; model?: string; styleCode?: string }): string {
  const queries = generateStockXQueries(ebayTitle, parsedDetails);
  return queries[0] || ebayTitle.split(' ').slice(0, 3).join(' ');
}

// Search StockX for matching products using the same endpoint as the working StockX arbitrage finder
async function searchStockXForProduct(query: string): Promise<any[]> {
  try {
    console.log(`🔍 Searching StockX for: ${query}`);
    
    // Fix: Use the correct domain instead of env variable that might be undefined
    const baseUrl = 'https://www.solesmarket.com';
    const apiUrl = `${baseUrl}/api/stockx/search?query=${encodeURIComponent(query)}&limit=10`;
    
    console.log(`🌐 StockX API URL: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; solesmarket-arbitrage)'
      }
    });
    
    console.log(`📡 StockX API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`📦 StockX API response:`, data);
      
      // Check for authentication error
      if (data.error && data.authRequired) {
        console.log(`❌ StockX requires authentication: ${data.error}`);
        return [];
      }
      
      // Handle successful response with products
      if (data.products?.length > 0) {
        console.log(`✅ Found ${data.products.length} StockX products`);
        return data.products;
      } else {
        console.log(`⚠️ No StockX products found for: ${query}`);
        return [];
      }
    } else {
      const errorData = await response.text();
      console.log(`❌ StockX search failed (${response.status}): ${errorData}`);
      return [];
    }
    
  } catch (error) {
    console.log('❌ StockX search error:', error);
    return [];
  }
}


// Get StockX market data for a specific product and size
async function getStockXMarketData(productId: string, size?: string): Promise<StockXPriceData | null> {
  try {
    // Use your existing StockX market data API
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/stockx/products/${productId}/market-data`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Find the variant that matches the size
      const variants = data.variants || [];
      let targetVariant = variants.find((v: any) => v.size === size);
      
      // If no exact size match, use the first variant or aggregate data
      if (!targetVariant && variants.length > 0) {
        targetVariant = variants[0];
      }
      
      if (targetVariant) {
        return {
          lowestAsk: targetVariant.lowestAsk || 0,
          highestBid: targetVariant.highestBid || 0,
          lastSale: targetVariant.lastSale || 0,
          productId: productId,
          variantId: targetVariant.id,
          size: targetVariant.size || size || 'N/A'
        };
      }
    }
  } catch (error) {
    console.log('StockX market data error:', error);
  }
  
  return null;
}

// Calculate arbitrage opportunity
function calculateArbitrage(ebayListing: EbayListing, stockxData: StockXPriceData | null): ArbitrageOpportunity | null {
  if (!stockxData || !stockxData.lowestAsk) {
    return null;
  }
  
  // Calculate total cost (eBay price + shipping + fees)
  const ebayPrice = ebayListing.price;
  const shipping = ebayListing.shipping || 0;
  const ebayFees = ebayPrice * 0.03; // Assume 3% eBay fees for calculations
  const paypalFees = (ebayPrice + shipping) * 0.029; // PayPal fees
  const totalCost = ebayPrice + shipping + ebayFees + paypalFees;
  
  // Calculate net revenue (StockX ask - StockX fees)
  const stockxPrice = stockxData.lowestAsk;
  const stockxFees = stockxPrice * 0.095; // StockX takes 9.5% + transaction fees
  const stockxShipping = 13.95; // StockX shipping fee
  const netRevenue = stockxPrice - stockxFees - stockxShipping;
  
  // Calculate profit and margins
  const profit = netRevenue - totalCost;
  const profitMargin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  
  return {
    ebayListing,
    stockxData,
    profit,
    profitMargin,
    totalCost,
    netRevenue,
    roi,
    confidence: 0 // Will be calculated based on title matching
  };
}

// Calculate confidence score for eBay-StockX matching
function calculateMatchConfidence(ebayTitle: string, stockxTitle: string, parsedDetails: any): number {
  const ebayLower = ebayTitle.toLowerCase();
  const stockxLower = stockxTitle.toLowerCase();
  
  let confidence = 0;
  
  // Brand match
  if (parsedDetails.brand && stockxLower.includes(parsedDetails.brand.toLowerCase())) {
    confidence += 40;
  }
  
  // Model/keywords match
  const ebayWords = ebayLower.split(' ').filter(word => word.length > 2);
  const stockxWords = stockxLower.split(' ').filter(word => word.length > 2);
  const matchingWords = ebayWords.filter(word => 
    stockxWords.some(sw => sw.includes(word) || word.includes(sw))
  );
  
  confidence += Math.min(matchingWords.length * 10, 40);
  
  // Size match bonus
  if (parsedDetails.size && stockxTitle.includes(parsedDetails.size)) {
    confidence += 20;
  }
  
  return Math.min(confidence, 100);
}

// No more mock data - real eBay API only

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || '';
  const minProfitMargin = parseFloat(searchParams.get('minProfitMargin') || '15');
  const maxPrice = parseFloat(searchParams.get('maxPrice') || '1000');
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

  try {
    console.log(`🔍 Searching eBay for: "${query}" with minProfit: ${minProfitMargin}%, maxPrice: $${maxPrice}`);
    
    // Step 1: Search eBay for listings
    const ebayListings = await searchEbayForShoes(query, limit);
    console.log(`📦 Found ${ebayListings.length} eBay listings`);
    console.log(`📦 Sample listing:`, ebayListings[0] || 'None');
    
    if (ebayListings.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        message: 'No eBay listings found for this search'
      });
    }
    
    // Step 2: Process each eBay listing
    const opportunities: ArbitrageOpportunity[] = [];
    
    
    console.log(`🔄 Starting to process ${ebayListings.length} eBay listings...`);
    
    for (let i = 0; i < ebayListings.length; i++) {
      const listing = ebayListings[i];
      console.log(`\n--- Processing eBay listing ${i + 1}/${ebayListings.length} ---`);
      console.log(`📦 eBay listing: ${listing.title} - $${listing.price}`);
      
      // Skip if over max price
      if (listing.price > maxPrice) {
        console.log(`❌ Skipping: Price $${listing.price} exceeds max $${maxPrice}`);
        continue;
      }
      
      // Skip obviously irrelevant listings
      const title = listing.title.toLowerCase();
      
      // Skip box-only listings
      if (title.includes('box only') && !title.includes('with box')) {
        console.log(`❌ Skipping box-only listing: ${listing.title}`);
        continue;
      }
      
      // Skip non-sneaker brands (unless searching for a specific style code)
      const hasSneakerBrand = ['nike', 'adidas', 'jordan', 'yeezy', 'puma', 'new balance', 'vans', 'converse'].some(brand => 
        title.includes(brand)
      );
      
      if (!hasSneakerBrand && !query.match(/^[A-Z]{2}\d{4}-\d{3}$/i)) {
        console.log(`❌ Skipping non-sneaker brand: ${listing.title}`);
        continue;
      }
      
      // Parse product details from listing (enhanced with GTIN support)
      const parsedDetails = parseShoeDetails(listing.title);
      
      // Enhanced: Extract additional identifiers from eBay listing
      const enhancedDetails = {
        ...parsedDetails,
        originalTitle: listing.title,
        // TODO: Extract from eBay item specifics when available
        gtin: extractGTINFromTitle(listing.title),
        colorway: extractColorway(listing.title),
        condition: listing.condition,
        seller: listing.seller
      };
      
      console.log(`📝 Enhanced details:`, enhancedDetails);
      
      // Generate multiple StockX search queries to try (enhanced with GTIN/colorway)
      const stockxQueries = generateEnhancedStockXQueries(enhancedDetails);
      console.log(`🔍 Generated ${stockxQueries.length} enhanced StockX queries:`, stockxQueries);
      
      let stockxProducts: any[] = [];
      let usedQuery = '';
      
      // Try each query until we find matches
      for (const query of stockxQueries) {
        console.log(`🔍 Trying StockX query: "${query}"`);
        stockxProducts = await searchStockXForProduct(query);
        console.log(`📈 Found ${stockxProducts.length} StockX matches for "${query}"`);
        
        if (stockxProducts.length > 0) {
          usedQuery = query;
          break;
        }
        
        // Small delay between searches to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (stockxProducts.length === 0) {
        console.log(`⚠️ No StockX matches found after trying ${stockxQueries.length} queries:`, stockxQueries);
        
        // Create a "no match" entry for debugging so users can see what was processed
        opportunities.push({
          ebayListing: {
            itemId: listing.itemId,
            title: listing.title,
            price: listing.price,
            currency: listing.currency,
            image: listing.image,
            url: listing.url,
            seller: listing.seller,
            condition: listing.condition,
            shipping: listing.shipping,
            source: 'ebay'
          },
          stockxData: null,
          profit: -999, // Clearly unprofitable
          profitMargin: -100,
          totalCost: listing.price + (listing.shipping || 0),
          netRevenue: 0,
          roi: -100,
          matchedProduct: `No StockX match found. Tried: ${stockxQueries.join(', ')}`,
          confidence: 100 // High confidence that this listing was processed (for debugging display)
        });
        continue;
      }
      
      // Process each StockX match
      for (const stockxProduct of stockxProducts) {
        try {
          // Get market data for this product
          const marketData = await getStockXMarketData(stockxProduct.id, parsedDetails.size);
          
          if (marketData) {
            console.log(`💰 Market data: Ask $${marketData.lowestAsk}, Bid $${marketData.highestBid}`);
            
            // Calculate arbitrage opportunity
            const arbitrage = calculateArbitrage(listing, marketData);
            
            if (arbitrage) {
              console.log(`💡 Arbitrage calc: Profit $${arbitrage.profit.toFixed(2)} (${arbitrage.profitMargin.toFixed(1)}%) - Min required: ${minProfitMargin}%`);
              
              // Calculate match confidence
              arbitrage.confidence = calculateMatchConfidence(listing.title, stockxProduct.title, parsedDetails);
              arbitrage.matchedProduct = `${stockxProduct.title} (found with: "${usedQuery}")`;
              
              // TEMPORARILY: Show ALL matches regardless of profitability for debugging
              opportunities.push(arbitrage);
              
              if (arbitrage.profitMargin >= minProfitMargin && arbitrage.profit > 0) {
                console.log(`✅ Profitable opportunity: $${arbitrage.profit.toFixed(2)} profit (${arbitrage.profitMargin.toFixed(1)}%)`);
              } else {
                console.log(`🔍 Unprofitable match (showing for debugging): $${arbitrage.profit.toFixed(2)} profit (${arbitrage.profitMargin.toFixed(1)}%)`);
              }
            }
          }
        } catch (error) {
          console.error('Error processing StockX product:', error);
        }
      }
      
      // Rate limiting to avoid overwhelming APIs
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Sort by profit descending
    opportunities.sort((a, b) => b.profit - a.profit);
    
    console.log(`🎯 Found ${opportunities.length} total matches (including unprofitable ones for debugging)`);
    
    return NextResponse.json({
      success: true,
      opportunities: opportunities.slice(0, 50), // Limit results
      searchQuery: query,
      totalEbayListings: ebayListings.length,
      totalOpportunities: opportunities.length,
      averageProfit: opportunities.length > 0 ? 
        opportunities.reduce((sum, opp) => sum + opp.profit, 0) / opportunities.length : 0,
      averageProfitMargin: opportunities.length > 0 ? 
        opportunities.reduce((sum, opp) => sum + opp.profitMargin, 0) / opportunities.length : 0
    });

  } catch (error) {
    console.error('Arbitrage search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to search for arbitrage opportunities',
      details: error.message
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // For future: could add functionality to save/track opportunities
  return NextResponse.json({ error: 'Method not implemented' }, { status: 501 });
}
