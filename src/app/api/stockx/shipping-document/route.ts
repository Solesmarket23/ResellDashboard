import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getBearerToken(request: NextRequest): string | null {
  const raw = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = (m?.[1] || '').trim();
  return t ? t : null;
}

/**
 * GET /api/stockx/shipping-document?orderNumber=06-XXXXX
 *
 * Returns shipping documents for a StockX order (Direct orders only).
 * Response: GetShipmentDetailsResponse – shippingDocuments with requiredDocuments,
 * thermalLabelOnly, sellerShippingInstructions (normalLabel, thermalLabel by language), etc.
 * Use the document IDs/URLs with the pdf endpoint to download the actual label PDFs.
 *
 * Auth: StockX cookies (web) or Bearer token (native app).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('orderNumber')?.trim();

    if (!orderNumber) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing orderNumber',
          usage: 'GET /api/stockx/shipping-document?orderNumber=06-XXXXX',
        },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    let usedCookieAuth = false;

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
      usedCookieAuth = true;
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No StockX access token. Authenticate with StockX first.' },
        { status: 401 }
      );
    }

    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
    const url = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}/shipping-document`;

    const doFetch = async (token: string) =>
      fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'ResellDashboard/1.0',
        },
      });

    let res = await doFetch(accessToken);

    if (res.status === 401 && refreshToken) {
      const refreshed = await refreshStockXTokens(refreshToken);
      if (refreshed.success && refreshed.accessToken) {
        accessToken = refreshed.accessToken;
        res = await doFetch(accessToken);
      }
    }

    if (!res.ok) {
      const text = await res.text();
      const is404 = res.status === 404;
      const userMessage = is404
        ? 'No shipping label available for this order. Shipping labels are only available for Standard/Direct orders.'
        : 'StockX shipping-document API error';
      return NextResponse.json(
        {
          success: false,
          error: userMessage,
          orderNumber,
          statusCode: res.status,
          details: text,
          note: is404 ? undefined : 'This endpoint only supports Direct order types.',
        },
        { status: res.status }
      );
    }

    const data = (await res.json()) as Record<string, unknown>;
    const json = NextResponse.json({ success: true, orderNumber, ...data });
    if (usedCookieAuth && accessToken && accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(json, accessToken, refreshToken);
    }
    return json;
  } catch (e) {
    console.error('[stockx/shipping-document]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
