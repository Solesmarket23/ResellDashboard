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
  MIN_PROFIT: 50, // Minimum $50 profit
  MIN_PROFIT_PERCENTAGE: 20, // Minimum 20% profit margin
  MAX_EBAY_PRICE: 2000, // Don't show items over $2000 (too risky)
  MIN_EBAY_PRICE: 50, // Don't show items under $50 (low value)
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
    console.log(`📥 Downloading eBay feed for category ${categoryId}...`);
    
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
    
    // For now, we'll simulate feed data since Feed API requires special approval
    // In production, you would call the actual Feed API here
    console.log('⚠️ Using simulated feed data (Feed API requires special approval)');
    
    // Simulate some high-potential sneaker listings
    const simulatedItems: EbayFeedItem[] = [
      {
        itemId: 'v1|123456789|987654321',
        title: 'Nike Air Jordan 1 Retro High OG "Bred" Size 10.5 DS',
        priceValue: '180.00',
        priceCurrency: 'USD',
        gtin: '194180000000',
        brand: 'Nike',
        mpn: '555088-061',
        condition: 'New',
        imageUrl: 'https://example.com/jordan1.jpg',
        itemWebUrl: 'https://www.ebay.com/itm/123456789',
        sellerUsername: 'sneakerhead123',
        availability: 'AVAILABLE',
        categoryId: '15709',
        category: 'Shoes|Athletic Shoes|Basketball Shoes',
        estimatedAvailableQuantity: 1,
        shippingCost: '15.00',
        returnsAccepted: true,
        sellerFeedbackScore: '5000',
        sellerFeedbackPercentage: '99.8'
      },
      {
        itemId: 'v1|123456790|987654322',
        title: 'Adidas Yeezy Boost 350 V2 "Zebra" Size 9 DS',
        priceValue: '220.00',
        priceCurrency: 'USD',
        gtin: '194180000001',
        brand: 'Adidas',
        mpn: 'CP9654',
        condition: 'New',
        imageUrl: 'https://example.com/yeezy.jpg',
        itemWebUrl: 'https://www.ebay.com/itm/123456790',
        sellerUsername: 'yeezycollector',
        availability: 'AVAILABLE',
        categoryId: '15709',
        category: 'Shoes|Athletic Shoes|Running Shoes',
        estimatedAvailableQuantity: 1,
        shippingCost: '12.00',
        returnsAccepted: true,
        sellerFeedbackScore: '2500',
        sellerFeedbackPercentage: '98.5'
      }
    ];
    
    return simulatedItems.slice(0, limit);
    
  } catch (error) {
    console.error('❌ Error downloading eBay feed:', error);
    throw error;
  }
}

function filterHighPotentialItems(items: EbayFeedItem[]): EbayFeedItem[] {
  return items.filter(item => {
    const price = parseFloat(item.priceValue);
    
    // Basic filters
    if (price < PROFIT_THRESHOLDS.MIN_EBAY_PRICE || price > PROFIT_THRESHOLDS.MAX_EBAY_PRICE) {
      return false;
    }
    
    // Must be available
    if (item.availability !== 'AVAILABLE') {
      return false;
    }
    
    // Must have GTIN or be from known sneaker brands
    const hasGtin = item.gtin && item.gtin.length >= 8;
    const isSneakerBrand = ['Nike', 'Adidas', 'Jordan', 'New Balance', 'Puma', 'Reebok'].includes(item.brand);
    
    if (!hasGtin && !isSneakerBrand) {
      return false;
    }
    
    // Must be new condition for best arbitrage
    if (item.condition !== 'New') {
      return false;
    }
    
    // Must have good seller feedback
    const feedbackScore = parseInt(item.sellerFeedbackScore || '0');
    const feedbackPercentage = parseFloat(item.sellerFeedbackPercentage || '0');
    
    if (feedbackScore < 100 || feedbackPercentage < 95) {
      return false;
    }
    
    return true;
  });
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
