import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint with hardcoded test data to verify frontend display
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || 'Nike Dunk Low';
  
  console.log('🧪 === ARBITRAGE DEBUG TEST START ===');
  console.log(`🔍 Query: "${query}"`);
  
  // Temporary test data - remove after debugging
  const testOpportunities = [
    {
      ebayItem: {
        title: "Nike Dunk Low White Black Size 10",
        price: 120,
        url: "https://ebay.com/test1",
        imageUrl: "https://via.placeholder.com/300x300",
        condition: "New with box"
      },
      stockxItem: {
        title: "Nike Dunk Low White/Black",
        price: 150,
        url: "https://stockx.com/test1",
        imageUrl: "https://via.placeholder.com/300x300"
      },
      potentialProfit: 30,
      profitMargin: 25,
      confidence: 85,
      size: "10"
    },
    {
      ebayItem: {
        title: "Nike Dunk Low Panda Size 9",
        price: 110,
        url: "https://ebay.com/test2",
        imageUrl: "https://via.placeholder.com/300x300",
        condition: "New"
      },
      stockxItem: {
        title: "Nike Dunk Low White/Black",
        price: 140,
        url: "https://stockx.com/test2",
        imageUrl: "https://via.placeholder.com/300x300"
      },
      potentialProfit: 30,
      profitMargin: 27.3,
      confidence: 90,
      size: "9"
    },
    {
      ebayItem: {
        title: "Nike Dunk Low Black White Size 11",
        price: 95,
        url: "https://ebay.com/test3",
        imageUrl: "https://via.placeholder.com/300x300",
        condition: "Used"
      },
      stockxItem: {
        title: "Nike Dunk Low Black/White",
        price: 130,
        url: "https://stockx.com/test3",
        imageUrl: "https://via.placeholder.com/300x300"
      },
      potentialProfit: 35,
      profitMargin: 36.8,
      confidence: 80,
      size: "11"
    }
  ];

  console.log(`✅ Returning ${testOpportunities.length} test opportunities`);
  
  return NextResponse.json({
    success: true,
    opportunities: testOpportunities,
    searchQuery: query,
    totalEbayListings: 50,
    totalOpportunities: testOpportunities.length,
    averageProfit: 31.7,
    averageProfitMargin: 29.7,
    debug: {
      message: "Using hardcoded test data for frontend verification",
      timestamp: new Date().toISOString()
    }
  });
}