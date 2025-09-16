import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting tracking data consolidation...');

    // Get all purchases
    const purchases = await getDocuments('purchases');
    console.log(`📊 Found ${purchases.length} total purchases`);

    const results = {
      totalProcessed: 0,
      consolidated: 0,
      alreadyConsolidated: 0,
      errors: 0,
      details: [] as any[]
    };

    for (const purchase of purchases) {
      try {
        results.totalProcessed++;
        
        // Find the best tracking value from any field
        const trackingValue = purchase.tracking || 
                             purchase.trackingNumber || 
                             purchase.tracking_number ||
                             purchase.shipment?.tracking ||
                             purchase.shipment?.trackingNumber;

        // Find the best carrier value
        const carrierValue = purchase.carrier || 
                            purchase.trackingCarrier ||
                            purchase.shipment?.carrier;

        // Find the best shipping status
        const shippingStatusValue = purchase.shippingStatus || 
                                   purchase.shipping_status ||
                                   purchase.status;

        // Check if consolidation is needed
        const needsConsolidation = !purchase.tracking || 
                                 purchase.tracking === '' || 
                                 purchase.tracking === 'No tracking' ||
                                 purchase.trackingNumber ||
                                 purchase.tracking_number ||
                                 purchase.shipment?.tracking ||
                                 purchase.shipment?.trackingNumber;

        if (needsConsolidation && trackingValue && trackingValue !== 'No tracking') {
          // Create backup of existing data
          const backupData = {
            originalTracking: purchase.tracking,
            originalTrackingNumber: purchase.trackingNumber,
            originalTrackingNumberAlt: purchase.tracking_number,
            originalShipmentTracking: purchase.shipment?.tracking,
            originalShipmentTrackingNumber: purchase.shipment?.trackingNumber,
            consolidatedAt: new Date().toISOString()
          };

          // Update with consolidated data
          const updateData = {
            tracking: trackingValue,
            carrier: carrierValue || 'Unknown',
            shippingStatus: shippingStatusValue || 'ordered',
            trackingConsolidated: true,
            trackingBackup: backupData,
            lastConsolidated: new Date().toISOString()
          };

          await updateDocument('purchases', purchase.id, updateData);

          results.consolidated++;
          results.details.push({
            orderNumber: purchase.orderNumber,
            status: 'consolidated',
            trackingValue: trackingValue,
            carrier: carrierValue,
            previousFields: {
              tracking: purchase.tracking,
              trackingNumber: purchase.trackingNumber,
              tracking_number: purchase.tracking_number,
              shipmentTracking: purchase.shipment?.tracking,
              shipmentTrackingNumber: purchase.shipment?.trackingNumber
            }
          });

          console.log(`✅ Consolidated tracking for ${purchase.orderNumber}: ${trackingValue}`);
        } else if (purchase.tracking && purchase.tracking !== 'No tracking') {
          results.alreadyConsolidated++;
          results.details.push({
            orderNumber: purchase.orderNumber,
            status: 'already_consolidated',
            trackingValue: purchase.tracking
          });
        } else {
          results.details.push({
            orderNumber: purchase.orderNumber,
            status: 'no_tracking_available',
            message: 'No tracking data found in any field'
          });
        }

      } catch (error) {
        results.errors++;
        results.details.push({
          orderNumber: purchase.orderNumber,
          status: 'error',
          error: error.message
        });
        console.error(`❌ Error processing ${purchase.orderNumber}:`, error);
      }
    }

    console.log('🎉 Tracking consolidation completed!');
    console.log(`📈 Results: ${results.consolidated} consolidated, ${results.alreadyConsolidated} already good, ${results.errors} errors`);

    return NextResponse.json({
      success: true,
      message: 'Tracking data consolidation completed successfully',
      results
    });

  } catch (error) {
    console.error('❌ Error running tracking consolidation:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to consolidate tracking data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

