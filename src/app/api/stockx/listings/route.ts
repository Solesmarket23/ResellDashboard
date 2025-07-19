import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(request: NextRequest) {
  try {
    // Get access token from cookies
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No access token found. Please authenticate first.' 
      }, { status: 401 });
    }

    console.log('🛍️ Fetching StockX listings...');
    console.log('🔑 API Key:', process.env.STOCKX_API_KEY ? `Present (${process.env.STOCKX_API_KEY.substring(0, 8)}...)` : 'Missing');
    console.log('🔐 Client ID:', process.env.STOCKX_CLIENT_ID ? 'Present' : 'Missing');
    console.log('🎫 Access token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'Missing');

    // Function to fetch a page of listings
    const fetchPage = async (pageNum: number, token: string) => {
      const params = new URLSearchParams({
        limit: '100', // Get up to 100 listings per page
        page: pageNum.toString(),
        sort: 'created_at:desc', // Get newest listings first
        listingStatuses: 'ACTIVE' // Only get active listings that can be repriced
      });
      
      const url = `https://api.stockx.com/v2/selling/listings?${params}`;
      console.log('📍 Fetching from:', url);
      
      const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
      console.log('🔐 Using API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'EMPTY');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ResellDashboard/1.0'
        }
      });
      
      console.log('📊 Response status:', response.status);
      
      return response;
    };

    // Fetch first page
    let response = await fetchPage(1, accessToken);

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Store the new access token for later use
        accessToken = refreshResult.accessToken;
        // Retry with new token
        response = await fetchPage(1, accessToken);
      } else {
        return NextResponse.json({ 
          success: false, 
          error: 'Authentication expired. Please re-authenticate.' 
        }, { status: 401 });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ StockX API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      // Try to parse error details
      let errorMessage = `StockX API error: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) errorMessage = errorData.message;
        if (errorData.error) errorMessage = errorData.error;
      } catch {
        // If not JSON, use the text
        if (errorText) errorMessage = errorText;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Listings response:', {
      hasListings: !!data.listings,
      dataKeys: Object.keys(data),
      firstListing: data.listings?.[0]
    });

    // StockX API returns listings in a 'listings' array
    const rawListings = data.listings || data.data || [];
    console.log(`📦 Found ${rawListings.length} listings`);

    // Transform the data to match our component's expectations
    const transformedListings = rawListings.map((listing: any, index: number) => {
      // Log the structure of the first listing to understand the format
      if (index === 0) {
        console.log('Sample listing structure:', {
          keys: Object.keys(listing),
          listing: listing
        });
      }
      
      // Log status distribution
      if (index === 0) {
        const statusCounts = rawListings.reduce((acc: any, l: any) => {
          acc[l.status || 'UNKNOWN'] = (acc[l.status || 'UNKNOWN'] || 0) + 1;
          return acc;
        }, {});
        console.log('📊 Listing status distribution:', statusCounts);
        console.log('📌 Valid statuses: INACTIVE, ACTIVE, DELETED, CANCELED, MATCHED, COMPLETED');
      }
      
      return {
        listingId: listing.listingId || listing.id || `listing-${index}`,
        productId: listing.productId || listing.product?.productId || listing.product?.id || '',
        variantId: listing.variantId || listing.variant?.variantId || listing.variant?.id || '',
        productName: listing.productName || listing.product?.productName || listing.product?.title || listing.product?.name || 'Unknown Product',
        size: listing.size || listing.variant?.size || listing.variant?.variantValue || listing.variantValue || 'Unknown Size',
        currentPrice: parseFloat(listing.amount || listing.price || '0'),
        originalPrice: parseFloat(listing.amount || listing.price || '0'),
        brand: listing.brand || listing.product?.brand || 'Unknown Brand',
        styleId: listing.styleId || listing.product?.styleId || '',
        colorway: listing.colorway || listing.product?.colorway || '',
        condition: listing.condition || 'new',
        status: listing.status || listing.listingStatus || 'active',
        createdAt: listing.createdAt || listing.created_at,
        updatedAt: listing.updatedAt || listing.updated_at,
        // Additional fields that might be useful
        productUuid: listing.productUuid || listing.product?.uuid,
        variantUuid: listing.variantUuid || listing.variant?.uuid,
        listingUuid: listing.uuid || listing.listingUuid
      };
    });

    const successResponse = NextResponse.json({
      success: true,
      listings: transformedListings,
      totalCount: transformedListings.length,
      timestamp: new Date().toISOString()
    });

    // If we refreshed the token, set the new cookies
    if (accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken!);
    }

    return successResponse;

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
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

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
              'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
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
              'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
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