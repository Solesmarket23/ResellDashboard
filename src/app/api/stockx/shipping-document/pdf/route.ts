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
 * GET /api/stockx/shipping-document/pdf?orderNumber=06-XXXXX&shippingId=S-123
 *
 * Downloads a single shipping document (label) as PDF for a StockX order.
 * shippingId comes from the list endpoint (e.g. requiredDocuments or thermalLabelOnly).
 *
 * Auth: StockX cookies (web) or Bearer token (native app).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('orderNumber')?.trim();
    const shippingId = searchParams.get('shippingId')?.trim();

    if (!orderNumber || !shippingId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing orderNumber or shippingId',
          usage: 'GET /api/stockx/shipping-document/pdf?orderNumber=06-XXXXX&shippingId=S-123',
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
    const url = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}/shipping-document/${encodeURIComponent(shippingId)}`;

    const doFetch = async (token: string) =>
      fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': apiKey,
          Accept: 'application/pdf',
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
        : 'StockX shipping-document PDF error';
      return NextResponse.json(
        {
          success: false,
          error: userMessage,
          orderNumber,
          shippingId,
          statusCode: res.status,
          details: text,
        },
        { status: res.status }
      );
    }

    const blob = await res.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="stockx-shipping-${orderNumber}-${shippingId}.pdf"`,
        'Cache-Control': 'private, no-cache',
      },
    });

    if (usedCookieAuth && accessToken && accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(response, accessToken, refreshToken);
    }

    return response;
  } catch (e) {
    console.error('[stockx/shipping-document/pdf]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
