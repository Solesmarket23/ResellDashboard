import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';

function getBearerToken(request: NextRequest): string | null {
  const raw = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = (m?.[1] || '').trim();
  return t ? t : null;
}

// Module-level cache to reduce repeated upstream calls across requests (best-effort in serverless).
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ORDER_DETAILS_TTL_MS = 10 * 60 * 1000; // 10m
const catalogCache = new Map<string, { brand: string | null; productType: string | null; imageUrl: string | null; ts: number }>();
const orderDetailsCache = new Map<string, { data: any | null; ts: number }>();

/** Extract imageUrl from StockX catalog product JSON (same logic as catalog/products and listings/native). */
function imageUrlFromCatalogProduct(product: any): string | null {
  if (!product || typeof product !== 'object') return null;
  const url =
    (Array.isArray(product.productImages) && product.productImages[0]) ||
    (Array.isArray(product.product_images) && product.product_images[0]) ||
    product.media?.imageUrl ||
    product.media?.image_url ||
    product.imageUrl ||
    product.image_url ||
    product.image ||
    (Array.isArray(product.media) &&
      (product.media.find((m: any) => m?.type === 'image' && m?.url)?.url ||
        product.media.find((m: any) => typeof m?.url === 'string')?.url));
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

/** Normalize shipment so iOS gets shipByDate (camelCase) whether upstream uses shipByDate or ship_by_date. */
function normalizeShipment(shipment: any): any {
  if (!shipment || typeof shipment !== 'object') return shipment;
  const shipBy =
    shipment.shipByDate ?? shipment.ship_by_date ?? (typeof (shipment as any).ShipByDate === 'string' ? (shipment as any).ShipByDate : null);
  if (shipBy == null) return shipment;
  return { ...shipment, shipByDate: shipBy };
}

/** Extract image URL from an order (list or enriched) from all known StockX response shapes. */
function imageUrlFromOrder(order: any): string | null {
  if (!order || typeof order !== 'object') return null;
  const url =
    order?.product?.imageUrl ||
    order?.product?.image_url ||
    order?.product?.media?.imageUrl ||
    order?.product?.media?.image_url ||
    (Array.isArray(order?.product?.media) && order.product.media.find((m: any) => typeof m?.url === 'string')?.url) ||
    order?.variant?.product?.media?.imageUrl ||
    order?.variant?.product?.media?.image_url ||
    order?.variant?.product?.imageUrl ||
    order?.variant?.product?.image_url ||
    order?.variant?.product?.image ||
    (Array.isArray(order?.variant?.product?.media) && order.variant.product.media.find((m: any) => typeof m?.url === 'string')?.url);
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const upstreamCalls = {
      activeList: 0,
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

        await res.text().catch(() => '');
        await sleep(backoffMs);
        attempt += 1;
      }
      upstreamCalls[callCounter] += 1;
      return await fetch(url, init);
    };

    const parseMoney = (value: any): number => {
      if (value === null || value === undefined) return 0;
      // If API returns a string like "199" or "199.00" (dollars)
      if (typeof value === 'string') {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 0;
        // Sometimes numeric strings can still be cents (e.g. "19900")
        const dollars = Math.abs(n) > 5000 ? n / 100 : n;
        return Math.round(dollars * 100) / 100;
      }
      // If API returns number, it might be cents (e.g. 19900) or dollars (e.g. 199)
      if (typeof value === 'number' && Number.isFinite(value)) {
        // Heuristic: anything large is almost certainly cents
        const dollars = value > 5000 ? value / 100 : value;
        return Math.round(dollars * 100) / 100;
      }
      return 0;
    };

    const searchParams = request.nextUrl.searchParams;
    const pageNumber = parseInt(searchParams.get('pageNumber') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '100', 10), 100);
    const orderStatus = searchParams.get('orderStatus') || undefined;
    const includeCatalog = searchParams.get('includeCatalog') === '1';
    const includeDetails = searchParams.get('includeDetails') === '1';

    const cookieStore = await cookies();
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    const bearer = getBearerToken(request);
    if (bearer) {
      const uid = await resolveNativeAuthUserId(request);
      if (!uid) {
        return NextResponse.json({ error: 'Invalid or missing Bearer token' }, { status: 401 });
      }
      const adminDb = getAdminDb();
      if (!adminDb) {
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
      }
      const userSnap = await adminDb.collection('users').doc(uid).get();
      const userData = (userSnap.data() || {}) as Record<string, unknown>;
      const stockxTokens = (userData?.stockxTokens || {}) as Record<string, unknown>;
      accessToken = String(stockxTokens?.access_token ?? '').trim();
      refreshToken = String(stockxTokens?.refresh_token ?? '').trim();
      const expiresAt = Number(stockxTokens?.expires_at ?? 0);
      if (expiresAt && Date.now() > expiresAt - 60_000 && refreshToken) {
        const refreshed = await refreshStockXTokens(refreshToken);
        if (refreshed.success && refreshed.accessToken) {
          accessToken = refreshed.accessToken;
          refreshToken = refreshed.refreshToken || refreshToken;
        }
      }
    }

    if (!accessToken) {
      accessToken = cookieStore.get('stockx_access_token')?.value ?? null;
      refreshToken = cookieStore.get('stockx_refresh_token')?.value ?? null;
    }

    const apiKey = process.env.STOCKX_API_KEY;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'StockX not connected. Please authenticate first.' },
        { status: 401 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing StockX API key (STOCKX_API_KEY)' },
        { status: 500 }
      );
    }

    console.log('🔍 Fetching active StockX orders...');

    const qp = new URLSearchParams();
    qp.set('pageNumber', String(Math.max(1, pageNumber)));
    qp.set('pageSize', String(Math.max(1, pageSize)));
    if (orderStatus) qp.set('orderStatus', orderStatus);
    // When fetching CREATED (to-ship) orders, sort by ship-by date so most urgent first
    const sortOrder = searchParams.get('sortOrder') || (orderStatus === 'CREATED' ? 'SHIPBYDATE' : undefined);
    if (sortOrder) qp.set('sortOrder', sortOrder);

    // Call StockX API for active orders
    const apiUrl = `https://api.stockx.com/v2/selling/orders/active?${qp.toString()}`;
    let response = await fetchWithBackoff(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    }, 'activeList');

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        response = await fetchWithBackoff(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'x-api-key': apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        }, 'activeList');
        
        // Store the new access token for later use
        accessToken = refreshResult.accessToken;
      } else {
        return NextResponse.json(
          { error: 'Authentication expired. Please re-authenticate with StockX.' },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      console.error('❌ StockX API error:', response.status, response.statusText);

      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'StockX API error',
          statusCode: response.status,
          details: errorText || response.statusText,
          authRequired: response.status === 401,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('✅ Active orders fetched successfully:', data);

    const enrichBrands = async (orders: any[], token: string) => {
      if (!Array.isArray(orders) || orders.length === 0) return orders;

      const cache = new Map<string, { brand: string | null; productType: string | null; imageUrl: string | null }>();
      const fetchCatalog = async (pid: string) => {
        if (!pid) return;
        if (cache.has(pid)) return;
        const cachedGlobal = catalogCache.get(pid);
        if (cachedGlobal && Date.now() - cachedGlobal.ts < CATALOG_TTL_MS) {
          cache.set(pid, { brand: cachedGlobal.brand, productType: cachedGlobal.productType, imageUrl: cachedGlobal.imageUrl });
          return;
        }
        try {
          const res = await fetchWithBackoff(`https://api.stockx.com/v2/catalog/products/${encodeURIComponent(pid)}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'x-api-key': apiKey,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'ResellDashboard/1.0',
            },
          }, 'catalog');
          if (!res.ok) {
            cache.set(pid, { brand: null, productType: null, imageUrl: null });
            catalogCache.set(pid, { brand: null, productType: null, imageUrl: null, ts: Date.now() });
            return;
          }
          const json = await res.json().catch(() => ({}));
          const brand = typeof json?.brand === 'string' ? json.brand.trim() : null;
          const productType = typeof json?.productType === 'string' ? json.productType.trim() : null;
          const imageUrl = imageUrlFromCatalogProduct(json);
          cache.set(pid, { brand: brand || null, productType: productType || null, imageUrl });
          catalogCache.set(pid, { brand: brand || null, productType: productType || null, imageUrl, ts: Date.now() });
        } catch {
          cache.set(pid, { brand: null, productType: null, imageUrl: null });
          catalogCache.set(pid, { brand: null, productType: null, imageUrl: null, ts: Date.now() });
        }
      };

      const ids = Array.from(
        new Set(
          orders
            .map((o) => String(o?.product?.productId || o?.productId || o?.product?.id || '').trim())
            .filter(Boolean)
        )
      );

      const limit = 12;
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, ids.length) }, async () => {
        while (idx < ids.length) {
          const current = ids[idx];
          idx += 1;
          await fetchCatalog(current);
        }
      });
      await Promise.all(workers);

      return orders.map((o) => {
        const pid = String(o?.product?.productId || o?.productId || o?.product?.id || '').trim();
        const existing = String(o?.product?.brand || o?.variant?.product?.brand || '').trim();
        const cached = pid ? cache.get(pid) : undefined;
        const brand = includeCatalog ? (existing || (cached?.brand ?? '')) : existing;
        const existingCategory = String(o?.product?.category || o?.variant?.product?.category || '').trim();
        const category = includeCatalog ? (existingCategory || (cached?.productType ?? '')) : existingCategory;
        const imageUrl = cached?.imageUrl ?? o?.variant?.product?.media?.imageUrl ?? o?.product?.imageUrl ?? null;

        const hasBrandOrCategory = !!(brand || category);
        const hasImageUrl = !!imageUrl;
        if (!hasBrandOrCategory && !hasImageUrl) return o;
        return {
          ...o,
          product: {
            ...(o.product || {}),
            productId: o?.product?.productId || pid,
            ...(brand ? { brand } : {}),
            ...(category ? { category } : {}),
            ...(imageUrl ? { imageUrl } : {}),
          },
        };
      });
    };

    const ordersRaw = Array.isArray(data.orders) ? data.orders : [];
    const ordersWithBrands = await enrichBrands(ordersRaw, accessToken);

    const enrichPayoutDetails = async (orders: any[], token: string) => {
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
              'User-Agent': 'ResellDashboard/1.0',
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
        .map((o) => String(o?.orderNumber || o?.orderId || o?.id || '').trim())
        .filter(Boolean)
        .filter((n, i, arr) => arr.indexOf(n) === i)
        .filter((orderNumber) => {
          const o = orders.find((x) => String(x?.orderNumber || x?.orderId || x?.id || '').trim() === orderNumber);
          if (!o) return false;
          const payout = o?.payout;
          const payoutMissing = !(payout && payout.totalPayout !== null && payout.totalPayout !== undefined);
          const hasShipment = Boolean(o?.shipment?.trackingNumber || o?.shipment?.shipByDate);
          const hasAuth = Boolean(o?.authenticationDetails?.status);
          // Fetch details if payout is missing OR shipment/auth fields are missing.
          return payoutMissing || !hasShipment || !hasAuth;
        });

      const limit = 6;
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, needs.length) }, async () => {
        while (idx < needs.length) {
          const current = needs[idx];
          idx += 1;
          await fetchDetails(current);
        }
      });
      await Promise.all(workers);

      return orders.map((o) => {
        const orderNumber = String(o?.orderNumber || o?.orderId || o?.id || '').trim();
        const payout = o?.payout;
        const details = orderNumber ? cache.get(orderNumber) : null;
        if (!details || typeof details !== 'object') return o;

        const merged: any = {
          ...o,
          ...(details?.shipment ? { shipment: details.shipment } : {}),
          ...(details?.authenticationDetails ? { authenticationDetails: details.authenticationDetails } : {}),
          ...(details?.inventoryType ? { inventoryType: details.inventoryType } : {}),
        };

        // Backfill payout if missing
        if (!(payout && payout.totalPayout !== null && payout.totalPayout !== undefined) && details?.payout) {
          return { ...merged, payout: details.payout };
        }

        return merged;
      });
    };

    const ordersWithBrandsAndDetails = await enrichPayoutDetails(ordersWithBrands, accessToken);

    // Transform StockX API response to our format
    const transformedOrders =
      ordersWithBrandsAndDetails?.map((order: any) => {
        const payoutObj = order?.payout;
        const salePrice = parseMoney(payoutObj?.salePrice ?? order?.amount);
        const payout: number | null =
          payoutObj && payoutObj.totalPayout !== null && payoutObj.totalPayout !== undefined
            ? parseMoney(payoutObj.totalPayout)
            : null;
        const fees: number | null =
          payout !== null ? Math.max(0, Math.round((salePrice - payout) * 100) / 100) : null;
        const pid = order?.product?.productId || order?.productId || order?.product?.id || null;

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          productId: pid,
          productName:
            order.product?.productName ||
            order.product?.name ||
            order.variant?.product?.productName ||
            order.variant?.product?.name ||
            'Unknown Product',
          productBrand: order.product?.brand || order.variant?.product?.brand || 'Unknown Brand',
          category: order.product?.category || order.variant?.product?.category,
          size: order.variant?.variantValue || order.variant?.size || 'N/A',
          sku: order.product?.styleId || order.variant?.sku || 'N/A',
          status: order.status,
          salePrice,
          fees,
          payout,
          orderDate: order.createdAt,
          buyerLocation: order.shippingAddress?.city || 'Unknown',
          shippingMethod: order.shippingMethod || 'Standard',
          imageUrl: imageUrlFromOrder(order),
          shipment: normalizeShipment(order.shipment),
          authenticationDetails: order.authenticationDetails,
          inventoryType: order.inventoryType,
        };
      }) || [];

    const successResponse = NextResponse.json({
      orders: transformedOrders,
      total: transformedOrders.length,
      source: 'stockx',
      count: data.count,
      pageNumber: data.pageNumber,
      pageSize: data.pageSize,
      hasNextPage: data.hasNextPage,
      debug: {
        upstreamCalls: {
          ...upstreamCalls,
          total: upstreamCalls.activeList + upstreamCalls.catalog + upstreamCalls.orderDetails,
        },
      },
    });

    if (!bearer && accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken ?? '');
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching active orders:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch active orders',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}