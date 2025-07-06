import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Extract all query parameters
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');
  const pageNumber = parseInt(searchParams.get('pageNumber') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '10');
  const orderStatus = searchParams.get('orderStatus');
  const productId = searchParams.get('productId');
  const variantId = searchParams.get('variantId');
  const inventoryTypes = searchParams.get('inventoryTypes');
  const initiatedShipmentDisplayIds = searchParams.get('initiatedShipmentDisplayIds');

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
    // Build query parameters
    const queryParams = new URLSearchParams();
    
    // Add pagination
    queryParams.set('pageNumber', pageNumber.toString());
    queryParams.set('pageSize', Math.min(pageSize, 100).toString()); // API max is 100
    
    // Add optional filters
    if (fromDate) queryParams.set('fromDate', fromDate);
    if (toDate) queryParams.set('toDate', toDate);
    if (orderStatus) queryParams.set('orderStatus', orderStatus);
    if (productId) queryParams.set('productId', productId);
    if (variantId) queryParams.set('variantId', variantId);
    if (inventoryTypes) queryParams.set('inventoryTypes', inventoryTypes);
    if (initiatedShipmentDisplayIds) queryParams.set('initiatedShipmentDisplayIds', initiatedShipmentDisplayIds);

    // StockX API endpoint for historical orders
    const apiUrl = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
    console.log(`📋 Fetching StockX historical orders: ${apiUrl}`);

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
            const ordersData = await retryResponse.json();
            
            // Process the orders data
            const processedOrders = processOrdersData(ordersData);
            
            // Update the access token cookie
            const successResponse = NextResponse.json({
              success: true,
              data: processedOrders,
              count: ordersData.count || processedOrders.length,
              pageNumber: ordersData.pageNumber || pageNumber,
              pageSize: ordersData.pageSize || pageSize,
              hasNextPage: ordersData.hasNextPage || false,
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
      console.error('StockX Historical Orders API Error:', errorText);
      
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

    const ordersData = await response.json();
    console.log(`✅ Successfully fetched historical orders:`, ordersData);
    
    // Process the orders data
    const processedOrders = processOrdersData(ordersData);

    return NextResponse.json({
      success: true,
      data: processedOrders,
      count: ordersData.count || processedOrders.length,
      pageNumber: ordersData.pageNumber || pageNumber,
      pageSize: ordersData.pageSize || pageSize,
      hasNextPage: ordersData.hasNextPage || false,
      appliedFilters: {
        fromDate,
        toDate,
        orderStatus,
        productId,
        variantId,
        inventoryTypes,
        initiatedShipmentDisplayIds
      }
    });

  } catch (error) {
    console.error('Error fetching StockX historical orders:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch historical orders',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Function to process and format historical orders data
function processOrdersData(rawData: any) {
  console.log(`🔄 Processing historical orders data:`, rawData);
  
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
    // Extract comprehensive order information
    const orderData = {
      id: order.id || order.orderId,
      status: order.status,
      orderStatus: order.orderStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      completedAt: order.completedAt,
      canceledAt: order.canceledAt,
      
      // Product information
      product: {
        id: order.product?.id || order.productId,
        name: order.product?.name || order.productName,
        brand: order.product?.brand,
        colorway: order.product?.colorway,
        imageUrl: order.product?.imageUrl,
        sku: order.product?.sku,
        urlKey: order.product?.urlKey,
        styleId: order.product?.styleId
      },
      
      // Variant information
      variant: {
        id: order.variant?.id || order.variantId,
        size: order.variant?.size || order.size,
        condition: order.variant?.condition || order.condition,
        inventoryType: order.variant?.inventoryType || order.inventoryType
      },
      
      // Pricing information
      pricing: {
        salePrice: order.salePrice || order.price,
        processingFee: order.processingFee,
        transactionFee: order.transactionFee,
        shippingFee: order.shippingFee,
        totalFees: order.totalFees,
        payout: order.payout,
        currency: order.currency || 'USD'
      },
      
      // Shipping information
      shipping: {
        trackingNumber: order.trackingNumber,
        shippingMethod: order.shippingMethod,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        initiatedShipmentDisplayId: order.initiatedShipmentDisplayId
      },
      
      // Buyer information (may be limited)
      buyer: {
        region: order.buyer?.region,
        country: order.buyer?.country
      },
      
      // Authentication and verification
      authentication: {
        authenticationStatus: order.authenticationStatus,
        authenticatedAt: order.authenticatedAt,
        authenticationFailed: order.authenticationFailed
      },
      
      // Return information (if applicable)
      returns: {
        returnStatus: order.returnStatus,
        returnReason: order.returnReason,
        returnedAt: order.returnedAt
      },
      
      // Calculate profit and metrics
      metrics: calculateOrderMetrics(order),
      
      // Raw order data for debugging
      rawData: order
    };

    return orderData;
  });
}

// Function to calculate order metrics and profit
function calculateOrderMetrics(order: any) {
  const salePrice = order.salePrice || order.price || 0;
  const totalFees = order.totalFees || 0;
  const netPayout = order.payout || (salePrice - totalFees);
  
  // Calculate fee breakdown
  const processingFee = order.processingFee || 0;
  const transactionFee = order.transactionFee || 0;
  const shippingFee = order.shippingFee || 0;
  const calculatedFees = processingFee + transactionFee + shippingFee;
  
  return {
    salePrice,
    totalFees,
    netPayout,
    feeBreakdown: {
      processingFee,
      transactionFee,
      shippingFee,
      calculatedTotal: calculatedFees
    },
    profitMargin: salePrice > 0 ? ((netPayout / salePrice) * 100).toFixed(2) : 0,
    // Note: To calculate actual profit, you'd need to track purchase cost
    // profitAmount: netPayout - purchaseCost,
    // profitMarginPercent: ((netPayout - purchaseCost) / purchaseCost) * 100
  };
} 