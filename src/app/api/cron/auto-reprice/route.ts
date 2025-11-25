import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Verify this is a legitimate cron request
function verifyCronRequest(request: NextRequest) {
  const authHeader = headers().get('authorization');
  const userAgent = headers().get('user-agent');
  const host = headers().get('host');
  
  // Allow requests from:
  // 1. Vercel crons (with secret)
  // 2. GitHub Actions (specific user agent)
  // 3. Localhost (development)
  return authHeader === `Bearer ${process.env.CRON_SECRET}` || 
         userAgent?.includes('GitHub-Actions') ||
         host?.includes('localhost') ||
         host?.includes('solesmarket.com');
}

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Import adminDb lazily to avoid initialization errors
    const { adminDb } = await import('@/lib/firebase/firebaseAdmin');
    
    if (!adminDb) {
      return NextResponse.json({ 
        error: 'Firebase Admin not initialized',
        message: 'Missing Firebase Admin credentials'
      }, { status: 500 });
    }

    console.log('🔄 Cron job started: auto-reprice');
    
    // Get all users with auto-repricing enabled
    const usersSnapshot = await adminDb.collection('users').get();
    const activeUsers: string[] = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      // Check if user has auto-repricing enabled
      const autoRepricingEnabled = userData.stockxAutoRepricingEnabled === true;
      
      if (!autoRepricingEnabled) {
        continue;
      }

      // Check if enough time has passed based on user's interval preference
      const repricingConfig = userData.stockxAutoRepricingConfig || {};
      const intervalMinutes = repricingConfig.intervalMinutes || 5; // Default: 5 minutes
      const lastRepricedAt = userData.lastRepricedAt;
      
      if (lastRepricedAt) {
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

    console.log(`📊 Found ${activeUsers.length} users with auto-repricing enabled`);

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
          console.log(`❌ No StockX access token for user ${userId}`);
          errors.push(`User ${userId}: Missing StockX access token`);
          continue;
        }

        // Fetch user's active listings
        const listingsResponse = await fetch('https://api.stockx.com/v2/selling', {
          headers: {
            'Authorization': `Bearer ${stockxTokens.access_token}`,
            'x-api-key': process.env.STOCKX_API_KEY || '',
            'Content-Type': 'application/json'
          }
        });

        if (!listingsResponse.ok) {
          console.log(`❌ Failed to fetch listings for user ${userId}: ${listingsResponse.status}`);
          errors.push(`User ${userId}: Failed to fetch listings (${listingsResponse.status})`);
          continue;
        }

        const listingsData = await listingsResponse.json();
        const listings = listingsData.data || [];

        if (listings.length === 0) {
          console.log(`⏭️ No active listings for user ${userId}`);
          continue;
        }

        console.log(`📦 Found ${listings.length} active listings for user ${userId}`);

        // Load saved settings for each listing from Firebase
        const settingsSnapshot = await adminDb.collection('stockxListingSettings')
          .where('userId', '==', userId)
          .get();
        
        const savedSettings = new Map();
        settingsSnapshot.forEach(doc => {
          const data = doc.data();
          savedSettings.set(data.listingId, data);
        });

        console.log(`⚙️ Loaded ${savedSettings.size} saved listing settings`);

        // Prepare repricing items, but skip listings with "manual" pricing strategy
        const itemsToReprice = listings
          .filter((listing: any) => {
            const settings = savedSettings.get(listing.id);
            const pricingStrategy = settings?.pricingStrategy;
            
            // If no settings found, skip the listing (user hasn't configured it yet)
            if (!settings) {
              console.log(`⏭️ Skipping listing ${listing.id}: No saved settings (default to keep current)`);
              return false;
            }
            
            // Skip if pricing strategy is "manual" or "keep_current"
            if (pricingStrategy?.type === 'manual') {
              console.log(`⏭️ Skipping listing ${listing.id}: Manual pricing strategy`);
              return false;
            }
            if (pricingStrategy?.type === 'keep_current') {
              console.log(`⏭️ Skipping listing ${listing.id}: Keep current strategy`);
              return false;
            }
            
            return true;
          })
          .map((listing: any) => {
            const settings = savedSettings.get(listing.id);
            return {
              listingId: listing.id,
              productId: listing.product?.id,
              variantId: listing.variant?.id,
              currentPrice: listing.amount,
              lowestAsk: listing.product?.market?.lowestAsk || listing.amount,
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

        // Call the repricing API internally (using individual strategies)
        const repriceResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stockx/repricing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${stockxTokens.access_token}`,
            'x-api-key': process.env.STOCKX_API_KEY || '',
            'x-user-id': userId
          },
          body: JSON.stringify({
            listings: itemsToReprice,
            strategy: {
              type: repricingConfig.strategy || 'competitive',
              settings: {
                minProfitMargin: repricingConfig.minProfitMargin || 5,
                maxPriceReduction: repricingConfig.maxReduction || 20,
                competitiveBuffer: repricingConfig.competitiveBuffer || 1,
                aggressiveness: 'moderate'
              }
            },
            dryRun: false,
            useIndividualStrategies: true // Use individual strategies per listing
          })
        });

        if (!repriceResponse.ok) {
          console.log(`❌ Repricing failed for user ${userId}: ${repriceResponse.status}`);
          errors.push(`User ${userId}: Repricing failed (${repriceResponse.status})`);
          continue;
        }

        const repriceData = await repriceResponse.json();
        const successCount = repriceData.results?.filter((r: any) => r.success).length || 0;
        
        totalListingsRepriced += successCount;
        console.log(`✅ Successfully repriced ${successCount} listings for user ${userId}`);

        // Update lastRepricedAt timestamp
        await adminDb.collection('users').doc(userId).update({
          lastRepricedAt: new Date().toISOString()
        });

        // Log the repricing action
        await adminDb.collection('repricing_logs').add({
          userId,
          timestamp: new Date().toISOString(),
          listingsProcessed: listings.length,
          listingsRepriced: successCount,
          strategy: repricingConfig.strategy,
          intervalMinutes: repricingConfig.intervalMinutes || 5,
          automated: true
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

