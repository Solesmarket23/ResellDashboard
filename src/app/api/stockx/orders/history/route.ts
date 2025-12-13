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
  const includeCatalog = searchParams.get('includeCatalog') === '1';
  const includeDetails = searchParams.get('includeDetails') === '1';

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
    const enrichWithCatalogBrand = async (orders: any[], token: string) => {
      if (!includeCatalog) return orders;
      if (!Array.isArray(orders) || orders.length === 0) return orders;

      const cache = new Map<string, string | null>();

      const fetchBrandForProductId = async (pid: string): Promise<string | null> => {
        if (!pid) return null;
        if (cache.has(pid)) return cache.get(pid) ?? null;
        try {
          const res = await fetch(`https://api.stockx.com/v2/catalog/products/${encodeURIComponent(pid)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'x-api-key': apiKey,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'FlipFlow/1.0',
            },
          });
          if (!res.ok) {
            cache.set(pid, null);
            return null;
          }
          const json = await res.json().catch(() => ({}));
          const brand = typeof json?.brand === 'string' ? json.brand.trim() : null;
          cache.set(pid, brand || null);
          return brand || null;
        } catch {
          cache.set(pid, null);
          return null;
        }
      };

      const uniqueProductIds = Array.from(
        new Set(
          orders
            .map((o) => String(o?.product?.id || o?.product?.productId || o?.productId || '').trim())
            .filter(Boolean)
        )
      );

      // Concurrency-limited fetch to avoid hammering StockX.
      const limit = 5;
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, uniqueProductIds.length) }, async () => {
        while (idx < uniqueProductIds.length) {
          const current = uniqueProductIds[idx];
          idx += 1;
          await fetchBrandForProductId(current);
        }
      });
      await Promise.all(workers);

      return orders.map((o) => {
        const pid = String(o?.product?.id || o?.product?.productId || o?.productId || '').trim();
        const existing = typeof o?.product?.brand === 'string' ? o.product.brand.trim() : '';
        const brand = existing || (pid ? cache.get(pid) || '' : '');
        if (!brand) return o;
        return {
          ...o,
          product: {
            ...(o.product || {}),
            id: o?.product?.id || pid,
            brand,
          },
        };
      });
    };

    const enrichWithOrderDetailsPayout = async (orders: any[], token: string) => {
      if (!includeDetails) return orders;
      if (!Array.isArray(orders) || orders.length === 0) return orders;

      const cache = new Map<string, any>();
      const fetchDetails = async (orderNumber: string) => {
        if (!orderNumber) return null;
        if (cache.has(orderNumber)) return cache.get(orderNumber);
        try {
          const res = await fetch(`https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'x-api-key': apiKey,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'FlipFlow/1.0',
            },
          });
          if (!res.ok) {
            cache.set(orderNumber, null);
            return null;
          }
          const json = await res.json().catch(() => ({}));
          cache.set(orderNumber, json || null);
          return json || null;
        } catch {
          cache.set(orderNumber, null);
          return null;
        }
      };

      const needs = orders
        .filter((o) => {
          const sale = typeof o?.pricing?.salePrice === 'number' ? o.pricing.salePrice : null;
          const payout = typeof o?.pricing?.payout === 'number' ? o.pricing.payout : null;
          // Only enrich if we likely have a missing payout (not a real $0 sale)
          return sale !== null && sale > 0 && (payout === null || payout === 0);
        })
        .map((o) => String(o?.orderNumber || o?.id || o?.rawData?.orderNumber || '').trim())
        .filter(Boolean);

      const unique = Array.from(new Set(needs));
      const limit = 3;
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, unique.length) }, async () => {
        while (idx < unique.length) {
          const current = unique[idx];
          idx += 1;
          await fetchDetails(current);
        }
      });
      await Promise.all(workers);

      const parseMoney = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value)) return value > 5000 ? value / 100 : value;
        if (typeof value === 'string') {
          const n = parseFloat(value);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      return orders.map((o) => {
        const sale = typeof o?.pricing?.salePrice === 'number' ? o.pricing.salePrice : null;
        const payout = typeof o?.pricing?.payout === 'number' ? o.pricing.payout : null;
        if (sale === null || sale <= 0) return o;
        if (payout !== null && payout !== 0) return o;

        const orderNumber = String(o?.orderNumber || o?.id || o?.rawData?.orderNumber || '').trim();
        const details = orderNumber ? cache.get(orderNumber) : null;
        if (!details || typeof details !== 'object') return o;
        const detailsPayout = parseMoney(details?.payout?.totalPayout);
        const detailsSale = parseMoney(details?.payout?.salePrice) ?? parseMoney(details?.amount) ?? sale;
        if (detailsPayout === null) return o;
        const detailsFees = Math.max(0, Math.round((detailsSale - detailsPayout) * 100) / 100);

        return {
          ...o,
          pricing: {
            ...(o.pricing || {}),
            salePrice: detailsSale,
            payout: detailsPayout,
            totalFees: detailsFees,
            payoutDetails: details?.payout || o?.pricing?.payoutDetails || null,
          },
          metrics: {
            ...(o.metrics || {}),
            salePrice: detailsSale,
            netPayout: detailsPayout,
            totalFees: detailsFees,
          },
        };
      });
    };

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
            const processedOrdersRaw = processOrdersData(ordersData);
            const withBrands = await enrichWithCatalogBrand(processedOrdersRaw, tokenData.access_token);
            const processedOrders = await enrichWithOrderDetailsPayout(withBrands, tokenData.access_token);
            
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
              maxAge: 2592000 // 30 days in seconds
            });

            // Also update refresh token if provided
            if (tokenData.refresh_token) {
              successResponse.cookies.set('stockx_refresh_token', tokenData.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 2592000 // 30 days in seconds
              });
            }

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
    const processedOrdersRaw = processOrdersData(ordersData);
    const withBrands = await enrichWithCatalogBrand(processedOrdersRaw, accessToken);
    const processedOrders = await enrichWithOrderDetailsPayout(withBrands, accessToken);

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
    const parseMoney = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number' && Number.isFinite(value)) {
        // StockX often uses cents for numeric money (e.g. amount=25000)
        return value > 5000 ? value / 100 : value;
      }
      if (typeof value === 'string') {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const currencyCode = order.currencyCode || order.currency || order.payout?.currencyCode || 'USD';

    // StockX public API order history uses:
    // - amount (number, cents)
    // - payout { salePrice: string, totalPayout: string, totalAdjustments: string, adjustments: [...] }
    const payoutSale = parseMoney(order.payout?.salePrice);
    const payoutTotal = parseMoney(order.payout?.totalPayout);
    const saleFromAmount = parseMoney(order.amount);
    const salePrice = payoutSale ?? saleFromAmount ?? parseMoney(order.salePrice) ?? parseMoney(order.price) ?? 0;
    const netPayout = payoutTotal ?? parseMoney(order.payoutAmount) ?? parseMoney(order.netPayout) ?? parseMoney(order.payout) ?? null;
    const totalFees =
      netPayout !== null
        ? Math.max(0, salePrice - netPayout)
        : parseMoney(order.totalFees);

    // Extract comprehensive order information
    const orderData = {
      id: order.id || order.orderId || order.orderNumber || order.askId,
      orderNumber: order.orderNumber || order.orderId || order.id || order.askId,
      status: order.status,
      orderStatus: order.orderStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      completedAt: order.completedAt,
      canceledAt: order.canceledAt,
      
      // Product information
      product: {
        // Public API schema uses OrderProduct { productId, productName, styleId }
        id: order.product?.productId || order.product?.id || order.productId,
        name:
          order.product?.productName ||
          order.product?.name ||
          order.productName ||
          order.variant?.product?.productName ||
          order.variant?.product?.name,
        brand:
          order.product?.brand ||
          order.variant?.product?.brand ||
          order.brand,
        category:
          order.product?.category ||
          order.variant?.product?.category ||
          order.category,
        colorway: order.product?.colorway || order.variant?.product?.colorway,
        imageUrl:
          order.product?.imageUrl ||
          order.variant?.product?.media?.imageUrl ||
          order.variant?.product?.imageUrl,
        sku:
          order.product?.sku ||
          order.product?.styleId ||
          order.variant?.product?.sku,
        urlKey: order.product?.urlKey || order.variant?.product?.urlKey,
        styleId:
          order.product?.styleId ||
          order.variant?.product?.styleId ||
          order.product?.styleId
      },
      
      // Variant information
      variant: {
        id: order.variant?.id || order.variantId,
        size: order.variant?.size || order.size || order.variant?.variantValue,
        condition: order.variant?.condition || order.condition,
        inventoryType: order.variant?.inventoryType || order.inventoryType
      },
      
      // Pricing information
      pricing: {
        salePrice,
        // These are not explicitly provided in the public order-history schema; we derive totals from payout.
        processingFee: parseMoney(order.processingFee),
        transactionFee: parseMoney(order.transactionFee),
        shippingFee: parseMoney(order.shippingFee),
        totalFees,
        payout: netPayout,
        currency: currencyCode,
        payoutDetails: order.payout || null
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
      metrics: calculateOrderMetrics({
        salePrice,
        totalFees,
        netPayout,
        payoutDetails: order.payout
      }),
      
      // Raw order data for debugging
      rawData: order
    };

    return orderData;
  });
}

