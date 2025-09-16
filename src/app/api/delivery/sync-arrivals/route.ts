import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '../../../../lib/firebase/firebaseUtils';
import { scraperManager } from '../../../../lib/scrapers/scraperManager';
import { deliveryArrivalLogger } from '../../../../lib/delivery/arrivalLogger';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting delivery arrival sync...');
    
    // Get all purchases with tracking numbers
    const purchases = await getDocuments('purchases');
    console.log(`📊 Found ${purchases.length} total purchases`);
    
    // Filter purchases with valid tracking numbers
    const purchasesWithTracking = purchases.filter(purchase => {
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
    
    console.log(`📦 Found ${purchasesWithTracking.length} purchases with tracking numbers`);
    
    const results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      arrivals: [] as any[],
      errors: [] as string[]
    };
    
    // Process each purchase with tracking
    for (const purchase of purchasesWithTracking) {
      try {
        results.totalProcessed++;
        
        // Get the actual tracking value
        const trackingValue = purchase.tracking || 
                             purchase.trackingNumber || 
                             purchase.tracking_number ||
                             purchase.shipment?.tracking ||
                             purchase.shipment?.trackingNumber;
        
        console.log(`🔍 Processing purchase ${purchase.id} with tracking: ${trackingValue}`);
        
        // Get live tracking data using scraper
        const trackingInfo = await scraperManager.getTrackingInfo(trackingValue);
        
        if (trackingInfo.error) {
          console.log(`⚠️ Tracking error for ${trackingValue}: ${trackingInfo.error}`);
          results.failed++;
          results.errors.push(`Purchase ${purchase.id}: ${trackingInfo.error}`);
          continue;
        }
        
        // Log delivery arrival
        const arrival = await deliveryArrivalLogger.logDeliveryArrival(purchase, trackingInfo);
        results.arrivals.push(arrival);
        results.successful++;
        
        console.log(`✅ Logged arrival for ${purchase.id}: ${arrival.status} (${arrival.updates[0]?.arrivalProbability || 0}% arrival probability)`);
        
        // Add small delay to avoid overwhelming scrapers
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        results.failed++;
        results.errors.push(`Purchase ${purchase.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error(`❌ Error processing purchase ${purchase.id}:`, error);
      }
    }
    
    // Get arrival statistics
    const stats = deliveryArrivalLogger.getArrivalStats();
    
    console.log(`🎉 Delivery arrival sync complete:`);
    console.log(`  📊 Processed: ${results.totalProcessed}`);
    console.log(`  ✅ Successful: ${results.successful}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    console.log(`  📦 Total arrivals: ${stats.total}`);
    console.log(`  🚚 Arriving today: ${stats.arrivingToday}`);
    console.log(`  📅 Arriving this week: ${stats.arrivingThisWeek}`);
    
    return NextResponse.json({
      success: true,
      results,
      stats,
      message: `Synced ${results.successful} deliveries with ${stats.arrivingToday} arriving today`
    });
    
  } catch (error) {
    console.error('❌ Error syncing delivery arrivals:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Get current arrival statistics
export async function GET(request: NextRequest) {
  try {
    const stats = deliveryArrivalLogger.getArrivalStats();
    const arrivals = deliveryArrivalLogger.getAllArrivals();
    const pendingNotifications = deliveryArrivalLogger.getPendingNotifications();
    
    return NextResponse.json({
      success: true,
      data: {
        stats,
        arrivals: arrivals.slice(0, 50), // Limit to first 50 for performance
        pendingNotifications
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting arrival statistics:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
