import { NextRequest, NextResponse } from 'next/server';
import { SlackNotificationService, createSlackService } from '@/lib/notifications/slackService';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { fetchStockXMarketPriceDetailed } from '@/lib/stockx/marketPrice';

// This route can do bulk tracking + optional StockX lookups; allow a longer execution window in serverless runtimes.
export const maxDuration = 90;

/**
 * Helper function to extract brand from product name
 */
function extractBrandFromProductName(productName: string): string {
  if (!productName) return 'Unknown';
  
  const brandPatterns = [
    { pattern: /^(Nike|Air Jordan|Jordan)\b/i, brand: 'Nike' },
    { pattern: /^(adidas|Adidas|Yeezy)\b/i, brand: 'adidas' },
    { pattern: /^(New Balance)\b/i, brand: 'New Balance' },
    { pattern: /^(Converse)\b/i, brand: 'Converse' },
    { pattern: /^(Vans)\b/i, brand: 'Vans' },
    { pattern: /^(Puma)\b/i, brand: 'Puma' },
    { pattern: /^(UGG)\b/i, brand: 'UGG' },
    { pattern: /^(ASICS|Asics)\b/i, brand: 'ASICS' },
    { pattern: /^(Reebok)\b/i, brand: 'Reebok' },
    { pattern: /^(Denim Tears)\b/i, brand: 'Denim Tears' },
    { pattern: /^(Off-White|Off White)\b/i, brand: 'Off-White' },
    { pattern: /^(Supreme)\b/i, brand: 'Supreme' },
    { pattern: /^(Fear of God|FOG)\b/i, brand: 'Fear of God' },
    { pattern: /^(Stone Island)\b/i, brand: 'Stone Island' },
    { pattern: /^(Travis Scott)\b/i, brand: 'Travis Scott' },
    { pattern: /^(Balenciaga)\b/i, brand: 'Balenciaga' }
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(productName)) {
      return brand;
    }
  }
  
  // Fallback: take first word
  const firstWord = productName.split(' ')[0];
  return firstWord || 'Unknown';
}

function normalizeStockXSizeForLookup(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'Unknown';
  if (s.toLowerCase() === 'unknown') return 'Unknown';
  const upper = s.toUpperCase();
  const isWomen =
    /\bW\b/.test(upper) ||
    upper.includes('USW') ||
    upper.includes('WOMEN') ||
    /(\d+(?:\.\d+)?)W\b/.test(upper);
  const isYouth =
    /\bY\b/.test(upper) ||
    upper.includes('YOUTH') ||
    /(\d+(?:\.\d+)?)Y\b/.test(upper);

  // If numeric size is present: "US M 8.5" -> "8.5", "US W 6.5" -> "6.5W", "US 6.5Y" -> "6.5Y"
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const num = m[1];
    if (isYouth) return `${num}Y`;
    if (isWomen) return `${num}W`;
    return num;
    }
  // Apparel sizes: normalize to a simple token (S/M/L/XL/XXL/XXXL/XS) when possible.
  const letter = s.match(/\b(XXXL|XXL|XL|XS|S|M|L)\b/i)?.[1];
  if (letter) return letter.toUpperCase();
  // Fallback: keep the raw token (prevents turning "US M" into an empty string)
  return s;
}

function pickFirstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string') {
      const s = c.trim();
      if (s) return s;
    }
  }
      return null;
    }
    
function pickProductImageUrl(purchase: any): string | undefined {
  const raw = pickFirstString(
    purchase?.productImage,
    purchase?.productImageUrl,
    purchase?.image,
    purchase?.imageUrl,
    purchase?.product?.image,
    purchase?.product?.imageUrl,
    purchase?.product?.image_url,
    purchase?.product?.thumbnail,
    purchase?.product?.thumbnailUrl,
    purchase?.product?.thumb,
    Array.isArray(purchase?.product?.images) ? purchase.product.images[0] : null,
    Array.isArray(purchase?.images) ? purchase.images[0] : null
  );
  if (!raw) return undefined;
  // Slack image accessories must be publicly reachable; require https.
  if (!raw.startsWith('https://')) return undefined;
  return raw;
}

function buildGmailEmailUrl(args: { emailId?: unknown; orderNumber?: unknown; trackingNumber?: unknown }): string | null {
  const emailId = typeof args.emailId === 'string' ? args.emailId.trim() : '';
  if (emailId && !emailId.startsWith('manual:')) {
    // Avoid hardcoding /u/0 which can be the wrong account when users have multiple Gmail accounts.
    return `https://mail.google.com/mail/#all/${encodeURIComponent(emailId)}`;
  }
  const orderNumber = typeof args.orderNumber === 'string' ? args.orderNumber.trim() : '';
  if (orderNumber) {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(`"${orderNumber}"`)}`;
  }
  const trackingNumber = typeof args.trackingNumber === 'string' ? args.trackingNumber.trim() : '';
  if (trackingNumber) {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(`"${trackingNumber}"`)}`;
  }
      return null;
    }
    
function buildStockXSlackLink(args: {
  urlKey?: string | null;
  styleId?: string | null;
  productName: string;
  size: string;
}): string {
  const urlKey = typeof args.urlKey === 'string' ? args.urlKey.trim() : '';
  const size = String(args.size || '').trim();
  const hasSize = !!size && size !== 'Unknown';
  if (urlKey) {
    const url = `https://stockx.com/${urlKey}${hasSize ? `?size=${encodeURIComponent(size)}` : ''}`;
    const label = hasSize ? `StockX (${size})` : 'StockX';
    return `<${url}|${label}>`;
  }
  const term = String(args.styleId || '').trim() || String(args.productName || '').trim() || 'StockX';
  const url = `https://stockx.com/search?s=${encodeURIComponent(term)}`;
  return `<${url}|StockX Search>`;
}

function isOnTheWayStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? '').toLowerCase().trim();
  if (!s) return true; // treat missing as "in progress"
  // Exclude clearly-not-on-the-way states
  if (s === 'delivered' || s === 'returned' || s === 'cancelled' || s === 'canceled') return false;
  return true;
}

function extractStockXUrlKeyFromLink(raw: unknown): string | null {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) return null;

  const tryParse = (maybeUrl: string): string | null => {
    try {
      const u = new URL(maybeUrl);

      // Some email trackers wrap the real destination in ?r=...
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
      // Ignore non-product paths
      if (first === 'search' || first === 'category' || first === 'news' || first === 'help') return null;
      return first;
    } catch {
      return null;
    }
  };

  // Accept both raw slugs and URLs
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

async function getStockXAuthForUser(request: NextRequest, userId: string): Promise<{ apiKey: string; accessToken?: string; refreshToken?: string } | null> {
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;
  if (!apiKey) return null;

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshTokenCookie = request.cookies.get('stockx_refresh_token')?.value;
  if (accessToken || refreshTokenCookie) {
    return { apiKey, accessToken, refreshToken: refreshTokenCookie };
    }
    
  // Fallback: use user's stored refresh token (same approach as cron), so Slack can fetch prices even when cookies are missing.
  try {
    const db = getAdminDb();
    const userSnap = await db.collection('users').doc(userId).get();
    const data = userSnap.exists ? (userSnap.data() as any) : null;
    const tokens = data?.stockxTokens || null;
    const refreshToken =
      (tokens?.refresh_token as string | undefined) ||
      (tokens?.refreshToken as string | undefined) ||
      undefined;
    if (!refreshToken) return { apiKey };
    return { apiKey, refreshToken };
  } catch {
    return { apiKey };
  }
}