// Function to calculate order metrics and profit
function calculateOrderMetrics(order: any) {
  const salePrice = typeof order.salePrice === 'number' ? order.salePrice : 0;
  const totalFees = typeof order.totalFees === 'number' ? order.totalFees : 0;
  const netPayout =
    typeof order.netPayout === 'number'
      ? order.netPayout
      : typeof order.payout === 'number'
        ? order.payout
        : salePrice - totalFees;

  // If payout details exist, use adjustments for a better breakdown display (not all fees are itemized).
  const adjustments: any[] = Array.isArray(order.payoutDetails?.adjustments)
    ? order.payoutDetails.adjustments
    : [];
  const adjustmentsTotal = adjustments.reduce((sum, a) => {
    const n = typeof a?.amount === 'number' ? a.amount : parseFloat(a?.amount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  
  return {
    salePrice,
    totalFees,
    netPayout,
    feeBreakdown: {
      // These are often not available via history endpoint; keep them for future compatibility.
      processingFee: order.processingFee || 0,
      transactionFee: order.transactionFee || 0,
      shippingFee: order.shippingFee || 0,
      calculatedTotal: order.processingFee && order.transactionFee && order.shippingFee
        ? (order.processingFee || 0) + (order.transactionFee || 0) + (order.shippingFee || 0)
        : null,
      adjustmentsTotal: adjustmentsTotal || null,
      adjustmentsCount: adjustments.length || 0
    },
    profitMargin: salePrice > 0 ? ((netPayout / salePrice) * 100).toFixed(2) : 0,
    // Note: To calculate actual profit, you'd need to track purchase cost
    // profitAmount: netPayout - purchaseCost,
    // profitMarginPercent: ((netPayout - purchaseCost) / purchaseCost) * 100
  };
} 