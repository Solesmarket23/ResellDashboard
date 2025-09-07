import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const variantId = searchParams.get('variantId');
  const period = searchParams.get('period') || '30'; // days

  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  try {
    // Get access token from cookies
    let accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

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
      return NextResponse.json({ error: 'StockX API key not configured' }, { status: 500 });
    }

    console.log(`📈 Fetching historical sales for product: ${productId}, variant: ${variantId || 'all'}, period: ${period} days`);

    // Method 1: Try to get recent sales/activity from StockX API
    // This endpoint might give us recent sales data
    const activityUrl = variantId 
      ? `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/activity`
      : `https://api.stockx.com/v2/catalog/products/${productId}/activity`;

    console.log(`🔍 Trying activity endpoint: ${activityUrl}`);

    let response = await fetch(activityUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    // If activity endpoint doesn't work, try market data with historical context
    if (!response.ok) {
      console.log(`⚠️ Activity endpoint failed (${response.status}), trying market data...`);
      
      const marketUrl = variantId
        ? `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`
        : `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;

      response = await fetch(marketUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-API-Key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'ResellDashboard/1.0'
        }
      });
    }

    if (!response.ok) {
      console.error(`❌ StockX API error: ${response.status} ${response.statusText}`);
      
      // Return mock data structure for development/fallback
      return NextResponse.json({
        success: true,
        data: generateMockHistoricalData(productId, variantId, parseInt(period)),
        source: 'mock',
        message: 'Using mock data - StockX historical sales API not accessible'
      });
    }

    const data = await response.json();
    console.log(`✅ Historical data response:`, data);

    // Process the response based on what we received
    const processedData = processHistoricalData(data, period);

    return NextResponse.json({
      success: true,
      data: processedData,
      source: 'stockx',
      productId,
      variantId,
      period: parseInt(period)
    });

  } catch (error) {
    console.error('❌ Error fetching historical sales:', error);
    
    // Return mock data as fallback
    return NextResponse.json({
      success: true,
      data: generateMockHistoricalData(productId, variantId || null, parseInt(period)),
      source: 'mock_fallback',
      message: 'API error - using mock data'
    });
  }
}

function processHistoricalData(rawData: any, period: string): any {
  // Process StockX API response into our format
  const sales = rawData.sales || rawData.activity || rawData.recentSales || [];
  
  return {
    recentSales: sales.slice(0, 50).map((sale: any) => ({
      date: sale.createdAt || sale.saleDate || sale.timestamp,
      price: sale.price || sale.salePrice || sale.amount,
      size: sale.variant?.size || sale.size,
      condition: sale.condition || 'new',
      seller: sale.seller?.username ? `${sale.seller.username.substring(0, 2)}***` : 'Anonymous'
    })),
    priceHistory: generatePriceHistory(sales, parseInt(period)),
    analytics: {
      totalSales: sales.length,
      averagePrice: sales.length > 0 ? sales.reduce((sum: number, sale: any) => sum + (sale.price || 0), 0) / sales.length : 0,
      highestSale: sales.length > 0 ? Math.max(...sales.map((s: any) => s.price || 0)) : 0,
      lowestSale: sales.length > 0 ? Math.min(...sales.map((s: any) => s.price || 0)) : 0,
      priceRange: {
        min: sales.length > 0 ? Math.min(...sales.map((s: any) => s.price || 0)) : 0,
        max: sales.length > 0 ? Math.max(...sales.map((s: any) => s.price || 0)) : 0
      }
    }
  };
}

function generatePriceHistory(sales: any[], days: number) {
  // Generate daily price points from sales data
  const now = new Date();
  const priceHistory = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Find sales for this day
    const daySales = sales.filter((sale: any) => {
      const saleDate = new Date(sale.createdAt || sale.saleDate || sale.timestamp);
      return saleDate.toDateString() === date.toDateString();
    });
    
    if (daySales.length > 0) {
      const avgPrice = daySales.reduce((sum: number, sale: any) => sum + (sale.price || 0), 0) / daySales.length;
      priceHistory.push({
        date: date.toISOString().split('T')[0],
        price: Math.round(avgPrice),
        sales: daySales.length
      });
    }
  }
  
  return priceHistory;
}

function generateMockHistoricalData(productId: string, variantId: string | null, days: number) {
  // Generate realistic mock data for development/fallback
  const basePrice = 200 + Math.random() * 300; // $200-$500 base
  const now = new Date();
  
  const recentSales = [];
  const priceHistory = [];
  
  // Generate recent sales (last 30 sales)
  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.random() * days;
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    const priceVariation = (Math.random() - 0.5) * 100; // ±$50 variation
    const salePrice = Math.round(basePrice + priceVariation);
    
    recentSales.push({
      date: date.toISOString(),
      price: salePrice,
      size: ['9', '9.5', '10', '10.5', '11'][Math.floor(Math.random() * 5)],
      condition: Math.random() > 0.1 ? 'new' : 'used',
      seller: `u${Math.random().toString(36).substring(2, 5)}***`
    });
  }
  
  // Generate daily price history
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const trend = Math.sin(i / 10) * 20; // Some trend variation
    const noise = (Math.random() - 0.5) * 30; // Daily noise
    const price = Math.round(basePrice + trend + noise);
    
    const daySales = recentSales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate.toDateString() === date.toDateString();
    }).length;
    
    priceHistory.push({
      date: date.toISOString().split('T')[0],
      price,
      sales: daySales
    });
  }
  
  // Sort by date
  recentSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return {
    recentSales: recentSales.slice(0, 20),
    priceHistory,
    analytics: {
      totalSales: recentSales.length,
      averagePrice: Math.round(basePrice),
      highestSale: Math.max(...recentSales.map(s => s.price)),
      lowestSale: Math.min(...recentSales.map(s => s.price)),
      priceRange: {
        min: Math.min(...recentSales.map(s => s.price)),
        max: Math.max(...recentSales.map(s => s.price))
      }
    }
  };
}
