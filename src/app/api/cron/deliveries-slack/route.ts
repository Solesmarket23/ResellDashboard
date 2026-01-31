import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { SlackNotificationService } from '@/lib/notifications/slackService';
import { trackingService } from '@/lib/tracking/trackingService';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { fetchStockXMarketPriceDetailed } from '@/lib/stockx/marketPrice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  const host = request.headers.get('host') || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  // Prefer CRON_SECRET when set; otherwise allow Vercel Cron header (prevents random public hits).
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (isLocal) return true;
  return isVercelCron;
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

function normalizeStockXShoeSize(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'Unknown';
  if (s.toLowerCase() === 'unknown') return 'Unknown';
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return m[1];
  return s.replace(/^US\s+[MW]\s+/i, '').trim();
}

function isOnTheWayStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? '').toLowerCase().trim();
  if (!s) return true;
  if (s === 'delivered' || s === 'returned' || s === 'cancelled' || s === 'canceled') return false;
  return true;
}

function extractStockXUrlKeyFromLink(raw: unknown): string | null {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) return null;

  const tryParse = (maybeUrl: string): string | null => {
    try {
      const u = new URL(maybeUrl);
      const redirected =
        u.searchParams.get('r') ||
        u.searchParams.get('redirect') ||
        u.searchParams.get('redirect_url') ||
        u.searchParams.get('url');
      if (redirected && redirected.includes('stockx.com')) {
        const nested = tryParse(redirected);
        if (nested) return nested;
      }

      const host = u.host.toLowerCase();
      if (!host.includes('stockx.com')) return null;

      const path = u.pathname.replace(/^\/+/, '');
      const first = path.split('/')[0]?.trim() || '';
      if (!first) return null;
      if (first === 'search' || first === 'category' || first === 'news' || first === 'help') return null;
      return first;
    } catch {
      return null;
    }
  };

  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(input)) return input;
  }
  return tryParse(input);
}

function extractStockXUrlKeyFromPurchase(purchase: any): string | null {
  const candidates: unknown[] = [
    purchase?.urlKey,
    purchase?.stockxUrlKey,
    purchase?.stockxUrl,
    purchase?.productUrl,
    purchase?.productLink,
    purchase?.url,
    purchase?.product?.urlKey,
    purchase?.product?.stockxUrl,
    purchase?.product?.url,
    purchase?.links?.stockx,
  ];
  for (const c of candidates) {
    const key = extractStockXUrlKeyFromLink(c);
    if (key) return key;
  }
  return null;
}

