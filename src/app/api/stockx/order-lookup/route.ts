import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

/**
 * GET /api/stockx/order-lookup?orderNumber=06-XXXXX
 *
 * Look up a StockX order by order number and return a clean JSON with:
 * - paidOut: whether the order has been paid out
 * - payout: net payout amount (if available)
 * - payoutDate: when payout was/will be
 * - shippingUrl: tracking URL (e.g. FedEx) when tracking number is present
 * - trackingNumber, status, productName, salePrice, fees, etc.
 *
 * Requires StockX auth (cookies). Add ?raw=1 to include full StockX response.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('orderNumber')?.trim();
    const includeRaw = searchParams.get('raw') === '1' || searchParams.get('raw') === 'true';

    if (!orderNumber) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing orderNumber',
          usage: 'GET /api/stockx/order-lookup?orderNumber=06-XXXXX',
        },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing StockX API key (STOCKX_API_KEY or STOCKX_CLIENT_ID)' },
        { status: 500 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No access token found',
          authRequired: true,
          message: 'Please authenticate with StockX first (e.g. visit /api/stockx/auth)',
        },
        { status: 401 }
      );
    }

    const apiUrl = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`;

    const doFetch = async (token: string) => {
      return await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'FlipFlow/1.0',
        },
      });
    };

    let response = await doFetch(accessToken);

    if (response.status === 401 && refreshToken) {
      const refreshResult = await refreshStockXTokens(refreshToken);
      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken;
        response = await doFetch(accessToken);
      } else {
        return NextResponse.json(
          {
            success: false,
            error: 'Authentication expired',
            authRequired: true,
            message: 'Please re-authenticate with StockX',
          },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: 'StockX API error',
          orderNumber,
          statusCode: response.status,
          details: errorText,
          authRequired: response.status === 401,
        },
        { status: response.status }
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Shape a friendly response: payout, shippingUrl, paidOut
    const status = String(data?.status ?? '').trim().toUpperCase();
    const paidOut =
      status === 'COMPLETED' ||
      status === 'PAYOUTCOMPLETED' ||
      status === 'PAYOUT_COMPLETED';

    const payoutObj = (data?.payout || data?.payoutDetails) as Record<string, unknown> | undefined;
    const salePrice = parseMoney(payoutObj?.salePrice ?? data?.amount);
    const totalPayout = parseMoney(
      payoutObj?.totalPayout ?? payoutObj?.payout ?? (payoutObj as any)?.amount
    );
    const fees =
      salePrice != null && totalPayout != null
        ? Math.max(0, Math.round((salePrice - totalPayout) * 100) / 100)
        : null;

    const trackingNumber =
      (data?.shipment as any)?.trackingNumber ??
      (data?.shipping as any)?.trackingNumber ??
      (data as any)?.trackingNumber ??
      null;
    const carrierCode = (data?.shipment as any)?.carrierCode ?? (data?.shipping as any)?.carrierCode ?? null;
    const shippingUrl = buildTrackingUrl(trackingNumber, carrierCode);

    const productName =
      (data?.product as any)?.productName ??
      (data?.product as any)?.name ??
      (data as any)?.productName ??
      null;

    const payoutDate = (data as any)?.payoutDate ?? payoutObj?.date ?? null;

    const result: Record<string, unknown> = {
      success: true,
      orderNumber: data?.orderNumber ?? data?.id ?? orderNumber,
      status: status || null,
      paidOut,
      payout: totalPayout,
      payoutDate: payoutDate ?? undefined,
      salePrice: salePrice ?? undefined,
      fees: fees ?? undefined,
      currency: (data as any)?.currency ?? payoutObj?.currency ?? 'USD',
      productName: productName ?? undefined,
      trackingNumber: trackingNumber ?? undefined,
      shippingUrl: shippingUrl ?? undefined,
    };

    if (includeRaw) {
      result.raw = data;
    }

    const successResponse = NextResponse.json(result);

    if (accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken ?? '');
    }

    return successResponse;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch order details',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dollars = Math.abs(value) > 5000 ? value / 100 : value;
    return Math.round(dollars * 100) / 100;
  }
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

function buildTrackingUrl(trackingNumber: string | null, carrierCode?: string | null): string | null {
  if (!trackingNumber || typeof trackingNumber !== 'string') return null;
  const tn = trackingNumber.trim();
  if (!tn) return null;

  // FedEx: 12–22 digits, or 15 digits, or 1Z...
  if (/^1Z[0-9A-Z]{16}$/i.test(tn) || /^\d{12,22}$/.test(tn)) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`;
  }
  // UPS: 1Z...
  if (/^1Z[0-9A-Z]{16}$/i.test(tn)) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}`;
  }
  // USPS: 20–22 digits
  if (/^\d{20,22}$/.test(tn)) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}`;
  }

  // Default to FedEx for unknown format (StockX often uses FedEx)
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`;
}
