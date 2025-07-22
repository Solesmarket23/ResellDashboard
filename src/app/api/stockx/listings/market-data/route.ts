import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    const { listings } = await request.json();
    
    if (!listings || !Array.isArray(listings)) {
      return NextResponse.json({ error: 'Invalid listings data' }, { status: 400 });
    }

    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
    
    // Fetch market data for each listing
    const marketDataPromises = listings.map(async (listing: any) => {
      try {
        if (!listing.productId || !listing.variantId) {
          return { listingId: listing.listingId, marketData: null };
        }
        
        const marketUrl = `https://api.stockx.com/v2/catalog/products/${listing.productId}/variants/${listing.variantId}/market-data`;
        
        const response = await fetch(marketUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          // The market data endpoint returns an array, find the matching variant
          const variantData = Array.isArray(data) 
            ? data.find((item: any) => item.variantId === listing.variantId)
            : data;
          
          if (variantData) {
            return {
              listingId: listing.listingId,
              marketData: {
                lowestAsk: variantData.lowestAskAmount ? parseInt(variantData.lowestAskAmount) : null,
                highestBid: variantData.highestBidAmount ? parseInt(variantData.highestBidAmount) : null,
                lastSale: variantData.lastSaleAmount ? parseInt(variantData.lastSaleAmount) : null,
                numberOfAsks: variantData.numberOfAsks || 0,
                numberOfBids: variantData.numberOfBids || 0
              }
            };
          }
        }
        
        return { listingId: listing.listingId, marketData: null };
      } catch (error) {
        console.error(`Error fetching market data for listing ${listing.listingId}:`, error);
        return { listingId: listing.listingId, marketData: null };
      }
    });
    
    // Add delays between requests to avoid rate limiting
    const results = [];
    for (let i = 0; i < marketDataPromises.length; i++) {
      results.push(await marketDataPromises[i]);
      if (i < marketDataPromises.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests
      }
    }
    
    return NextResponse.json({
      success: true,
      marketData: results
    });
    
  } catch (error) {
    console.error('Market data fetch error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch market data', 
      details: error.message 
    }, { status: 500 });
  }
}