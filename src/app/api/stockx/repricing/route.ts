import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

interface RepricingStrategy {
  type: 'competitive' | 'margin_based' | 'velocity_based' | 'hybrid';
  settings: {
    minProfitMargin?: number;
    maxPriceReduction?: number;
    competitiveBuffer?: number;
    velocityThreshold?: number;
    maxDaysListed?: number;
    aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  };
}

interface IndividualPricingStrategy {
  type:
    | 'queue_focus'
    | 'peek_focus'
    | 'beat_lowest'
    | 'match_lowest'
    | 'percentage_below'
    | 'manual'
    | 'keep_current'
    | 'reset_then_beat_lowest'
    | 'market_peek';
  value?: number;
  manualPrice?: number;
  resetPrice?: number;
  beatBy?: number;
  peekSettings?: {
    frequency: 'hourly' | 'aggressive' | 'balanced' | 'conservative'; // 1h, 4h, 6h, 8h
    lastPeekTime?: string;
  };
}

interface ListingToReprice {
  listingId: string;
  productId: string;
  variantId: string;
  currentPrice: number;
  originalPrice?: number;
  costBasis?: number;
  daysListed?: number;
  views?: number;
  saves?: number;
  // Individual pricing settings
  pricingStrategy?: IndividualPricingStrategy;
  minPrice?: number;
  maxPrice?: number;
  autoDeactivate?: boolean;
  // Market snapshot from previous run (for spam reduction gate)
  lastSeenLowestAsk?: number | null;
  lastSeenFlexLowestAsk?: number | null;
  // Duplicate inventory: fixed reserve price for followers (set once and hold)
  reservePrice?: number | null;
  reservePriceSetAt?: string | null;
  // Market Peek cadence support (persisted in stockxPricingSettings)
  lastPeekTime?: string | null;
}

function normalizePercent(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  // Accept either 0.2 or 20 as "20%"
  return value > 1 ? value / 100 : value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseStockXMoneyToDollars(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // StockX sometimes returns cents (e.g. 12345) and sometimes dollars (e.g. 123)
  return n > 1000 ? n / 100 : n;
}

function toDisplayDollars(askDollars: number | null): number | null {
  if (askDollars === null) return null;
  if (!Number.isFinite(askDollars) || askDollars <= 0) return null;
  // StockX UI displays whole-dollar asks. When the API returns cents (e.g. 250.5),
  // the UI rounds up. Use ceil so "$1 below lowest" matches what you see (251 -> 250),
  // instead of undercutting by $2 due to flooring (250.50 - 1 => 249.50 -> 249).
  return Math.ceil(askDollars);
}

function minPositive(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function equalNullableNumber(a: unknown, b: unknown): boolean {
  const na = typeof a === 'number' && Number.isFinite(a) ? a : null;
  const nb = typeof b === 'number' && Number.isFinite(b) ? b : null;
  return na === nb;
}

function marketPeekIntervalMs(freq: string | undefined): number {
  switch (freq) {
    case 'hourly':
      return 60 * 60 * 1000;
    case 'aggressive':
      return 4 * 60 * 60 * 1000;
    case 'balanced':
      return 6 * 60 * 60 * 1000;
    case 'conservative':
    default:
      return 8 * 60 * 60 * 1000;
  }
}

function isStuckAtResetPrice(currentPrice: unknown): boolean {
  return typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice >= 900;
}

function computeRecoveryPrice(listing: ListingData): number | null {
  // Best-effort: if we ever get left at a "peek/reset" sentinel price (e.g. $999),
  // fall back to Min if present. This is strictly better than remaining at $999.
  if (isFiniteNumber(listing.minPrice) && listing.minPrice > 0) return Math.round(listing.minPrice);
  // If no Min is set, we don't have a universally "safe" fallback without market data.
  return null;
}

// Prevent overlapping Two-step runs (cron + manual save, multiple tabs, etc.).
// Two-step is multi-step (set $999 -> refetch -> set final). Overlaps can interleave and leave the listing at $999.
const TWO_STEP_LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes
type TwoStepLock = { acquired: boolean; runId: string; lockedUntilMs: number };

async function acquireTwoStepLock(listingId: string, holder?: string | null): Promise<TwoStepLock> {
  const runId = (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  try {
    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn('⚠️ Two-step lock disabled: Firebase Admin not initialized');
      return { acquired: true, runId, lockedUntilMs: Date.now() + TWO_STEP_LOCK_TTL_MS };
    }

    const ref = adminDb.collection('stockxTwoStepLocks').doc(String(listingId).trim());
    const now = Date.now();
    const lockedUntilMs = now + TWO_STEP_LOCK_TTL_MS;
    const nowIso = new Date(now).toISOString();

    const acquired = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as any) : null;
      const curUntil =
        typeof cur?.lockedUntilMs === 'number' && Number.isFinite(cur.lockedUntilMs) ? cur.lockedUntilMs : 0;
      if (curUntil && curUntil > now) return false;

      tx.set(
        ref,
        {
          listingId: String(listingId).trim(),
          runId,
          holder: holder || null,
          lockedUntilMs,
          lockedUntil: new Date(lockedUntilMs).toISOString(),
          updatedAt: nowIso,
          createdAt: snap.exists ? cur?.createdAt || nowIso : nowIso,
        },
        { merge: true }
      );
      return true;
    });

    return { acquired, runId, lockedUntilMs };
  } catch (e) {
    console.warn('⚠️ Two-step lock acquire failed (continuing without lock):', e);
    return { acquired: true, runId, lockedUntilMs: Date.now() + TWO_STEP_LOCK_TTL_MS };
  }
}

async function releaseTwoStepLock(listingId: string, runId: string): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return;
    const ref = adminDb.collection('stockxTwoStepLocks').doc(String(listingId).trim());
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const cur = snap.data() as any;
      if (cur?.runId && cur.runId !== runId) return;
      tx.delete(ref);
    });
  } catch (e) {
    // best-effort; TTL will auto-expire
    console.warn('⚠️ Two-step lock release failed:', e);
  }
}

