import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isPerimeterXBlock(body: string): boolean {
  const b = String(body || '').toLowerCase();
  return (
    b.includes('px-cloud.net') ||
    b.includes('"appid":"px') ||
    b.includes('"blockscript"') ||
    b.includes('/captcha/captcha.js') ||
    b.includes('perimeterx')
  );
}

function normalizeSize(size: unknown): string {
  return String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function parseMoney(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function computeFees(salePrice: number, totalPayout: number): number {
  const fee = salePrice - totalPayout;
  return Number.isFinite(fee) ? Math.max(0, fee) : 0;
}

async function fetchOrdersOnce(opts: {
  url: string;
  apiKey: string;
  accessToken: string;
}): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(opts.url, {
    headers: {
      'x-api-key': opts.apiKey,
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'ResellDashboard/1.0'
    },
    cache: 'no-store'
  });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, text };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = (body?.userId ? String(body.userId) : '').trim();
    const pageNumber = Math.max(1, Math.min(50, Number(body?.pageNumber || 1)));
    const pageSize = Math.max(1, Math.min(100, Number(body?.pageSize || 25)));
    const orderStatus = (body?.orderStatus ? String(body.orderStatus) : 'COMPLETED').trim().toUpperCase();

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const apiKey = process.env.STOCKX_CLIENT_ID;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Missing STOCKX_CLIENT_ID' }, { status: 500 });
    }

    // Prefer cookies (browser)
    let accessToken = request.cookies.get('stockx_access_token')?.value || '';
    let refreshToken = request.cookies.get('stockx_refresh_token')?.value || '';

    // Fallback: Firebase stored tokens (best effort)
    if ((!accessToken || !refreshToken) && userId) {
      try {
        const db = getAdminDb();
        const userDoc = await db.collection('users').doc(String(userId)).get();
        const userData = userDoc.data() as any;
        accessToken = accessToken || userData?.stockxTokens?.access_token || '';
        refreshToken = refreshToken || userData?.stockxTokens?.refresh_token || '';
      } catch {
        // ignore
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Missing StockX access token. Please connect StockX first.' },
        { status: 401 }
      );
    }

    const qp = new URLSearchParams({
      pageNumber: String(pageNumber),
      pageSize: String(pageSize),
      orderStatus
    });

    const apiUrl = `https://api.stockx.com/v2/selling/orders/history?${qp.toString()}`;
    const gatewayUrl = `https://gateway.stockx.com/v2/selling/orders/history?${qp.toString()}`;

    // Prefer api.stockx.com first.
    let urlToUse = apiUrl;
    let attempt = await fetchOrdersOnce({ url: urlToUse, apiKey, accessToken });

    // If api 401s, try gateway (audience mismatch).
    if (attempt.status === 401) {
      urlToUse = gatewayUrl;
      attempt = await fetchOrdersOnce({ url: urlToUse, apiKey, accessToken });
    }

    // If still 401 and we have refresh token, refresh once and retry current host.
    if (attempt.status === 401 && refreshToken) {
      const refreshed = await refreshStockXTokens(refreshToken);
      if (refreshed.success && refreshed.accessToken) {
        accessToken = refreshed.accessToken;
        const retry = await fetchOrdersOnce({ url: urlToUse, apiKey, accessToken });
        attempt = retry;
      }
    }

    if (!attempt.ok) {
      const blocked = attempt.status === 403 && isPerimeterXBlock(attempt.text);
      return NextResponse.json(
        {
          success: false,
          error: 'StockX request failed',
          status: attempt.status,
          blocked: blocked || undefined,
          message: blocked
            ? 'StockX bot protection (CAPTCHA) was triggered. Wait a few minutes, then retry.'
            : `StockX responded ${attempt.status}.`,
          bodySnippet: String(attempt.text || '').slice(0, 600),
          url: urlToUse
        },
        { status: attempt.status }
      );
    }

    let data: any = null;
    try {
      data = JSON.parse(attempt.text || '{}');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to parse StockX JSON', bodySnippet: String(attempt.text || '').slice(0, 600) },
        { status: 502 }
      );
    }

    const orders: any[] = Array.isArray(data?.orders) ? data.orders : [];
    const db = getAdminDb();

    let saved = 0;
    let updated = 0;
    const writtenIds: string[] = [];

    for (const order of orders) {
      const orderNumber = order?.orderNumber ? String(order.orderNumber) : '';
      if (!orderNumber) continue;

      const productName = order?.product?.productName || order?.productName || order?.product?.name || null;
      const brand = order?.product?.brand || order?.brand || order?.brandName || null;
      const styleId = order?.product?.sku || order?.sku || order?.styleId || order?.product?.styleId || null;
      const size = normalizeSize(order?.variant?.variantValue || order?.variant?.size || order?.size);
      const salePrice = parseMoney(order?.amount || order?.salePrice || order?.price);
      const totalPayout = parseMoney(order?.payout?.totalPayout || order?.payoutDetails?.totalPayout || order?.totalPayout);
      const fees = computeFees(salePrice, totalPayout);
      const payout = totalPayout || null;
      const listingId = order?.listingId || order?.askId || null;
      const date = order?.createdAt || order?.updatedAt || null;

      const saleDoc: any = {
        userId,
        orderNumber,
        product: productName,
        brand,
        size,
        styleId,
        salePrice,
        fees,
        payout,
        date,
        listingId,
        status: order?.status || orderStatus,
        type: 'imported',
        updatedAt: new Date().toISOString()
      };

      // Upsert by (userId, orderNumber)
      const existingSnap = await db
        .collection('user_sales')
        .where('userId', '==', userId)
        .where('orderNumber', '==', orderNumber)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const docId = existingSnap.docs[0].id;
        await db.collection('user_sales').doc(docId).set(saleDoc, { merge: true });
        updated++;
        writtenIds.push(docId);
      } else {
        const ref = await db.collection('user_sales').add({
          ...saleDoc,
          createdAt: new Date().toISOString()
        });
        saved++;
        writtenIds.push(ref.id);
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      fetched: orders.length,
      saved,
      updated,
      writtenIds,
      sourceUrl: urlToUse
    });
  } catch (e: any) {
    console.error('❌ import-once error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}


