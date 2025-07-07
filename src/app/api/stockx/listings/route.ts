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

    console.log('🛍️ Fetching StockX listings...');

    // Fetch listings from StockX API
    const response = await fetch('https://api.stockx.com/v2/selling/listings', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': process.env.STOCKX_API_KEY!,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Clear the invalid token
        const responseWithClearedCookie = NextResponse.json({ 
          success: false, 
          error: 'Authentication expired. Please re-authenticate.' 
        }, { status: 401 });
        
        responseWithClearedCookie.cookies.delete('stockx_access_token');
        return responseWithClearedCookie;
      }

      throw new Error(`StockX API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Listings fetched successfully:', {
      totalListings: data.listings?.length || 0,
      hasData: !!data.listings
    });

    // Transform the data to match our component's expectations
    const transformedListings = (data.listings || []).map((listing: any, index: number) => ({
      listingId: listing.id || `listing-${index}`,
      productId: listing.product?.id || '',
      variantId: listing.variant?.id || '',
      productName: listing.product?.title || 'Unknown Product',
      size: listing.variant?.size || listing.variant?.variantValue || 'Unknown Size',
      currentPrice: parseFloat(listing.amount || '0'),
      originalPrice: parseFloat(listing.amount || '0'),
      brand: listing.product?.brand || 'Unknown Brand',
      colorway: listing.product?.colorway || '',
      condition: listing.condition || 'new',
      status: listing.status || 'active',
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt
    }));

    return NextResponse.json({
      success: true,
      listings: transformedListings,
      totalCount: transformedListings.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching listings:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch listings', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, listingIds, newPrice } = await request.json();
    
    // Get access token from cookies
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No access token found. Please authenticate first.' 
      }, { status: 401 });
    }

    console.log(`🛍️ Executing ${action} on listings:`, listingIds);

    if (action === 'update_price') {
      // Update listing prices
      const results = [];
      
      for (const listingId of listingIds) {
        try {
          const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'x-api-key': process.env.STOCKX_API_KEY!,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              amount: newPrice.toString()
            })
          });

          if (response.ok) {
            const updatedListing = await response.json();
            results.push({
              listingId,
              success: true,
              newPrice,
              listing: updatedListing
            });
          } else {
            results.push({
              listingId,
              success: false,
              error: `Failed to update: ${response.status}`
            });
          }
          
          // Rate limiting - wait between requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          results.push({
            listingId,
            success: false,
            error: error.message
          });
        }
      }

      return NextResponse.json({
        success: true,
        action,
        results,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'delete') {
      // Delete listings
      const results = [];
      
      for (const listingId of listingIds) {
        try {
          const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'x-api-key': process.env.STOCKX_API_KEY!,
            }
          });

          results.push({
            listingId,
            success: response.ok,
            status: response.status
          });
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          results.push({
            listingId,
            success: false,
            error: error.message
          });
        }
      }

      return NextResponse.json({
        success: true,
        action,
        results,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action. Supported actions: update_price, delete' 
    }, { status: 400 });

  } catch (error) {
    console.error('❌ Error updating listings:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update listings', 
      details: error.message 
    }, { status: 500 });
  }
} 