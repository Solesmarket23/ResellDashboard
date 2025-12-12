import { NextRequest, NextResponse } from 'next/server';

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
  // Prefer explicit config for cron (Vercel/GitHub Actions)
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL ||
    '';

  if (envUrl) {
    // VERCEL_URL is often just the hostname
    if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
      return `https://${envUrl}`;
    }
    return envUrl;
  }

  // Fallback to request host (useful for local/ngrok manual triggers)
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;

  // Final fallback (should rarely happen)
  return 'http://localhost:3000';
}

export async function GET(request: NextRequest) {
  try {
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
        
        const listingsResponse = await fetch(`https://api.stockx.com/v2/selling/listings?${params}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${stockxTokens.access_token}`,
            'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });

        if (!listingsResponse.ok) {
          const statusCode = listingsResponse.status;
          console.log(`⏭️ Skipping user ${userId}: Failed to fetch listings (${statusCode})`);
          
          // Add more specific error messages
          if (statusCode === 401) {
            errors.push(`User ${userId}: StockX token expired or invalid (401)`);
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
        
        const savedSettings = new Map();
        settingsSnapshot.forEach(doc => {
          const data = doc.data();
          savedSettings.set(data.listingId, data);
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
              autoDeactivate: settings?.autoDeactivate
            };
          });

        if (itemsToReprice.length === 0) {
          console.log(`⏭️ No listings to reprice for user ${userId} (all are manual or keep_current)`);
          continue;
        }

        console.log(`🎯 Repricing ${itemsToReprice.length} listings (skipped ${listings.length - itemsToReprice.length} manual/keep_current)`);

        // Call the repricing API internally (using individual strategies per listing)
        const baseUrl = getBaseUrl(request);
        console.log(`🌐 Using baseUrl for repricing: ${baseUrl}`);
        
        const repriceResponse = await fetch(`${baseUrl}/api/stockx/repricing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${stockxTokens.access_token}`,
            'x-api-key': process.env.STOCKX_API_KEY || '',
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
            useIndividualStrategies: true // Use individual pricing rules per listing
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

