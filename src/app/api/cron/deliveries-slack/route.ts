import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { SlackNotificationService } from '@/lib/notifications/slackService';
import { trackingService } from '@/lib/tracking/trackingService';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

function localParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const yyyy = get('year');
  const mm = get('month');
  const dd = get('day');
  const hh = get('hour');
  const min = get('minute');
  return { localDate: `${yyyy}-${mm}-${dd}`, hh, min };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function fetchStockXMarketPriceWithToken(args: {
  accessToken: string;
  apiKey: string;
  productName: string;
  size: string;
  styleId?: string | null;
}): Promise<number | null> {
  const { accessToken, apiKey, productName, size, styleId } = args;
  try {
    const searchTerm = styleId || productName;
    const searchQuery = encodeURIComponent(searchTerm);
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${searchQuery}&pageSize=5`;
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        Accept: 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json().catch(() => ({}));
    const products = (searchData.results || searchData.Products || []) as any[];
    if (!Array.isArray(products) || products.length === 0) return null;
    const product = products[0];
    const productId = product.id || product.uuid || product.productId;
    if (!productId) return null;

    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    const marketResponse = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        Accept: 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });
    if (!marketResponse.ok) return null;
    const marketData = await marketResponse.json().catch(() => null);
    const variants = Array.isArray(marketData) ? marketData : [];
    if (!Array.isArray(variants) || variants.length === 0) return null;

    let target = null as any;
    if (size && size !== 'Unknown') {
      target = variants.find((v: any) => {
        const variantSize = v.variantValue || v.size || v.sizeValue || v.shoeSize || v.displaySize;
        return variantSize === size || variantSize === `US M ${size}` || variantSize === `US W ${size}`;
      });
    }
    if (!target) {
      target =
        variants.find((v: any) => (parseInt(v.lowestAskAmount) > 0) || (parseInt(v.flexLowestAskAmount) > 0)) ||
        variants[0];
    }
    if (!target) return null;
    const standardAsk = parseInt(target.lowestAskAmount) || 0;
    const flexAsk = parseInt(target.flexLowestAskAmount) || 0;
    const cents = standardAsk > 0 && flexAsk > 0 ? Math.min(standardAsk, flexAsk) : standardAsk > 0 ? standardAsk : flexAsk;
    if (!cents) return null;
    return cents / 100;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyCron(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const db = getAdminDb();
    const usersSnap = await db.collection('users').where('deliveriesSlack.enabled', '==', true).get();
    if (usersSnap.empty) {
      return NextResponse.json({ success: true, message: 'No users with deliveriesSlack enabled' });
    }

    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
    if (!apiKey) return NextResponse.json({ success: false, error: 'Missing STOCKX_API_KEY' }, { status: 500 });

    const now = new Date();
    let sent = 0;
    let skipped = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const doc of usersSnap.docs) {
      const userId = doc.id;
      const data = doc.data() as any;
      const s = data?.deliveriesSlack || {};
      const webhookUrl = String(s.webhookUrl || '').trim();
      const timeLocal = String(s.timeLocal || '21:00');
      const timezone = String(s.timezone || 'America/New_York');

      if (!webhookUrl) {
        skipped++;
        continue;
      }

      let parts: { localDate: string; hh: string; min: string };
      try {
        parts = localParts(now, timezone);
      } catch {
        errors.push({ userId, error: 'Invalid timezone' });
        continue;
      }

      const [schedH, schedM] = timeLocal.split(':');
      const isDue = parts.hh > schedH || (parts.hh === schedH && parts.min >= schedM);
      if (!isDue) {
        skipped++;
        continue;
      }

      // Idempotency lock per user+localDate
      const lockId = `${userId}__${parts.localDate}`;
      const lockRef = db.collection('deliveriesSlackDailyLocks').doc(lockId);
      const acquired = await db.runTransaction(async (tx) => {
        const snap = await tx.get(lockRef);
        if (snap.exists) return false;
        tx.set(lockRef, {
          userId,
          localDate: parts.localDate,
          timezone,
          timeLocal,
          createdAt: new Date().toISOString(),
        });
        return true;
      });
      if (!acquired) {
        skipped++;
        continue;
      }

      try {
        // Need StockX tokens for market pricing in cron mode
        const tokens = data?.stockxTokens || null;
        const refreshToken = tokens?.refresh_token || tokens?.refreshToken || null;
        if (!refreshToken) throw new Error('Missing StockX refresh token (run /api/stockx/sync-tokens)');

        const refreshResult = await refreshStockXTokens(refreshToken);
        if (!refreshResult.success || !refreshResult.accessToken) {
          throw new Error(`StockX token refresh failed: ${refreshResult.error || 'unknown'}`);
        }
        const accessToken = refreshResult.accessToken;

        // Pull purchases with tracking for this user
        const [p1, p2] = await Promise.all([
          db.collection('purchases').where('userId', '==', userId).get(),
          db.collection('purchases').where('uid', '==', userId).get(),
        ]);
        const purchases = [...p1.docs, ...p2.docs]
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p, idx, arr) => idx === arr.findIndex((x) => x.id === p.id));

        const purchasesWithTracking = purchases.filter((purchase: any) => {
          const trackingValue =
            purchase.tracking || purchase.trackingNumber || purchase.tracking_number || purchase.shipment?.tracking || purchase.shipment?.trackingNumber;
          return trackingValue && String(trackingValue).trim() !== '' && trackingValue !== 'TBD';
        });

        if (purchasesWithTracking.length === 0) {
          // still count as sent (we don't want it spamming every run)
          await db.collection('users').doc(userId).set({ deliveriesSlack: { lastSentLocalDate: parts.localDate } }, { merge: true });
          sent++;
          continue;
        }

        const trackingNumbers = purchasesWithTracking.map((p: any) => p.tracking || p.trackingNumber || p.tracking_number || p.shipment?.tracking || p.shipment?.trackingNumber);
        const liveTrackingData = await trackingService.getBulkTrackingInfo(trackingNumbers);

        const deliveries = await Promise.all(
          purchasesWithTracking.map(async (purchase: any) => {
            const trackingValue = purchase.tracking || purchase.trackingNumber || purchase.tracking_number || purchase.shipment?.tracking || purchase.shipment?.trackingNumber;
            const liveTracking = liveTrackingData.find((lt: any) => lt.trackingNumber === trackingValue);

            let status = String(purchase.status || '').toLowerCase() || 'shipped';
            if (liveTracking && !liveTracking.error) status = liveTracking.status;

            let estimatedDelivery = 'TBD';
            if (liveTracking && liveTracking.estimatedDelivery) estimatedDelivery = liveTracking.estimatedDelivery;
            else if (purchase.estimatedDelivery) estimatedDelivery = purchase.estimatedDelivery;
            if (estimatedDelivery && estimatedDelivery !== 'TBD') {
              const dt = new Date(estimatedDelivery);
              if (!Number.isNaN(dt.getTime())) estimatedDelivery = dt.toISOString().split('T')[0];
              else estimatedDelivery = 'TBD';
            }

            const productName = purchase.productName || purchase.product?.name || 'Unknown Product';
            const productSize = purchase.productSize || purchase.size || purchase.product?.size || 'Unknown';
            const styleId = purchase.styleId || purchase.style_id || null;

            let purchasePrice: number | undefined;
            if (purchase.total_amount !== undefined) purchasePrice = typeof purchase.total_amount === 'number' ? purchase.total_amount : parseFloat(purchase.total_amount);
            else if (purchase.totalAmount !== undefined) purchasePrice = typeof purchase.totalAmount === 'number' ? purchase.totalAmount : parseFloat(purchase.totalAmount);
            else if (purchase.totalPayment !== undefined) purchasePrice = typeof purchase.totalPayment === 'number' ? purchase.totalPayment : parseFloat(purchase.totalPayment);
            else if (purchase.purchasePrice !== undefined) purchasePrice = typeof purchase.purchasePrice === 'number' ? purchase.purchasePrice : parseFloat(purchase.purchasePrice);
            else if (purchase.price) {
              // Try to parse price string like "$180.00" or "180.00 + $0.00"
              const priceStr = String(purchase.price).replace(/[$,]/g, '').split('+')[0].trim();
              const n = parseFloat(priceStr);
              if (Number.isFinite(n)) purchasePrice = n;
            }
            if (purchasePrice !== undefined && (!Number.isFinite(purchasePrice) || purchasePrice <= 0)) purchasePrice = undefined;

            let marketPrice: number | undefined;
            const cached = purchase.lowestAsk || purchase.marketPrice;
            if (cached) {
              const n = typeof cached === 'number' ? cached : parseFloat(cached);
              if (Number.isFinite(n) && n > 0) marketPrice = n;
            }
            if (!marketPrice) {
              const realtime = await fetchStockXMarketPriceWithToken({ accessToken, apiKey, productName, size: productSize, styleId });
              if (realtime) marketPrice = realtime;
            }
            if (marketPrice !== undefined && (!Number.isFinite(marketPrice) || marketPrice <= 0)) {
              marketPrice = undefined;
            }

            let estimatedProfit: number | undefined;
            if (
              purchasePrice !== undefined &&
              marketPrice !== undefined &&
              Number.isFinite(purchasePrice) &&
              Number.isFinite(marketPrice)
            ) {
              estimatedProfit = marketPrice - purchasePrice - 1;
            }

            return {
              productName,
              productBrand: purchase.productBrand || purchase.brand || 'Unknown',
              productSize,
              trackingNumber: String(trackingValue),
              carrier: (liveTracking?.carrier || purchase.carrier || 'Unknown') as string,
              estimatedDelivery,
              status,
              purchasePrice,
              marketPrice,
              estimatedProfit
            };
          })
        );

        const localToday = parts.localDate;
        const localTomorrow = localParts(addDays(now, 1), timezone).localDate;
        const arrivingToday = deliveries.filter((d) => d.estimatedDelivery === localToday || d.status === 'out_for_delivery').length;
        const arrivingTomorrow = deliveries.filter((d) => d.estimatedDelivery === localTomorrow).length;
        const sumFiniteOrNull = (values: Array<number | undefined>): number | null => {
          const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
          if (finite.length === 0) return null;
          return finite.reduce((sum, v) => sum + v, 0);
        };

        const todayItems = deliveries.filter((d) => d.estimatedDelivery === localToday || d.status === 'out_for_delivery');
        const tomorrowItems = deliveries.filter((d) => d.estimatedDelivery === localTomorrow);
        const projectedProfitToday = sumFiniteOrNull(todayItems.map((d) => d.estimatedProfit));
        const projectedProfitTomorrow = sumFiniteOrNull(tomorrowItems.map((d) => d.estimatedProfit));
        const onTheWay = deliveries.filter((d) => ['in_transit', 'shipped', 'out_for_delivery'].includes(d.status));
        const projectedProfitOnTheWay = sumFiniteOrNull(onTheWay.map((d) => d.estimatedProfit));
        const marketValueOnTheWay = sumFiniteOrNull(onTheWay.map((d) => d.marketPrice));
        const purchaseCostOnTheWay = sumFiniteOrNull(onTheWay.map((d) => d.purchasePrice));

        const slack = new SlackNotificationService({
          webhookUrl,
          username: 'Delivery Tracker',
          iconEmoji: ':package:'
        });
        await slack.sendDeliverySummary({
          totalDeliveries: deliveries.length,
          arrivingToday,
          arrivingTomorrow,
          arrivingThisWeek: 0,
          inTransit: deliveries.filter((d) => ['in_transit', 'shipped', 'out_for_delivery'].includes(d.status)).length,
          ...(projectedProfitToday !== null ? { projectedProfitToday } : {}),
          ...(projectedProfitTomorrow !== null ? { projectedProfitTomorrow } : {}),
          ...(projectedProfitOnTheWay !== null ? { projectedProfitOnTheWay } : {}),
          ...(marketValueOnTheWay !== null ? { marketValueOnTheWay } : {}),
          ...(purchaseCostOnTheWay !== null ? { purchaseCostOnTheWay } : {}),
          deliveries
        });

        await db.collection('users').doc(userId).set({ deliveriesSlack: { lastSentLocalDate: parts.localDate } }, { merge: true });
        sent++;
      } catch (e: any) {
        // Release lock on failure so we can retry next run
        await lockRef.delete().catch(() => null);
        errors.push({ userId, error: e?.message || 'Unknown error' });
      }
    }

    return NextResponse.json({ success: true, sent, skipped, errors });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