async function pollListingOperationStatus(args: {
  listingId: string;
  operationId: string;
  accessToken: string;
  timeoutMs?: number;
}) {
  const { listingId, operationId, accessToken } = args;
  const timeoutMs = args.timeoutMs ?? 30_000;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';

  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const statusResponse = await fetch(
        `https://api.stockx.com/v2/selling/listings/${listingId}/operations/${operationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-API-Key': apiKey,
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        }
      );

      if (!statusResponse.ok) {
        // Keep polling on transient failures
        continue;
      }

      const statusData = await statusResponse.json();
      const status: string | undefined = statusData.operationStatus;

      const successStatuses = new Set(['SUCCEEDED', 'SUCCESSFUL', 'COMPLETED']);
      const failureStatuses = new Set(['FAILED', 'ERROR']);
      const pendingStatuses = new Set(['PENDING', 'IN_PROGRESS']);

      if (status && successStatuses.has(status)) {
        return { complete: true, success: true, status, attempts, data: statusData };
      }
      if (status && failureStatuses.has(status)) {
        return { complete: true, success: false, status, attempts, data: statusData };
      }
      if (status && pendingStatuses.has(status)) {
        continue;
      }

      // Unknown status: keep polling for a bit
    } catch {
      // keep polling
    }
  }

  return { complete: false, success: true, status: 'TIMEOUT', attempts };
}

export async function POST(request: NextRequest) {
  try {
    // Try to get access token from Authorization header first (for cron jobs), then from cookies
    let accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
    let refreshToken: string | undefined;
    const userId = request.headers.get('x-user-id'); // Get user ID from cron job
    
    console.log('🔍 Repricing API - Auth header:', request.headers.get('authorization') ? 'Present' : 'Missing');
    console.log('🔍 Access token from header:', accessToken ? 'Present' : 'None');
    console.log('🔍 User ID from header:', userId || 'None');
    
    if (!accessToken) {
      // Fall back to cookies for browser requests
      const cookieStore = cookies();
      accessToken = cookieStore.get('stockx_access_token')?.value;
      refreshToken = cookieStore.get('stockx_refresh_token')?.value;
      console.log('🔍 Access token from cookies:', accessToken ? 'Present' : 'None');
    } else if (userId) {
      // If we have a user ID from cron job, load refresh token from Firebase
      try {
        const { getAdminDb } = await import('@/lib/firebase/admin');
        const adminDb = getAdminDb();
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();
        refreshToken = userData?.stockxTokens?.refresh_token;
        console.log('🔍 Loaded refresh token from Firebase:', refreshToken ? 'Present' : 'Missing');
      } catch (error) {
        console.log('⚠️ Could not load refresh token from Firebase:', error);
      }
    }
    
    if (!accessToken) {
      console.log('❌ No access token found in headers or cookies');
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }
    
    console.log('✅ Access token available for repricing');

    const { 
      listings, 
      strategy, 
      dryRun = true,
      notificationEmail,
      useIndividualStrategies = false,
      minPriceChange,
      allowTwoStep = false,
      forceTwoStepPeek = false
    }: {
      listings: ListingToReprice[];
      strategy: RepricingStrategy;
      dryRun?: boolean;
      notificationEmail?: string;
      useIndividualStrategies?: boolean;
      minPriceChange?: number;
      allowTwoStep?: boolean;
      forceTwoStepPeek?: boolean;
    } = await request.json();

    console.log(`🔄 Starting repricing for ${listings.length} listings (dry run: ${dryRun})`);
    console.log(`🎯 Using individual strategies: ${useIndividualStrategies}`);

    // Per-request market data cache to reduce upstream calls (StockX can 429).
    const MARKET_CACHE_TTL_MS = 30_000;
    const marketCache = new Map<string, { ts: number; data: any }>();
    const marketInFlight = new Map<string, Promise<any>>();
    const marketKeyFor = (productId: string, variantId: string) => `${productId}:${variantId}`;
    const getMarketData = async (
      productId: string,
      variantId: string,
      opts?: { bustCache?: boolean }
    ) => {
      const bustCache = opts?.bustCache === true;
      const key = marketKeyFor(productId, variantId);
      if (!bustCache) {
        const cached = marketCache.get(key);
        if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS) return cached.data;
        const inFlight = marketInFlight.get(key);
        if (inFlight) return await inFlight;
      }

      const p = fetchMarketData(productId, variantId, accessToken);
      if (!bustCache) marketInFlight.set(key, p);
      try {
        const data = await p;
        if (!bustCache) marketCache.set(key, { ts: Date.now(), data });
        return data;
      } finally {
        if (!bustCache) marketInFlight.delete(key);
      }
    };

    const repricingResults = [];
    const errors = [];
    let tokenRefreshed = false;

    // Duplicate-inventory behavior:
    // If a user has multiple identical listings (same productId+variantId) and they are using the
    // Two-step strategy, we only run Two-step on ONE "leader" listing and price the remaining
    // listings as a reserve stack at a fixed multiplier of the current best ask.
    //
    // This matches the common selling reality: only the lowest-priced identical listing sells first,
    // so keeping the rest high avoids racing yourself downward while still keeping inventory listed.
    const RESERVE_MULTIPLIER = 2.5;
    const RESERVE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // refresh followers every 7 days
    const groupKeyFor = (l: ListingToReprice) => `${l.productId}__${l.variantId}`;
    const groupCandidates = new Map<string, ListingToReprice[]>();
    for (const l of listings) {
      if (useIndividualStrategies && l.pricingStrategy?.type === 'reset_then_beat_lowest') {
        const key = groupKeyFor(l);
        const arr = groupCandidates.get(key) || [];
        arr.push(l);
        groupCandidates.set(key, arr);
      }
    }
    const groupLeaderByKey = new Map<string, string>();
    for (const [key, arr] of groupCandidates.entries()) {
      // Only apply this behavior for groups with duplicates (2+ listings).
      if (arr.length < 2) continue;
      // Choose a stable leader: lowest currentPrice, then listingId tiebreaker.
      const sorted = [...arr].sort((a, b) => {
        if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice;
        return String(a.listingId).localeCompare(String(b.listingId));
      });
      groupLeaderByKey.set(key, sorted[0].listingId);
    }

    for (const listing of listings) {
      try {
        const isTwoStepStrategy =
          useIndividualStrategies && listing.pricingStrategy?.type === 'reset_then_beat_lowest';
        // If the two-step strategy performs the temporary reset (step 1), the listing's *actual* current
        // price becomes `resetPrice` (e.g. 999) even though `listing.currentPrice` still reflects the
        // original price passed into this API. We must compare against the effective current price to
        // avoid incorrectly short-circuiting and leaving the listing stuck at the reset value.
        let comparisonCurrentPrice = listing.currentPrice;
        let didTemporaryReset = false;
        let twoStepMeta:
          | {
              resetPrice: number;
              beatBy: number;
              // Standard + flex asks used for decisions (in dollars)
              initialLowestAsk?: number | null;
              initialFlexLowestAsk?: number | null;
              competitorLowestAsk?: number | null;
              competitorFlexLowestAsk?: number | null;
              mode?: 'peek_next_lowest' | 'direct_undercut';
              resetOperationId?: string;
              resetOperationStatus?: string;
              finalOperationId?: string;
              finalOperationStatus?: string;
              revertOperationId?: string;
              revertOperationStatus?: string;
            }
          | undefined;

        // Get current market data
        let marketData;
        try {
          marketData = await getMarketData(listing.productId, listing.variantId);
        } catch (error: any) {
          // If we get a 401 and haven't tried refreshing yet, refresh the token
          if (error.message?.includes('401') && !tokenRefreshed && refreshToken) {
            console.log('🔄 Token expired, attempting refresh...');
            const refreshResult = await refreshStockXTokens(refreshToken);
            
            if (refreshResult.success && refreshResult.accessToken) {
              accessToken = refreshResult.accessToken;
              tokenRefreshed = true;
              console.log('✅ Token refreshed successfully');
              
              // Retry fetching market data with new token
              try {
                marketData = await getMarketData(listing.productId, listing.variantId, { bustCache: true });
              } catch (retryErr: any) {
                const retryMsg = String(retryErr?.message || retryErr);
                // If the retry got rate-limited, treat it as a soft skip (do NOT throw).
                if (retryMsg.includes('429')) {
                  console.warn(
                    `⏳ Rate limited (429) fetching market data after token refresh; skipping listing ${listing.listingId} for now.`
                  );
                  // Recovery: if the listing is stuck at a peek/reset sentinel price (e.g. $999),
                  // bring it back down to Min even when market data is unavailable.
                  const recoveryPrice = computeRecoveryPrice(listing);
                  if (!dryRun && isStuckAtResetPrice(listing.currentPrice) && recoveryPrice !== null) {
                    const recovery = await updateListingPrice(listing.listingId, recoveryPrice, accessToken, {
                      waitForCompletion: true,
                      timeoutMs: 30_000,
                    });
                    repricingResults.push({
                      listingId: listing.listingId,
                      currentPrice: listing.currentPrice,
                      newPrice: recoveryPrice,
                      action: recovery.success ? 'updated' : 'failed',
                      reason: recovery.success
                        ? `Recovered from high price while market is rate-limited (set to Min $${recoveryPrice})`
                        : `Recovery failed while market is rate-limited: ${recovery.error || 'Unknown error'}`,
                      operationId: recovery.operation?.operationId,
                      operationStatus: recovery.operationStatus,
                      market: { lowestAsk: null, flexLowestAsk: null },
                    });
                    continue;
                  }

                  repricingResults.push({
                    listingId: listing.listingId,
                    currentPrice: listing.currentPrice,
                    newPrice: listing.currentPrice,
                    action: 'no_change',
                    reason: 'Skipped: rate limited fetching market data (429). Will retry on next run.',
                    market: { lowestAsk: null, flexLowestAsk: null },
                  });
                  continue;
                }
                throw retryErr;
              }
            } else {
              throw new Error('Token refresh failed: ' + refreshResult.error);
            }
          } else {
            const msg = String(error?.message || error);
            // Rate limited: treat as a soft skip so one 429 doesn't "fail" a listing.
            if (msg.includes('429')) {
              console.warn(`⏳ Rate limited (429) fetching market data; skipping listing ${listing.listingId} for now.`);
              // Recovery: if the listing is stuck at a peek/reset sentinel price (e.g. $999),
              // bring it back down to Min even when market data is unavailable.
              const recoveryPrice = computeRecoveryPrice(listing);
              if (!dryRun && isStuckAtResetPrice(listing.currentPrice) && recoveryPrice !== null) {
                const recovery = await updateListingPrice(listing.listingId, recoveryPrice, accessToken, {
                  waitForCompletion: true,
                  timeoutMs: 30_000,
                });
                repricingResults.push({
                  listingId: listing.listingId,
                  currentPrice: listing.currentPrice,
                  newPrice: recoveryPrice,
                  action: recovery.success ? 'updated' : 'failed',
                  reason: recovery.success
                    ? `Recovered from high price while market is rate-limited (set to Min $${recoveryPrice})`
                    : `Recovery failed while market is rate-limited: ${recovery.error || 'Unknown error'}`,
                  operationId: recovery.operation?.operationId,
                  operationStatus: recovery.operationStatus,
                  market: { lowestAsk: null, flexLowestAsk: null },
                });
                continue;
              }

              repricingResults.push({
                listingId: listing.listingId,
                currentPrice: listing.currentPrice,
                newPrice: listing.currentPrice,
                action: 'no_change',
                reason: 'Skipped: rate limited fetching market data (429). Will retry on next run.',
                market: { lowestAsk: null, flexLowestAsk: null },
              });
              continue;
            }
            throw error;
          }
        }
        
        if (!marketData) {
          errors.push(`No market data for listing ${listing.listingId}`);
          continue;
        }

        // Market snapshot (dollars) for logging + persistence + change detection
        const currentStdAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).lowestAskAmount));
        const currentFlexAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).flexLowestAskAmount));

        // Calculate new price based on strategy
        let newPrice: number;
        let skipReason: string | null = null;

        // If this listing is part of a duplicate group running Two-step, only the leader runs Two-step.
        // All other listings get priced to a reserve price (multiplier of current best ask).
        const groupKey = groupKeyFor(listing);
        const groupLeaderId = groupLeaderByKey.get(groupKey);
        const isDuplicateTwoStepGroup = !!groupLeaderId && useIndividualStrategies && isTwoStepStrategy;
        const isReserveFollower = isDuplicateTwoStepGroup && listing.listingId !== groupLeaderId;
        
        if (useIndividualStrategies && listing.pricingStrategy) {
          // Spam-reduction gate for Two-step:
          // If market asks haven't changed since last run AND you're still effectively winning,
          // skip repricing (standard ties count as WIN; flex ties/undercuts beat you).
          if (
            listing.pricingStrategy.type === 'reset_then_beat_lowest' &&
            allowTwoStep === true &&
            dryRun === false
          ) {
            // If current price violates user safety bounds, never skip.
            // Users may change Min/Max while market is unchanged; we must still clamp to the new bounds.
            const hasMinBound = isFiniteNumber(listing.minPrice);
            const hasMaxBound = isFiniteNumber(listing.maxPrice);
            const violatesBounds =
              (hasMinBound && listing.currentPrice < listing.minPrice!) ||
              (hasMaxBound && listing.currentPrice > listing.maxPrice!);

            // If flex is <= your price, you are NOT winning (flex wins).
            const losingToFlex = currentFlexAsk !== null && currentFlexAsk <= listing.currentPrice;
            // If standard is < your price, you are NOT winning.
            const losingToStd = currentStdAsk !== null && currentStdAsk < listing.currentPrice;
            const hasAnyAsk = currentStdAsk !== null || currentFlexAsk !== null;
            const isWinning = hasAnyAsk ? (!losingToFlex && !losingToStd) : false;

            const unchanged =
              equalNullableNumber(listing.lastSeenLowestAsk, currentStdAsk) &&
              equalNullableNumber(listing.lastSeenFlexLowestAsk, currentFlexAsk);

            // If the caller explicitly forces a Two-step peek (manual Save), do NOT skip even if market is unchanged.
            if (unchanged && isWinning && !violatesBounds && forceTwoStepPeek !== true) {
              console.log(
                `⏭️ Two-step skip (market unchanged + already winning): ${listing.listingId} ` +
                  `(price=$${listing.currentPrice}, lowestAsk=${currentStdAsk ?? 'null'}, flexLowestAsk=${currentFlexAsk ?? 'null'}, ` +
                  `lastSeenLowestAsk=${listing.lastSeenLowestAsk ?? 'null'}, lastSeenFlexLowestAsk=${listing.lastSeenFlexLowestAsk ?? 'null'})`
              );
              repricingResults.push({
                listingId: listing.listingId,
                currentPrice: listing.currentPrice,
                newPrice: listing.currentPrice,
                action: 'no_change',
                reason: 'Market unchanged and already winning (standard ties = win; flex ties/undercuts beat you)',
                market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
              });
              continue;
            }
          }

          if (isReserveFollower) {
            const stdAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).lowestAskAmount));
            const flexAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).flexLowestAskAmount));
            const bestAsk = minPositive(stdAsk, flexAsk);
            if (bestAsk === null) {
              repricingResults.push({
                listingId: listing.listingId,
                currentPrice: listing.currentPrice,
                newPrice: listing.currentPrice,
                action: 'no_change',
                reason: 'Reserve pricing skipped: no lowest ask available',
                market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
              });
              continue;
            }
            // Reserve behavior (duplicate inventory):
            // Keep non-leader units far above the active unit so you don't compete against yourself.
            // We only ever move reserves UP (never down), so reserves remain "safe" and stable.
            const storedReserve =
              typeof listing.reservePrice === 'number' && Number.isFinite(listing.reservePrice) && listing.reservePrice > 0
                ? Math.max(1, Math.round(listing.reservePrice))
                : null;
            const computedReserve = Math.max(1, Math.round(bestAsk * RESERVE_MULTIPLIER));
            newPrice = storedReserve !== null ? Math.max(storedReserve, computedReserve) : computedReserve;

            skipReason =
              storedReserve === null
                ? `Reserve pricing: duplicate inventory (leader ${groupLeaderId} runs Two-step). Set to ${RESERVE_MULTIPLIER}x best ask ($${bestAsk} → $${newPrice})`
                : storedReserve >= computedReserve
                  ? `Reserve pricing: duplicate inventory (leader ${groupLeaderId} runs Two-step). Hold $${newPrice} (>= ${RESERVE_MULTIPLIER}x $${bestAsk})`
                  : `Reserve pricing: duplicate inventory (leader ${groupLeaderId} runs Two-step). Raise to ${RESERVE_MULTIPLIER}x best ask ($${bestAsk} → $${newPrice})`;
          } else
          // Special case: two-step strategy (temporary reset to a high price, then undercut)
          if (listing.pricingStrategy.type === 'reset_then_beat_lowest') {
            const resetPrice = isFiniteNumber(listing.pricingStrategy.resetPrice)
              ? listing.pricingStrategy.resetPrice
              : 999;
            // Two-step is intentionally hardcoded to undercut by $1 (no per-listing input).
            // Ignore any legacy beatBy/value values stored in settings.
            const beatBy = 1;
            twoStepMeta = { resetPrice, beatBy };

            // Compute the final target price from current market
            const initialLowestAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).lowestAskAmount));
            const initialFlexLowestAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).flexLowestAskAmount));
            const initialBestAsk = minPositive(initialLowestAsk, initialFlexLowestAsk);
            const computedFinal = initialBestAsk !== null ? Math.max(1, initialBestAsk - beatBy) : listing.currentPrice;
            const shouldPeekNextLowest = forceTwoStepPeek
              ? true
              : initialBestAsk !== null
                ? listing.currentPrice <= initialBestAsk
                : true;
            twoStepMeta.initialLowestAsk = initialLowestAsk;
            twoStepMeta.initialFlexLowestAsk = initialFlexLowestAsk;
            twoStepMeta.mode = shouldPeekNextLowest ? 'peek_next_lowest' : 'direct_undercut';

            if (!allowTwoStep) {
              repricingResults.push({
                listingId: listing.listingId,
                currentPrice: listing.currentPrice,
                newPrice: listing.currentPrice,
                action: 'no_change',
                reason: 'Two-step strategy blocked (allowTwoStep=false)',
                market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                twoStep: {
                  ...twoStepMeta,
                  computedFinal
                }
              });
              continue;
            }

            // IMPORTANT: Min/Max bounds should prevent unnecessary $999 peeks.
            // If the final undercut would be clamped to Min/Max anyway, skip the reset step entirely to reduce
            // StockX push notification spam. We still fetch market data every run, so when market rises above Min,
            // Two-step can resume automatically.
            const hasMinBound = isFiniteNumber(listing.minPrice);
            const hasMaxBound = isFiniteNumber(listing.maxPrice);
            const boundedTarget = (() => {
              let t = computedFinal;
              if (hasMinBound) t = Math.max(listing.minPrice!, t);
              if (hasMaxBound) t = Math.min(listing.maxPrice!, t);
              return t;
            })();

            if (!forceTwoStepPeek && !dryRun && boundedTarget !== computedFinal) {
              // Do NOT peek/reset if we'd just clamp. Set directly to the bounded value.
              newPrice = boundedTarget;
              skipReason =
                hasMinBound && boundedTarget === listing.minPrice
                  ? `Two-step skipped: market under Min ($${listing.minPrice})`
                  : hasMaxBound && boundedTarget === listing.maxPrice
                    ? `Two-step skipped: market over Max ($${listing.maxPrice})`
                    : 'Two-step skipped: bounded target differs';
              twoStepMeta = { ...twoStepMeta, computedFinal } as any;
              // continue into the normal constraint/update pipeline with newPrice already bounded
            } else
            // For dry runs we still want to apply constraints/thresholds below,
            // so we set newPrice here and fall through into the normal pipeline.
            if (dryRun) {
              newPrice = computedFinal;
              skipReason = shouldPeekNextLowest
                ? `Two-step (dry-run): would set $${resetPrice} to reveal next-lowest ask, then undercut by $${beatBy}`
                : initialBestAsk !== null
                  ? `Two-step not needed (already not lowest): undercut $${initialBestAsk} - $${beatBy} = $${computedFinal}`
                  : 'Two-step: no market ask available';
              twoStepMeta = {
                ...twoStepMeta,
                computedFinal
              } as any;
            } else {
              // If we're NOT currently the lowest ask, don't do the risky reset step
              // unless the caller explicitly requested a forced peek.
              // Just undercut the current lowest ask directly.
              if (!forceTwoStepPeek && !shouldPeekNextLowest) {
                newPrice = computedFinal;
                twoStepMeta = {
                  ...twoStepMeta,
                  mode: 'direct_undercut',
                  computedFinal
                } as any;
              } else {
              // If this is a duplicate-inventory Two-step group, push reserve followers UP first
              // so the "next lowest ask" revealed by the $999 peek is a real competitor (not your own other unit).
              if (!dryRun) {
                const key = groupKeyFor(listing);
                const leaderIdForKey = groupLeaderByKey.get(key);
                const isLeader = !!leaderIdForKey && listing.listingId === leaderIdForKey;
                const groupArr = groupCandidates.get(key) || [];
                const shouldPreRaiseFollowers = isLeader && groupArr.length > 1;
                if (shouldPreRaiseFollowers) {
                  const stdAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).lowestAskAmount));
                  const flexAsk = toDisplayDollars(parseStockXMoneyToDollars((marketData as any).flexLowestAskAmount));
                  const bestAsk = minPositive(stdAsk, flexAsk);
                  if (bestAsk !== null) {
                    const reserveTarget = Math.max(1, Math.round(bestAsk * RESERVE_MULTIPLIER));
                    const followerIds = groupArr.map(a => a.listingId).filter(id => id !== leaderIdForKey);
                    for (const followerId of followerIds) {
                      // Best-effort: only raise if follower is below target (avoid churn).
                      const follower = groupArr.find(a => a.listingId === followerId);
                      const followerCur = typeof follower?.currentPrice === 'number' ? follower.currentPrice : Number.NaN;
                      if (Number.isFinite(followerCur) && followerCur >= reserveTarget) continue;
                      await updateListingPrice(followerId, reserveTarget, accessToken, {
                        waitForCompletion: true,
                        timeoutMs: 30_000
                      });
                    }
                    // Give StockX a moment to reflect follower updates before we peek.
                    await new Promise(r => setTimeout(r, 2500));
                    // Refresh market snapshot after moving followers up.
                    try {
                      marketData = await getMarketData(listing.productId, listing.variantId, { bustCache: true });
                    } catch {
                      // ignore; we'll still proceed with the peek/reset
                    }
                  }
                }
              }
              // Prevent overlapping Two-step sequences for the same listingId.
              // If another run is already in-flight, skip (do NOT set $999).
              const lock = await acquireTwoStepLock(listing.listingId, userId || null);
              if (!lock.acquired) {
                repricingResults.push({
                  listingId: listing.listingId,
                  currentPrice: listing.currentPrice,
                  newPrice: listing.currentPrice,
                  action: 'no_change',
                  reason: 'Two-step skipped: another run is already in progress',
                  market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                  twoStep: {
                    ...twoStepMeta,
                    mode: 'peek_next_lowest',
                    lock: { acquired: false, lockedUntilMs: lock.lockedUntilMs }
                  }
                });
                continue;
              }

              try {
              // Step 1: set to reset price (intentionally may violate maxPrice; it's temporary)
              const resetResult = await updateListingPrice(listing.listingId, resetPrice, accessToken, {
                waitForCompletion: true,
                timeoutMs: 30_000
              });
              if (!resetResult.success) {
                repricingResults.push({
                  listingId: listing.listingId,
                  currentPrice: listing.currentPrice,
                  newPrice: listing.currentPrice,
                  action: 'failed',
                  reason: `Two-step reset failed: ${resetResult.error || 'Unknown error'}`,
                  market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                  twoStep: {
                    ...twoStepMeta,
                    mode: 'peek_next_lowest',
                    lock: { acquired: true, lockedUntilMs: lock.lockedUntilMs },
                    resetOperationId: resetResult.operation?.operationId,
                    resetOperationStatus: resetResult.operationStatus
                  }
                });
                continue;
              }
  
              if (twoStepMeta) {
                twoStepMeta.resetOperationId = resetResult.operation?.operationId;
                twoStepMeta.resetOperationStatus = resetResult.operationStatus;
                (twoStepMeta as any).lock = { acquired: true, lockedUntilMs: lock.lockedUntilMs };
              }

              // From this point onward, the listing is (very likely) set to resetPrice on StockX.
              // Ensure all subsequent "no_change" checks compare against the reset price, otherwise
              // we can incorrectly skip the final revert/update and leave the listing at $999.
              didTemporaryReset = true;
              comparisonCurrentPrice = resetPrice;
  
              // Small delay, then refetch market data and compute final undercut price
              try {
                // After a reset, StockX can take a moment to reflect the new competitive landscape.
                // Retry a few times to avoid leaving the listing stuck at the temporary reset price.
                let refreshedMarket: any | null = null;
                let competitorLowestAsk: number | null = null;
                let competitorFlexLowestAsk: number | null = null;
                let competitorBestAsk: number | null = null;

                for (let attempt = 0; attempt < 4; attempt++) {
                  // 1.5s, 2.5s, 3.5s, 4.5s
                  await new Promise(resolve => setTimeout(resolve, 1500 + attempt * 1000));
                  refreshedMarket = await getMarketData(listing.productId, listing.variantId, { bustCache: true });

                  competitorLowestAsk = toDisplayDollars(parseStockXMoneyToDollars((refreshedMarket as any).lowestAskAmount));
                  competitorFlexLowestAsk = toDisplayDollars(parseStockXMoneyToDollars((refreshedMarket as any).flexLowestAskAmount));
                  competitorBestAsk = minPositive(competitorLowestAsk, competitorFlexLowestAsk);

                  if (competitorBestAsk !== null) break;
                }

                // Use refreshed market data for competitivePosition calculations (even if asks are null)
                if (refreshedMarket) marketData = refreshedMarket;

                if (competitorBestAsk === null) {
                  // We performed the temporary reset, but couldn't read a valid ask afterwards.
                  // Revert to the original price so the listing is never left at $999.
                  const revert = await updateListingPrice(listing.listingId, listing.currentPrice, accessToken, {
                    waitForCompletion: true,
                    timeoutMs: 30_000
                  });
                  if (twoStepMeta) {
                    twoStepMeta.competitorLowestAsk = competitorLowestAsk;
                    twoStepMeta.competitorFlexLowestAsk = competitorFlexLowestAsk;
                    twoStepMeta.computedFinal = listing.currentPrice;
                    twoStepMeta.revertOperationId = revert.operation?.operationId;
                    twoStepMeta.revertOperationStatus = revert.operationStatus;
                  }
                  repricingResults.push({
                    listingId: listing.listingId,
                    currentPrice: listing.currentPrice,
                    newPrice: listing.currentPrice,
                    action: 'failed',
                    reason: `Two-step failed: no lowest ask available after reset. Revert ${revert.success ? 'succeeded' : 'failed'}.`,
                    market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                    twoStep: twoStepMeta
                  });
                  continue;
                }

                newPrice = Math.max(1, competitorBestAsk - beatBy);

                // Attach metadata for transparency
                twoStepMeta = {
                  ...twoStepMeta,
                  mode: 'peek_next_lowest',
                  competitorLowestAsk,
                  competitorFlexLowestAsk,
                  computedFinal: newPrice
                } as any;
              } catch (err: any) {
                // If anything fails after the reset succeeded, attempt to revert to the original price.
                const message = err instanceof Error ? err.message : String(err);
                const revert = await updateListingPrice(listing.listingId, listing.currentPrice, accessToken, {
                  waitForCompletion: true,
                  timeoutMs: 30_000
                });
                if (twoStepMeta) {
                  twoStepMeta.revertOperationId = revert.operation?.operationId;
                  twoStepMeta.revertOperationStatus = revert.operationStatus;
                }
                repricingResults.push({
                  listingId: listing.listingId,
                  currentPrice: listing.currentPrice,
                  newPrice: listing.currentPrice,
                  action: 'failed',
                  reason: `Two-step failed after reset: ${message}. Revert ${revert.success ? 'succeeded' : 'failed'}.`,
                  market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                  twoStep: twoStepMeta
                });
                continue;
              }
  
              // Continue into the normal constraint/safety/update pipeline for final price
              } finally {
                await releaseTwoStepLock(listing.listingId, lock.runId);
              }
              }
            }

          } else if (listing.pricingStrategy.type === 'queue_focus') {
            // Queue Focus:
            // - Goal: avoid churn that can lose tie-queue priority; do NOT use $999 peeks.
            // - If you're winning, hold price.
            // - If you're not winning, match best ask (no undercut).
            const hasAnyAsk = currentStdAsk !== null || currentFlexAsk !== null;
            const bestAsk = minPositive(currentStdAsk, currentFlexAsk);

            const losingToFlex = currentFlexAsk !== null && currentFlexAsk <= listing.currentPrice;
            const losingToStd = currentStdAsk !== null && currentStdAsk < listing.currentPrice;
            const isWinning = hasAnyAsk ? (!losingToFlex && !losingToStd) : false;

            if (!bestAsk) {
              newPrice = listing.currentPrice;
              skipReason = 'Queue focus: no lowest ask available';
            } else if (isWinning) {
              newPrice = listing.currentPrice;
              skipReason = 'Queue focus: already winning (hold price)';
            } else {
              newPrice = Math.max(1, bestAsk);
              skipReason = `Queue focus: match best ask ($${bestAsk} → $${newPrice})`;
            }
          } else if (listing.pricingStrategy.type === 'market_peek' || listing.pricingStrategy.type === 'peek_focus') {
            // Market Peek strategy:
            // - If you're NOT winning, undercut best ask immediately.
            // - If you ARE winning, and the peek is due, temporarily raise to a high price to reveal the next-lowest,
            //   then raise to (nextLowestAsk - $1).
            // - Runs at most once per configured interval (default 6h; user may set hourly).

            const beatBy = 1;
            const resetPrice = 999;

            const hasAnyAsk = currentStdAsk !== null || currentFlexAsk !== null;
            const bestAsk = minPositive(currentStdAsk, currentFlexAsk);

            // Winning logic: standard ties count as WIN; flex ties/undercuts beat you.
            const losingToFlex = currentFlexAsk !== null && currentFlexAsk <= listing.currentPrice;
            const losingToStd = currentStdAsk !== null && currentStdAsk < listing.currentPrice;
            const isWinning = hasAnyAsk ? (!losingToFlex && !losingToStd) : false;

            const freq = listing.pricingStrategy.peekSettings?.frequency || 'balanced';
            const intervalMs = marketPeekIntervalMs(freq);
            const lastPeekIso =
              listing.pricingStrategy.peekSettings?.lastPeekTime ||
              (typeof listing.lastPeekTime === 'string' ? listing.lastPeekTime : null) ||
              null;
            const lastPeekMs = lastPeekIso ? Date.parse(lastPeekIso) : Number.NaN;
            const due = !Number.isFinite(lastPeekMs) || Date.now() - lastPeekMs >= intervalMs;

            if (!bestAsk) {
              // No market ask available; do nothing.
              newPrice = listing.currentPrice;
              skipReason = 'Market peek skipped: no lowest ask available';
            } else if (!isWinning) {
              // If you're not winning, behave like competitive mode immediately.
              newPrice = Math.max(1, bestAsk - beatBy);
              skipReason = `Market peek: not winning. Undercut best ask ($${bestAsk} → $${newPrice})`;
            } else if (!due) {
              newPrice = listing.currentPrice;
              skipReason = `Market peek not due yet (${freq})`;
            } else if (dryRun) {
              // Dry-run: simulate what we'd do, but don't actually do the temporary reset.
              newPrice = listing.currentPrice;
              skipReason = `Market peek (dry-run): would raise to $${resetPrice}, then set to (nextLowestAsk - $${beatBy})`;
            } else {
              // Queue safety: if you're pinned at Min, do NOT do the temporary reset.
              // Resetting to $999 can cause you to lose tie-queue priority at Min, which hurts high-volume SKUs.
              const hasMinBound = isFiniteNumber(listing.minPrice);
              const pinnedAtMin =
                hasMinBound && listing.currentPrice <= (listing.minPrice as number) + 0.01;
              if (pinnedAtMin) {
                newPrice = listing.currentPrice;
                skipReason = `Market peek skipped: at Min ($${listing.minPrice}) — preserve queue`;
                // Treat this as a "peek attempt" for cadence purposes so cron doesn't try every run.
                (listing as any).lastPeekTime = new Date().toISOString();
                (listing as any).__peekMeta = {
                  frequency: freq,
                  lastPeekTime: (listing as any).lastPeekTime,
                  resetPrice,
                  beatBy,
                  skippedDueToMin: true
                };
            } else {
              // Perform the peek: temporarily raise, refetch market, then raise to next-lowest - $1.
              const originalPrice = listing.currentPrice;

              const resetResult = await updateListingPrice(listing.listingId, resetPrice, accessToken, {
                waitForCompletion: true,
                timeoutMs: 30_000
              });

              if (!resetResult.success) {
                repricingResults.push({
                  listingId: listing.listingId,
                  currentPrice: listing.currentPrice,
                  newPrice: listing.currentPrice,
                  action: 'failed',
                  reason: `Market peek reset failed: ${resetResult.error || 'Unknown error'}`,
                  market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                  peek: {
                    frequency: freq,
                    lastPeekTime: new Date().toISOString(),
                    resetPrice,
                    beatBy,
                    resetOperationId: resetResult.operation?.operationId,
                    resetOperationStatus: resetResult.operationStatus
                  }
                } as any);
                continue;
              }

              didTemporaryReset = true;
              comparisonCurrentPrice = resetPrice;

              let competitorLowestAsk: number | null = null;
              let competitorFlexLowestAsk: number | null = null;
              let competitorBestAsk: number | null = null;
              let refreshedMarket: any | null = null;

              try {
                for (let attempt = 0; attempt < 4; attempt++) {
                  await new Promise(resolve => setTimeout(resolve, 1500 + attempt * 1000));
                  refreshedMarket = await getMarketData(listing.productId, listing.variantId, { bustCache: true });

                  competitorLowestAsk = toDisplayDollars(parseStockXMoneyToDollars((refreshedMarket as any).lowestAskAmount));
                  competitorFlexLowestAsk = toDisplayDollars(parseStockXMoneyToDollars((refreshedMarket as any).flexLowestAskAmount));
                  competitorBestAsk = minPositive(competitorLowestAsk, competitorFlexLowestAsk);
                  if (competitorBestAsk !== null) break;
                }

                if (refreshedMarket) marketData = refreshedMarket;

                if (competitorBestAsk === null) {
                  const revert = await updateListingPrice(listing.listingId, originalPrice, accessToken, {
                    waitForCompletion: true,
                    timeoutMs: 30_000
                  });
                  repricingResults.push({
                    listingId: listing.listingId,
                    currentPrice: originalPrice,
                    newPrice: originalPrice,
                    action: 'failed',
                    reason: `Market peek failed: no lowest ask available after reset. Revert ${revert.success ? 'succeeded' : 'failed'}.`,
                    market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                    peek: {
                      frequency: freq,
                      lastPeekTime: new Date().toISOString(),
                      resetPrice,
                      beatBy,
                      competitorLowestAsk,
                      competitorFlexLowestAsk,
                      resetOperationId: resetResult.operation?.operationId,
                      resetOperationStatus: resetResult.operationStatus,
                      revertOperationId: revert.operation?.operationId,
                      revertOperationStatus: revert.operationStatus
                    }
                  } as any);
                  continue;
                }

                const target = Math.max(1, competitorBestAsk - beatBy);
                // Only raise (avoid lowering when already winning).
                // Respect maxPrice if set.
                const hasMax = isFiniteNumber(listing.maxPrice);
                const boundedTarget = hasMax ? Math.min(listing.maxPrice!, target) : target;

                if (boundedTarget <= originalPrice) {
                  // No raise available; revert back to original price.
                  const revert = await updateListingPrice(listing.listingId, originalPrice, accessToken, {
                    waitForCompletion: true,
                    timeoutMs: 30_000
                  });
                  repricingResults.push({
                    listingId: listing.listingId,
                    currentPrice: originalPrice,
                    newPrice: originalPrice,
                    action: 'no_change',
                    reason: `Market peek: no higher price available (nextBest=$${competitorBestAsk}, target=$${target})`,
                    market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                    peek: {
                      frequency: freq,
                      lastPeekTime: new Date().toISOString(),
                      resetPrice,
                      beatBy,
                      competitorLowestAsk,
                      competitorFlexLowestAsk,
                      computedTarget: target,
                      computedFinal: originalPrice,
                      resetOperationId: resetResult.operation?.operationId,
                      resetOperationStatus: resetResult.operationStatus,
                      revertOperationId: revert.operation?.operationId,
                      revertOperationStatus: revert.operationStatus
                    }
                  } as any);
                  continue;
                }

                // Final update to the raised price
                newPrice = boundedTarget;
                skipReason = `Market peek: raise to (nextLowestAsk - $${beatBy}) ($${competitorBestAsk} → $${newPrice})`;

                // Attach metadata so cron can persist lastPeekTime
                (twoStepMeta as any) = undefined;
                (listing as any).lastPeekTime = new Date().toISOString();
                (listing as any).__peekMeta = {
                  frequency: freq,
                  lastPeekTime: (listing as any).lastPeekTime,
                  resetPrice,
                  beatBy,
                  competitorLowestAsk,
                  competitorFlexLowestAsk,
                  computedTarget: target
                };
              } catch (err: any) {
                const message = err instanceof Error ? err.message : String(err);
                const revert = await updateListingPrice(listing.listingId, originalPrice, accessToken, {
                  waitForCompletion: true,
                  timeoutMs: 30_000
                });
                repricingResults.push({
                  listingId: listing.listingId,
                  currentPrice: originalPrice,
                  newPrice: originalPrice,
                  action: 'failed',
                  reason: `Market peek failed after reset: ${message}. Revert ${revert.success ? 'succeeded' : 'failed'}.`,
                  market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
                  peek: {
                    frequency: freq,
                    lastPeekTime: new Date().toISOString(),
                    resetPrice,
                    beatBy,
                    resetOperationId: resetResult.operation?.operationId,
                    resetOperationStatus: resetResult.operationStatus,
                    revertOperationId: revert.operation?.operationId,
                    revertOperationStatus: revert.operationStatus
                  }
                } as any);
                continue;
              }
              }
            }

          } else {
          newPrice = calculateIndividualPrice(listing, marketData);
          
          // Check if we're already the lowest ask for "beat_lowest" strategy
          if (listing.pricingStrategy.type === 'beat_lowest') {
            const lowestAsk = parseInt(marketData.lowestAskAmount);
            if (listing.currentPrice <= lowestAsk) {
              skipReason = `Already lowest ask at $${listing.currentPrice} (market: $${lowestAsk})`;
            }
          }
          }
        } else {
          newPrice = calculateNewPrice(listing, marketData, strategy);
        }
        
        if (!newPrice || newPrice === comparisonCurrentPrice) {
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: listing.currentPrice,
            action: 'no_change',
            reason: skipReason || 'Price already optimal',
            market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
          });
          continue;
        }

        // Apply min/max price constraints if individual strategies are used (support one-sided bounds)
        if (useIndividualStrategies) {
          const hasMin = isFiniteNumber(listing.minPrice);
          const hasMax = isFiniteNumber(listing.maxPrice);
          const originalNewPrice = newPrice;

          if (hasMin) newPrice = Math.max(listing.minPrice!, newPrice);
          if (hasMax) newPrice = Math.min(listing.maxPrice!, newPrice);

          // If autoDeactivate is enabled and the calculated price would violate bounds, deactivate instead of clamping.
          const violatesMin = hasMin && originalNewPrice < listing.minPrice!;
          const violatesMax = hasMax && originalNewPrice > listing.maxPrice!;
          if (listing.autoDeactivate && (violatesMin || violatesMax)) {
            if (!dryRun) {
              await deactivateListing(listing.listingId, accessToken);
            }

            const rangeLabel =
              hasMin && hasMax
                ? `[${listing.minPrice}, ${listing.maxPrice}]`
                : hasMin
                  ? `[${listing.minPrice}, ∞)`
                  : hasMax
                    ? `(-∞, ${listing.maxPrice}]`
                    : 'unbounded';

            repricingResults.push({
              listingId: listing.listingId,
              currentPrice: listing.currentPrice,
              newPrice: listing.currentPrice,
              action: dryRun ? 'would_deactivate' : 'deactivated',
              reason: `Calculated price $${originalNewPrice} outside allowed range ${rangeLabel}`
            });
            continue;
          }
        }

        // Normalize to an integer dollar amount before comparing/updating.
        // StockX listing updates are whole-dollar, and we want consistent behavior vs UI.
        newPrice = Math.max(1, Math.round(newPrice));

        // Optional: skip tiny changes to reduce churn
        if (isFiniteNumber(minPriceChange) && Math.abs(newPrice - comparisonCurrentPrice) < minPriceChange) {
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: listing.currentPrice,
            action: 'no_change',
            reason: `Change $${Math.abs(newPrice - comparisonCurrentPrice).toFixed(2)} below threshold $${minPriceChange}`,
            market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
          });
          continue;
        }

        // Re-check after constraints/thresholds
        if (newPrice === comparisonCurrentPrice) {
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: listing.currentPrice,
            action: 'no_change',
            reason: skipReason || 'No change after constraints',
            market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
          });
          continue;
        }

        // Apply safety checks (only for global strategies, not individual)
        if (!useIndividualStrategies) {
        const safetyCheck = performSafetyChecks(listing, newPrice, strategy);
        if (!safetyCheck.passed) {
          errors.push(`Safety check failed for ${listing.listingId}: ${safetyCheck.reason}`);
          continue;
          }
        }

        // Execute repricing if not dry run
        if (!dryRun) {
          const updateResult = await updateListingPrice(
            listing.listingId,
            newPrice,
            accessToken,
            // Only wait for completion on the FINAL step of the two-step strategy (LIVE mode)
            isTwoStepStrategy ? { waitForCompletion: true, timeoutMs: 30_000 } : undefined
          );

          if (twoStepMeta) {
            twoStepMeta.finalOperationId = updateResult.operation?.operationId;
            twoStepMeta.finalOperationStatus = updateResult.operationStatus;
          }

          // If the two-step reset happened and the final update failed, attempt a best-effort revert
          // back to the original listing price (so we don't leave the listing stuck at $999).
          let finalUpdateSucceeded = updateResult.success;
          if (!finalUpdateSucceeded && didTemporaryReset) {
            const revert = await updateListingPrice(listing.listingId, listing.currentPrice, accessToken, {
              waitForCompletion: true,
              timeoutMs: 30_000
            });
            if (twoStepMeta) {
              twoStepMeta.revertOperationId = revert.operation?.operationId;
              twoStepMeta.revertOperationStatus = revert.operationStatus;
            }
            // Even if revert fails, we keep the action as failed, but with a more informative reason.
            repricingResults.push({
              listingId: listing.listingId,
              currentPrice: listing.currentPrice,
              newPrice: newPrice,
              action: 'failed',
              reason: `Final price update failed: ${updateResult.error || 'Unknown error'}. Revert ${revert.success ? 'succeeded' : 'failed'}.`,
              profitChange: calculateProfitChange(listing, newPrice),
              competitivePosition: analyzeCompetitivePosition(newPrice, marketData),
              operationId: updateResult.operation?.operationId,
              operationStatus: updateResult.operationStatus,
              market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
              twoStep: twoStepMeta,
              peek: (listing as any).__peekMeta || undefined
            });
            continue;
          }
          
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: newPrice,
            action: updateResult.success ? 'updated' : 'failed',
            reason: updateResult.success ? 'Price updated successfully' : updateResult.error,
            profitChange: calculateProfitChange(listing, newPrice),
            competitivePosition: analyzeCompetitivePosition(newPrice, marketData),
            operationId: updateResult.operation?.operationId,
            operationStatus: updateResult.operationStatus,
            market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
            twoStep: twoStepMeta,
            peek: (listing as any).__peekMeta || undefined
          });
        } else {
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: newPrice,
            action: 'would_update',
            reason: 'Dry run - would update price',
            profitChange: calculateProfitChange(listing, newPrice),
            competitivePosition: analyzeCompetitivePosition(newPrice, marketData),
            market: { lowestAsk: currentStdAsk, flexLowestAsk: currentFlexAsk },
            twoStep: twoStepMeta,
            peek: (listing as any).__peekMeta || undefined
          });
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing listing ${listing.listingId}:`, error);
        errors.push(`Error processing ${listing.listingId}: ${error.message}`);
      }
    }

    // Send notification if email provided
    if (notificationEmail && repricingResults.length > 0) {
      await sendRepricingNotification(notificationEmail, repricingResults, strategy, dryRun);
    }

    const response = NextResponse.json({
      success: true,
      results: repricingResults,
      errors: errors,
      summary: {
        totalListings: listings.length,
        updated: repricingResults.filter(r => r.action === 'updated').length,
        noChange: repricingResults.filter(r => r.action === 'no_change').length,
        errors: errors.length,
        dryRun: dryRun
      }
    });

    // If we refreshed the token, set the new cookies
    if (tokenRefreshed) {
      setStockXTokenCookies(response, accessToken, refreshToken);
    }

    return response;

  } catch (error) {
    console.error('Repricing error:', error);
    return NextResponse.json({ 
      error: 'Failed to process repricing', 
      details: error.message 
    }, { status: 500 });
  }
}

