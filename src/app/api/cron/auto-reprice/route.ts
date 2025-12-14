import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchWithRetry(
  run: () => Promise<Response>,
  opts: { attempts: number; baseDelayMs: number; retryStatuses: Set<number> }
): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      const res = await run();
      last = res;
      if (!opts.retryStatuses.has(res.status)) return res;
      // Drain body to avoid leaking resources
      await res.text().catch(() => '');
    } catch (e) {
      // Network/timeout errors: treat as retryable
      if (attempt === opts.attempts - 1) throw e;
    }
    const backoff = Math.min(15_000, opts.baseDelayMs * Math.pow(2, attempt));
    await sleep(backoff);
  }
  // Shouldn't happen, but keep TS happy
  if (last) return last;
  return await run();
}

// Verify this is a legitimate cron request
function verifyCronRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const host = request.headers.get('host');
  
  // Allow requests from:
  // 1. Vercel crons (with secret)
  // 2. GitHub Actions (specific user agent)
  // 3. Localhost (development)
  return authHeader === `Bearer ${process.env.CRON_SECRET}` || 
         userAgent?.includes('GitHub-Actions') ||
         host?.includes('localhost') ||
         host?.includes('solesmarket.com');
}

function getBaseUrl(request: NextRequest) {
  // If this cron request is hitting the production domain, always use it.
  // This avoids accidentally calling a protected *.vercel.app deployment URL (SSO/Deployment Protection),
  // which returns HTML instead of the API response.
  const host = request.headers.get('host') || '';
  if (host.includes('solesmarket.com')) {
    return 'https://www.solesmarket.com';
  }

  // Prefer explicit config for cron (Vercel/GitHub Actions). This should be a PUBLIC domain
  // that is NOT protected by Vercel Deployment Protection.
  const envUrl =
    process.env.CRON_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL ||
    '';

  if (envUrl) {
    // VERCEL_URL is often just the hostname
    if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
      const normalized = `https://${envUrl}`;
      // If this points at a protected *.vercel.app domain, prefer the public production domain.
      if (normalized.includes('.vercel.app')) {
        return 'https://www.solesmarket.com';
      }
      return normalized;
    }
    // If this points at a protected *.vercel.app domain, prefer the public production domain.
    if (envUrl.includes('.vercel.app')) {
      return 'https://www.solesmarket.com';
    }
    return envUrl;
  }

  // Fallback to request host (useful for local/ngrok manual triggers)
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) {
    const derived = `${proto}://${host}`;
    if (derived.includes('.vercel.app')) {
      return 'https://www.solesmarket.com';
    }
    return derived;
  }

  // Final fallback (should rarely happen)
  return 'http://localhost:3000';
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_PAUSED === '1' || process.env.CRON_PAUSED === 'true') {
      return NextResponse.json({
        success: true,
        paused: true,
        message: 'Cron paused via CRON_PAUSED',
        timestamp: new Date().toISOString()
      });
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';
    const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true';
    const onlyUserId = searchParams.get('userId')?.trim() || null;

    // Verify this is a legitimate cron request
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Import and initialize Firebase Admin
    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    
    if (!adminDb) {
      return NextResponse.json({ 
        error: 'Firebase Admin not initialized',
        message: 'Missing Firebase Admin credentials'
      }, { status: 500 });
    }

    console.log('🔄 Cron job started: auto-reprice', { force, dryRun, onlyUserId });

    const activeUsers: string[] = [];
    const apiKey = process.env.STOCKX_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing STOCKX_API_KEY', message: 'Set STOCKX_API_KEY in environment variables' },
        { status: 500 }
      );
    }

    if (onlyUserId) {
      const userDoc = await adminDb.collection('users').doc(onlyUserId).get();
      if (!userDoc.exists) {
        return NextResponse.json({ success: false, error: `User ${onlyUserId} not found` }, { status: 404 });
      }

      const userData = userDoc.data() || {};
      if (!force && userData.stockxAutoRepricingEnabled !== true) {
        return NextResponse.json({
          success: true,
          message: `User ${onlyUserId} is not auto-repricing enabled (pass ?force=1 to override)`,
          timestamp: new Date().toISOString()
        });
      }

      activeUsers.push(onlyUserId);
      console.log(`🎯 Running for single user: ${onlyUserId}`);
    } else {
      // Query only users with auto-repricing enabled (more efficient than loading all users)
      const usersSnapshot = await adminDb.collection('users')
        .where('stockxAutoRepricingEnabled', '==', true)
        .get();
      
      console.log(`📊 Found ${usersSnapshot.size} users with auto-repricing enabled`);
      
      if (usersSnapshot.empty) {
        return NextResponse.json({
          success: true,
          message: 'No users have auto-repricing enabled',
          timestamp: new Date().toISOString()
        });
      }
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();

        // Check if enough time has passed based on user's interval preference (unless forced)
        const repricingConfig = userData.stockxAutoRepricingConfig || {};
        const intervalMinutes = repricingConfig.intervalMinutes || 5; // Default: 5 minutes
        const lastRepricedAt = userData.lastRepricedAt;
        
        if (!force && lastRepricedAt) {
          const lastRepricedTime = new Date(lastRepricedAt).getTime();
          const now = Date.now();
          const minutesSinceLastReprice = (now - lastRepricedTime) / (1000 * 60);
          
          if (minutesSinceLastReprice < intervalMinutes) {
            console.log(`⏭️ Skipping user ${userDoc.id}: Only ${Math.floor(minutesSinceLastReprice)} minutes since last reprice (interval: ${intervalMinutes} minutes)`);
            continue;
          }
        }
        
        activeUsers.push(userDoc.id);
      }
    }

    console.log(`🎯 ${activeUsers.length} users ready for repricing${force ? ' (forced)' : ' (passed interval check)'}`);

    if (activeUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users have auto-repricing enabled',
        timestamp: new Date().toISOString()
      });
    }

    let totalListingsRepriced = 0;
    const errors: string[] = [];

    // Process each user's listings
    for (const userId of activeUsers) {
      try {
        console.log(`👤 Processing auto-reprice for user ${userId}`);

        // Get user's auto-repricing configuration
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (!userData) {
          console.log(`❌ No user data found for ${userId}`);
          continue;
        }

        const repricingConfig = userData.stockxAutoRepricingConfig || {
          strategy: 'competitive',
          competitiveBuffer: 1,
          maxReduction: 20,
          minProfitMargin: 5,
          enabled: true
        };

        // Get user's StockX tokens
        const stockxTokens = userData.stockxTokens;
        
        if (!stockxTokens?.access_token) {
          console.log(`⏭️ Skipping user ${userId}: No StockX access token`);
          errors.push(`User ${userId}: Missing StockX access token`);
          continue;
        }
        
        // Quick token validation: check if it looks valid (not expired format check)
        if (stockxTokens.access_token.length < 20) {
          console.log(`⏭️ Skipping user ${userId}: Invalid access token format`);
          errors.push(`User ${userId}: Invalid access token format`);
          continue;
        }

        // Fetch user's active listings (matching the exact format from listings/route.ts)
        const params = new URLSearchParams({
          listingStatuses: 'ACTIVE',
          pageSize: '100',
          pageNumber: '1'
        });
        
        // Helper: fetch listings, refreshing token once on 401 (common cause of "repricing not working")
        const fetchListings = async (accessToken: string) => {
          const url = `https://api.stockx.com/v2/selling/listings?${params}`;
          const init: RequestInit = {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': 'ResellDashboard/1.0',
            },
          };
          return await fetchWithTimeout(url, init, 20_000);
        };

        let accessToken = stockxTokens.access_token as string;
        let refreshToken = stockxTokens.refresh_token as string | undefined;

        const retryStatuses = new Set([429, 500, 502, 503, 504]);
        let listingsResponse = await fetchWithRetry(() => fetchListings(accessToken), {
          attempts: 4,
          baseDelayMs: 750,
          retryStatuses,
        });

        if (listingsResponse.status === 401 && refreshToken) {
          console.log(`🔄 StockX listings 401 for user ${userId}. Attempting token refresh...`);
          const refreshed = await refreshStockXTokens(refreshToken);
          if (refreshed.success && refreshed.accessToken) {
            accessToken = refreshed.accessToken;
            refreshToken = refreshed.refreshToken || refreshToken;
            try {
              await adminDb.collection('users').doc(userId).set(
                {
                  stockxTokens: {
                    ...(userData.stockxTokens || {}),
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    updated_at: new Date().toISOString(),
                  },
                },
                { merge: true }
              );
              console.log(`✅ Refreshed StockX tokens saved to Firebase for user ${userId}`);
            } catch (e) {
              console.warn(`⚠️ Token refresh succeeded but failed to persist for user ${userId}:`, e);
            }

            // Retry listings fetch once with refreshed token
            listingsResponse = await fetchWithRetry(() => fetchListings(accessToken), {
              attempts: 3,
              baseDelayMs: 750,
              retryStatuses,
            });
          } else {
            console.log(`❌ Token refresh failed for user ${userId}: ${refreshed.error || 'Unknown error'}`);
          }
        }

        if (!listingsResponse.ok) {
          const statusCode = listingsResponse.status;
          console.log(`⏭️ Skipping user ${userId}: Failed to fetch listings (${statusCode})`);
          
          // Add more specific error messages
          if (statusCode === 401) {
            errors.push(`User ${userId}: StockX token expired/invalid or API key rejected (401)`);
          } else if (statusCode === 429) {
            errors.push(`User ${userId}: Rate limited by StockX (429)`);
          } else {
            errors.push(`User ${userId}: Failed to fetch listings (${statusCode})`);
          }
          
          // Skip to next user - don't waste Firebase reads on settings/logs
          continue;
        }

        const listingsData = await listingsResponse.json();
        const listings = listingsData.listings || listingsData.data || [];

        if (listings.length === 0) {
          console.log(`⏭️ No active listings for user ${userId}`);
          continue;
        }

        console.log(`📦 Found ${listings.length} active listings for user ${userId}`);

        // Load saved settings for each listing from Firebase
        const settingsSnapshot = await adminDb.collection('stockxPricingSettings')
          .where('userId', '==', userId)
          .get();
        
        const savedSettings = new Map<string, any>();
        settingsSnapshot.forEach(doc => {
          const data = doc.data();
          savedSettings.set(data.listingId, { id: doc.id, ...data });
        });

        console.log(`⚙️ Loaded ${savedSettings.size} saved listing settings`);

        // Prepare repricing items, filtering by pricing strategy
        const itemsToReprice = listings
          .filter((listing: any) => {
            const settings = savedSettings.get(listing.listingId); // FIXED: Use listingId instead of id
            const pricingStrategy = settings?.pricingStrategy;
            
            // If no settings found, skip the listing (user hasn't configured it yet)
            if (!settings) {
              console.log(`⏭️ Skipping listing ${listing.listingId}: No saved settings (opt-in required)`);
              return false;
            }

            // Per-listing toggle: if explicitly disabled, skip
            if (settings.enabled === false) {
              console.log(`⏭️ Skipping listing ${listing.listingId}: Auto-reprice disabled for this listing`);
              return false;
            }
            
            // Skip if pricing strategy is "manual" or "keep_current"
            if (pricingStrategy?.type === 'manual') {
              console.log(`⏭️ Skipping listing ${listing.listingId}: Manual pricing (user-controlled)`);
              return false;
            }
            if (pricingStrategy?.type === 'keep_current') {
              console.log(`⏭️ Skipping listing ${listing.listingId}: Keep current price`);
              return false;
            }
            
            // Log which strategy will be used
            console.log(`✅ Will reprice listing ${listing.listingId} using "${pricingStrategy?.type}" strategy`);
            
            return true;
          })
          .map((listing: any) => {
            const settings = savedSettings.get(listing.listingId);
            return {
              listingId: listing.listingId,
              productId: listing.product?.productId, // FIXED: Use productId field
              variantId: listing.variant?.variantId, // FIXED: Use variantId field
              currentPrice: parseInt(listing.amount), // Parse to number
              lowestAsk: listing.product?.market?.lowestAsk || parseInt(listing.amount),
              highestBid: listing.product?.market?.highestBid || 0,
              pricingStrategy: settings?.pricingStrategy,
              minPrice: settings?.minPrice,
              maxPrice: settings?.maxPrice,
              autoDeactivate: settings?.autoDeactivate,
              // Market-change gate inputs (used by repricing API)
              lastSeenLowestAsk: settings?.lastSeenLowestAsk ?? null,
              lastSeenFlexLowestAsk: settings?.lastSeenFlexLowestAsk ?? null,
              // Duplicate inventory: fixed reserve price for followers
              reservePrice: settings?.reservePrice ?? null,
              reservePriceSetAt: settings?.reservePriceSetAt ?? null
            };
          });

        if (itemsToReprice.length === 0) {
          console.log(`⏭️ No listings to reprice for user ${userId} (all are manual or keep_current)`);
          continue;
        }

        console.log(`🎯 Repricing ${itemsToReprice.length} listings (skipped ${listings.length - itemsToReprice.length} manual/keep_current)`);

        const allowTwoStepForBatch = itemsToReprice.some(
          (i: any) => String(i?.pricingStrategy?.type || '') === 'reset_then_beat_lowest'
        );

        // Call the repricing API internally (using individual strategies per listing)
        const baseUrl = getBaseUrl(request);
        console.log(`🌐 Using baseUrl for repricing: ${baseUrl}`);
        
        const repriceResponse = await fetch(`${baseUrl}/api/stockx/repricing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'x-api-key': apiKey,
            'x-user-id': userId
          },
          body: JSON.stringify({
            listings: itemsToReprice,
            // No global strategy - each listing uses its own saved pricing rule
            strategy: {
              type: 'competitive', // Fallback only (not used when useIndividualStrategies is true)
              settings: {
                minProfitMargin: 5,
                maxPriceReduction: 20,
                competitiveBuffer: 1,
                aggressiveness: 'moderate'
              }
            },
            dryRun,
            useIndividualStrategies: true, // Use individual pricing rules per listing
            // Required for the reset_then_beat_lowest strategy to execute (otherwise repricing route blocks it)
            allowTwoStep: allowTwoStepForBatch
          })
        });

        console.log(`📡 Repricing API response status: ${repriceResponse.status}`);

        if (!repriceResponse.ok) {
          const errorText = await repriceResponse.text();
          console.log(`❌ Repricing API returned not ok: ${repriceResponse.status}`);
          console.log(`❌ Error details:`, errorText);
          errors.push(`User ${userId}: Repricing failed (${repriceResponse.status}) - ${errorText}`);
          continue;
        }

        const repriceData = await repriceResponse.json();
        console.log(`📊 Repricing API response:`, JSON.stringify(repriceData, null, 2));

        // Extra clarity logs for skip reasons (helps debug "why didn't it reprice?")
        try {
          const resultsArr: any[] = Array.isArray(repriceData?.results) ? repriceData.results : [];
          const skipsUnchangedWinning = resultsArr.filter(
            r =>
              r?.action === 'no_change' &&
              typeof r?.reason === 'string' &&
              r.reason.toLowerCase().includes('market unchanged') &&
              r.reason.toLowerCase().includes('winning')
          );

          if (skipsUnchangedWinning.length > 0) {
            console.log(
              `⏭️ Skipping ${skipsUnchangedWinning.length} listing(s): market unchanged + already winning (will check again next cron)`
            );
            for (const r of skipsUnchangedWinning.slice(0, 25)) {
              const m = r?.market || {};
              console.log(
                `  - ${r.listingId}: lowestAsk=${m.lowestAsk ?? 'null'} flexLowestAsk=${m.flexLowestAsk ?? 'null'} (no update)`
              );
            }
            if (skipsUnchangedWinning.length > 25) {
              console.log(`  ... and ${skipsUnchangedWinning.length - 25} more`);
            }
          }
        } catch (e) {
          console.warn('⚠️ Failed to compute skip logs:', e);
        }

        // Persist market snapshots so future runs can skip when unchanged + you're still winning.
        // (This reduces StockX push notification spam by avoiding unnecessary update calls.)
        try {
          const nowIso = new Date().toISOString();
          const resultsArr: any[] = Array.isArray(repriceData?.results) ? repriceData.results : [];
          const batch = adminDb.batch();
          let writes = 0;

          for (const r of resultsArr) {
            const listingId = r?.listingId;
            const market = r?.market;
            if (!listingId || !market) continue;
            const s = savedSettings.get(listingId);
            const docId = s?.id;
            if (!docId) continue;

            const docRef = adminDb.collection('stockxPricingSettings').doc(docId);
            const patch: any = {
              lastSeenLowestAsk: typeof market.lowestAsk === 'number' ? market.lowestAsk : null,
              lastSeenFlexLowestAsk: typeof market.flexLowestAsk === 'number' ? market.flexLowestAsk : null,
              lastSeenAt: nowIso,
              updatedAt: nowIso
            };

            // If this listing is a reserve follower and we don't have a stored reservePrice yet,
            // store its current price as the fixed reserve price ("set once and hold").
            const reasonLower = typeof r?.reason === 'string' ? r.reason.toLowerCase() : '';
            const np = typeof r?.newPrice === 'number' ? r.newPrice : null;
            const hasStoredReserve = typeof s?.reservePrice === 'number' && Number.isFinite(s.reservePrice) && s.reservePrice > 0;
            const hasStoredSetAt = typeof s?.reservePriceSetAt === 'string' && Boolean(s.reservePriceSetAt);

            // Persist follower reserve price when the repricing API indicates it was set/refreshed.
            if (reasonLower.includes('reserve pricing (set once)') || reasonLower.includes('reserve pricing (refresh 7d)')) {
              if (np && np > 0) {
                patch.reservePrice = np;
                patch.reservePriceSetAt = nowIso;
              }
            } else if (hasStoredReserve && !hasStoredSetAt) {
              // Backfill timestamp for older docs that have reservePrice but no reservePriceSetAt.
              patch.reservePriceSetAt = nowIso;
            }

            batch.set(docRef, patch, { merge: true });
            writes++;
          }

          if (writes > 0) {
            await batch.commit();
            console.log(`🧠 Saved market snapshots for ${writes} listing(s)`);
          }
        } catch (e) {
          console.warn('⚠️ Failed to persist market snapshots:', e);
        }
        
        const successCount = (repriceData.results?.filter((r: any) => (r.success === true) || (r.action === 'updated'))?.length) || 0;
        
        console.log(`📈 Results breakdown:`, {
          totalResults: repriceData.results?.length || 0,
          successCount,
          results: repriceData.results?.map((r: any) => ({ listingId: r.listingId, action: r.action, success: r.success }))
        });
        
        totalListingsRepriced += successCount;
        console.log(`✅ Successfully repriced ${successCount} listings for user ${userId}`);

        // Update lastRepricedAt timestamp only for LIVE runs
        if (!dryRun) {
          await adminDb.collection('users').doc(userId).update({
            lastRepricedAt: new Date().toISOString()
          });
        }

        // Log the repricing action
        await adminDb.collection('repricing_logs').add({
          userId,
          timestamp: new Date().toISOString(),
          listingsProcessed: listings.length,
          listingsRepriced: successCount,
          strategy: repricingConfig.strategy,
          intervalMinutes: repricingConfig.intervalMinutes || 5,
          automated: true,
          dryRun,
          forced: force
        });

        // Add a small delay between users to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Error processing user ${userId}:`, error);
        errors.push(`User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Auto-repricing completed',
      results: {
        force,
        dryRun,
        onlyUserId: onlyUserId || undefined,
        totalUsers: activeUsers.length,
        totalListingsRepriced,
        errors: errors.length > 0 ? errors : undefined
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Auto-reprice cron job failed:', error);
    return NextResponse.json({
      error: 'Auto-reprice failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

