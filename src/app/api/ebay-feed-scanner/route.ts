import { NextRequest, NextResponse } from 'next/server';
import { getEbayApplicationToken } from '@/lib/ebay/auth';

interface EbayFeedItem {
  itemId: string;
  title: string;
  priceValue: string;
  priceCurrency: string;
  gtin: string;
  brand: string;
  mpn: string;
  condition: string;
  imageUrl: string;
  itemWebUrl: string;
  sellerUsername: string;
  availability: string;
  categoryId: string;
  category: string;
  // Additional fields for analysis
  estimatedAvailableQuantity?: number;
  shippingCost?: string;
  returnsAccepted?: boolean;
  sellerFeedbackScore?: string;
  sellerFeedbackPercentage?: string;
}

interface StockXProduct {
  id: string;
  title: string;
  brand: string;
  price: number;
  lowestAsk: number;
  highestBid: number;
  lastSale: number;
  urlKey: string;
  styleCode?: string;
  gtin?: string;
}

interface ArbitrageOpportunity {
  ebayItem: EbayFeedItem;
  stockxProduct: StockXProduct;
  profit: number;
  profitPercentage: number;
  confidence: number;
  searchMethod: 'gtin' | 'stylecode' | 'text';
  gtin?: string;
  styleCode?: string;
  matchedProduct: string;
  usedQuery: string;
}

// Configuration for profitable opportunities
const PROFIT_THRESHOLDS = {
  MIN_PROFIT: 10, // Minimum $10 profit (more realistic)
  MIN_PROFIT_PERCENTAGE: 5, // Minimum 5% profit margin (more realistic)
  MAX_EBAY_PRICE: 2000, // Don't show items over $2000 (too risky)
  MIN_EBAY_PRICE: 20, // Don't show items under $20 (more lenient)
};

// eBay fees and costs
const EBAY_FEES = {
  FINAL_VALUE_FEE: 0.10, // 10% final value fee
  PAYMENT_PROCESSING: 0.029, // 2.9% payment processing
  SHIPPING_COST: 15, // Estimated shipping cost
};

// StockX fees and costs
const STOCKX_FEES = {
  SELLER_FEE: 0.095, // 9.5% seller fee
  PAYMENT_PROCESSING: 0.03, // 3% payment processing
  SHIPPING_COST: 13, // StockX shipping cost
};

export async function GET(request: NextRequest) {
  try {
    console.log('🚀 Starting eBay Feed Scanner for profitable opportunities...');
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId') || '15709'; // Shoes category
    const limit = parseInt(searchParams.get('limit') || '1000');
    const minProfit = parseFloat(searchParams.get('minProfit') || PROFIT_THRESHOLDS.MIN_PROFIT.toString());
    
    console.log(`📊 Scanning category ${categoryId} for opportunities with min profit $${minProfit}`);
    
    // Step 1: Download eBay Feed Data
    const ebayItems = await downloadEbayFeed(categoryId, limit);
    console.log(`📦 Downloaded ${ebayItems.length} eBay items from feed`);
    
    if (ebayItems.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No eBay items found in feed',
        opportunities: []
      });
    }
    
    // Step 2: Filter for high-potential items
    const filteredItems = filterHighPotentialItems(ebayItems);
    console.log(`🎯 Filtered to ${filteredItems.length} high-potential items`);
    
    // Step 3: Find StockX matches and calculate arbitrage
    const opportunities = await findArbitrageOpportunities(filteredItems, request);
    console.log(`💰 Found ${opportunities.length} arbitrage opportunities`);
    
    // Step 4: Filter by profitability thresholds
    const profitableOpportunities = opportunities.filter(opp => 
      opp.profit >= minProfit && 
      opp.profitPercentage >= PROFIT_THRESHOLDS.MIN_PROFIT_PERCENTAGE
    );
    
    console.log(`💎 ${profitableOpportunities.length} opportunities meet profitability thresholds`);
    
    // Step 5: Sort by profit potential
    const sortedOpportunities = profitableOpportunities.sort((a, b) => b.profit - a.profit);
    
    return NextResponse.json({
      success: true,
      message: `Found ${sortedOpportunities.length} profitable opportunities`,
      totalScanned: ebayItems.length,
      filtered: filteredItems.length,
      opportunities: sortedOpportunities.slice(0, 50), // Return top 50
      thresholds: {
        minProfit: minProfit,
        minProfitPercentage: PROFIT_THRESHOLDS.MIN_PROFIT_PERCENTAGE,
        maxEbayPrice: PROFIT_THRESHOLDS.MAX_EBAY_PRICE,
        minEbayPrice: PROFIT_THRESHOLDS.MIN_EBAY_PRICE
      }
    });
    
  } catch (error) {
    console.error('❌ eBay Feed Scanner error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to scan eBay feed',
      error: error instanceof Error ? error.message : 'Unknown error',
      opportunities: []
    }, { status: 500 });
  }
}

