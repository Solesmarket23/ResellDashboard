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

function extractShippingIdFromListData(data: Record<string, unknown>): boolean {
  const ids = collectAllShippingIds(data);
  return ids.length > 0;
}

const extractIdFromUrl = (url: string) => {
  const m = url.match(/\/shipping-document\/([^/?#]+)$/);
  return m?.[1] ?? null;
};
const extractFromDocValue = (v: unknown): string | null => {
  if (typeof v === 'string' && v.length > 0) return v;
  if (v && typeof v === 'object' && (v as Record<string, unknown>)?.url)
    return extractIdFromUrl((v as Record<string, unknown>).url as string);
  return null;
};

/** Collect all shipping document IDs (label + insert) from list response. */
function collectAllShippingIds(data: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const add = (id: string | null) => {
    if (id && !seen.has(id)) seen.add(id);
  };
  if (typeof data?.shippingId === 'string') add(data.shippingId as string);
  const docs = (data?.shippingDocuments ?? data?.documents) as Record<string, unknown> | undefined;
  if (docs) {
    const thermal = docs.thermalLabelOnly;
    if (typeof thermal === 'string') add(thermal);
    else if (thermal && typeof thermal === 'object' && thermal !== null)
      add(extractFromDocValue(thermal));
    const required = docs.requiredDocuments as Record<string, unknown> | undefined;
    if (required && typeof required === 'object') {
      for (const v of Object.values(required)) add(extractFromDocValue(v));
    }
    const instructions = docs.sellerShippingInstructions as Record<string, unknown> | undefined;
    if (instructions && typeof instructions === 'object') {
      for (const key of ['thermalLabel', 'normalLabel'] as const) {
        const byLang = instructions[key] as Record<string, unknown> | undefined;
        if (byLang && typeof byLang === 'object')
          for (const v of Object.values(byLang)) add(extractFromDocValue(v));
      }
    }
  }
  return [...seen];
}

/** Split document IDs into thermal vs normal/ink (for app toggle). When type unknown, include in both. */
function collectThermalAndNormalIds(data: Record<string, unknown>): { thermal: string[]; normal: string[] } {
  const thermal = new Set<string>();
  const normal = new Set<string>();
  const docs = (data?.shippingDocuments ?? data?.documents) as Record<string, unknown> | undefined;
  if (docs?.sellerShippingInstructions && typeof docs.sellerShippingInstructions === 'object') {
    const instructions = docs.sellerShippingInstructions as Record<string, unknown>;
    const thermalByLang = instructions.thermalLabel as Record<string, unknown> | undefined;
    if (thermalByLang && typeof thermalByLang === 'object')
      for (const v of Object.values(thermalByLang)) {
        const id = extractFromDocValue(v);
        if (id) thermal.add(id);
      }
    const normalByLang = instructions.normalLabel as Record<string, unknown> | undefined;
    if (normalByLang && typeof normalByLang === 'object')
      for (const v of Object.values(normalByLang)) {
        const id = extractFromDocValue(v);
        if (id) normal.add(id);
      }
  }
  const otherIds = new Set<string>();
  if (typeof data?.shippingId === 'string') otherIds.add(data.shippingId as string);
  if (docs) {
    const t = docs.thermalLabelOnly;
    if (typeof t === 'string') otherIds.add(t);
    else if (t && typeof t === 'object') { const id = extractFromDocValue(t); if (id) otherIds.add(id); }
    const required = docs.requiredDocuments as Record<string, unknown> | undefined;
    if (required && typeof required === 'object')
      for (const v of Object.values(required)) { const id = extractFromDocValue(v); if (id) otherIds.add(id); }
  }
  otherIds.forEach((id) => {
    thermal.add(id);
    normal.add(id);
  });
  return { thermal: [...thermal], normal: [...normal] };
}

function getShippingIdFromOrderDetails(orderData: Record<string, unknown>): string | null {
  const shipment = orderData?.shipment as Record<string, unknown> | undefined;
  let url = (shipment?.shippingDocumentUrl ?? shipment?.shippingDocumentURL) as string | undefined;
  if (!url || typeof url !== 'string') {
    url = (orderData?.shippingDocumentUrl ?? orderData?.shippingDocumentURL) as string | undefined;
  }
  if (url && typeof url === 'string') {
    const match = url.match(/\/shipping-document\/([^/?#]+)$/);
    if (match?.[1]) return match[1];
  }
  return null;
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

    const log = (msg: string, data?: Record<string, unknown>) => {
      console.log('[stockx/shipping-document]', msg, data ?? '');
    };

    log('request', { orderNumber });

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

    log('StockX list response', { status: res.status });

    if (!res.ok) {
      const text = await res.text();
      const is404 = res.status === 404;

      log('list failed, trying order-details fallback', { listStatus: res.status });

      // Try fallback whenever list fails: order details often have shipment.shippingDocumentUrl
      // (list endpoint only supports Direct; returns 404/400 for other order types)
      const orderDetailsUrl = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`;
      const orderRes = await fetch(orderDetailsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'ResellDashboard/1.0',
        },
      });
      log('order-details response', { status: orderRes.status });
      if (orderRes.ok) {
        const orderData = (await orderRes.json()) as Record<string, unknown>;
        const fallbackId = getShippingIdFromOrderDetails(orderData);
        if (fallbackId) {
          log('returning 200 from order-details fallback (list failed)', { shippingId: fallbackId });
          const json = NextResponse.json({
            success: true,
            orderNumber,
            shippingId: fallbackId,
            shippingDocumentIds: [fallbackId],
            thermalDocumentIds: [fallbackId],
            normalDocumentIds: [fallbackId],
            shippingDocuments: { requiredDocuments: { label: fallbackId } },
            _fromOrderDetails: true,
          });
          if (usedCookieAuth && accessToken && accessToken !== cookieStore.get('stockx_access_token')?.value) {
            setStockXTokenCookies(json, accessToken, refreshToken);
          }
          return json;
        }
        log('order-details ok but no shippingDocumentUrl/shippingId found');
      } else {
        log('order-details failed', { status: orderRes.status });
      }

      let userMessage: string;
      if (is404) {
        userMessage =
          'No shipping label available for this order. Shipping labels are only available for Standard/Direct orders.';
      } else {
        // Surface status and optional StockX message so the user knows why it failed
        let detail = '';
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const msg =
            (parsed?.message as string) ||
            (parsed?.error as string) ||
            (parsed?.errorMessage as string) ||
            (Array.isArray(parsed?.errors) && (parsed.errors[0] as { message?: string })?.message);
          if (msg && typeof msg === 'string' && msg.length < 200) detail = `: ${msg}`;
        } catch {
          if (text && text.length < 120 && !text.startsWith('<')) detail = `: ${text}`;
        }
        const statusLabel =
          res.status === 401
            ? 'StockX sign-in expired or not connected'
            : res.status === 403
              ? 'Not allowed for this order'
              : res.status === 400
                ? 'Invalid order number or request'
                : `StockX API error (${res.status})`;
        userMessage = `${statusLabel}${detail}. Shipping labels are for Standard/Direct orders only.`;
      }
      return NextResponse.json(
        {
          success: false,
          error: userMessage,
          orderNumber,
          statusCode: res.status,
          details: text,
          note: is404 ? undefined : 'Connect StockX on the web (same account) if you see sign-in/not connected.',
        },
        { status: res.status }
      );
    }

    const data = (await res.json()) as Record<string, unknown>;
    const hasUsableId =
      (typeof data?.shippingId === 'string' && (data.shippingId as string).length > 0) ||
      extractShippingIdFromListData(data);
    log('list 200 parsed', { hasUsableId, hasShippingId: typeof data?.shippingId === 'string', hasShippingDocuments: !!data?.shippingDocuments });
    if (!hasUsableId) {
      log('list 200 but no usable ID, trying order-details fallback');
      // List returned 200 but no document ID; try order details
      const orderDetailsUrl = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`;
      const orderRes = await fetch(orderDetailsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'ResellDashboard/1.0',
        },
      });
      log('order-details response (list had no ID)', { status: orderRes.status });
      if (orderRes.ok) {
        const orderData = (await orderRes.json()) as Record<string, unknown>;
        const fallbackId = getShippingIdFromOrderDetails(orderData);
        if (fallbackId) {
          log('returning 200 from order-details fallback (list had no ID)', { shippingId: fallbackId });
          const json = NextResponse.json({
            success: true,
            orderNumber,
            shippingId: fallbackId,
            shippingDocumentIds: [fallbackId],
            thermalDocumentIds: [fallbackId],
            normalDocumentIds: [fallbackId],
            shippingDocuments: { requiredDocuments: { label: fallbackId } },
            _fromOrderDetails: true,
          });
          if (usedCookieAuth && accessToken && accessToken !== cookieStore.get('stockx_access_token')?.value) {
            setStockXTokenCookies(json, accessToken, refreshToken);
          }
          return json;
        }
        log('order-details ok but no shippingDocumentUrl/shippingId found');
      }
    }
    const allIds = collectAllShippingIds(data);
    const { thermal: thermalIds, normal: normalIds } = collectThermalAndNormalIds(data);
    log('returning 200 from list response', { shippingDocumentIds: allIds, thermalDocumentIds: thermalIds, normalDocumentIds: normalIds });
    const json = NextResponse.json({
      success: true,
      orderNumber,
      shippingDocumentIds: allIds,
      thermalDocumentIds: thermalIds,
      normalDocumentIds: normalIds,
      shippingId: allIds[0] ?? data?.shippingId,
      ...data,
    });
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
