import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false,
        error: 'No access token found. Please re-authenticate with StockX.' 
      }, { status: 401 });
    }

    const { listingId, amount } = await request.json();

    if (!listingId || !amount) {
      return NextResponse.json({ 
        success: false,
        error: 'Missing required fields: listingId and amount' 
      }, { status: 400 });
    }

    console.log(`💰 Updating listing ${listingId} to $${amount}`);

    // Try to update the listing price
    let response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(amount),
        currencyCode: 'USD'
      })
    });

    // If we get a 401, try refreshing the token
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, refreshing...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken;
        console.log('✅ Token refreshed, retrying...');
        
        // Retry with new token
        response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-api-key': process.env.STOCKX_CLIENT_ID || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: String(amount),
            currencyCode: 'USD'
          })
        });
      } else {
        return NextResponse.json({ 
          success: false,
          error: 'Token expired. Please re-authenticate with StockX.',
          needsAuth: true
        }, { status: 401 });
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ StockX API error:', response.status, errorData);
      return NextResponse.json({ 
        success: false,
        error: errorData.message || `StockX API error: ${response.status}`,
        details: errorData
      }, { status: response.status });
    }

    const result = await response.json();
    console.log('✅ Price updated successfully:', result);

    const successResponse = NextResponse.json({
      success: true,
      listing: result,
      newPrice: amount
    });

    // Set refreshed token in cookies if we refreshed
    if (refreshToken && accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Update price error:', error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update price'
    }, { status: 500 });
  }
}