async function downloadEbayFeed(categoryId: string, limit: number): Promise<EbayFeedItem[]> {
  try {
    console.log(`📥 Searching eBay for sneaker listings...`);
    
    const ebayAppId = process.env.EBAY_APP_ID;
    const ebayClientSecret = process.env.EBAY_CLIENT_SECRET;
    
    if (!ebayAppId || !ebayClientSecret) {
      throw new Error('eBay credentials not configured');
    }
    
    // Get access token
    const accessToken = await getEbayApplicationToken(ebayAppId, ebayClientSecret);
    if (!accessToken) {
      throw new Error('Failed to get eBay access token');
    }
    
    // Use real eBay search API instead of feed API
    console.log('🔍 Using real eBay search API for bulk scanning');
    
    // Search for actual sneaker models (not stickers/accessories)
    const searchTerms = [
      'Nike Air Jordan 1 High sneakers -sticker -decals -accessories',
      'Nike Air Jordan 4 sneakers -sticker -decals -accessories', 
      'Yeezy Boost 350 V2 sneakers -sticker -decals -accessories',
      'Nike Dunk Low sneakers -sticker -decals -accessories',
      'Nike Air Force 1 sneakers -sticker -decals -accessories'
    ];
    
    const allItems: EbayFeedItem[] = [];
    const itemsPerTerm = Math.ceil(limit / searchTerms.length);
    
    for (const term of searchTerms) {
      try {
        console.log(`🔍 Searching for: ${term}`);
        
        const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search`;
        const params = new URLSearchParams({
          q: `${term} sneakers shoes -box -"box only" -empty`,
          limit: itemsPerTerm.toString(),
          sort: 'price',
          fieldgroups: 'MATCHING_ITEMS,EXTENDED'
        });
        
        // Add category filter
        params.append('category_ids', '15709');
        
        // Add filters
        const filters = [
          'conditions:{NEW,USED_EXCELLENT,USED_VERY_GOOD}',
          'price:[50..1000]'
        ];
        params.append('filter', filters.join(','));
        
        const response = await fetch(`${apiUrl}?${params}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS%2Czip%3D90210'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`📊 Raw eBay response for "${term}":`, JSON.stringify(data, null, 2));
          
          const items = (data.itemSummaries || []).map((item: any) => {
            console.log(`🔍 Processing item:`, {
              title: item.title,
              price: item.price,
              condition: item.condition,
              brand: extractBrandFromTitle(item.title)
            });
            
            return {
              itemId: item.itemId,
              title: item.title,
              priceValue: item.price?.value?.toString() || '0',
              priceCurrency: item.price?.currency || 'USD',
              gtin: '', // Will be extracted from title if available
              brand: extractBrandFromTitle(item.title),
              mpn: '', // Not available in search API
              condition: item.condition || 'New',
              imageUrl: item.image?.imageUrl || '/placeholder-shoe.png',
              itemWebUrl: item.itemWebUrl,
              sellerUsername: item.seller?.username || 'Unknown',
              availability: 'AVAILABLE',
              categoryId: '15709',
              category: 'Shoes|Athletic Shoes',
              estimatedAvailableQuantity: 1,
              shippingCost: item.shippingOptions?.[0]?.shippingCost?.value?.toString() || '0',
              returnsAccepted: true,
              sellerFeedbackScore: '1000', // Default value
              sellerFeedbackPercentage: '95' // Default value
            };
          });
          
          allItems.push(...items);
          console.log(`✅ Found ${items.length} items for "${term}"`);
        } else {
          const errorText = await response.text();
          console.log(`❌ Search failed for "${term}": ${response.status} - ${errorText}`);
        }
        
        // Small delay between searches
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error searching for "${term}":`, error);
      }
    }
    
    console.log(`📦 Total items found: ${allItems.length}`);
    console.log(`📊 Sample items:`, allItems.slice(0, 3).map(item => ({
      title: item.title,
      price: item.priceValue,
      brand: item.brand,
      condition: item.condition
    })));
    return allItems.slice(0, limit);
    
  } catch (error) {
    console.error('❌ Error downloading eBay data:', error);
    throw error;
  }
}

function extractBrandFromTitle(title: string): string {
  const brands = ['Nike', 'Adidas', 'Jordan', 'New Balance', 'Puma', 'Reebok', 'Converse', 'Vans'];
  const titleLower = title.toLowerCase();
  
  for (const brand of brands) {
    if (titleLower.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  
  return 'Unknown';
}

function filterHighPotentialItems(items: EbayFeedItem[]): EbayFeedItem[] {
  console.log(`🔍 Filtering ${items.length} items...`);
  
  const filtered = items.filter(item => {
    const price = parseFloat(item.priceValue);
    const title = item.title.toLowerCase();
    
    console.log(`🔍 Item: $${price} ${item.brand} ${item.condition} - "${item.title.substring(0, 50)}..."`);
    
    // Filter out stickers, decals, and accessories
    const isAccessory = title.includes('sticker') || 
                       title.includes('decal') || 
                       title.includes('accessory') ||
                       title.includes('keychain') ||
                       title.includes('pin') ||
                       title.includes('patch') ||
                       title.includes('poster') ||
                       title.includes('print');
    
    if (isAccessory) {
      console.log(`❌ Accessory filter: ${item.title.substring(0, 50)}...`);
      return false;
    }
    
    // Price filters
    if (price <= 0 || price > 2000) {
      console.log(`❌ Price filter: $${price}`);
      return false;
    }
    
    // Must be actual shoes (not just any Nike/Jordan item)
    const isShoe = title.includes('size') || 
                   title.includes('shoe') || 
                   title.includes('sneaker') ||
                   title.includes('jordan') ||
                   title.includes('yeezy') ||
                   title.includes('dunk') ||
                   title.includes('air force');
    
    if (!isShoe) {
      console.log(`❌ Shoe filter: ${item.title.substring(0, 50)}...`);
      return false;
    }
    
    console.log(`✅ Passed all filters: $${price} ${item.brand} ${item.condition}`);
    return true;
  });
  
  console.log(`📊 Filtered ${items.length} items down to ${filtered.length} high-potential items`);
  return filtered;
}

async function findArbitrageOpportunities(items: EbayFeedItem[], request: NextRequest): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];
  
  console.log(`🔍 Finding StockX matches for ${items.length} items...`);
  
  for (const item of items) {
    try {
      // Try to find StockX match
      const stockxProduct = await findStockXMatch(item, request);
      
      if (stockxProduct) {
        const opportunity = calculateArbitrage(item, stockxProduct);
        
        if (opportunity.profit > 0) {
          opportunities.push(opportunity);
          console.log(`✅ Found opportunity: ${item.title} - $${opportunity.profit.toFixed(2)} profit`);
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error processing item ${item.itemId}:`, error);
      continue;
    }
  }
  
  return opportunities;
}

