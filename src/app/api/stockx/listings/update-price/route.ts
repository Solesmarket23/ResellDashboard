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
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
    console.log('🔐 Using API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'EMPTY');
    
    let response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
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
            'x-api-key': apiKey,
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
    console.log('📋 Update operation created:', result);

    // The update is asynchronous - we need to poll for completion
    const operationId = result.operationId;
    
    if (!operationId) {
      console.error('❌ No operationId returned from StockX');
      return NextResponse.json({ 
        success: false,
        error: 'No operation ID returned from StockX'
      }, { status: 500 });
    }

    // Poll the operation status (max 30 seconds)
    const maxAttempts = 30;
    let attempts = 0;
    let operationComplete = false;
    let operationSuccess = false;
    let operationError = null;

    while (attempts < maxAttempts && !operationComplete) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;

      try {
        const statusResponse = await fetch(
          `https://api.stockx.com/v2/selling/listings/${listingId}/operations/${operationId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            }
          }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log(`⏳ Operation status (attempt ${attempts}):`, statusData.operationStatus);

          if (statusData.operationStatus === 'COMPLETED') {
            operationComplete = true;
            operationSuccess = true;
          } else if (statusData.operationStatus === 'FAILED') {
            operationComplete = true;
            operationSuccess = false;
            operationError = statusData.error?.message || 'Operation failed';
          }
          // If PENDING or IN_PROGRESS, continue polling
        }
      } catch (pollError) {
        console.error('❌ Error polling operation status:', pollError);
      }
    }

    if (!operationComplete) {
      console.warn('⚠️ Operation polling timed out');
      return NextResponse.json({ 
        success: false,
        error: 'Price update timed out. Please check your listing to see if it updated.'
      }, { status: 408 });
    }

    if (!operationSuccess) {
      console.error('❌ Operation failed:', operationError);
      return NextResponse.json({ 
        success: false,
        error: operationError || 'Price update failed'
      }, { status: 500 });
    }

    console.log('✅ Price updated successfully!');

    const successResponse = NextResponse.json({
      success: true,
      newPrice: amount,
      listingId: listingId
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

