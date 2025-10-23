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
  searchMethod?: 'gtin' | 'stylecode' | 'text'; // How the product was matched
  gtin?: string; // GTIN used for matching (if applicable)
  styleCode?: string; // Style code used for matching (if applicable)
  stockxUrl?: string; // Direct StockX product URL
  stockxProductId?: string;
  stockxUrlKey?: string;
}

// Normalize style codes for exact matching (remove non-alphanumerics, uppercase)
function normalizeStyleCode(input: string): string {
  return (input || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
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

// Search eBay directly by GTIN for exact product matches
async function searchEbayByGTIN(gtin: string, limit: number = 100): Promise<EbayListing[]> {
  const ebayAppId = process.env.EBAY_APP_ID;
  const ebayClientSecret = process.env.EBAY_CLIENT_SECRET;
  
  console.log(`🔍 eBay GTIN search called for: ${gtin}`);
  
  if (!ebayAppId || !ebayClientSecret) {
    console.log('❌ CRITICAL: Missing eBay credentials in environment variables');
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
    
    const params = new URLSearchParams({
      gtin: gtin, // Direct GTIN search
      limit: limit.toString(),
      sort: 'price', // Sort by price ascending to find deals
      fieldgroups: 'MATCHING_ITEMS,EXTENDED'
    });
    
    console.log(`🌐 eBay GTIN API URL: ${apiUrl}?${params}`);
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS%2Czip%3D90210'
      }
    });

    console.log(`📡 eBay GTIN API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ eBay GTIN API error:', response.status, errorText);
      throw new Error(`eBay GTIN API failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`📦 eBay GTIN API raw response:`, JSON.stringify(data, null, 2));
    
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
    
    console.log(`✅ eBay GTIN search successful: Found ${mappedResults.length} listings for GTIN ${gtin}`);
    console.log(`📝 Sample GTIN listing:`, mappedResults[0] || 'None');
    
    return mappedResults;

  } catch (error) {
    console.error('❌ eBay GTIN search error:', error);
    throw error;
  }
}

