import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';

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

    // Verify this is a CRON request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🕐 CRON: Starting scheduled delivery sync...');

    // Get all unique user IDs from purchases
    const allPurchases = await getDocumentsServer('purchases', {});
    
    // Group purchases by user ID
    const userPurchases = new Map<string, any[]>();
    allPurchases.forEach(purchase => {
      const userId = purchase.userId || purchase.uid;
      if (userId) {
        if (!userPurchases.has(userId)) {
          userPurchases.set(userId, []);
        }
        userPurchases.get(userId)!.push(purchase);
      }
    });

    console.log(`📊 CRON: Found ${userPurchases.size} users with purchases`);

    const syncResults = {
      totalUsers: userPurchases.size,
      successfulSyncs: 0,
      failedSyncs: 0,
      totalDeliveries: 0,
      liveTrackingUpdates: 0,
      errors: [] as string[]
    };

    // Sync deliveries for each user
    for (const [userId, purchases] of userPurchases) {
      try {
        console.log(`🔄 CRON: Syncing deliveries for user ${userId} (${purchases.length} purchases)`);
        
        // Filter purchases with tracking numbers
        const purchasesWithTracking = purchases.filter((purchase: any) => {
          const trackingValue = purchase.tracking || 
                               purchase.trackingNumber || 
                               purchase.tracking_number ||
                               purchase.shipment?.tracking ||
                               purchase.shipment?.trackingNumber;
          
          return trackingValue && 
                 trackingValue !== '' && 
                 trackingValue !== 'No tracking' &&
                 trackingValue !== null &&
                 trackingValue !== undefined &&
                 trackingValue !== 'N/A' &&
                 trackingValue !== 'TBD';
        });

        if (purchasesWithTracking.length === 0) {
          console.log(`⏭️ CRON: No tracking numbers for user ${userId}, skipping`);
          continue;
        }

        // Extract tracking numbers
        const trackingNumbers = purchasesWithTracking.map((purchase: any) => {
          return purchase.tracking || 
                 purchase.trackingNumber || 
                 purchase.tracking_number ||
                 purchase.shipment?.tracking ||
                 purchase.shipment?.trackingNumber;
        });

        // Get live tracking data
        const liveTrackingData = await trackingService.getBulkTrackingInfo(trackingNumbers);
        
        // Count live tracking updates
        const liveUpdates = liveTrackingData.filter(lt => !lt.error && lt.estimatedDelivery);
        syncResults.liveTrackingUpdates += liveUpdates.length;
        syncResults.totalDeliveries += purchasesWithTracking.length;

        console.log(`✅ CRON: Synced ${purchasesWithTracking.length} deliveries for user ${userId} (${liveUpdates.length} with live data)`);
        syncResults.successfulSyncs++;

        // Add a small delay between users to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ CRON: Error syncing user ${userId}:`, error);
        syncResults.failedSyncs++;
        syncResults.errors.push(`User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log('✅ CRON: Delivery sync completed', syncResults);

    return NextResponse.json({
      success: true,
      message: 'Delivery sync completed',
      results: syncResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ CRON: Error in delivery sync:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