/**
 * POST /api/notifications/slack
 * Send delivery summary to Slack
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, type = 'daily_summary', purchases } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Create Slack service (prefer per-user Deliveries Slack settings; fallback to env)
    let slackService: SlackNotificationService | null = null;
    let userSlackTimezone: string | null = null;
    try {
      const db = getAdminDb();
      const snap = await db.collection('users').doc(userId).get();
      const data = snap.exists ? (snap.data() as any) : null;
      const webhookUrl = String(data?.deliveriesSlack?.webhookUrl || '').trim();
      const tz = String(data?.deliveriesSlack?.timezone || '').trim();
      if (tz) userSlackTimezone = tz;
      if (webhookUrl) {
        slackService = new SlackNotificationService({
          webhookUrl,
          username: 'Delivery Tracker',
          iconEmoji: ':package:',
          timezone: userSlackTimezone || undefined,
        });
      }
    } catch {
      // ignore and fall back to env
    }
    slackService = slackService || createSlackService();
    if (!slackService) {
      return NextResponse.json(
        { error: 'Slack not configured. Add a webhook in Deliveries settings (or set SLACK_WEBHOOK_URL).' },
        { status: 500 }
      );
    }

    console.log(`📨 Sending Slack notification (${type}) for user: ${userId}`);

    // Get purchases - either from request body (localStorage users) or Firebase
    let allPurchases: any[] = [];
    
    if (purchases && Array.isArray(purchases)) {
      allPurchases = purchases;
      console.log(`📦 Using ${allPurchases.length} purchases from request`);
    } else {
      // Get from Firebase
      const [purchasesByUserId, purchasesByUid] = await Promise.all([
        getDocumentsServer('purchases', {
          where: [{ field: 'userId', operator: '==', value: userId }]
        }),
        getDocumentsServer('purchases', {
          where: [{ field: 'uid', operator: '==', value: userId }]
        })
      ]);

      allPurchases = [...purchasesByUserId, ...purchasesByUid].filter((purchase, index, self) => 
        index === self.findIndex(p => p.id === purchase.id)
      );
      console.log(`📦 Found ${allPurchases.length} purchases from Firebase`);
    }

    // Filter purchases with tracking numbers
    const purchasesWithTracking = allPurchases.filter((purchase: any) => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number;
      return trackingValue && trackingValue.trim() !== '' && trackingValue !== 'TBD';
    });

    console.log(`📦 Found ${purchasesWithTracking.length} purchases with tracking`);

    if (purchasesWithTracking.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No deliveries to notify about',
        sent: false
      });
    }

    // Get live tracking data ONLY for purchases that aren't already delivered, and dedupe tracking numbers.
    const purchasesNeedingLiveTracking = purchasesWithTracking.filter((purchase: any) => {
      const status = String(purchase?.status || purchase?.shippingStatus || '').toLowerCase().trim();
      return status !== 'delivered';
    });
    const trackingNumbers = Array.from(
      new Set(
        purchasesNeedingLiveTracking
          .map((purchase: any) => purchase.tracking || purchase.trackingNumber || purchase.tracking_number)
          .filter((t: any) => t && String(t).trim() !== '' && t !== 'TBD')
          .map((t: any) => String(t).trim())
      )
    );

    console.log(`🔄 Fetching live tracking data for ${trackingNumbers.length} packages (non-delivered only)`);
    const liveTrackingData =
      trackingNumbers.length > 0 ? await trackingService.getBulkTrackingInfo(trackingNumbers) : [];
    const liveTrackingByNumber = new Map<string, any>(
      (liveTrackingData || []).map((lt: any) => [String(lt?.trackingNumber || '').trim(), lt])
    );

    const isClearlyPublicUrl = (raw: string): boolean => {
      const s = (raw || '').trim().toLowerCase();
      if (!s) return false;
      return !(s.includes('localhost') || s.includes('127.0.0.1') || s.includes('ngrok'));
    };

    const sanitizeBaseUrl = (raw: string): string | null => {
      const s = String(raw || '').trim();
      if (!s) return null;
      const withProto = s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`;
      if (!isClearlyPublicUrl(withProto)) return null;
      // strip trailing slash
      return withProto.replace(/\/+$/, '');
    };

    const getBaseUrl = () => {
      const host = request.headers.get('host') || '';
      if (host.includes('solesmarket.com')) return 'https://www.solesmarket.com';

      // Slack links must be publicly reachable. Prefer an explicit public base URL,
      // but NEVER allow localhost/ngrok to slip into Slack messages.
      const explicit =
        process.env.SLACK_PUBLIC_BASE_URL ||
        process.env.SLACK_LINK_BASE_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        '';
      const sanitized = sanitizeBaseUrl(explicit);
      if (sanitized) return sanitized;

      // Default to production if we can't determine a safe public base URL.
      return 'https://www.solesmarket.com';
    };
    const baseUrl = getBaseUrl();

    // Concurrency limiter to avoid StockX 429s
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
    // Guardrails to keep Slack sends fast and within Slack's block limits.
    const MAX_LIVE_MARKET_FETCH_ITEMS = 50; // cap expensive live StockX lookups per request
    const MAX_DELIVERIES_IN_SLACK_MESSAGE = 40; // Slack blocks max is 50; each item is ~1 block + overhead
    // Never hard-disable live pricing based on total tracked items; instead we prioritize which items consume budget.
    const allowAnyLiveMarketFetch = true;
    let remainingLiveMarketFetchBudget = MAX_LIVE_MARKET_FETCH_ITEMS;

    // Prioritize live StockX fetches for items arriving today (the Slack "daily" breakdown),
    // so we don't burn budget on far-future ETAs while today's items show "skipped".
    // IMPORTANT: Do NOT use process.env.TZ (often UTC). Prefer user's Deliveries Slack timezone, then SLACK_TIMEZONE, then ET.
    const slackTimeZone = (userSlackTimezone || process.env.SLACK_TIMEZONE || 'America/New_York').trim() || 'America/New_York';
    const toYmdInTimeZone = (d: Date, tz: string): string => {
      try {
        // en-CA produces YYYY-MM-DD which matches our ETA strings.
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      } catch {
        return d.toISOString().split('T')[0];
      }
    };
    const todayStrForSlack = toYmdInTimeZone(new Date(), slackTimeZone);
    const tomorrowStrForSlack = toYmdInTimeZone(new Date(Date.now() + 24 * 60 * 60 * 1000), slackTimeZone);
    const localHourForSlack = (() => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: slackTimeZone,
          hour: '2-digit',
          hour12: false,
        }).formatToParts(new Date());
        const h = parts.find((p) => p.type === 'hour')?.value;
        const n = h ? Number.parseInt(h, 10) : NaN;
        return Number.isFinite(n) ? n : new Date().getHours();
      } catch {
        return new Date().getHours();
      }
    })();
    const includeTomorrowForSlack = localHourForSlack >= 21;

    const parsePurchasePrice = (purchase: any): number | null => {
      const pick = (v: any): number | null => {
        if (v === null || v === undefined) return null;
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, '').split('+')[0].trim());
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      return (
        pick(purchase?.total_amount) ??
        pick(purchase?.totalAmount) ??
        pick(purchase?.totalPayment) ??
        pick(purchase?.purchasePrice) ??
        pick(purchase?.price) ??
        null
      );
    };

    const normalizeEtaYmd = (purchase: any, liveTracking: any): string => {
      const raw = (liveTracking?.estimatedDelivery || purchase?.estimatedDelivery || '').trim?.() || String(liveTracking?.estimatedDelivery || purchase?.estimatedDelivery || '').trim();
      if (!raw || raw === 'TBD') return 'TBD';
      try {
        const d = new Date(raw);
        if (!Number.isFinite(d.getTime())) return 'TBD';
        return d.toISOString().split('T')[0];
      } catch {
        return 'TBD';
      }
    };

    // Reorder processing so the live StockX budget is spent on the highest-impact arrivals first.
    const purchasesWithTrackingSorted = [...purchasesWithTracking].sort((a: any, b: any) => {
      const aTracking = String(a?.tracking || a?.trackingNumber || a?.tracking_number || '').trim();
      const bTracking = String(b?.tracking || b?.trackingNumber || b?.tracking_number || '').trim();
      const aLive = liveTrackingByNumber.get(aTracking);
      const bLive = liveTrackingByNumber.get(bTracking);

      const aStatus = (aLive && !aLive.error ? String(aLive.status) : String(a?.status || '')).toLowerCase().trim();
      const bStatus = (bLive && !bLive.error ? String(bLive.status) : String(b?.status || '')).toLowerCase().trim();

      const aEta = normalizeEtaYmd(a, aLive);
      const bEta = normalizeEtaYmd(b, bLive);

      const aArr = aEta === todayStrForSlack || aStatus === 'out_for_delivery' || (includeTomorrowForSlack && aEta === tomorrowStrForSlack);
      const bArr = bEta === todayStrForSlack || bStatus === 'out_for_delivery' || (includeTomorrowForSlack && bEta === tomorrowStrForSlack);
      if (aArr !== bArr) return aArr ? -1 : 1;

      const ap = parsePurchasePrice(a) ?? 0;
      const bp = parsePurchasePrice(b) ?? 0;
      if (ap !== bp) return bp - ap; // higher purchase price first

      return String(a?.productName || '').localeCompare(String(b?.productName || ''));
    });
    // We want market prices for anything "on the way" (not just a narrow carrier-status subset).
    // Many tracking APIs return UNKNOWN/LABEL_CREATED/etc, which should still count as on-the-way.
    const marketCache = new Map<string, Promise<ReturnType<typeof fetchStockXMarketPriceDetailed>>>();
    let stockxRateLimited = false;

    const marketDebug = {
      apiKeyConfigured: Boolean(process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID),
      totalItems: purchasesWithTracking.length,
      cachedUsed: 0,
      fetchedOk: 0,
      skippedNoAuth: 0,
      skippedNotActive: 0,
      skippedRateLimited: 0,
      failedByReason: {} as Record<string, number>,
      failedHttpStatuses: {} as Record<string, number>,
      items: [] as Array<{
        purchaseId: string;
        productName: string;
        productSizeRaw: string;
        normalizedSize: string;
        status: string;
        onTheWay: boolean;
        identifiers: {
          styleId?: string | null;
          urlKey?: string | null;
          productId?: string;
          variantId?: string;
        };
        cachedMarketPrice?: number;
        fetchedMarketPrice?: number;
        decision:
          | 'used_cached'
          | 'skipped_not_active'
          | 'skipped_missing_stockx_tokens'
          | 'skipped_rate_limited'
          | 'fetched_ok'
          | 'fetched_failed';
        result?: {
          reason?: string;
          stage?: string;
          httpStatus?: number;
          termUsed?: string;
          urlKey?: string;
          productId?: string;
          variantId?: string;
          details?: string;
          askSource?: 'standard' | 'flex';
          askStd?: number | null;
          askFlex?: number | null;
        };
        marketLink?: string;
      }>,
    };

    const fetchMarketWithControls = async (args: {
      auth: any;
      productName: string;
      size: string;
      styleId?: string | null;
      urlKey?: string | null;
      productId?: string;
      variantId?: string;
    }) => {
      if (stockxRateLimited) {
        marketDebug.skippedRateLimited++;
        marketDebug.failedByReason['rate_limited_short_circuit'] =
          (marketDebug.failedByReason['rate_limited_short_circuit'] || 0) + 1;
        return { price: null } as any;
      }

      const key = `${String(args.productId || '').trim()}|${String(args.variantId || '').trim()}|${String(args.urlKey || '').trim()}|${String(args.styleId || '').trim()}|${args.productName}|${args.size}`.toLowerCase();
      const existing = marketCache.get(key);
      if (existing) return existing;

      const p = (async () => {
        await stockxSem.acquire();
        try {
          const result = await fetchStockXMarketPriceDetailed(args);
          // If we hit a 429 on search, short-circuit further requests to avoid hammering StockX.
          if (result.reason === 'search_http_error' && result.httpStatus === 429) {
            stockxRateLimited = true;
          }
          return result;
        } finally {
          stockxSem.release();
        }
      })();

      marketCache.set(key, p);
      return p;
    };

    // Build deliveries array with live tracking data AND real-time StockX prices
    console.log(`💰 Fetching real-time StockX prices for ${purchasesWithTracking.length} items...`);
    
    const deliveries = await Promise.all(purchasesWithTrackingSorted.map(async (purchase: any) => {
      const trackingValue = purchase.tracking || purchase.trackingNumber || purchase.tracking_number;
      const liveTracking = liveTrackingByNumber.get(String(trackingValue || '').trim());
      
      // Determine status from live tracking or purchase status
      let status = purchase.status?.toLowerCase() || 'shipped';
      if (liveTracking && !liveTracking.error) {
        status = liveTracking.status;
      }

      // Get estimated delivery - normalize to YYYY-MM-DD format
      let estimatedDelivery = 'TBD';
      if (liveTracking && liveTracking.estimatedDelivery) {
        estimatedDelivery = liveTracking.estimatedDelivery;
      } else if (purchase.estimatedDelivery) {
        estimatedDelivery = purchase.estimatedDelivery;
      }

      // Validate and normalize date format
      if (estimatedDelivery && estimatedDelivery !== 'TBD') {
        try {
          const date = new Date(estimatedDelivery);
          if (!isNaN(date.getTime())) {
            // Convert to YYYY-MM-DD format
            estimatedDelivery = date.toISOString().split('T')[0];
          } else {
            console.warn(`⚠️ Invalid date for ${purchase.productName}: ${estimatedDelivery}`);
            estimatedDelivery = 'TBD';
          }
        } catch (error) {
          console.error(`❌ Error parsing date for ${purchase.productName}:`, error);
          estimatedDelivery = 'TBD';
        }
      }

      const productName = purchase.productName || purchase.product?.name || 'Unknown Product';
      const productSizeRaw = purchase.productSize || purchase.size || purchase.product?.size || 'Unknown';
      const productSizeDisplay = String(productSizeRaw ?? '').trim() || 'Unknown';
      const productSizeLookup = normalizeStockXSizeForLookup(productSizeRaw);
      const styleId = purchase.styleId || purchase.style_id || null;
      const urlKey = extractStockXUrlKeyFromPurchase(purchase);
      const ids = extractStockXIdsFromPurchase(purchase);
      const purchaseId = String(purchase.id || purchase.purchaseId || purchase.orderNumber || trackingValue || '').trim();
      const onTheWay = isOnTheWayStatus(status);
      const productImage = pickProductImageUrl(purchase);
      const orderNumber = purchase.orderNumber || purchase.order_number || purchase.orderId;
      const emailUrl = buildGmailEmailUrl({
        emailId: (purchase as any)?.emailId || (purchase as any)?.email_id || (purchase as any)?.gmailEmailId,
        orderNumber,
        trackingNumber: trackingValue,
      });
      const gmailLink = emailUrl ? `<${emailUrl}|Gmail>` : undefined;
      
      // Extract brand from product name
      let productBrand = purchase.productBrand || purchase.brand;
      
      // If brand is missing or is the color (from product_variant bug), extract from name
      if (!productBrand || productBrand === 'Unknown Brand' || productBrand.length < 3) {
        productBrand = extractBrandFromProductName(productName);
      }
      
      // Calculate profit: Market Price - Purchase Price
      let purchasePrice: number | undefined;
      let marketPrice: number | undefined;
      let estimatedProfit: number | undefined;
      let marketStatus: string | undefined;
      let stockxLowestAsk: number | undefined;
      let stockxHighestBid: number | undefined;

      // Get purchase price (total amount paid) - check all possible field names
      // Priority order: total_amount (Gmail parsed) > totalAmount > totalPayment > price
      if (purchase.total_amount !== undefined) {
        purchasePrice = typeof purchase.total_amount === 'number' ? purchase.total_amount : parseFloat(purchase.total_amount);
      } else if (purchase.totalAmount !== undefined) {
        purchasePrice = typeof purchase.totalAmount === 'number' ? purchase.totalAmount : parseFloat(purchase.totalAmount);
      } else if (purchase.totalPayment !== undefined) {
        purchasePrice = typeof purchase.totalPayment === 'number' ? purchase.totalPayment : parseFloat(purchase.totalPayment);
      } else if (purchase.purchasePrice !== undefined) {
        purchasePrice = typeof purchase.purchasePrice === 'number' ? purchase.purchasePrice : parseFloat(purchase.purchasePrice);
      } else if (purchase.price) {
        // Try to parse price string like "$180.00" or "180.00 + $0.00"
        const priceStr = purchase.price.toString().replace(/[$,]/g, '').split('+')[0].trim();
        purchasePrice = parseFloat(priceStr);
      }
      
      // Validate purchase price
      if (purchasePrice !== undefined && (isNaN(purchasePrice) || purchasePrice <= 0)) {
        purchasePrice = undefined;
      }

      // Get current market price from StockX - try cached first, then fetch real-time
      let cachedMarketSource: 'purchase.lowestAsk' | 'purchase.marketPrice' | undefined;
      if (purchase.lowestAsk) {
        marketPrice = typeof purchase.lowestAsk === 'number' ? purchase.lowestAsk : parseFloat(purchase.lowestAsk);
        cachedMarketSource = 'purchase.lowestAsk';
      } else if (purchase.marketPrice) {
        marketPrice = typeof purchase.marketPrice === 'number' ? purchase.marketPrice : parseFloat(purchase.marketPrice);
        cachedMarketSource = 'purchase.marketPrice';
      }
      // Sanitize cached market price
      if (marketPrice !== undefined && (!Number.isFinite(marketPrice) || marketPrice <= 0)) {
        marketPrice = undefined;
      }
      const cachedMarketPrice = marketPrice;

      // Always attach a StockX link (even if we can't fetch a market price). This ensures Slack has "StockX Search".
      (purchase as any).__stockxLink = buildStockXSlackLink({
        urlKey,
        styleId,
        productName,
        size: productSizeLookup,
      });
      // Live StockX pricing can be expensive. We only do it for a small number of on-the-way items,
      // and we disable it entirely for very large tracked sets.
      const arrivingTodayOrTomorrowForSlack =
        estimatedDelivery === todayStrForSlack ||
        status === 'out_for_delivery' ||
        (includeTomorrowForSlack && estimatedDelivery === tomorrowStrForSlack);
      const shouldAttemptLiveFetch = (() => {
        // For Slack daily summaries: focus live market fetch on items arriving today (and late-night: tomorrow too).
        if (!arrivingTodayOrTomorrowForSlack) return false;
        if (!onTheWay) return false;
        if (!allowAnyLiveMarketFetch) return false;
        if (remainingLiveMarketFetchBudget <= 0) return false;
        remainingLiveMarketFetchBudget--;
        return true;
      })();
      // If we have exact StockX productId+variantId, prefer forcing live price (but only when allowed).
      const forceLivePrice =
        shouldAttemptLiveFetch &&
        typeof ids.productId === 'string' &&
        ids.productId.trim() !== '' &&
        typeof ids.variantId === 'string' &&
        ids.variantId.trim() !== '';
      if (forceLivePrice) {
        // We'll still keep cached as fallback, but don't use it as the primary Slack market price.
        marketPrice = undefined;
      }

      const itemDebugBase = {
        purchaseId,
        productName,
        productSizeRaw: String(productSizeRaw ?? ''),
        normalizedSize: productSizeLookup,
        status,
        onTheWay,
        identifiers: {
          styleId,
          urlKey,
          productId: ids.productId,
          variantId: ids.variantId,
        },
      } as const;
      
      // If no market price cached, fetch real-time from StockX (prioritize styleId for accuracy!)
      if (marketPrice === undefined) {
        // Only skip if it's clearly not on the way (delivered/cancelled/etc)
        if (!onTheWay) {
          marketDebug.skippedNotActive++;
          marketDebug.items.push({
            ...itemDebugBase,
            decision: 'skipped_not_active',
            cachedMarketPrice: undefined,
            fetchedMarketPrice: undefined,
          });
        } else if (!shouldAttemptLiveFetch) {
          // Keep Slack fast: skip live fetch when disabled or budget exhausted.
          marketDebug.failedByReason['live_fetch_skipped_for_speed'] =
            (marketDebug.failedByReason['live_fetch_skipped_for_speed'] || 0) + 1;
          marketStatus = arrivingTodayOrTomorrowForSlack ? 'unavailable — live fetch skipped' : 'unavailable — not arriving today';
          marketDebug.items.push({
            ...itemDebugBase,
            decision: 'skipped_rate_limited',
            ...(cachedMarketPrice !== undefined ? { cachedMarketPrice } : {}),
            result: { reason: 'live_fetch_skipped_for_speed', stage: 'budget' },
          });
        } else {
        const auth = await getStockXAuthForUser(request, userId);
        if (!auth) {
          console.log(`⚠️ Missing STOCKX_API_KEY, skipping price fetch`);
          marketDebug.failedByReason['missing_api_key'] = (marketDebug.failedByReason['missing_api_key'] || 0) + 1;
          marketStatus = 'unavailable — missing StockX API key';
          marketDebug.items.push({
            ...itemDebugBase,
            decision: 'fetched_failed',
            result: { reason: 'missing_api_key', stage: 'auth' },
          });
        } else {
          const hasAuth = Boolean((auth as any).accessToken || (auth as any).refreshToken);
          if (!hasAuth) {
            marketDebug.skippedNoAuth++;
            marketDebug.failedByReason['missing_stockx_tokens'] =
              (marketDebug.failedByReason['missing_stockx_tokens'] || 0) + 1;
            marketStatus = 'unavailable — StockX not connected';
            // User-requested behavior: do NOT fall back to cached; keep as unknown so we can verify live fetch coverage.
            marketDebug.items.push({
              ...itemDebugBase,
              decision: 'skipped_missing_stockx_tokens',
              ...(cachedMarketPrice !== undefined ? { cachedMarketPrice } : {}),
              result: { details: cachedMarketSource || (cachedMarketPrice !== undefined ? 'cached_unknown_field' : undefined) },
            });
          } else {
            if (stockxRateLimited) {
              // (fetchMarketWithControls will also short-circuit, but this makes the per-item trace explicit)
              marketDebug.items.push({
                ...itemDebugBase,
                decision: 'skipped_rate_limited',
                result: { reason: 'rate_limited_short_circuit' },
              });
            }
            const result = await fetchMarketWithControls({
              auth,
              productName,
              // Use the raw display size here so we preserve cohort hints like "US W 8" for variant matching.
              // (The URL link can still use the simplified size token.)
              size: productSizeDisplay,
              styleId,
              urlKey,
              productId: ids.productId,
              variantId: ids.variantId,
            });
            if (result.price) {
              marketPrice = result.price;
              marketDebug.fetchedOk++;
              marketStatus = undefined;
              const askStd = typeof (result as any).askStd === 'number' ? (result as any).askStd : null;
              const askFlex = typeof (result as any).askFlex === 'number' ? (result as any).askFlex : null;
              const bidStd = typeof (result as any).bidStd === 'number' ? (result as any).bidStd : null;
              const bidFlex = typeof (result as any).bidFlex === 'number' ? (result as any).bidFlex : null;
              stockxLowestAsk = (askStd ?? askFlex ?? undefined) as any;
              stockxHighestBid = (bidStd ?? bidFlex ?? undefined) as any;
          console.log(`✅ Real-time price fetched: ${productName}${styleId ? ` (StyleId: ${styleId})` : ''} = $${marketPrice}`);
              const stockxUrlKey = (result as any).urlKey as string | undefined;
              const termUsed = (result as any).termUsed as string | undefined;
              const searchTerm = termUsed || styleId || productName;
              const marketUrl = stockxUrlKey
                ? `https://stockx.com/${stockxUrlKey}${productSizeLookup && productSizeLookup !== 'Unknown' ? `?size=${encodeURIComponent(productSizeLookup)}` : ''}`
                : `https://stockx.com/search?s=${encodeURIComponent(searchTerm)}`;
              marketDebug.items.push({
                ...itemDebugBase,
                decision: 'fetched_ok',
                ...(cachedMarketPrice !== undefined ? { cachedMarketPrice } : {}),
                fetchedMarketPrice: marketPrice,
                result: {
                  reason: (result as any).reason,
                  stage: (result as any).stage,
                  httpStatus: (result as any).httpStatus,
                  termUsed,
                  urlKey: (result as any).urlKey,
                  productId: (result as any).productId,
                  variantId: (result as any).variantId,
                  details: (result as any).details,
                  askSource: (result as any).askSource,
                  askStd: (result as any).askStd,
                  askFlex: (result as any).askFlex,
                },
                marketLink: `<${marketUrl}|Market>`,
              });

              // Best-effort backfill so next time we can use the repricer-style direct market-data call.
              // Only applies when the purchase came from Firebase (so it has a Firestore doc id at purchase.id).
              const docId = typeof purchase?.id === 'string' ? purchase.id.trim() : '';
              if (docId) {
                try {
                  const db = getAdminDb();
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
            } else {
              marketDebug.failedByReason[result.reason] = (marketDebug.failedByReason[result.reason] || 0) + 1;
              // Short, user-facing reason for why this item didn't get a market price.
              marketStatus = `unavailable — ${result.reason.replace(/_/g, ' ')}`;
              const askStd = typeof (result as any).askStd === 'number' ? (result as any).askStd : null;
              const askFlex = typeof (result as any).askFlex === 'number' ? (result as any).askFlex : null;
              const bidStd = typeof (result as any).bidStd === 'number' ? (result as any).bidStd : null;
              const bidFlex = typeof (result as any).bidFlex === 'number' ? (result as any).bidFlex : null;
              stockxLowestAsk = (askStd ?? askFlex ?? undefined) as any;
              stockxHighestBid = (bidStd ?? bidFlex ?? undefined) as any;
              if (typeof result.httpStatus === 'number') {
                const key = `${result.stage || 'unknown'}:${result.httpStatus}`;
                marketDebug.failedHttpStatuses[key] = (marketDebug.failedHttpStatuses[key] || 0) + 1;
              }

              const stockxUrlKey = (result as any).urlKey as string | undefined;
              const termUsed = (result as any).termUsed as string | undefined;
              const searchTerm = termUsed || styleId || productName;
              const marketUrl = stockxUrlKey
                ? `https://stockx.com/${stockxUrlKey}${productSizeLookup && productSizeLookup !== 'Unknown' ? `?size=${encodeURIComponent(productSizeLookup)}` : ''}`
                : `https://stockx.com/search?s=${encodeURIComponent(searchTerm)}`;
              // User-requested behavior: If live fetch fails, DO NOT fall back to cached.
              marketDebug.items.push({
                ...itemDebugBase,
                decision: 'fetched_failed',
                ...(cachedMarketPrice !== undefined ? { cachedMarketPrice } : {}),
                result: {
                  reason: (result as any).reason,
                  stage: (result as any).stage,
                  httpStatus: (result as any).httpStatus,
                  termUsed,
                  urlKey: (result as any).urlKey,
                  productId: (result as any).productId,
                  variantId: (result as any).variantId,
                  details: (result as any).details,
                  askSource: (result as any).askSource,
                  askStd: (result as any).askStd,
                  askFlex: (result as any).askFlex,
                },
                marketLink: `<${marketUrl}|Market>`,
              });
            }

              // Always attach a StockX link (prefer exact urlKey+size; otherwise fall back to search).
              const stockxUrlKey = (result as any).urlKey as string | undefined;
              (purchase as any).__stockxLink = buildStockXSlackLink({
                urlKey: stockxUrlKey || urlKey,
                styleId,
                productName,
                size: productSizeLookup,
              });
          }
        }
        }
      } else {
        console.log(`📦 Using cached price: ${productName} = $${marketPrice}`);
        (purchase as any).__stockxLink = buildStockXSlackLink({ urlKey, styleId, productName, size: productSizeLookup });
        // Capture a per-item trace of cached prices too (helps verify we're actually covering all items)
        marketDebug.items.push({
          ...itemDebugBase,
          decision: 'used_cached',
          cachedMarketPrice: marketPrice,
          result: { details: cachedMarketSource || 'cached_unknown_field' },
        });
        marketDebug.cachedUsed++;
        marketStatus = undefined;
      }
      if (marketPrice !== undefined && (!Number.isFinite(marketPrice) || marketPrice <= 0)) {
        marketPrice = undefined;
        if (!marketStatus) marketStatus = 'unavailable';
      }

      // Calculate estimated profit: Market Price - Purchase Price
      if (
        purchasePrice !== undefined &&
        marketPrice !== undefined &&
        Number.isFinite(purchasePrice) &&
        Number.isFinite(marketPrice)
      ) {
        estimatedProfit = marketPrice - purchasePrice;
      }
      
      console.log(`📦 ${productName}: tracking=${trackingValue}, eta=${estimatedDelivery}, status=${status}, purchase=$${purchasePrice}, market=$${marketPrice}, profit=$${estimatedProfit}`);

      return {
        purchaseId,
        productName,
        productBrand,
        productSize: productSizeDisplay,
        productImage,
        trackingNumber: trackingValue,
        carrier: liveTracking?.carrier || purchase.carrier || 'Unknown',
        estimatedDelivery,
        status,
        purchasePrice,
        marketPrice,
        estimatedProfit,
        ...(typeof stockxLowestAsk === 'number' && Number.isFinite(stockxLowestAsk) ? { stockxLowestAsk } : {}),
        ...(typeof stockxHighestBid === 'number' && Number.isFinite(stockxHighestBid) ? { stockxHighestBid } : {}),
        ...(marketPrice === undefined && marketStatus ? { marketStatus } : {}),
        purchaseLink: purchaseId ? `<${baseUrl}/dashboard?section=purchases&purchaseId=${encodeURIComponent(purchaseId)}|Purchase>` : undefined,
        gmailLink,
        stockxLink: (purchase as any).__stockxLink as string | undefined,
      };
    }));

    // Slack message payload guardrail: keep within Slack block limits and keep request snappy.
    const toSlackPriority = (d: any): number => {
      const s = String(d?.status || '').toLowerCase();
      if (s === 'out_for_delivery') return 3;
      if (s === 'in_transit') return 2;
      if (s === 'shipped') return 1;
      return 0;
    };
    const deliveriesSortedForSlack = [...deliveries].sort((a, b) => toSlackPriority(b) - toSlackPriority(a));
    const truncatedForSlack = deliveriesSortedForSlack.length > MAX_DELIVERIES_IN_SLACK_MESSAGE;
    const deliveriesForSlack = deliveriesSortedForSlack.slice(0, MAX_DELIVERIES_IN_SLACK_MESSAGE);

    // Calculate summary stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const arrivingToday = deliveries.filter(d => 
      d.estimatedDelivery === todayStr || d.status === 'out_for_delivery'
    ).length;

    const arrivingTomorrow = deliveries.filter(d => 
      d.estimatedDelivery === tomorrowStr
    ).length;

    const arrivingThisWeek = deliveries.filter(d => {
      if (!d.estimatedDelivery || d.estimatedDelivery === 'TBD') return false;
      const deliveryDate = new Date(d.estimatedDelivery);
      return deliveryDate > tomorrow && deliveryDate <= weekEnd;
    }).length;

    const inTransit = deliveries.filter(d => 
      d.status === 'in_transit' || d.status === 'shipped' || d.status === 'out_for_delivery'
    ).length;

    const sumFiniteOrNull = (values: Array<number | undefined>): number | null => {
      const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (finite.length === 0) return null;
      return finite.reduce((sum, v) => sum + v, 0);
    };

    const todayItems = deliveries.filter(d => d.estimatedDelivery === todayStr || d.status === 'out_for_delivery');
    const tomorrowItems = deliveries.filter(d => d.estimatedDelivery === tomorrowStr);
    const projectedProfitToday = sumFiniteOrNull(todayItems.map(d => d.estimatedProfit));
    const projectedProfitTomorrow = sumFiniteOrNull(tomorrowItems.map(d => d.estimatedProfit));

    const onTheWay = deliveries.filter(d => d.status === 'in_transit' || d.status === 'shipped' || d.status === 'out_for_delivery');
    const projectedProfitOnTheWay = sumFiniteOrNull(onTheWay.map(d => d.estimatedProfit));
    const marketValueOnTheWay = sumFiniteOrNull(onTheWay.map(d => d.marketPrice));
    const purchaseCostOnTheWay = sumFiniteOrNull(onTheWay.map(d => d.purchasePrice));

    const buildMarketNote = (): string | null => {
      const entries = Object.entries(marketDebug.failedByReason).sort((a, b) => b[1] - a[1]);
      const top = entries[0];
      if (!top) return null;
      const topReason = top[0];
      const counts = `cached ${marketDebug.cachedUsed}, fetched ${marketDebug.fetchedOk}, failed ${entries.reduce((s, [,c]) => s + c, 0)}`;
      if (topReason === 'missing_stockx_tokens') return `Market prices unavailable: StockX not connected for this user (${counts}).`;
      if (topReason === 'missing_refresh_token' || topReason === 'token_refresh_failed') return `Market prices unavailable: StockX token refresh failed (${counts}).`;
      if (topReason.endsWith('_http_error')) return `Market prices unavailable: StockX HTTP errors (${counts}).`;
      if (topReason === 'search_http_error' || topReason === 'market_http_error') return `Market prices unavailable: StockX HTTP errors (${counts}).`;
      if (topReason === 'network_error') return `Market prices unavailable: StockX network errors (${counts}).`;
      return `Market prices unavailable: ${topReason} (${counts}).`;
    };
    const baseMarketNote =
      purchaseCostOnTheWay !== null && marketValueOnTheWay === null && projectedProfitOnTheWay === null
        ? buildMarketNote()
        : null;
    const slackTruncationNote = truncatedForSlack
      ? `Slack message truncated to ${MAX_DELIVERIES_IN_SLACK_MESSAGE} items (of ${deliveriesSortedForSlack.length} tracked with delivery info).`
      : null;
    const marketPriceNote =
      [baseMarketNote, slackTruncationNote].filter(Boolean).join(' ') || null;

    // Send notification
    if (type === 'daily_summary') {
      await slackService.sendDeliverySummary({
        totalDeliveries: deliveries.length,
        arrivingToday,
        arrivingTomorrow,
        arrivingThisWeek,
        inTransit,
        ...(projectedProfitToday !== null ? { projectedProfitToday } : {}),
        ...(projectedProfitTomorrow !== null ? { projectedProfitTomorrow } : {}),
        ...(projectedProfitOnTheWay !== null ? { projectedProfitOnTheWay } : {}),
        ...(marketValueOnTheWay !== null ? { marketValueOnTheWay } : {}),
        ...(purchaseCostOnTheWay !== null ? { purchaseCostOnTheWay } : {}),
        ...(marketPriceNote ? { marketPriceNote } : {}),
        deliveries: deliveriesForSlack
      });
    } else if (type === 'out_for_delivery') {
      await slackService.sendOutForDeliveryOnly({ deliveries: deliveriesForSlack });
    }

    console.log(`✅ Slack notification sent successfully`);

    return NextResponse.json({
      success: true,
      message: 'Notification sent',
      sent: true,
      marketPriceDebug: marketDebug,
      summary: {
        totalDeliveries: deliveries.length,
        arrivingToday,
        arrivingTomorrow,
        arrivingThisWeek,
        inTransit,
        outForDelivery: deliveries.filter((d) => d.status === 'out_for_delivery').length
      }
    });

  } catch (error) {
    console.error('❌ Error sending Slack notification:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/notifications/slack/test
 * Test Slack webhook configuration
 */
export async function GET(request: NextRequest) {
  try {
    const slackService = createSlackService();
    
    if (!slackService) {
      return NextResponse.json({ 
        configured: false,
        message: 'Slack not configured. Please set SLACK_WEBHOOK_URL in .env.local' 
      });
    }

    // Send a test message
    await slackService.sendDeliveryUpdate({
      productName: 'Test Product',
      trackingNumber: '1Z999AA10123456784',
      status: 'in_transit',
      estimatedDelivery: new Date().toISOString().split('T')[0]
    });

    return NextResponse.json({
      configured: true,
      message: 'Slack webhook is configured and working! Check your Slack channel.'
    });

  } catch (error) {
    console.error('❌ Slack webhook test failed:', error);
    return NextResponse.json({
      configured: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

