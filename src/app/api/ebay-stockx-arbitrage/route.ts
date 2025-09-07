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

// Generate eBay application token from App ID
async function getEbayApplicationToken(appId: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${appId}:`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    if (!response.ok) {
      console.error('eBay token error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('eBay token generation failed:', error);
    return null;
  }
}

// Enhanced eBay search with better product parsing
async function searchEbayForShoes(query: string, limit: number = 50): Promise<EbayListing[]> {
  const ebayAppId = process.env.EBAY_APP_ID;
  
  if (!ebayAppId) {
    console.log('⚠️ No eBay App ID found, using mock data for development');
    return generateMockEbayListings(query, limit);
  }

  try {
    // Get application token
    const accessToken = await getEbayApplicationToken(ebayAppId);
    
    if (!accessToken) {
      console.log('⚠️ Could not get eBay access token, using mock data');
      return generateMockEbayListings(query, limit);
    }

    // Search in sneakers category (15709) and athletic shoes (3034)
    const categoryIds = '15709,3034';
    const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search`;
    
    const params = new URLSearchParams({
      q: query,
      category_ids: categoryIds,
      limit: limit.toString(),
      sort: 'price', // Sort by price ascending to find deals
      filter: 'conditions:{NEW}', // Only new items
      fieldgroups: 'MATCHING_ITEMS,EXTENDED'
    });

    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    if (!response.ok) {
      console.error('eBay API error:', response.status, await response.text());
      return generateMockEbayListings(query, limit);
    }

    const data = await response.json();
    
    return (data.itemSummaries || []).map((item: any) => ({
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

  } catch (error) {
    console.error('eBay search error:', error);
    return generateMockEbayListings(query, limit);
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

// Generate StockX search query from eBay listing - supports both style codes and product names
function generateStockXQuery(ebayTitle: string, parsedDetails: { brand?: string; model?: string; styleCode?: string }): string {
  const { brand, model, styleCode } = parsedDetails;
  
  // Priority 1: Use style code if available (most accurate)
  if (styleCode) {
    console.log(`🎯 Using style code for StockX search: ${styleCode}`);
    return styleCode;
  }
  
  // Priority 2: Use brand + model
  if (brand && model) {
    return `${brand} ${model}`.trim();
  } 
  
  // Priority 3: Use just brand
  if (brand) {
    return brand;
  } 
  
  // Fallback: Use first few words of title
  return ebayTitle.split(' ').slice(0, 3).join(' ');
}

// Search StockX for matching products using the same endpoint as the working StockX arbitrage finder
async function searchStockXForProduct(query: string): Promise<any[]> {
  try {
    console.log(`🔍 Searching StockX for: ${query}`);
    
    // Fix: Use the correct domain instead of env variable that might be undefined
    const baseUrl = 'https://www.solesmarket.com';
    const apiUrl = `${baseUrl}/api/stockx/public-search?query=${encodeURIComponent(query)}&limit=10`;
    
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
      console.log(`📦 StockX API response data:`, data);
      
      // Handle the response format from the working StockX search API
      if (data.success && data.data?.products?.length > 0) {
        console.log(`✅ Found ${data.data.products.length} StockX products`);
        return data.data.products;
      } else if (data.products?.length > 0) {
        // Alternative response format
        console.log(`✅ Found ${data.products.length} StockX products (alt format)`);
        return data.products;
      } else {
        console.log(`⚠️ No StockX products found for: ${query}`);
        console.log(`📄 Full StockX response:`, JSON.stringify(data, null, 2));
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

// Mock data for development
function generateMockEbayListings(query: string, limit: number): EbayListing[] {
  const mockListings: EbayListing[] = [
    {
      title: 'Nike Air Jordan 1 High OG "Bred Toe" Size 10 NEW',
      price: 180,
      currency: 'USD',
      image: '/placeholder-shoe.png',
      url: 'https://ebay.com/item/mock1',
      seller: 'sneaker_connect',
      condition: 'New',
      source: 'eBay (Mock)',
      itemId: 'mock1',
      shipping: 12
    },
    {
      title: 'Adidas Yeezy Boost 350 V2 "Zebra" Size 9.5',
      price: 320,
      currency: 'USD',
      image: '/placeholder-shoe.png',
      url: 'https://ebay.com/item/mock2',
      seller: 'yeezy_outlet',
      condition: 'New',
      source: 'eBay (Mock)',
      itemId: 'mock2',
      shipping: 15
    },
    {
      title: 'Nike Dunk Low "Panda" Black White Size 11',
      price: 85,
      currency: 'USD',
      image: '/placeholder-shoe.png',
      url: 'https://ebay.com/item/mock3',
      seller: 'kicks_dealer',
      condition: 'New',
      source: 'eBay (Mock)',
      itemId: 'mock3',
      shipping: 10
    }
  ];
  
  return mockListings.slice(0, limit);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || '';
  const minProfitMargin = parseFloat(searchParams.get('minProfitMargin') || '15');
  const maxPrice = parseFloat(searchParams.get('maxPrice') || '1000');
  const limit = parseInt(searchParams.get('limit') || '20');

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
      
      // Parse shoe details from title
      const parsedDetails = parseShoeDetails(listing.title);
      console.log(`📝 Parsed details:`, parsedDetails);
      
      // Generate StockX search query
      const stockxQuery = generateStockXQuery(listing.title, parsedDetails);
      console.log(`🔍 StockX query: "${stockxQuery}"`);
      
      // Search StockX for matching products
      const stockxProducts = await searchStockXForProduct(stockxQuery);
      console.log(`📈 Found ${stockxProducts.length} StockX matches`);
      
      if (stockxProducts.length === 0) {
        console.log(`⚠️ No StockX matches found for: "${stockxQuery}"`);
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
              arbitrage.matchedProduct = stockxProduct.title;
              
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
