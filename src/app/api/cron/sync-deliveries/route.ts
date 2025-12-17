import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

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

        // Persist actual delivery dates onto purchases (strict FIFO can use this)
        // NOTE: We only write when actualDelivery is present to avoid noisy updates.
        const db = getAdminDb();
        const updatesByTracking = new Map<string, any>();
        for (const lt of liveTrackingData) {
          if (!lt || (lt as any).error) continue;
          const trackingNumber = (lt as any).trackingNumber ? String((lt as any).trackingNumber) : '';
          if (!trackingNumber) continue;
          const actualDelivery = (lt as any).actualDelivery ? String((lt as any).actualDelivery) : '';
          if (!actualDelivery) continue;
          updatesByTracking.set(trackingNumber, {
            actualDelivery,
            // keep estimatedDelivery as well (useful for UI), but strict FIFO will ignore it
            ...(typeof (lt as any).estimatedDelivery === 'string' && (lt as any).estimatedDelivery.trim()
              ? { estimatedDelivery: String((lt as any).estimatedDelivery) }
              : {}),
            // best-effort: mark status as delivered
            status: 'delivered',
            shippingStatus: 'delivered',
            lastUpdated: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

        if (updatesByTracking.size > 0) {
          const batch = db.batch();
          let writeCount = 0;
          for (const purchase of purchasesWithTracking) {
            const trackingValue = purchase.tracking || 
                                 purchase.trackingNumber || 
                                 purchase.tracking_number ||
                                 purchase.shipment?.tracking ||
                                 purchase.shipment?.trackingNumber;
            if (!trackingValue) continue;
            const update = updatesByTracking.get(String(trackingValue));
            if (!update) continue;
            const purchaseId = String(purchase.id || '');
            if (!purchaseId) continue;
            batch.set(db.collection('purchases').doc(purchaseId), update, { merge: true });
            writeCount++;
          }
          if (writeCount > 0) {
            await batch.commit();
            console.log(`📝 CRON: Updated ${writeCount} purchase(s) with actualDelivery for user ${userId}`);
          }
        }

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
