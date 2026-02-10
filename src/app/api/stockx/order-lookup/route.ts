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

/**
 * GET /api/stockx/order-lookup?orderNumber=06-XXXXX
 *
 * Look up a StockX order by order number and return a clean JSON with:
 * - paidOut, payout, payoutDate, shippingUrl, trackingNumber, status, productName, salePrice, fees
 * - styleId, size (for picking: which SKU to fulfill)
 *
 * Auth: StockX cookies (web) or Bearer token (native app). Add ?raw=1 to include full StockX response.
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
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    const bearer = getBearerToken(request);
    if (bearer) {
      const uid = await resolveNativeAuthUserId(request);
      if (!uid) {
        return NextResponse.json({ success: false, error: 'Invalid or missing Bearer token' }, { status: 401 });
      }
      const adminDb = getAdminDb();
      if (!adminDb) {
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
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
    const styleId = (data?.product as any)?.styleId ?? (data as any)?.styleId ?? null;
    const size = (data?.variant as any)?.variantValue ?? (data?.variant as any)?.size ?? (data as any)?.size ?? null;

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
      styleId: styleId ?? undefined,
      size: size ?? undefined,
      trackingNumber: trackingNumber ?? undefined,
      shippingUrl: shippingUrl ?? undefined,
    };

    if (includeRaw) {
      result.raw = data;
    }

    const successResponse = NextResponse.json(result);

    if (!bearer && accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken!, refreshToken ?? '');
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