async function findStockXMatch(item: EbayFeedItem, request: NextRequest): Promise<StockXProduct | null> {
  try {
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;
    
    if (!accessToken || !apiKey) {
      console.log('❌ Missing StockX credentials');
      return null;
    }
    
    // Try GTIN search first
    if (item.gtin) {
      const gtinResults = await searchStockXByGTIN(item.gtin, accessToken, apiKey);
      if (gtinResults.length > 0) {
        return gtinResults[0];
      }
    }
    
    // Try brand + model search
    const searchQuery = `${item.brand} ${extractModelFromTitle(item.title)}`;
    const searchResults = await searchStockXForProduct(searchQuery, accessToken, apiKey);
    
    if (searchResults.length > 0) {
      return searchResults[0];
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Error finding StockX match:', error);
    return null;
  }
}

async function searchStockXByGTIN(gtin: string, accessToken: string, apiKey: string): Promise<StockXProduct[]> {
  try {
    const searchQueries = [
      gtin,
      `gtin:${gtin}`,
      `upc:${gtin}`,
      `ean:${gtin}`
    ];
    
    for (const query of searchQueries) {
      const response = await fetch(`https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}&pageNumber=1&pageSize=5`, {
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
        const products = data.products || [];
        
        if (products.length > 0) {
          return products.map((p: any) => ({
            id: p.id || p.uuid || p.productId,
            title: p.title || p.name,
            brand: p.brand,
            price: p.price || 0,
            lowestAsk: p.lowestAsk || 0,
            highestBid: p.highestBid || 0,
            lastSale: p.lastSale || 0,
            urlKey: p.urlKey,
            styleCode: p.styleCode || p.sku,
            gtin: p.gtin
          }));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return [];
    
  } catch (error) {
    console.error('❌ Error searching StockX by GTIN:', error);
    return [];
  }
}

async function searchStockXForProduct(query: string, accessToken: string, apiKey: string): Promise<StockXProduct[]> {
  try {
    const response = await fetch(`https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}&pageNumber=1&pageSize=5`, {
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
      const products = data.products || [];
      
      return products.map((p: any) => ({
        id: p.id || p.uuid || p.productId,
        title: p.title || p.name,
        brand: p.brand,
        price: p.price || 0,
        lowestAsk: p.lowestAsk || 0,
        highestBid: p.highestBid || 0,
        lastSale: p.lastSale || 0,
        urlKey: p.urlKey,
        styleCode: p.styleCode || p.sku,
        gtin: p.gtin
      }));
    }
    
    return [];
    
  } catch (error) {
    console.error('❌ Error searching StockX:', error);
    return [];
  }
}

function extractModelFromTitle(title: string): string {
  // Extract model from title (e.g., "Air Jordan 1" from "Nike Air Jordan 1 Retro High OG")
  const words = title.split(' ');
  const brandIndex = words.findIndex(word => 
    ['Nike', 'Adidas', 'Jordan', 'New Balance', 'Puma', 'Reebok'].includes(word)
  );
  
  if (brandIndex >= 0 && brandIndex < words.length - 1) {
    return words.slice(brandIndex + 1, brandIndex + 4).join(' '); // Take next 3 words
  }
  
  return title;
}

function calculateArbitrage(ebayItem: EbayFeedItem, stockxProduct: StockXProduct): ArbitrageOpportunity {
  const ebayPrice = parseFloat(ebayItem.priceValue);
  const ebayShipping = parseFloat(ebayItem.shippingCost || '0');
  const totalEbayCost = ebayPrice + ebayShipping;
  
  // Calculate eBay fees
  const ebayFees = (ebayPrice * EBAY_FEES.FINAL_VALUE_FEE) + (ebayPrice * EBAY_FEES.PAYMENT_PROCESSING);
  const totalEbayCostWithFees = totalEbayCost + ebayFees;
  
  // Use StockX lowest ask as selling price
  const stockxSellingPrice = stockxProduct.lowestAsk;
  
  // Calculate StockX fees
  const stockxFees = (stockxSellingPrice * STOCKX_FEES.SELLER_FEE) + (stockxSellingPrice * STOCKX_FEES.PAYMENT_PROCESSING);
  const stockxShipping = STOCKX_FEES.SHIPPING_COST;
  const totalStockxCosts = stockxFees + stockxShipping;
  
  // Calculate profit
  const profit = stockxSellingPrice - totalEbayCostWithFees - totalStockxCosts;
  const profitPercentage = (profit / totalEbayCostWithFees) * 100;
  
  // Calculate confidence based on match quality
  const confidence = calculateMatchConfidence(ebayItem.title, stockxProduct.title);
  
  return {
    ebayItem,
    stockxProduct,
    profit: Math.round(profit * 100) / 100,
    profitPercentage: Math.round(profitPercentage * 100) / 100,
    confidence,
    searchMethod: 'gtin', // Simplified for now
    gtin: ebayItem.gtin,
    styleCode: stockxProduct.styleCode,
    matchedProduct: stockxProduct.title,
    usedQuery: ebayItem.gtin || 'text search'
  };
}

function calculateMatchConfidence(ebayTitle: string, stockxTitle: string): number {
  // Simple confidence calculation based on title similarity
  const ebayWords = ebayTitle.toLowerCase().split(' ');
  const stockxWords = stockxTitle.toLowerCase().split(' ');
  
  const commonWords = ebayWords.filter(word => stockxWords.includes(word));
  const similarity = commonWords.length / Math.max(ebayWords.length, stockxWords.length);
  
  return Math.round(similarity * 100);
}
