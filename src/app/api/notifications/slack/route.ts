import { NextRequest, NextResponse } from 'next/server';
import { createSlackService } from '@/lib/notifications/slackService';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';

/**
 * Helper function to extract brand from product name
 */
function extractBrandFromProductName(productName: string): string {
  if (!productName) return 'Unknown';
  
  const brandPatterns = [
    { pattern: /^(Nike|Air Jordan|Jordan)\b/i, brand: 'Nike' },
    { pattern: /^(adidas|Adidas|Yeezy)\b/i, brand: 'adidas' },
    { pattern: /^(New Balance)\b/i, brand: 'New Balance' },
    { pattern: /^(Converse)\b/i, brand: 'Converse' },
    { pattern: /^(Vans)\b/i, brand: 'Vans' },
    { pattern: /^(Puma)\b/i, brand: 'Puma' },
    { pattern: /^(UGG)\b/i, brand: 'UGG' },
    { pattern: /^(ASICS|Asics)\b/i, brand: 'ASICS' },
    { pattern: /^(Reebok)\b/i, brand: 'Reebok' },
    { pattern: /^(Denim Tears)\b/i, brand: 'Denim Tears' },
    { pattern: /^(Off-White|Off White)\b/i, brand: 'Off-White' },
    { pattern: /^(Supreme)\b/i, brand: 'Supreme' },
    { pattern: /^(Fear of God|FOG)\b/i, brand: 'Fear of God' },
    { pattern: /^(Stone Island)\b/i, brand: 'Stone Island' },
    { pattern: /^(Travis Scott)\b/i, brand: 'Travis Scott' },
    { pattern: /^(Balenciaga)\b/i, brand: 'Balenciaga' }
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(productName)) {
      return brand;
    }
  }
  
  // Fallback: take first word
  const firstWord = productName.split(' ')[0];
  return firstWord || 'Unknown';
}

/**
 * Fetch real-time StockX market price for a product
 * Prioritizes styleId search for accuracy, falls back to product name
 */
