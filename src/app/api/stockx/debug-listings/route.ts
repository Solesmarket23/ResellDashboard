import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Get access token from cookies
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No access token found. Please authenticate first.' 
      }, { status: 401 });
    }

    console.log('🔍 Debug: Fetching raw StockX listings...');

    // Fetch with exact parameters from StockX docs
    const params = new URLSearchParams({
      listingStatuses: 'ACTIVE',
      pageSize: '100',
      pageNumber: '1'
    });
    
    const url = `https://api.stockx.com/v2/selling/listings?${params}`;
    console.log('📍 Debug URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`StockX API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Detailed analysis
    const analysis = {
      totalFromAPI: data.listings?.length || 0,
      paginationInfo: {
        count: data.count,
        pageSize: data.pageSize,
        pageNumber: data.pageNumber,
        hasNextPage: data.hasNextPage
      },
      statusBreakdown: {},
      listingsWithOrders: 0,
      listingsWithoutAsk: 0,
      expiredListings: 0,
      trulyActiveListings: 0,
      sampleListings: []
    };

    // Analyze each listing
    data.listings?.forEach((listing: any, index: number) => {
      // Count by status
      const status = listing.status || 'NO_STATUS';
      analysis.statusBreakdown[status] = (analysis.statusBreakdown[status] || 0) + 1;
      
      // Check various conditions
      if (listing.order) analysis.listingsWithOrders++;
      if (!listing.ask) analysis.listingsWithoutAsk++;
      if (listing.ask?.askExpiresAt && new Date(listing.ask.askExpiresAt) < new Date()) {
        analysis.expiredListings++;
      }
      
      // Check if truly active
      const isTrulyActive = 
        listing.status === 'ACTIVE' && 
        !listing.order && 
        listing.ask && 
        (!listing.ask.askExpiresAt || new Date(listing.ask.askExpiresAt) > new Date());
      
      if (isTrulyActive) analysis.trulyActiveListings++;
      
      // Include first 5 listings as samples
      if (index < 5) {
        analysis.sampleListings.push({
          id: listing.id,
          productName: listing.product?.title,
          size: listing.variant?.size,
          status: listing.status,
          hasOrder: !!listing.order,
          hasAsk: !!listing.ask,
          askExpired: listing.ask?.askExpiresAt ? 
            new Date(listing.ask.askExpiresAt) < new Date() : false,
          price: listing.amount,
          createdAt: listing.createdAt
        });
      }
    });

    return NextResponse.json({
      success: true,
      analysis,
      discrepancy: {
        apiReturned: analysis.totalFromAPI,
        trulyActive: analysis.trulyActiveListings,
        difference: analysis.totalFromAPI - analysis.trulyActiveListings,
        possibleReasons: {
          hasOrders: analysis.listingsWithOrders,
          noAsk: analysis.listingsWithoutAsk,
          expired: analysis.expiredListings
        }
      },
      recommendation: analysis.totalFromAPI === analysis.trulyActiveListings ? 
        'No discrepancy - all listings are truly active' :
        `Found ${analysis.totalFromAPI - analysis.trulyActiveListings} listings that shouldn't be included`
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to debug listings', 
      details: error.message 
    }, { status: 500 });
  }
}