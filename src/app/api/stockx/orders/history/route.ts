import { NextRequest, NextResponse } from 'next/server';

// Module-level cache to reduce repeated upstream calls across requests (best-effort in serverless).
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ORDER_DETAILS_TTL_MS = 10 * 60 * 1000; // 10m
const catalogCache = new Map<string, { brand: string | null; productType: string | null; ts: number }>();
const orderDetailsCache = new Map<string, { data: any | null; ts: number }>();

function isPerimeterXBlock(body: string): boolean {
  const b = String(body || '').toLowerCase();
  // StockX commonly uses PerimeterX (PX). When blocked, the body is often JSON/HTML that includes px-cloud.net / blockScript.
  return (
    b.includes('px-cloud.net') ||
    b.includes('"appid":"px') ||
    b.includes('"blockscript"') ||
    b.includes('/captcha/captcha.js') ||
    b.includes('"customlogo":"https://stockx-assets') ||
    b.includes('perimeterx')
  );
}

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

  console.log('📥 /api/stockx/orders/history request', {
    pageNumber,
    pageSize,
    orderStatus: orderStatus || null,
    fromDate: fromDate || null,
    toDate: toDate || null,
    includeCatalog,
    includeDetails,
  });

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
    const upstreamCalls = {
      historyList: 0,
      catalog: 0,
      orderDetails: 0,
      retries429: 0,
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const fetchWithBackoff = async (
      url: string,
      init: RequestInit,
      callCounter: keyof typeof upstreamCalls,
      maxAttempts = 5
    ) => {
      let attempt = 0;
      while (attempt < maxAttempts) {
        upstreamCalls[callCounter] += 1;
        const res = await fetch(url, init);
        if (res.status !== 429) return res;

        upstreamCalls.retries429 += 1;
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
        const backoffMs = Number.isFinite(retryAfterSeconds)
          ? Math.min(30_000, Math.max(500, retryAfterSeconds * 1000))
          : Math.min(30_000, 500 * Math.pow(2, attempt));

        // Drain body to free resources
        await res.text().catch(() => '');
        await sleep(backoffMs);
        attempt += 1;
      }
      // One last attempt (counted)
      upstreamCalls[callCounter] += 1;
      return await fetch(url, init);
    };

    const enrichWithCatalogBrand = async (orders: any[], token: string) => {
      if (!includeCatalog) return orders;
      if (!Array.isArray(orders) || orders.length === 0) return orders;

      const cache = new Map<string, { brand: string | null; productType: string | null }>();

      const fetchBrandForProductId = async (pid: string): Promise<string | null> => {
        if (!pid) return null;
        if (cache.has(pid)) return cache.get(pid)?.brand ?? null;
        const cachedGlobal = catalogCache.get(pid);
        if (cachedGlobal && Date.now() - cachedGlobal.ts < CATALOG_TTL_MS) {
          cache.set(pid, { brand: cachedGlobal.brand, productType: cachedGlobal.productType });
          return cachedGlobal.brand ?? null;
        }
        try {
          const res = await fetchWithBackoff(`https://api.stockx.com/v2/catalog/products/${encodeURIComponent(pid)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'x-api-key': apiKey,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'FlipFlow/1.0',
            },
          }, 'catalog');
          if (!res.ok) {
            cache.set(pid, { brand: null, productType: null });
            catalogCache.set(pid, { brand: null, productType: null, ts: Date.now() });
            return null;
          }
          const json = await res.json().catch(() => ({}));
          const brand = typeof json?.brand === 'string' ? json.brand.trim() : null;
          const productType = typeof json?.productType === 'string' ? json.productType.trim() : null;
          cache.set(pid, { brand: brand || null, productType: productType || null });
          catalogCache.set(pid, { brand: brand || null, productType: productType || null, ts: Date.now() });
          return brand || null;
        } catch {
          cache.set(pid, { brand: null, productType: null });
          catalogCache.set(pid, { brand: null, productType: null, ts: Date.now() });
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

      // Concurrency-limited fetch to avoid hammering StockX (slightly higher to reduce request timeouts).
      const limit = 12;
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
        const cached = pid ? cache.get(pid) : undefined;
        const brand = existing || (cached?.brand || '');
        const existingCategory = typeof o?.product?.category === 'string' ? o.product.category.trim() : '';
        const category = existingCategory || (cached?.productType || '');

        if (!brand && !category) return o;
        return {
          ...o,
          product: {
            ...(o.product || {}),
            id: o?.product?.id || pid,
            ...(brand ? { brand } : {}),
            ...(category ? { category } : {}),
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
        const cachedGlobal = orderDetailsCache.get(orderNumber);
        if (cachedGlobal && Date.now() - cachedGlobal.ts < ORDER_DETAILS_TTL_MS) {
          cache.set(orderNumber, cachedGlobal.data);
          return cachedGlobal.data;
        }
        try {
          const res = await fetchWithBackoff(`https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'x-api-key': apiKey,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'FlipFlow/1.0',
            },
          }, 'orderDetails');
          if (!res.ok) {
            cache.set(orderNumber, null);
            orderDetailsCache.set(orderNumber, { data: null, ts: Date.now() });
            return null;
          }
          const json = await res.json().catch(() => ({}));
          cache.set(orderNumber, json || null);
          orderDetailsCache.set(orderNumber, { data: json || null, ts: Date.now() });
          return json || null;
        } catch {
          cache.set(orderNumber, null);
          orderDetailsCache.set(orderNumber, { data: null, ts: Date.now() });
          return null;
        }
      };

      const needs = orders
        .filter((o) => {
          const sale = typeof o?.pricing?.salePrice === 'number' ? o.pricing.salePrice : null;
          if (sale === null || sale <= 0) return false;

          const payout = typeof o?.pricing?.payout === 'number' ? o.pricing.payout : null;
          const payoutMissing = payout === null || payout === 0;

          const raw = o?.rawData || {};
          const hasShipment = Boolean(
            raw?.shipment?.trackingNumber ||
              raw?.shipment?.shipByDate ||
              raw?.trackingNumber ||
              o?.shipping?.trackingNumber
          );
          const hasAuth = Boolean(raw?.authenticationDetails?.status || o?.authentication?.authenticationStatus);

          // If we don't have shipment/auth fields (needed for table columns), pull details.
          return payoutMissing || !hasShipment || !hasAuth;
        })
        .map((o) => String(o?.orderNumber || o?.id || o?.rawData?.orderNumber || '').trim())
        .filter(Boolean);

      const unique = Array.from(new Set(needs));
      const limit = 6;
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
        if (sale === null || sale <= 0) return o;

        const orderNumber = String(o?.orderNumber || o?.id || o?.rawData?.orderNumber || '').trim();
        const details = orderNumber ? cache.get(orderNumber) : null;
        if (!details || typeof details !== 'object') return o;

        const raw = o?.rawData || {};
        const mergedRaw = {
          ...raw,
          ...(details?.shipment ? { shipment: details.shipment } : {}),
          ...(details?.authenticationDetails ? { authenticationDetails: details.authenticationDetails } : {}),
          ...(details?.inventoryType ? { inventoryType: details.inventoryType } : {}),
          ...(details?.payout ? { payout: details.payout } : {}),
        };

        const merged: any = {
          ...o,
          rawData: mergedRaw,
          // Populate our normalized sub-objects too (best effort)
          shipping: {
            ...(o.shipping || {}),
            ...(details?.shipment?.trackingNumber ? { trackingNumber: details.shipment.trackingNumber } : {}),
            ...(details?.shipment?.carrierCode ? { carrierCode: details.shipment.carrierCode } : {}),
            ...(details?.shipment?.shipByDate ? { shipByDate: details.shipment.shipByDate } : {}),
          },
          authentication: {
            ...(o.authentication || {}),
            ...(details?.authenticationDetails?.status ? { authenticationStatus: details.authenticationDetails.status } : {}),
          },
        };

        // If payout is missing, backfill money fields from details payout.
        const payout = typeof o?.pricing?.payout === 'number' ? o.pricing.payout : null;
        const payoutMissing = payout === null || payout === 0;
        if (!payoutMissing) return merged;

        const detailsPayout = parseMoney(details?.payout?.totalPayout);
        const detailsSale = parseMoney(details?.payout?.salePrice) ?? parseMoney(details?.amount) ?? sale;
        if (detailsPayout === null) return merged;
        const detailsFees = Math.max(0, Math.round((detailsSale - detailsPayout) * 100) / 100);

        return {
          ...merged,
          pricing: {
            ...(merged.pricing || {}),
            salePrice: detailsSale,
            payout: detailsPayout,
            totalFees: detailsFees,
            payoutDetails: details?.payout || merged?.pricing?.payoutDetails || null,
          },
          metrics: {
            ...(merged.metrics || {}),
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
    // StockX docs: only `orderStatus` is supported for /selling/orders/history.
    if (orderStatus) {
      queryParams.set('orderStatus', orderStatus);
    }
    if (productId) queryParams.set('productId', productId);
    if (variantId) queryParams.set('variantId', variantId);
    if (inventoryTypes) queryParams.set('inventoryTypes', inventoryTypes);
    if (initiatedShipmentDisplayIds) queryParams.set('initiatedShipmentDisplayIds', initiatedShipmentDisplayIds);

    // OAuth is issued with audience=gateway.stockx.com, and selling endpoints are served from gateway.
    // Using api.stockx.com can 401 even with a fresh token (audience mismatch).
    const apiUrl = `https://gateway.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
    console.log(`📋 Fetching StockX historical orders: ${apiUrl}`);

    // Make API call to StockX (best-effort retry on transient 5xx).
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetchWithBackoff(
        apiUrl,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'FlipFlow/1.0',
          },
        },
        'historyList'
      );

      if (!response || response.status < 500 || response.status >= 600) break;
      // Drain body then backoff before retry.
      await response.text().catch(() => '');
      const backoffMs = Math.min(5000, 500 * Math.pow(2, attempt));
      await sleep(backoffMs);
    }

    if (!response) {
      return NextResponse.json({ error: 'Failed to fetch StockX historical orders' }, { status: 502 });
    }

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
          const retryResponse = await fetchWithBackoff(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'FlipFlow/1.0'
            }
          }, 'historyList');

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
              tokenRefreshed: true,
              debug: {
                upstreamCalls: {
                  ...upstreamCalls,
                  total: upstreamCalls.historyList + upstreamCalls.catalog + upstreamCalls.orderDetails,
                },
              },
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

      // If the gateway endpoint returns 403, retry once via api.stockx.com as a best-effort fallback.
      // We've observed that some StockX stacks can return 403 on one host but succeed on the other.
      if (response.status === 403) {
        const blockedOnGateway = isPerimeterXBlock(errorText);
        const altUrl = apiUrl.replace('https://gateway.stockx.com', 'https://api.stockx.com');
        console.warn('⚠️ StockX 403 on gateway. Retrying via alternate host...', { altUrl, blockedOnGateway });
        const altRes = await fetchWithBackoff(
          altUrl,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': 'FlipFlow/1.0',
            },
          },
          'historyList',
          2
        );

        if (altRes.ok) {
          const ordersData = await altRes.json();
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
            debug: {
              upstreamCalls: {
                ...upstreamCalls,
                total: upstreamCalls.historyList + upstreamCalls.catalog + upstreamCalls.orderDetails,
              },
              retry: { perimeterXFallback: true, altHost: 'api.stockx.com' },
            },
            appliedFilters: {
              fromDate,
              toDate,
              orderStatus,
              productId,
              variantId,
              inventoryTypes,
              initiatedShipmentDisplayIds,
            },
          });
        } else {
          const altBody = await altRes.text().catch(() => '');
          console.warn('⚠️ Alternate host retry failed', { status: altRes.status, statusText: altRes.statusText });
          const blockedOnAlt = isPerimeterXBlock(altBody);
          const blocked = blockedOnGateway || blockedOnAlt;
          return NextResponse.json(
            {
              success: false,
              error: 'Access forbidden',
              message: blocked
                ? 'StockX bot protection (CAPTCHA) was triggered. Open StockX in your browser, complete any CAPTCHA, then retry in a few minutes.'
                : 'StockX returned 403 for the orders history endpoint. Your token may be valid, but this specific endpoint is blocked/permissioned for your account/API key.',
              blocked: blocked || undefined,
              statusCode: 403,
              details: (altBody || errorText || '').slice(0, 500),
              debug: {
                retry: {
                  alternateHostAttempted: true,
                  gatewayBlocked: blockedOnGateway || undefined,
                  altBlocked: blockedOnAlt || undefined,
                  altStatus: altRes.status,
                },
              },
            },
            { status: 403 }
          );
        }
      }
      
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
        const isBlocked = isPerimeterXBlock(errorText);
        return NextResponse.json(
          { 
            success: false,
            error: 'Access forbidden',
            details: errorText,
            message: isBlocked
              ? 'StockX bot protection (CAPTCHA) was triggered. Open StockX in your browser, complete any CAPTCHA, then retry in a few minutes.'
              : 'You may not have seller permissions or API access',
            blocked: isBlocked || undefined,
            statusCode: 403,
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
    console.log(`✅ Successfully fetched historical orders`, {
      pageNumber: ordersData?.pageNumber ?? pageNumber,
      pageSize: ordersData?.pageSize ?? pageSize,
      count: ordersData?.count ?? null,
      hasNextPage: Boolean(ordersData?.hasNextPage),
      firstOrderDateFields: (() => {
        const first = Array.isArray(ordersData?.orders) ? ordersData.orders[0] : Array.isArray(ordersData?.data) ? ordersData.data[0] : null;
        if (!first || typeof first !== 'object') return null;
        return {
          createdAt: (first as any)?.createdAt ?? null,
          orderDate: (first as any)?.orderDate ?? null,
          completedAt: (first as any)?.completedAt ?? null,
          updatedAt: (first as any)?.updatedAt ?? null,
          created: (first as any)?.created ?? null,
          status: (first as any)?.status ?? null,
        };
      })(),
    });
    
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
      debug: {
        upstreamCalls: {
          ...upstreamCalls,
          total: upstreamCalls.historyList + upstreamCalls.catalog + upstreamCalls.orderDetails,
        },
      },
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
    const createdAt =
      order.createdAt ||
      order.orderDate ||
      order.created ||
      order.completedAt ||
      order.updatedAt ||
      order.orderCreatedAt ||
      null;

    const orderData = {
      id: order.id || order.orderId || order.orderNumber || order.askId,
      orderNumber: order.orderNumber || order.orderId || order.id || order.askId,
      status: order.status,
      orderStatus: order.orderStatus,
      createdAt,
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