async function fetchStockXMarketPrice(
  productName: string, 
  size: string,
  request: NextRequest,
  styleId?: string
): Promise<number | null> {
  try {
    const searchTerm = styleId || productName;
    const searchType = styleId ? 'StyleId' : 'Product Name';
    console.log(`🔍 Fetching StockX price for: ${productName} (Size: ${size}) using ${searchType}: ${searchTerm}`);
    
    // Get StockX credentials from cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;
    
    if (!accessToken || !apiKey) {
      console.log(`⚠️ No StockX credentials available, skipping price fetch`);
      return null;
    }
    
    // Step 1: Search for the product using StyleId (much more accurate!) or product name
    const searchQuery = encodeURIComponent(searchTerm);
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${searchQuery}&pageSize=5`;
    
    console.log(`🔎 Searching StockX by ${searchType}: ${searchUrl}`);
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });
    
    if (!searchResponse.ok) {
      console.log(`❌ StockX search failed: ${searchResponse.status}`);
      return null;
    }
    
    const searchData = await searchResponse.json();
    const products = searchData.results || searchData.Products || [];
    
    if (products.length === 0) {
      console.log(`❌ No products found for ${searchType}: ${searchTerm}`);
      return null;
    }
    
    // Get the first matching product (when using styleId, should be exact match)
    const product = products[0];
    const productId = product.id || product.uuid || product.productId;
    
    if (!productId) {
      console.log(`❌ No productId found in search results`);
      return null;
    }
    
    console.log(`✅ Found product: ${product.title || product.name} (ID: ${productId})${styleId ? ' via StyleId ✨' : ''}`);
    
    // Step 2: Get market data for this product
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    
    console.log(`💰 Fetching market data: ${marketUrl}`);
    
    const marketResponse = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });
    
    if (!marketResponse.ok) {
      console.log(`❌ Market data fetch failed: ${marketResponse.status}`);
      return null;
    }
    
    const marketData = await marketResponse.json();
    const variants = Array.isArray(marketData) ? marketData : [];
    
    if (variants.length === 0) {
      console.log(`❌ No market data available`);
      return null;
    }
    
    // Step 3: Find the variant matching the size
    let targetVariant = null;
    
    // Try exact size match
    if (size && size !== 'Unknown') {
      targetVariant = variants.find((v: any) => {
        const variantSize = v.variantValue || v.size || v.sizeValue || v.shoeSize || v.displaySize;
        return variantSize === size || variantSize === `US M ${size}` || variantSize === `US W ${size}`;
      });
    }
    
    // If no exact match, use first variant with pricing
    if (!targetVariant) {
      targetVariant = variants.find((v: any) => 
        (v.lowestAskAmount && parseInt(v.lowestAskAmount) > 0) ||
        (v.flexLowestAskAmount && parseInt(v.flexLowestAskAmount) > 0)
      ) || variants[0];
    }
    
    if (!targetVariant) {
      console.log(`❌ No matching variant found`);
      return null;
    }
    
    // Step 4: Extract the lowest ask price (in cents, convert to dollars)
    const standardAsk = parseInt(targetVariant.lowestAskAmount) || 0;
    const flexAsk = parseInt(targetVariant.flexLowestAskAmount) || 0;
    
    // Use the lower of the two prices
    let lowestAskCents = 0;
    if (standardAsk > 0 && flexAsk > 0) {
      lowestAskCents = Math.min(standardAsk, flexAsk);
    } else if (standardAsk > 0) {
      lowestAskCents = standardAsk;
    } else if (flexAsk > 0) {
      lowestAskCents = flexAsk;
    }
    
    if (lowestAskCents === 0) {
      console.log(`❌ No pricing data available`);
      return null;
    }
    
    const lowestAsk = lowestAskCents / 100; // Convert cents to dollars
    
    console.log(`✅ Found market price: $${lowestAsk} for ${targetVariant.variantValue || 'variant'}`);
    
    return lowestAsk;
    
  } catch (error) {
    console.error(`❌ Error fetching StockX price for ${productName}:`, error);
    return null;
  }
}

/**
 * POST /api/notifications/slack
 * Send delivery summary to Slack
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, type = 'daily_summary', purchases } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Create Slack service
    const slackService = createSlackService();
    if (!slackService) {
      return NextResponse.json({ 
        error: 'Slack not configured. Please set SLACK_WEBHOOK_URL in .env.local' 
      }, { status: 500 });
    }

    console.log(`📨 Sending Slack notification (${type}) for user: ${userId}`);

    // Get purchases - either from request body (localStorage users) or Firebase
    let allPurchases: any[] = [];
    
    if (purchases && Array.isArray(purchases)) {
      allPurchases = purchases;
      console.log(`📦 Using ${allPurchases.length} purchases from request`);
    } else {
      // Get from Firebase
      const [purchasesByUserId, purchasesByUid] = await Promise.all([
        getDocumentsServer('purchases', {
          where: [{ field: 'userId', operator: '==', value: userId }]
        }),
        getDocumentsServer('purchases', {
          where: [{ field: 'uid', operator: '==', value: userId }]
        })
      ]);

      allPurchases = [...purchasesByUserId, ...purchasesByUid].filter((purchase, index, self) => 
        index === self.findIndex(p => p.id === purchase.id)
      );
      console.log(`📦 Found ${allPurchases.length} purchases from Firebase`);
    }

    // Filter purchases with tracking numbers
    const purchasesWithTracking = allPurchases.filter((purchase: any) => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number;
      return trackingValue && trackingValue.trim() !== '' && trackingValue !== 'TBD';
    });

    console.log(`📦 Found ${purchasesWithTracking.length} purchases with tracking`);

    if (purchasesWithTracking.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No deliveries to notify about',
        sent: false
      });
    }

    // Get tracking numbers
    const trackingNumbers = purchasesWithTracking.map((purchase: any) => 
      purchase.tracking || purchase.trackingNumber || purchase.tracking_number
    );

    // Get live tracking data
    console.log(`🔄 Fetching live tracking data for ${trackingNumbers.length} packages`);
    const liveTrackingData = await trackingService.getBulkTrackingInfo(trackingNumbers);

    // Build deliveries array with live tracking data AND real-time StockX prices
    console.log(`💰 Fetching real-time StockX prices for ${purchasesWithTracking.length} items...`);
    
    const deliveries = await Promise.all(purchasesWithTracking.map(async (purchase: any) => {
      const trackingValue = purchase.tracking || purchase.trackingNumber || purchase.tracking_number;
      const liveTracking = liveTrackingData.find(lt => lt.trackingNumber === trackingValue);
      
      // Determine status from live tracking or purchase status
      let status = purchase.status?.toLowerCase() || 'shipped';
      if (liveTracking && !liveTracking.error) {
        status = liveTracking.status;
      }

      // Get estimated delivery - normalize to YYYY-MM-DD format
      let estimatedDelivery = 'TBD';
      if (liveTracking && liveTracking.estimatedDelivery) {
        estimatedDelivery = liveTracking.estimatedDelivery;
      } else if (purchase.estimatedDelivery) {
        estimatedDelivery = purchase.estimatedDelivery;
      }

      // Validate and normalize date format
      if (estimatedDelivery && estimatedDelivery !== 'TBD') {
        try {
          const date = new Date(estimatedDelivery);
          if (!isNaN(date.getTime())) {
            // Convert to YYYY-MM-DD format
            estimatedDelivery = date.toISOString().split('T')[0];
          } else {
            console.warn(`⚠️ Invalid date for ${purchase.productName}: ${estimatedDelivery}`);
            estimatedDelivery = 'TBD';
          }
        } catch (error) {
          console.error(`❌ Error parsing date for ${purchase.productName}:`, error);
          estimatedDelivery = 'TBD';
        }
      }

      const productName = purchase.productName || purchase.product?.name || 'Unknown Product';
      const productSize = purchase.productSize || purchase.size || purchase.product?.size || 'Unknown';
      const styleId = purchase.styleId || purchase.style_id || null;
      
      // Extract brand from product name
      let productBrand = purchase.productBrand || purchase.brand;
      
      // If brand is missing or is the color (from product_variant bug), extract from name
      if (!productBrand || productBrand === 'Unknown Brand' || productBrand.length < 3) {
        productBrand = extractBrandFromProductName(productName);
      }
      
      // Calculate profit: Market Price - Purchase Price - $1 (pricing strategy)
      let purchasePrice: number | undefined;
      let marketPrice: number | undefined;
      let estimatedProfit: number | undefined;

      // Get purchase price (total amount paid) - check all possible field names
      // Priority order: total_amount (Gmail parsed) > totalAmount > totalPayment > price
      if (purchase.total_amount !== undefined) {
        purchasePrice = typeof purchase.total_amount === 'number' ? purchase.total_amount : parseFloat(purchase.total_amount);
      } else if (purchase.totalAmount !== undefined) {
        purchasePrice = typeof purchase.totalAmount === 'number' ? purchase.totalAmount : parseFloat(purchase.totalAmount);
      } else if (purchase.totalPayment !== undefined) {
        purchasePrice = typeof purchase.totalPayment === 'number' ? purchase.totalPayment : parseFloat(purchase.totalPayment);
      } else if (purchase.purchasePrice !== undefined) {
        purchasePrice = typeof purchase.purchasePrice === 'number' ? purchase.purchasePrice : parseFloat(purchase.purchasePrice);
      } else if (purchase.price) {
        // Try to parse price string like "$180.00" or "180.00 + $0.00"
        const priceStr = purchase.price.toString().replace(/[$,]/g, '').split('+')[0].trim();
        purchasePrice = parseFloat(priceStr);
      }
      
      // Validate purchase price
      if (purchasePrice !== undefined && (isNaN(purchasePrice) || purchasePrice <= 0)) {
        purchasePrice = undefined;
      }

      // Get current market price from StockX - try cached first, then fetch real-time
      if (purchase.lowestAsk) {
        marketPrice = typeof purchase.lowestAsk === 'number' ? purchase.lowestAsk : parseFloat(purchase.lowestAsk);
      } else if (purchase.marketPrice) {
        marketPrice = typeof purchase.marketPrice === 'number' ? purchase.marketPrice : parseFloat(purchase.marketPrice);
      }
      
      // If no market price cached, fetch real-time from StockX (prioritize styleId for accuracy!)
      if (!marketPrice || marketPrice <= 0) {
        const realtimePrice = await fetchStockXMarketPrice(productName, productSize, request, styleId);
        if (realtimePrice) {
          marketPrice = realtimePrice;
          console.log(`✅ Real-time price fetched: ${productName}${styleId ? ` (StyleId: ${styleId})` : ''} = $${marketPrice}`);
        }
      } else {
        console.log(`📦 Using cached price: ${productName} = $${marketPrice}`);
      }

      // Calculate estimated profit: Market Price - Purchase Price - $1
      if (purchasePrice && marketPrice && !isNaN(purchasePrice) && !isNaN(marketPrice)) {
        estimatedProfit = marketPrice - purchasePrice - 1; // Subtract $1 for pricing strategy
      }
      
      console.log(`📦 ${productName}: tracking=${trackingValue}, eta=${estimatedDelivery}, status=${status}, purchase=$${purchasePrice}, market=$${marketPrice}, profit=$${estimatedProfit}`);

      return {
        productName,
        productBrand,
        productSize,
        trackingNumber: trackingValue,
        carrier: liveTracking?.carrier || purchase.carrier || 'Unknown',
        estimatedDelivery,
        status,
        purchasePrice,
        marketPrice,
        estimatedProfit
      };
    }));

    // Calculate summary stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const arrivingToday = deliveries.filter(d => 
      d.estimatedDelivery === todayStr || d.status === 'out_for_delivery'
    ).length;

    const arrivingTomorrow = deliveries.filter(d => 
      d.estimatedDelivery === tomorrowStr
    ).length;

    const arrivingThisWeek = deliveries.filter(d => {
      if (!d.estimatedDelivery || d.estimatedDelivery === 'TBD') return false;
      const deliveryDate = new Date(d.estimatedDelivery);
      return deliveryDate > tomorrow && deliveryDate <= weekEnd;
    }).length;

    const inTransit = deliveries.filter(d => 
      d.status === 'in_transit' || d.status === 'shipped' || d.status === 'out_for_delivery'
    ).length;

    const projectedProfitToday = deliveries
      .filter(d => d.estimatedDelivery === todayStr || d.status === 'out_for_delivery')
      .reduce((sum, d) => sum + (typeof d.estimatedProfit === 'number' && Number.isFinite(d.estimatedProfit) ? d.estimatedProfit : 0), 0);

    // Send notification
    if (type === 'daily_summary') {
      await slackService.sendDeliverySummary({
        totalDeliveries: deliveries.length,
        arrivingToday,
        arrivingTomorrow,
        arrivingThisWeek,
        inTransit,
        projectedProfitToday,
        deliveries
      });
    }

    console.log(`✅ Slack notification sent successfully`);

    return NextResponse.json({
      success: true,
      message: 'Notification sent',
      sent: true,
      summary: {
        totalDeliveries: deliveries.length,
        arrivingToday,
        arrivingTomorrow,
        arrivingThisWeek,
        inTransit
      }
    });

  } catch (error) {
    console.error('❌ Error sending Slack notification:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/notifications/slack/test
 * Test Slack webhook configuration
 */
export async function GET(request: NextRequest) {
  try {
    const slackService = createSlackService();
    
    if (!slackService) {
      return NextResponse.json({ 
        configured: false,
        message: 'Slack not configured. Please set SLACK_WEBHOOK_URL in .env.local' 
      });
    }

    // Send a test message
    await slackService.sendDeliveryUpdate({
      productName: 'Test Product',
      trackingNumber: '1Z999AA10123456784',
      status: 'in_transit',
      estimatedDelivery: new Date().toISOString().split('T')[0]
    });

    return NextResponse.json({
      configured: true,
      message: 'Slack webhook is configured and working! Check your Slack channel.'
    });

  } catch (error) {
    console.error('❌ Slack webhook test failed:', error);
    return NextResponse.json({
      configured: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

