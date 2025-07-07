import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get('limit') || '50';
  const offset = searchParams.get('offset') || '0';
  const status = searchParams.get('status') || ''; // 'completed', 'pending', 'cancelled'

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

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
    return NextResponse.json(
      { error: 'Missing StockX API key' },
      { status: 500 }
    );
  }

  try {
    // Build API URL for seller orders/sales
    const pageNumber = Math.floor(parseInt(offset) / parseInt(limit)) + 1;
    const pageSize = Math.min(parseInt(limit), 50); // API max is 50
    
    const queryParams = new URLSearchParams({
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString()
    });

    // Add status filter if provided
    if (status) {
      queryParams.set('status', status);
    }

    // StockX API endpoint for seller orders (based on official documentation)
    const apiUrl = `https://api.stockx.com/v2/selling/orders?${queryParams.toString()}`;
    console.log(`🛒 Fetching StockX seller orders (official API): ${apiUrl}`);

    // Make API call to StockX
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (response.status === 401 && refreshToken) {
      // Access token expired, try to refresh
      console.log('Access token expired, attempting refresh...');
      
      const clientId = process.env.STOCKX_CLIENT_ID;
      const clientSecret = process.env.STOCKX_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: 'Missing OAuth credentials for token refresh' },
          { status: 500 }
        );
      }

      try {
        const refreshResponse = await fetch('https://accounts.stockx.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            audience: 'gateway.stockx.com',
            refresh_token: refreshToken
          })
        });

        if (refreshResponse.ok) {
          const tokenData = await refreshResponse.json();
          
          // Retry the request with new token
          const retryResponse = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'FlipFlow/1.0'
            }
          });

          if (retryResponse.ok) {
            const salesData = await retryResponse.json();
            
            // Process the sales data
            const processedSales = processSalesData(salesData);
            
            // Update the access token cookie
            const successResponse = NextResponse.json({
              success: true,
              data: processedSales,
              totalCount: salesData.totalCount || processedSales.length,
              pageNumber,
              pageSize,
              tokenRefreshed: true
            });

            successResponse.cookies.set('stockx_access_token', tokenData.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 43200 // 12 hours
            });

            return successResponse;
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('StockX Sales API Error:', errorText);
      
      if (response.status === 401) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Authentication failed', 
            details: errorText,
            authRequired: true,
            message: 'Please re-authenticate with StockX',
            statusCode: 401
          },
          { status: 401 }
        );
      } else if (response.status === 403) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Access forbidden', 
            details: errorText,
            message: 'You may not have seller permissions or API access',
            statusCode: 403
          },
          { status: 403 }
        );
      } else {
        return NextResponse.json(
          { 
            success: false,
            error: 'StockX API error', 
            details: errorText,
            statusCode: response.status
          },
          { status: response.status }
        );
      }
    }

    const salesData = await response.json();
    console.log(`✅ Successfully fetched seller orders:`, salesData);
    
    // Process the sales data
    const processedSales = processSalesData(salesData);

    return NextResponse.json({
      success: true,
      data: processedSales,
      totalCount: salesData.totalCount || processedSales.length,
      pageNumber,
      pageSize,
      appliedFilters: {
        status: status || 'all'
      }
    });

  } catch (error) {
    console.error('Error fetching StockX sales:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch sales data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Function to process and format sales data
function processSalesData(rawData: any) {
  console.log(`🔄 Processing seller orders data:`, rawData);
  
  // Handle different response formats
  let orders = [];
  if (rawData.orders && Array.isArray(rawData.orders)) {
    orders = rawData.orders;
  } else if (rawData.data && Array.isArray(rawData.data)) {
    orders = rawData.data;
  } else if (Array.isArray(rawData)) {
    orders = rawData;
  }

  return orders.map((order: any) => {
    // Extract key information from each order
    const saleData = {
      id: order.id || order.orderId,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      product: {
        id: order.product?.id,
        name: order.product?.name || order.productName,
        brand: order.product?.brand,
        colorway: order.product?.colorway,
        imageUrl: order.product?.imageUrl,
        sku: order.product?.sku,
        urlKey: order.product?.urlKey
      },
      variant: {
        id: order.variant?.id || order.variantId,
        size: order.variant?.size || order.size,
        condition: order.variant?.condition || order.condition
      },
      pricing: {
        salePrice: order.salePrice || order.price,
        processingFee: order.processingFee,
        transactionFee: order.transactionFee,
        shippingFee: order.shippingFee,
        totalFees: order.totalFees,
        payout: order.payout,
        currency: order.currency || 'USD'
      },
      shipping: {
        trackingNumber: order.trackingNumber,
        shippingMethod: order.shippingMethod,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt
      },
      buyer: {
        // Note: Buyer info may be limited for privacy
        region: order.buyer?.region
      },
      // Calculate profit if we have cost data
      profitCalculation: calculateProfit(order)
    };

    return saleData;
  });
}

// Function to calculate profit (if cost data is available)
function calculateProfit(order: any) {
  const salePrice = order.salePrice || order.price || 0;
  const totalFees = order.totalFees || 0;
  const netPayout = order.payout || (salePrice - totalFees);
  
  // You could store/track purchase cost separately
  // For now, we'll just return the net payout
  return {
    salePrice,
    totalFees,
    netPayout,
    // profitAmount: netPayout - purchaseCost, // Would need cost tracking
    // profitMargin: ((netPayout - purchaseCost) / purchaseCost) * 100
  };
} 