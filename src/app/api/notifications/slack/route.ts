import { NextRequest, NextResponse } from 'next/server';
import { SlackNotificationService, createSlackService } from '@/lib/notifications/slackService';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { fetchStockXMarketPriceDetailed } from '@/lib/stockx/marketPrice';

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

function normalizeStockXShoeSize(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'Unknown';
  if (s.toLowerCase() === 'unknown') return 'Unknown';
  // Prefer numeric shoe size if present: "US M 8.5" -> "8.5"
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return m[1];
  return s.replace(/^US\s+[MW]\s+/i, '').trim();
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
    try {
      const db = getAdminDb();
      const snap = await db.collection('users').doc(userId).get();
      const data = snap.exists ? (snap.data() as any) : null;
      const webhookUrl = String(data?.deliveriesSlack?.webhookUrl || '').trim();
      if (webhookUrl) {
        slackService = new SlackNotificationService({ webhookUrl, username: 'Delivery Tracker', iconEmoji: ':package:' });
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

    const getBaseUrl = () => {
      const host = request.headers.get('host') || '';
      if (host.includes('solesmarket.com')) return 'https://www.solesmarket.com';
      // Slack links must be publicly reachable. If we're on localhost or an ngrok host,
      // prefer an explicit public base URL (or default to production).
      if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('ngrok')) {
        const explicit =
          process.env.SLACK_LINK_BASE_URL ||
          process.env.NEXT_PUBLIC_BASE_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.APP_URL ||
          '';
        if (explicit) {
          if (!explicit.startsWith('http://') && !explicit.startsWith('https://')) return `https://${explicit}`;
          return explicit;
        }
        return 'https://www.solesmarket.com';
      }
      const envUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        process.env.VERCEL_URL ||
        '';
      if (envUrl) {
        if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) return `https://${envUrl}`;
        return envUrl;
      }
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      return host ? `${proto}://${host}` : 'http://localhost:3000';
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
    
    const deliveries = await Promise.all(purchasesWithTracking.map(async (purchase: any) => {
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
      const productSize = normalizeStockXShoeSize(productSizeRaw);
      const styleId = purchase.styleId || purchase.style_id || null;
      const urlKey = extractStockXUrlKeyFromPurchase(purchase);
      const ids = extractStockXIdsFromPurchase(purchase);
      const purchaseId = String(purchase.id || purchase.purchaseId || purchase.orderNumber || trackingValue || '').trim();
      
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
      if (purchase.lowestAsk) {
        marketPrice = typeof purchase.lowestAsk === 'number' ? purchase.lowestAsk : parseFloat(purchase.lowestAsk);
      } else if (purchase.marketPrice) {
        marketPrice = typeof purchase.marketPrice === 'number' ? purchase.marketPrice : parseFloat(purchase.marketPrice);
      }
      // Sanitize cached market price
      if (marketPrice !== undefined && (!Number.isFinite(marketPrice) || marketPrice <= 0)) {
        marketPrice = undefined;
      }
      if (marketPrice !== undefined) {
        marketDebug.cachedUsed++;
      }
      
      // If no market price cached, fetch real-time from StockX (prioritize styleId for accuracy!)
      if (marketPrice === undefined) {
        // Only skip if it's clearly not on the way (delivered/cancelled/etc)
        if (!isOnTheWayStatus(status)) {
          marketDebug.skippedNotActive++;
        } else {
        const auth = await getStockXAuthForUser(request, userId);
        if (!auth) {
          console.log(`⚠️ Missing STOCKX_API_KEY, skipping price fetch`);
          marketDebug.failedByReason['missing_api_key'] = (marketDebug.failedByReason['missing_api_key'] || 0) + 1;
        } else {
          const hasAuth = Boolean((auth as any).accessToken || (auth as any).refreshToken);
          if (!hasAuth) {
            marketDebug.skippedNoAuth++;
            marketDebug.failedByReason['missing_stockx_tokens'] =
              (marketDebug.failedByReason['missing_stockx_tokens'] || 0) + 1;
          } else {
            const result = await fetchMarketWithControls({
              auth,
              productName,
              size: productSize,
              styleId,
              urlKey,
              productId: ids.productId,
              variantId: ids.variantId,
            });
            if (result.price) {
              marketPrice = result.price;
              marketDebug.fetchedOk++;
              console.log(`✅ Real-time price fetched: ${productName}${styleId ? ` (StyleId: ${styleId})` : ''} = $${marketPrice}`);

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
              if (typeof result.httpStatus === 'number') {
                const key = `${result.stage || 'unknown'}:${result.httpStatus}`;
                marketDebug.failedHttpStatuses[key] = (marketDebug.failedHttpStatuses[key] || 0) + 1;
              }
            }

              // Always attach a market link even if pricing failed, so you can verify the match.
              const stockxUrlKey = (result as any).urlKey as string | undefined;
              const termUsed = (result as any).termUsed as string | undefined;
              const searchTerm = termUsed || styleId || productName;
              const marketUrl = stockxUrlKey
                ? `https://stockx.com/${stockxUrlKey}${productSize ? `?size=${encodeURIComponent(productSize)}` : ''}`
                : `https://stockx.com/search?s=${encodeURIComponent(searchTerm)}`;
              (purchase as any).__marketLink = `<${marketUrl}|Market>`;
          }
        }
        }
      } else {
        console.log(`📦 Using cached price: ${productName} = $${marketPrice}`);
      }
      if (marketPrice !== undefined && (!Number.isFinite(marketPrice) || marketPrice <= 0)) {
        marketPrice = undefined;
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
        productSize,
        trackingNumber: trackingValue,
        carrier: liveTracking?.carrier || purchase.carrier || 'Unknown',
        estimatedDelivery,
        status,
        purchasePrice,
        marketPrice,
        estimatedProfit,
        purchaseLink: purchaseId ? `<${baseUrl}/dashboard?section=purchases&purchaseId=${encodeURIComponent(purchaseId)}|Purchase>` : undefined,
        marketLink: (purchase as any).__marketLink as string | undefined
      };
    }));

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
    const marketPriceNote =
      purchaseCostOnTheWay !== null && marketValueOnTheWay === null && projectedProfitOnTheWay === null
        ? buildMarketNote()
        : null;

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
        deliveries
      });
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
        inTransit
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