// Enhanced eBay search with GTIN support and better product parsing
async function searchEbayForShoes(query: string, limit: number = 100, authenticityGuaranteeOnly: boolean = false, gtin?: string): Promise<EbayListing[]> {
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
      
      // Check if we have a GTIN for direct search
      const hasGTIN = gtin && isValidGTIN(gtin);
      
      // Enhance query to find actual shoes, not boxes
      const enhancedQuery = isStyleCode ? query : `${query} sneakers shoes -box -"box only" -empty`;
      
      const params = new URLSearchParams({
        q: enhancedQuery,
        limit: limit.toString(),
        sort: 'price', // Sort by price ascending to find deals
        fieldgroups: 'MATCHING_ITEMS,EXTENDED'
      });
      
      // Add GTIN as direct search parameter if available
      if (hasGTIN) {
        params.set('gtin', gtin);
        console.log(`🏷️ Using GTIN for direct eBay search: ${gtin}`);
      }
      
      console.log(`🔍 Enhanced eBay query: "${enhancedQuery}"`);

      // Build filters array and combine into single filter parameter
      const filters = [];
      
      // Only add category filter for non-style code searches
      if (!isStyleCode) {
        // Search in sneakers category only (eBay allows max 1 category)
        params.append('category_ids', '15709');
        // Add condition filter
        filters.push('conditions:{NEW,USED_EXCELLENT,USED_VERY_GOOD}');
        // Add price range filter to avoid very expensive items
        filters.push('price:[..1000]');
      }
      
      // Add authenticity guarantee filter if requested
      if (authenticityGuaranteeOnly) {
        // According to eBay docs, delivery location is required for authenticity guarantee
        filters.push('deliveryCountry:US');
        filters.push('deliveryPostalCode:90210');
        filters.push('qualifiedPrograms:{AUTHENTICITY_GUARANTEE}');
        console.log('✅ Authenticity Guarantee filter enabled with proper delivery location');
      }
      
      // Combine all filters into single parameter
      if (filters.length > 0) {
        params.append('filter', filters.join(','));
        console.log(`🔍 Combined filters: ${filters.join(',')}`);
      }
      
      console.log(`🎯 Search type: ${isStyleCode ? 'Style Code' : 'Product Name'}`);
      console.log(`📋 Category filter: ${isStyleCode ? 'None (broad search)' : 'Sneakers & Athletic Shoes'}`);
      console.log(`🔍 Condition filter: ${isStyleCode ? 'All conditions' : 'NEW,USED_EXCELLENT,USED_VERY_GOOD'}`);
      console.log(`🛡️ Authenticity Guarantee: ${authenticityGuaranteeOnly ? 'Required' : 'Not required'}`);

    console.log(`🌐 eBay API URL: ${apiUrl}?${params}`);
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS%2Czip%3D90210'
      }
    });

    console.log(`📡 eBay API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ eBay API error:', response.status, errorText);
      console.error(`🔍 Request URL: ${apiUrl}?${params}`);
      console.error(`📋 Request headers:`, {
        'Authorization': `Bearer ${accessToken?.slice(0, 20)}...`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS%2Czip%3D90210'
      });
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
      styleCode = normalizeStyleCode(match[1]);
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

// Enhanced GTIN extraction with validation and multiple formats
function extractGTINFromTitle(title: string): string | undefined {
  // Remove common prefixes and clean the title
  const cleanTitle = title
    .replace(/\b(upc|ean|gtin|barcode|code):\s*/gi, '')
    .replace(/\b(upc|ean|gtin|barcode|code)\s*#?\s*/gi, '')
    .replace(/[^\d\s]/g, ' ') // Keep only digits and spaces
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  // Look for UPC (12 digits) - most common for US products
  const upcMatch = cleanTitle.match(/\b(\d{12})\b/);
  if (upcMatch && isValidUPC(upcMatch[1])) {
    console.log(`🏷️ Found valid UPC: ${upcMatch[1]}`);
    return upcMatch[1];
  }
  
  // Look for EAN (13 digits) - international standard
  const eanMatch = cleanTitle.match(/\b(\d{13})\b/);
  if (eanMatch && isValidEAN(eanMatch[1])) {
    console.log(`🏷️ Found valid EAN: ${eanMatch[1]}`);
    return eanMatch[1];
  }
  
  // Look for GTIN-14 (14 digits) - used for trade items
  const gtin14Match = cleanTitle.match(/\b(\d{14})\b/);
  if (gtin14Match && isValidGTIN14(gtin14Match[1])) {
    console.log(`🏷️ Found valid GTIN-14: ${gtin14Match[1]}`);
    return gtin14Match[1];
  }
  
  // Look for any 8-14 digit sequence that might be a GTIN
  const anyGtinMatch = cleanTitle.match(/\b(\d{8,14})\b/);
  if (anyGtinMatch) {
    const candidate = anyGtinMatch[1];
    if (isValidGTIN(candidate)) {
      console.log(`🏷️ Found valid GTIN: ${candidate}`);
      return candidate;
    }
  }
  
  return undefined;
}

// Validate UPC (12 digits) using check digit algorithm
function isValidUPC(upc: string): boolean {
  if (!/^\d{12}$/.test(upc)) return false;
  
  const digits = upc.split('').map(Number);
  let sum = 0;
  
  // UPC check digit calculation
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[11];
}

// Validate EAN (13 digits) using check digit algorithm
function isValidEAN(ean: string): boolean {
  if (!/^\d{13}$/.test(ean)) return false;
  
  const digits = ean.split('').map(Number);
  let sum = 0;
  
  // EAN check digit calculation
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[12];
}

// Validate GTIN-14 (14 digits)
function isValidGTIN14(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) return false;
  
  const digits = gtin.split('').map(Number);
  let sum = 0;
  
  // GTIN-14 check digit calculation
  for (let i = 0; i < 13; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[13];
}

// Generic GTIN validation for any length
function isValidGTIN(gtin: string): boolean {
  const length = gtin.length;
  
  if (length === 12) return isValidUPC(gtin);
  if (length === 13) return isValidEAN(gtin);
  if (length === 14) return isValidGTIN14(gtin);
  
  // For other lengths, use basic format validation
  return /^\d{8,14}$/.test(gtin);
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
        queries.push('Dunk Low White Black');
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
    // General Nike search
    else {
      queries.push('Nike');
    }
  }
  
  // Priority 3: Adidas patterns
  if (title.includes('adidas')) {
    if (title.includes('yeezy')) {
      if (title.includes('350')) {
        queries.push('Adidas Yeezy Boost 350');
        queries.push('Yeezy 350');
        queries.push('Yeezy Boost 350 V2');
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
    // General Adidas search
    else {
      queries.push('Adidas');
    }
  }
  
  // Priority 4: Use brand + model if available
  if (brand && model) {
    const cleanModel = model.replace(/["]/g, '').trim();
    queries.push(`${brand} ${cleanModel}`);
  }
  
  // Priority 5: Extract key sneaker terms only - be more specific
  const sneakerKeywords = ['nike', 'adidas', 'jordan', 'dunk', 'yeezy', 'boost', 'air', 'force', 'blazer', 'cortez', 'retro', 'og', 'high', 'low', 'mid'];
  const words = ebayTitle.split(' ').filter(word => {
    const w = word.toLowerCase();
    return w.length > 2 && 
           !['size', 'new', 'used', 'mens', 'womens', 'men', 'women', 'box', 'only', 'shoe', 'shoes', 'sneakers'].includes(w) &&
           sneakerKeywords.some(keyword => w.includes(keyword) || ebayTitle.toLowerCase().includes(keyword));
  });
  
  if (words.length >= 2) {
    // Use more specific combinations
    queries.push(words.slice(0, 4).join(' ')); // First 4 meaningful sneaker words
    if (words.length >= 3) {
      queries.push(words.slice(0, 3).join(' ')); // First 3 words
    }
    if (words.length >= 2) {
      queries.push(words.slice(0, 2).join(' ')); // First 2 words
    }
  }
  
  // Priority 6: Brand only as last resort (only for major sneaker brands)
  if (brand && ['nike', 'adidas', 'jordan'].includes(brand.toLowerCase()) && queries.length === 0) {
    queries.push(brand);
  }
  
  // Priority 7: Generic sneaker search terms
  if (queries.length === 0) {
    if (title.includes('sneaker') || title.includes('shoe')) {
      queries.push('sneakers');
    }
  }
  
  // Remove duplicates and return
  const uniqueQueries = Array.from(new Set(queries));
  console.log(`🔍 Generated ${uniqueQueries.length} queries for "${ebayTitle}":`);
  uniqueQueries.forEach((q, i) => console.log(`  ${i + 1}. "${q}"`));
  return uniqueQueries;
}

// Enhanced query generation using all available identifiers with priority order
function generateEnhancedStockXQueries(productDetails: any): { 
  queries: string[]; 
  hasGTIN: boolean; 
  hasStyleCode: boolean;
  gtin?: string; 
  styleCode?: string;
} {
  const queries: string[] = [];
  let hasGTIN = false;
  let hasStyleCode = false;
  let gtin: string | undefined;
  let styleCode: string | undefined;
  
  // Priority 1: Style Code (most accurate for sneakers, required field in StockX API) - will be handled separately
  if (productDetails.styleCode) {
    styleCode = productDetails.styleCode;
    hasStyleCode = true;
    console.log(`🎯 Style code available for direct search: ${productDetails.styleCode}`);
  }
  
  // Priority 2: GTIN (very accurate if available) - will be handled separately
  if (productDetails.gtin) {
    gtin = productDetails.gtin;
    hasGTIN = true;
    console.log(`🎯 GTIN available for direct search: ${productDetails.gtin}`);
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
  const uniqueQueries = Array.from(new Set(queries));
  console.log(`🔍 Enhanced query generation for "${productDetails.originalTitle}": ${uniqueQueries.join(', ')}`);
  return { queries: uniqueQueries, hasGTIN, hasStyleCode, gtin, styleCode };
}

// Generate StockX search query from eBay listing - supports both style codes and product names
function generateStockXQuery(ebayTitle: string, parsedDetails: { brand?: string; model?: string; styleCode?: string }): string {
  const queries = generateStockXQueries(ebayTitle, parsedDetails);
  return queries[0] || ebayTitle.split(' ').slice(0, 3).join(' ');
}

// Search StockX using GTIN/UPC/EAN for exact product matches
async function searchStockXByGTIN(gtin: string, request: NextRequest): Promise<any[]> {
  try {
    console.log(`🔍 Searching StockX by GTIN: ${gtin}`);
    
    // Get authentication tokens from cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;
    
    if (!accessToken || !apiKey) {
      console.log(`❌ Missing StockX credentials for GTIN search`);
      return [];
    }
    
    // Try multiple StockX search approaches for GTIN
    const searchQueries = [
      gtin, // Direct GTIN search
      `UPC:${gtin}`, // UPC prefix
      `EAN:${gtin}`, // EAN prefix
      `GTIN:${gtin}`, // GTIN prefix
      `Barcode:${gtin}`, // Barcode prefix
    ];
    
    for (const searchQuery of searchQueries) {
      try {
        console.log(`🔍 Trying GTIN search query: "${searchQuery}"`);
        
        const searchApiParams = new URLSearchParams({
          query: searchQuery,
          pageNumber: '1',
          pageSize: '10'
        });

        const searchUrl = `https://api.stockx.com/v2/catalog/search?${searchApiParams.toString()}`;
        console.log(`🌐 GTIN StockX API call: ${searchUrl}`);
        
        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
          }
        });
        
        console.log(`📡 GTIN StockX API response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const products = data.products || [];
          
          console.log(`📦 GTIN StockX response: Found ${products.length} products`);
          
          if (products.length > 0) {
            console.log(`✅ GTIN search successful with query: "${searchQuery}"`);
            console.log(`📋 GTIN matches:`, products.slice(0, 3).map((p: any) => ({
              id: p.id || p.uuid || p.productId,
              title: p.title || p.name,
              brand: p.brand,
              urlKey: p.urlKey,
              productId: p.productId
            })));
            
            return products;
          }
        } else {
          const errorText = await response.text();
          console.log(`❌ GTIN search failed (${response.status}): ${errorText}`);
        }
        
        // Small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`❌ Error with GTIN search query "${searchQuery}":`, error);
        continue;
      }
    }
    
    console.log(`❌ No StockX products found for GTIN: ${gtin}`);
    return [];
    
  } catch (error) {
    console.log('❌ GTIN StockX search error:', error);
    return [];
  }
}

// Search StockX using Style Code for exact product matches (based on StockX API schema)
async function searchStockXByStyleCode(styleCode: string, request: NextRequest): Promise<any[]> {
  try {
    console.log(`🔍 Searching StockX by Style Code: ${styleCode}`);
    
    // Get authentication tokens from cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;
    
    if (!accessToken || !apiKey) {
      console.log(`❌ Missing StockX credentials for style code search`);
      return [];
    }
    
    // Try multiple StockX search approaches for style code
    const searchQueries = [
      styleCode, // Direct style code search
      `style:${styleCode}`, // Style prefix
      `styleCode:${styleCode}`, // StyleCode prefix
      `code:${styleCode}`, // Code prefix
      `SKU:${styleCode}`, // SKU prefix
    ];
    
    const target = normalizeStyleCode(styleCode);

    for (const searchQuery of searchQueries) {
      try {
        console.log(`🔍 Trying style code search query: "${searchQuery}"`);
        
        const searchApiParams = new URLSearchParams({
          query: searchQuery,
          pageNumber: '1',
          pageSize: '10'
        });

        const searchUrl = `https://api.stockx.com/v2/catalog/search?${searchApiParams.toString()}`;
        console.log(`🌐 Style Code StockX API call: ${searchUrl}`);
        
        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'FlipFlow/1.0'
          }
        });
        
        console.log(`📡 Style Code StockX API response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const products = data.products || [];
          
          console.log(`📦 Style Code StockX response: Found ${products.length} products`);
          // Enforce exact style code match when possible
          const filtered = products.filter((p: any) => {
            const candidate = p.styleCode || p.sku || p.code || p.productStyle || p.style;
            return candidate ? normalizeStyleCode(String(candidate)) === target : false;
          });
          
          if (filtered.length > 0) {
            console.log(`✅ Exact style code match(es) found for ${styleCode} using query: "${searchQuery}"`);
            console.log(`📋 Exact matches:`, filtered.slice(0, 3).map((p: any) => ({
              id: p.id || p.uuid || p.productId,
              title: p.title || p.name,
              brand: p.brand,
              urlKey: p.urlKey,
              productId: p.productId,
              styleCode: p.styleCode || p.sku
            })));
            return filtered;
          }
          // If no exact matches, fall back to returning all products (to allow downstream filters)
          if (products.length > 0) {
            console.log(`⚠️ No exact style code match; returning ${products.length} candidates for downstream filtering`);
            return products;
          }
        } else {
          const errorText = await response.text();
          console.log(`❌ Style code search failed (${response.status}): ${errorText}`);
        }
        
        // Small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`❌ Error with style code search query "${searchQuery}":`, error);
        continue;
      }
    }
    
    console.log(`❌ No StockX products found for style code: ${styleCode}`);
    return [];
    
  } catch (error) {
    console.log('❌ Style code StockX search error:', error);
    return [];
  }
}

// Search StockX for matching products using direct API call (no HTTP intermediary)
async function searchStockXForProduct(query: string, request: NextRequest): Promise<any[]> {
  try {
    console.log(`🔍 Searching StockX catalog directly for: ${query}`);
    
    // Get authentication tokens from cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;
    
    if (!accessToken) {
      console.log(`❌ No StockX access token found - user needs to authenticate`);
      return [];
    }
    
    if (!apiKey) {
      console.log(`❌ No StockX API key configured`);
      return [];
    }
    
    // Use StockX catalog search API directly
    const searchApiParams = new URLSearchParams({
      query: query,
      pageNumber: '1',
      pageSize: '10'
    });

    const searchUrl = `https://api.stockx.com/v2/catalog/search?${searchApiParams.toString()}`;
    console.log(`🌐 Direct StockX API call: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey, // Fixed: should be X-API-Key, not x-api-key
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });
    
    console.log(`📡 StockX API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      const products = data.products || [];
      
      console.log(`📦 StockX catalog response:`, {
        productCount: products.length,
        totalResults: data.totalResults || 0,
        hasProducts: products.length > 0
      });
      
      if (products.length > 0) {
        console.log(`✅ Found ${products.length} StockX products`);
        
        // Log first few products for debugging
        console.log(`📋 Sample StockX products:`, products.slice(0, 3).map((p: any) => ({
          id: p.id || p.uuid || p.productId,
          title: p.title || p.name,
          brand: p.brand,
          urlKey: p.urlKey,
          productId: p.productId
        })));
        
        return products;
      } else {
        console.log(`⚠️ No StockX products found for: ${query}`);
        return [];
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ StockX catalog search failed (${response.status}): ${errorText}`);
      
      // If unauthorized, user needs to authenticate
      if (response.status === 401) {
        console.log(`🔐 Authentication required - user should connect StockX account`);
      }
      
      return [];
    }
    
  } catch (error) {
    console.log('❌ StockX search error:', error);
    return [];
  }
}


// Get StockX market data for a specific product and size using direct API call
async function getStockXMarketData(productId: string, size?: string, request?: NextRequest): Promise<StockXPriceData | null> {
  try {
    console.log(`💰 Fetching market data for product: ${productId}, size: ${size || 'any'}`);
    
    // Get authentication tokens from cookies if request is provided
    let accessToken = '';
    let apiKey = process.env.STOCKX_API_KEY;
    
    if (request) {
      accessToken = request.cookies.get('stockx_access_token')?.value || '';
      apiKey = process.env.STOCKX_API_KEY;
    }
    
    if (!accessToken || !apiKey) {
      console.log(`❌ Missing StockX credentials for market data`);
      return null;
    }
    
    // Use direct StockX API call instead of internal API
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    console.log(`🌐 Direct StockX market data API call: ${marketUrl}`);
    
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

    console.log(`📡 Market data API response status: ${response.status}`);

    if (response.ok) {
      const marketData = await response.json();
      console.log(`✅ Market data response for ${productId}:`, {
        isArray: Array.isArray(marketData),
        variantCount: Array.isArray(marketData) ? marketData.length : 0,
        hasData: !!marketData,
        sampleData: Array.isArray(marketData) ? marketData[0] : null
      });
      
      // Market data response format from StockX API
      const variants = Array.isArray(marketData) ? marketData : [];
      
      // Find the variant that matches the size
      let targetVariant = null;
      if (size) {
        targetVariant = variants.find((v: any) => 
          v.variantValue === size || 
          v.size === size || 
          v.displaySize === size ||
          v.sizeValue === size ||
          v.shoeSize === size
        );
      }
      
      // If no exact size match, use the first variant with market data
      if (!targetVariant && variants.length > 0) {
        targetVariant = variants.find((v: any) => 
          (v.lowestAskAmount && v.lowestAskAmount > 0) || 
          (v.lowestAsk && v.lowestAsk > 0)
        ) || variants[0];
      }
      
      if (targetVariant) {
        // Handle different response formats
        const lowestAsk = targetVariant.lowestAskAmount || targetVariant.lowestAsk || 0;
        const highestBid = targetVariant.highestBidAmount || targetVariant.highestBid || 0;
        const lastSale = targetVariant.lastSaleAmount || targetVariant.lastSale || lowestAsk;
        
        console.log(`📊 Found market data:`, {
          size: targetVariant.variantValue || targetVariant.size || targetVariant.displaySize || targetVariant.sizeValue || targetVariant.shoeSize,
          lowestAsk: lowestAsk,
          highestBid: highestBid,
          lastSale: lastSale,
          variantId: targetVariant.variantId || targetVariant.id
        });
        
        if (lowestAsk > 0) {
          return {
            lowestAsk: lowestAsk,
            highestBid: highestBid,
            lastSale: lastSale,
            productId: productId,
            variantId: targetVariant.variantId || targetVariant.id,
            size: targetVariant.variantValue || targetVariant.size || targetVariant.displaySize || targetVariant.sizeValue || targetVariant.shoeSize || size || 'N/A'
          };
        } else {
          console.log(`⚠️ No valid pricing data found for ${productId} size ${size}`);
        }
      } else {
        console.log(`⚠️ No market data variants found for ${productId} size ${size}`);
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Market data request failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.log('❌ StockX market data error:', error);
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
  const newItemsOnly = searchParams.get('newItemsOnly') === 'true';
  const authenticityGuaranteeOnly = searchParams.get('authenticityGuaranteeOnly') === 'true';

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

  // Check StockX authentication early
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;
  
  if (!accessToken) {
    return NextResponse.json({
      success: false,
      error: 'StockX authentication required',
      message: 'Please connect your StockX account first to enable price comparisons',
      authRequired: true,
      opportunities: [],
      totalEbayListings: 0,
      totalOpportunities: 0
    }, { status: 401 });
  }

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'StockX API not configured',
      message: 'StockX API credentials are not properly configured',
      opportunities: [],
      totalEbayListings: 0,
      totalOpportunities: 0
    }, { status: 500 });
  }

  try {
    console.log(`🔍 === ARBITRAGE SEARCH DEBUG START ===`);
    console.log(`🔍 Searching eBay for: "${query}" with minProfit: ${minProfitMargin}%, maxPrice: $${maxPrice}, newOnly: ${newItemsOnly}, authenticityGuarantee: ${authenticityGuaranteeOnly}`);
    
    // Step 1: Search eBay for listings
    // Check if query contains a GTIN for direct eBay search
    const extractedGTIN = extractGTINFromTitle(query);
    let ebayListings: EbayListing[] = [];
    
    if (extractedGTIN) {
      console.log(`🏷️ GTIN detected in query, searching eBay by GTIN: ${extractedGTIN}`);
      try {
        ebayListings = await searchEbayByGTIN(extractedGTIN, limit);
        console.log(`📦 Found ${ebayListings.length} eBay listings by GTIN`);
      } catch (error) {
        console.error(`❌ eBay GTIN search failed, falling back to keyword search:`, error);
        ebayListings = await searchEbayForShoes(query, limit, authenticityGuaranteeOnly);
      }
    } else {
      console.log(`🔍 No GTIN detected, searching eBay by keyword: "${query}"`);
      ebayListings = await searchEbayForShoes(query, limit, authenticityGuaranteeOnly);
    }
    
    console.log(`📦 Found ${ebayListings.length} eBay listings total`);
    console.log(`📦 Sample listing:`, ebayListings[0] || 'None');
    
    if (ebayListings.length === 0) {
      console.log(`❌ No eBay listings found - search term might be too specific or no results`);
      return NextResponse.json({
        success: true,
        opportunities: [],
        searchQuery: query,
        totalEbayListings: 0,
        totalOpportunities: 0,
        message: 'No eBay listings found for this search',
        debugInfo: 'eBay search returned 0 results'
      });
    }
    
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
    console.log(`📝 Sample eBay item:`, ebayListings[0]);
    
    for (let i = 0; i < ebayListings.length; i++) {
      const listing = ebayListings[i];
      console.log(`\n🔄 === Processing eBay listing ${i + 1}/${ebayListings.length} ===`);
      console.log(`🏷️ eBay Item ${i + 1}: ${listing.title} - $${listing.price}`);
      
      // Skip if over max price
      if (listing.price > maxPrice) {
        console.log(`❌ Skipping: Price $${listing.price} exceeds max $${maxPrice}`);
        continue;
      }
      
      // Skip obviously irrelevant listings
      const title = listing.title.toLowerCase();
      
      // Skip box-only listings (more comprehensive check)
      const isBoxOnly = (
        title.includes('box only') ||
        title.includes('empty box') ||
        title.includes('shoe box only') ||
        title.includes('replacement box') ||
        (title.includes('box') && !title.includes('with box') && !title.includes('new box') && (
          title.includes('just') || 
          title.includes('only') ||
          title.includes('empty')
        ))
      );
      
      if (isBoxOnly) {
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
      
      // Skip used items if newItemsOnly filter is enabled
      if (newItemsOnly) {
        const condition = listing.condition.toLowerCase();
        const isNewItem = condition.includes('new') || condition.includes('brand new') || condition.includes('new with box') || condition.includes('new with tags') || condition.includes('new without box');
        
        if (!isNewItem) {
          console.log(`❌ Skipping used item (newItemsOnly=true): ${listing.title} - Condition: ${listing.condition}`);
          continue;
        }
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
      
      // Generate multiple StockX search queries to try (enhanced with GTIN/style code/colorway)
      const { queries: stockxQueries, hasGTIN, hasStyleCode, gtin, styleCode } = generateEnhancedStockXQueries(enhancedDetails);
      console.log(`🔍 Generated ${stockxQueries.length} enhanced StockX queries:`, stockxQueries);
      
      let stockxProducts: any[] = [];
      let usedQuery = '';
      let searchMethod: 'gtin' | 'stylecode' | 'text' = 'text';
      
      // Log StockX lookup attempt
      console.log(`🔍 Looking up on StockX...`);
      
      // Priority 1: Try Style Code search first (most accurate for sneakers, required in StockX API)
      if (hasStyleCode && styleCode) {
        console.log(`🎯 Attempting Style Code search first: ${styleCode}`);
        try {
          stockxProducts = await searchStockXByStyleCode(styleCode, request);
          console.log(`📈 Style code search found ${stockxProducts.length} StockX matches`);
          
          if (stockxProducts.length > 0) {
            usedQuery = styleCode;
            searchMethod = 'stylecode';
            console.log(`✅ Style code search successful: ${stockxProducts[0].title || stockxProducts[0].name} - $${stockxProducts[0].price || 'N/A'}`);
          }
        } catch (error) {
          console.error(`❌ Error with style code search:`, error);
        }
      }
      
      // Priority 2: Try GTIN search if style code search failed or not available
      if (stockxProducts.length === 0 && hasGTIN && gtin) {
        console.log(`🎯 Attempting GTIN search: ${gtin}`);
        try {
          stockxProducts = await searchStockXByGTIN(gtin, request);
          console.log(`📈 GTIN search found ${stockxProducts.length} StockX matches`);
          
          if (stockxProducts.length > 0) {
            usedQuery = gtin;
            searchMethod = 'gtin';
            console.log(`✅ GTIN search successful: ${stockxProducts[0].title || stockxProducts[0].name} - $${stockxProducts[0].price || 'N/A'}`);
          }
        } catch (error) {
          console.error(`❌ Error with GTIN search:`, error);
        }
      }
      
      // Priority 3: Fall back to text-based search if both style code and GTIN searches failed
      if (stockxProducts.length === 0) {
        console.log(`🔍 Style code and GTIN searches ${hasStyleCode || hasGTIN ? 'failed' : 'not available'}, trying text-based search...`);
        
        for (const query of stockxQueries) {
          console.log(`🔍 Trying StockX text query: "${query}"`);
          try {
            stockxProducts = await searchStockXForProduct(query, request);
            console.log(`📈 Found ${stockxProducts.length} StockX matches for "${query}"`);
            
            if (stockxProducts.length > 0) {
              usedQuery = query;
              searchMethod = 'text';
              console.log(`✅ Text search successful: ${stockxProducts[0].title || stockxProducts[0].name} - $${stockxProducts[0].price || 'N/A'}`);
              break;
            }
          } catch (error) {
            console.error(`❌ Error searching StockX for "${query}":`, error);
          }
          
          // Small delay between searches to be respectful
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (stockxProducts.length === 0) {
        console.log(`❌ No StockX match found`);
        console.log(`⚠️ No StockX matches found after trying ${stockxQueries.length} queries:`, stockxQueries);
        
        // Skip this listing if no StockX matches found (don't add placeholder entries)
        console.log(`⚠️ Skipping eBay listing (no StockX matches): ${listing.title}`);
        console.log(`   Tried queries: ${stockxQueries.join(', ')}`);
        continue;
      }
      
      // Process each StockX match
      for (const stockxProduct of stockxProducts) {
        try {
          console.log(`🎯 Processing StockX product: ${stockxProduct.title || stockxProduct.name}`);
          console.log(`🆔 StockX Product ID: ${stockxProduct.id || stockxProduct.productId || stockxProduct.uuid}`);
          
          // Get market data for this product
          const productId = stockxProduct.id || stockxProduct.productId || stockxProduct.uuid;
          console.log(`📊 Getting market data for product ID: ${productId}, size: ${parsedDetails.size}`);
          
          const marketData = await getStockXMarketData(productId, parsedDetails.size, request);
          
          if (marketData) {
            console.log(`💰 Market data: Ask $${marketData.lowestAsk}, Bid $${marketData.highestBid}`);
            
            // Calculate arbitrage opportunity
            const arbitrage = calculateArbitrage(listing, marketData);
            
            if (arbitrage) {
              console.log(`💡 Arbitrage calc: Profit $${arbitrage.profit.toFixed(2)} (${arbitrage.profitMargin.toFixed(1)}%) - Min required: ${minProfitMargin}%`);
              
              // Calculate match confidence (higher for style code and GTIN matches)
              const baseConfidence = calculateMatchConfidence(listing.title, stockxProduct.title, parsedDetails);
              let confidenceBoost = 0;
              if (searchMethod === 'stylecode') {
                confidenceBoost = 25; // Style code matches are most accurate (required in StockX API)
              } else if (searchMethod === 'gtin') {
                confidenceBoost = 20; // GTIN matches are very accurate
              }
              
              arbitrage.confidence = Math.min(baseConfidence + confidenceBoost, 100);
              arbitrage.matchedProduct = `${stockxProduct.title} (found with: "${usedQuery}")`;
              arbitrage.searchMethod = searchMethod as 'gtin' | 'stylecode' | 'text';
              arbitrage.gtin = gtin;
              arbitrage.styleCode = styleCode;
              // Attach direct StockX URL if we have urlKey
              const urlKey = stockxProduct.urlKey || stockxProduct.slug || stockxProduct.productUrlKey;
              if (urlKey) {
                arbitrage.stockxUrl = `https://stockx.com/${urlKey}`;
                arbitrage.stockxUrlKey = urlKey;
              } else if (productId) {
                // Fallback: product page by id
                arbitrage.stockxUrl = `https://stockx.com/${productId}`;
                arbitrage.stockxProductId = productId;
              }
              
              // TEMPORARILY: Show ALL matches regardless of profitability for debugging
              opportunities.push(arbitrage);
              
              if (arbitrage.profitMargin >= minProfitMargin && arbitrage.profit > 0) {
                console.log(`✅ Profitable opportunity: $${arbitrage.profit.toFixed(2)} profit (${arbitrage.profitMargin.toFixed(1)}%)`);
              } else {
                console.log(`🔍 Unprofitable match (showing for debugging): $${arbitrage.profit.toFixed(2)} profit (${arbitrage.profitMargin.toFixed(1)}%)`);
                console.log(`   eBay: $${arbitrage.ebayListing.price} + $${arbitrage.ebayListing.shipping || 0} shipping = $${arbitrage.totalCost.toFixed(2)} total cost`);
                console.log(`   StockX: $${arbitrage.stockxData?.lowestAsk || 0} ask - $${arbitrage.netRevenue.toFixed(2)} net revenue`);
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
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // For future: could add functionality to save/track opportunities
  return NextResponse.json({ error: 'Method not implemented' }, { status: 501 });
}