function extractStockXIdsFromPurchase(purchase: any): { productId?: string; variantId?: string } {
  const pid =
    purchase?.stockxProductId ||
    purchase?.productId ||
    purchase?.product?.productId ||
    purchase?.product?.id ||
    undefined;
  const vid =
    purchase?.stockxVariantId ||
    purchase?.variantId ||
    purchase?.variant?.variantId ||
    purchase?.variant?.id ||
    undefined;

  const productId = typeof pid === 'string' && pid.trim() ? pid.trim() : undefined;
  const variantId = typeof vid === 'string' && vid.trim() ? vid.trim() : undefined;
  return { productId, variantId };
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
    const mode = request.nextUrl.searchParams.get('mode')?.trim() || '';
    const minutelyEnabled = process.env.CRON_MINUTELY_ENABLED === '1' || process.env.CRON_MINUTELY_ENABLED === 'true';
    const minutelyUserId = (process.env.CRON_MINUTELY_USER_ID || '').trim();
    let sent = 0;
    let skipped = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const doc of usersSnap.docs) {
      const userId = doc.id;
      const data = doc.data() as any;
      const s = data?.deliveriesSlack || {};
      const webhookUrl = String(s.webhookUrl || '').trim();
      const timeLocal = String(s.timeLocal || '09:30');
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

      // Optional: minutely test mode (disabled unless explicitly enabled in env).
      // Useful to validate cron wiring without waiting until the scheduled time.
      const isMinutelyTest = mode === 'minutely' && minutelyEnabled && (!!minutelyUserId ? userId === minutelyUserId : true);
      if (!isDue && !isMinutelyTest) {
        skipped++;
        continue;
      }

      // Idempotency lock per user+localDate
      const lockSuffix = isMinutelyTest ? `${parts.localDate}__minutely` : parts.localDate;
      const lockId = `${userId}__${lockSuffix}`;
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

        // Concurrency limiter & short-circuit for StockX 429s (cron can hit a lot of items)
        class Semaphore {
          private available: number;
          private queue: Array<() => void> = [];
          constructor(available: number) {
            this.available = Math.max(1, available);
          }
          async acquire(): Promise<void> {
            if (this.available > 0) {
              this.available--;
              return;
            }
            await new Promise<void>((resolve) => this.queue.push(resolve));
            this.available--;
          }
          release(): void {
            this.available++;
            const next = this.queue.shift();
            if (next) next();
          }
        }
        const stockxSem = new Semaphore(3);
        // We want market prices for anything "on the way" (not only shipped/in_transit/out_for_delivery),
        // because carriers often return UNKNOWN/LABEL_CREATED/etc.
        const marketCache = new Map<string, Promise<any>>();
        let stockxRateLimited = false;

        const fetchMarketWithControls = async (args: {
          productName: string;
          size: string;
          styleId?: string | null;
          urlKey?: string | null;
          productId?: string;
          variantId?: string;
        }) => {
          if (stockxRateLimited) return { price: null, reason: 'rate_limited_short_circuit' };
          const key = `${String(args.productId || '').trim()}|${String(args.variantId || '').trim()}|${String(args.urlKey || '').trim()}|${String(args.styleId || '').trim()}|${args.productName}|${args.size}`.toLowerCase();
          const existing = marketCache.get(key);
          if (existing) return existing;
          const p = (async () => {
            await stockxSem.acquire();
            try {
              const result = await fetchStockXMarketPriceDetailed({
                auth: { apiKey, accessToken, refreshToken },
                productName: args.productName,
                size: args.size,
                styleId: args.styleId,
                urlKey: args.urlKey,
                productId: args.productId,
                variantId: args.variantId,
              });
              if (result.reason === 'search_http_error' && result.httpStatus === 429) stockxRateLimited = true;
              return result;
            } finally {
              stockxSem.release();
            }
          })();
          marketCache.set(key, p);
          return p;
        };

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

        // Only fetch live tracking for purchases that aren't already delivered, and dedupe tracking numbers.
        const purchasesNeedingLiveTracking = purchasesWithTracking.filter((p: any) => {
          const status = String(p?.status || p?.shippingStatus || '').toLowerCase().trim();
          return status !== 'delivered';
        });
        const trackingNumbers = Array.from(
          new Set(
            purchasesNeedingLiveTracking
              .map((p: any) => p.tracking || p.trackingNumber || p.tracking_number || p.shipment?.tracking || p.shipment?.trackingNumber)
              .filter((t: any) => t && String(t).trim() !== '' && t !== 'TBD')
              .map((t: any) => String(t).trim())
          )
        );
        const liveTrackingData = trackingNumbers.length > 0 ? await trackingService.getBulkTrackingInfo(trackingNumbers) : [];
        const liveTrackingByNumber = new Map<string, any>(
          (liveTrackingData || []).map((lt: any) => [String(lt?.trackingNumber || '').trim(), lt])
        );

        const deliveries = await Promise.all(
          purchasesWithTracking.map(async (purchase: any) => {
            const trackingValue = purchase.tracking || purchase.trackingNumber || purchase.tracking_number || purchase.shipment?.tracking || purchase.shipment?.trackingNumber;
            const liveTracking = liveTrackingByNumber.get(String(trackingValue || '').trim());

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
            const productSizeRaw = purchase.productSize || purchase.size || purchase.product?.size || 'Unknown';
            const productSize = normalizeStockXShoeSize(productSizeRaw);
            const styleId = purchase.styleId || purchase.style_id || null;
            const urlKey = extractStockXUrlKeyFromPurchase(purchase);
            const ids = extractStockXIdsFromPurchase(purchase);

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
            if (!marketPrice && isOnTheWayStatus(status)) {
              const result = await fetchMarketWithControls({
                productName,
                size: productSize,
                styleId,
                urlKey,
                productId: ids.productId,
                variantId: ids.variantId,
              });
              if (result.price) {
                marketPrice = result.price;
                // Backfill for future runs (best-effort)
                const docId = typeof purchase?.id === 'string' ? purchase.id.trim() : '';
                if (docId) {
                  try {
                    await db
                      .collection('purchases')
                      .doc(docId)
                      .set(
                        {
                          stockxProductId: result.productId || ids.productId || null,
                          stockxVariantId: result.variantId || ids.variantId || null,
                          stockxUrlKey: result.urlKey || urlKey || null,
                          marketPrice: result.price,
                          marketPriceUpdatedAt: new Date().toISOString(),
                        },
                        { merge: true }
                      );
                  } catch {
                    // non-fatal
                  }
                }
              }
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
              estimatedProfit = marketPrice - purchasePrice;
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

        const marketPriceNote =
          purchaseCostOnTheWay !== null && marketValueOnTheWay === null && projectedProfitOnTheWay === null
            ? `Market prices unavailable: StockX market prices could not be fetched (check StockX tokens/API access).`
            : null;

        const slack = new SlackNotificationService({
          webhookUrl,
          username: 'Delivery Tracker',
          iconEmoji: ':package:',
          timezone
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
          ...(marketPriceNote ? { marketPriceNote } : {}),
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

