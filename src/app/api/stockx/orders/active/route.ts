import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(request: NextRequest) {
  try {
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

    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
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

    // Call StockX API for active orders
    const apiUrl = `https://api.stockx.com/v2/selling/orders/active?${qp.toString()}`;
    let response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'x-api-key': apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });
        
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
      if (!includeCatalog) return orders;
      if (!Array.isArray(orders) || orders.length === 0) return orders;

      const cache = new Map<string, string | null>();
      const fetchBrand = async (pid: string): Promise<string | null> => {
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
              'User-Agent': 'ResellDashboard/1.0',
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

      const ids = Array.from(
        new Set(
          orders
            .map((o) => String(o?.product?.productId || o?.productId || o?.product?.id || '').trim())
            .filter(Boolean)
        )
      );

      const limit = 5;
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, ids.length) }, async () => {
        while (idx < ids.length) {
          const current = ids[idx];
          idx += 1;
          await fetchBrand(current);
        }
      });
      await Promise.all(workers);

      return orders.map((o) => {
        const pid = String(o?.product?.productId || o?.productId || o?.product?.id || '').trim();
        const existing = String(o?.product?.brand || o?.variant?.product?.brand || '').trim();
        const brand = existing || (pid ? cache.get(pid) || '' : '');
        if (!brand) return o;
        return {
          ...o,
          product: {
            ...(o.product || {}),
            productId: o?.product?.productId || pid,
            brand,
          },
        };
      });
    };

    const ordersRaw = Array.isArray(data.orders) ? data.orders : [];
    const ordersWithBrands = await enrichBrands(ordersRaw, accessToken);

    // Transform StockX API response to our format
    const transformedOrders =
      ordersWithBrands?.map((order: any) => {
        const payoutObj = order?.payout;
        const salePrice = parseMoney(payoutObj?.salePrice ?? order?.amount);
        const payout =
          payoutObj && payoutObj.totalPayout !== null && payoutObj.totalPayout !== undefined
            ? parseMoney(payoutObj.totalPayout)
            : 0;
        const fees =
          payoutObj && payoutObj.totalPayout !== null && payoutObj.totalPayout !== undefined
            ? Math.max(0, Math.round((salePrice - payout) * 100) / 100)
            : 0;
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
          imageUrl: order.variant?.product?.media?.imageUrl,
        };
      }) || [];

    const successResponse = NextResponse.json({
      orders: transformedOrders,
      total: transformedOrders.length,
      source: 'stockx',
      count: data.count,
      pageNumber: data.pageNumber,
      pageSize: data.pageSize,
      hasNextPage: data.hasNextPage
    });

    // If we refreshed the token, set the new cookies
    if (accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken!);
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