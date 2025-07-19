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

    console.log('🔍 Investigating StockX listing duplicates...');

    // Fetch listings from StockX
    const params = new URLSearchParams({
      limit: '200',
      page: '1',
      sort: 'created_at:desc',
      listingStatuses: 'ACTIVE'
    });
    
    const response = await fetch(`https://api.stockx.com/v2/selling/listings?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`StockX API error: ${response.status}`);
    }

    const data = await response.json();
    const listings = data.listings || [];
    
    // Group by product-size
    const productSizeGroups = new Map();
    listings.forEach((listing: any) => {
      const key = `${listing.product?.title || 'Unknown'}-${listing.variant?.size || 'Unknown'}`;
      if (!productSizeGroups.has(key)) {
        productSizeGroups.set(key, []);
      }
      productSizeGroups.get(key).push(listing);
    });
    
    // Find groups with multiple listings
    const duplicateGroups = Array.from(productSizeGroups.entries())
      .filter(([_, group]) => group.length > 1)
      .map(([key, group]) => ({
        productSize: key,
        count: group.length,
        listings: group.map((l: any) => ({
          listingId: l.id,
          productId: l.product?.id,
          variantId: l.variant?.id,
          price: l.amount,
          status: l.status,
          condition: l.condition,
          inventoryType: l.inventoryType,
          createdAt: l.createdAt,
          raw: l // Include full listing for investigation
        }))
      }));

    return NextResponse.json({
      success: true,
      totalListings: listings.length,
      uniqueProductSizeCombos: productSizeGroups.size,
      duplicateGroups: duplicateGroups,
      duplicateGroupCount: duplicateGroups.length,
      totalDuplicateListings: duplicateGroups.reduce((sum, g) => sum + (g.count - 1), 0),
      summary: `Found ${listings.length} total listings with ${productSizeGroups.size} unique product-size combinations. ${duplicateGroups.length} combinations have multiple listings.`
    });

  } catch (error) {
    console.error('❌ Error investigating duplicates:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to investigate duplicates', 
      details: error.message 
    }, { status: 500 });
  }
}