async function fetchMarketData(productId: string, variantId: string, accessToken: string) {
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
  const url = `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`;

  const retryStatuses = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    if (!response.ok) {
      if (retryStatuses.has(response.status) && attempt < 5) {
        // Respect Retry-After if provided; otherwise exponential-ish backoff.
        const retryAfter = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
        const retryAfterMs = Number.isFinite(retryAfterSeconds) ? Math.max(0, retryAfterSeconds * 1000) : 0;
        const baseBackoffMs = Math.min(30_000, 800 * Math.pow(2, attempt)); // 0.8s, 1.6s, 3.2s, 6.4s, 12.8s, 25.6s
        const jitterMs = Math.floor(Math.random() * 250);
        const waitMs = Math.max(retryAfterMs, baseBackoffMs) + jitterMs;
        await response.text().catch(() => '');
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Market data fetch failed: ${response.status}`);
    }

    const data = await response.json();
    // The market data endpoint returns an object with a 'variants' array
    const variants = data.variants || data;
    return Array.isArray(variants) ? variants.find(item => item.variantId === variantId) : data;
  }

  // Should never reach, but keep TS happy.
  throw new Error('Market data fetch failed: retry exhausted');
}

function calculateNewPrice(listing: ListingToReprice, marketData: any, strategy: RepricingStrategy) {
  const { lowestAskAmount, highestBidAmount } = marketData;
  // Prices are already in dollars from API
  const currentLowestAsk = parseInt(lowestAskAmount);
  const currentHighestBid = parseInt(highestBidAmount);

  switch (strategy.type) {
    case 'competitive':
      return calculateCompetitivePrice(listing, currentLowestAsk, strategy.settings);
    
    case 'margin_based':
      return calculateMarginBasedPrice(listing, currentLowestAsk, currentHighestBid, strategy.settings);
    
    case 'velocity_based':
      return calculateVelocityBasedPrice(listing, currentLowestAsk, strategy.settings);
    
    case 'hybrid':
      return calculateHybridPrice(listing, currentLowestAsk, currentHighestBid, strategy.settings);
    
    default:
      return listing.currentPrice;
  }
}

function calculateCompetitivePrice(listing: ListingToReprice, lowestAsk: number, settings: any) {
  const buffer = settings.competitiveBuffer || 1;
  const proposedPrice = Math.max(1, lowestAsk - buffer);
  
  return Math.min(proposedPrice, listing.currentPrice * 0.95); // Max 5% reduction
}

function calculateMarginBasedPrice(listing: ListingToReprice, lowestAsk: number, highestBid: number, settings: any) {
  const minMargin = normalizePercent(settings.minProfitMargin, 0.15);
  const minPrice = isFiniteNumber(listing.costBasis) ? listing.costBasis * (1 + minMargin) : 1;
  
  return Math.max(Math.min(lowestAsk - 1, listing.currentPrice * 0.9), minPrice, 1);
}

function calculateVelocityBasedPrice(listing: ListingToReprice, lowestAsk: number, settings: any) {
  const maxDays = settings.maxDaysListed || 30;
  const aggressiveness = settings.aggressiveness || 'moderate';
  
  let reductionFactor = 1;
  
  if (listing.daysListed > maxDays) {
    switch (aggressiveness) {
      case 'conservative':
        reductionFactor = 0.98;
        break;
      case 'moderate':
        reductionFactor = 0.95;
        break;
      case 'aggressive':
        reductionFactor = 0.90;
        break;
    }
  }
  
  const costFloor = isFiniteNumber(listing.costBasis) ? listing.costBasis * 1.05 : 1;
  return Math.max(listing.currentPrice * reductionFactor, costFloor, 1);
}

function calculateHybridPrice(listing: ListingToReprice, lowestAsk: number, highestBid: number, settings: any) {
  const competitive = calculateCompetitivePrice(listing, lowestAsk, settings);
  const margin = calculateMarginBasedPrice(listing, lowestAsk, highestBid, settings);
  const velocity = calculateVelocityBasedPrice(listing, lowestAsk, settings);
  
  // Weighted average based on listing performance
  const weights = {
    competitive: 0.5,
    margin: 0.3,
    velocity: 0.2
  };
  
  return Math.round(
    competitive * weights.competitive +
    margin * weights.margin +
    velocity * weights.velocity
  );
}

function performSafetyChecks(listing: ListingToReprice, newPrice: number, strategy: RepricingStrategy) {
  const maxReduction = normalizePercent(strategy.settings.maxPriceReduction, 0.20);
  const minPrice = isFiniteNumber(listing.costBasis) ? listing.costBasis * 1.05 : undefined; // Minimum 5% profit
  
  // Check maximum price reduction
  const reductionPercent = (listing.currentPrice - newPrice) / listing.currentPrice;
  if (reductionPercent > maxReduction) {
    return {
      passed: false,
      reason: `Price reduction (${(reductionPercent * 100).toFixed(1)}%) exceeds maximum (${(maxReduction * 100).toFixed(1)}%)`
    };
  }
  
  // Check minimum price (only when cost basis is available)
  if (typeof minPrice === 'number' && newPrice < minPrice) {
    return {
      passed: false,
      reason: `New price $${newPrice} below minimum profitable price $${minPrice.toFixed(2)}`
    };
  }
  
  return { passed: true };
}

async function updateListingPrice(
  listingId: string,
  newPrice: number,
  accessToken: string,
  options?: { waitForCompletion?: boolean; timeoutMs?: number }
) {
  try {
    console.log(`🔄 Updating listing ${listingId} to $${newPrice}`);
    
    const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      },
      body: JSON.stringify({
        amount: String(newPrice),
        currencyCode: 'USD'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`❌ StockX update failed: ${response.status}`, errorData);
      return { success: false, error: `Update failed: ${response.status} - ${errorData.message || 'Unknown error'}` };
    }

    const result = await response.json();
    console.log(`✅ Update initiated, operation ID: ${result.operationId}`);

    if (options?.waitForCompletion && result?.operationId) {
      const op = await pollListingOperationStatus({
        listingId,
        operationId: result.operationId,
        accessToken,
        timeoutMs: options.timeoutMs
      });

      if (op.complete && !op.success) {
        const opError = op.data?.error?.message || op.data?.error || 'Operation failed';
        return { success: false, error: opError, operation: result, operationStatus: op.status };
      }

      return { success: true, operation: result, operationStatus: op.status, operationPolled: true };
    }

    return { success: true, operation: result, operationPolled: false };
  } catch (error) {
    console.error(`❌ Update error:`, error);
    return { success: false, error: (error as Error).message };
  }
}

function calculateProfitChange(listing: ListingToReprice, newPrice: number) {
  if (!isFiniteNumber(listing.costBasis)) return null;
  const currentProfit = listing.currentPrice - listing.costBasis;
  const newProfit = newPrice - listing.costBasis;
  return newProfit - currentProfit;
}

function analyzeCompetitivePosition(price: number, marketData: any) {
  // Prices are already in dollars from API
  const lowestAsk = parseInt(marketData.lowestAskAmount);
  const highestBid = parseInt(marketData.highestBidAmount);
  
  if (price <= lowestAsk) {
    return 'lowest_ask';
  } else if (price <= lowestAsk + 5) {
    return 'competitive';
  } else if (price <= highestBid * 1.1) {
    return 'market_price';
  } else {
    return 'premium';
  }
}

function calculateIndividualPrice(listing: ListingToReprice, marketData: any): number {
  if (!listing.pricingStrategy) {
    return listing.currentPrice;
  }

  // Prices are already in dollars from API
  const lowestAsk = parseInt(marketData.lowestAskAmount);
  
  switch (listing.pricingStrategy.type) {
    case 'keep_current':
      return listing.currentPrice;
      
    case 'beat_lowest':
      const beatBy = Math.max(1, listing.pricingStrategy.value || 1);
      
      // If we're already the lowest ask (or lower), don't change price
      if (listing.currentPrice <= lowestAsk) {
        console.log(`🎯 Listing ${listing.listingId} is already lowest ask at $${listing.currentPrice} (market: $${lowestAsk})`);
        return listing.currentPrice; // Keep current price
      }
      
      // Otherwise, beat the lowest ask by the specified amount
      const newPrice = Math.max(1, lowestAsk - beatBy);
      console.log(`💰 Beating lowest ask: $${lowestAsk} - $${beatBy} = $${newPrice}`);
      return newPrice;
      
    case 'match_lowest':
      return lowestAsk;
      
    case 'percentage_below':
      const percentage = Math.max(0, Math.min(100, listing.pricingStrategy.value || 5));
      return Math.max(1, Math.round(lowestAsk * (1 - percentage / 100)));
      
    case 'manual':
      return listing.pricingStrategy.manualPrice || listing.currentPrice;

    // Note: this is executed via the special two-step branch above.
    case 'reset_then_beat_lowest':
      return listing.currentPrice;
      
    default:
      return listing.currentPrice;
  }
}

async function deactivateListing(listingId: string, accessToken: string) {
  try {
    // StockX uses DELETE to deactivate a listing
    const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Deactivation failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    console.log(`✅ Listing ${listingId} deactivated successfully`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to deactivate listing ${listingId}:`, error);
    return { success: false, error: error.message };
  }
}

async function sendRepricingNotification(email: string, results: any[], strategy: RepricingStrategy, dryRun: boolean) {
  // Implementation for sending email notifications
  // This would integrate with your email service
  console.log(`📧 Sending repricing notification to ${email}`);
  console.log(`Strategy: ${strategy.type}, Results: ${results.length}, Dry Run: ${dryRun}`);
} 