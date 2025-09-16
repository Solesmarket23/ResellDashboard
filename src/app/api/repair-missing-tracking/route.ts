import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting missing tracking field repair...');

    // Get all purchases
    const purchases = await getDocuments('purchases');
    console.log(`📊 Found ${purchases.length} total purchases`);

    let repairedCount = 0;
    let alreadyHadTracking = 0;
    const results = [];

    for (const purchase of purchases) {
      // Check if purchase is missing tracking field or has empty tracking
      const needsRepair = !purchase.tracking || 
                         purchase.tracking === '' || 
                         purchase.tracking === null || 
                         purchase.tracking === undefined;

      if (needsRepair) {
        console.log(`🔧 Repairing purchase ${purchase.orderNumber || purchase.id}...`);
        
        // Try to find tracking in alternative fields
        let trackingToUse = '';
        let carrierToUse = '';
        let shippingStatusToUse = 'ordered';

        // Check for tracking in various possible field names
        if (purchase.trackingNumber) {
          trackingToUse = purchase.trackingNumber;
        } else if (purchase.tracking_number) {
          trackingToUse = purchase.tracking_number;
        } else if (purchase.shipment?.trackingNumber) {
          trackingToUse = purchase.shipment.trackingNumber;
        } else if (purchase.shipment?.tracking) {
          trackingToUse = purchase.shipment.tracking;
        }

        // Check for carrier
        if (purchase.carrier) {
          carrierToUse = purchase.carrier;
        } else if (purchase.shipment?.carrier) {
          carrierToUse = purchase.shipment.carrier;
        }

        // Check for shipping status
        if (purchase.shippingStatus) {
          shippingStatusToUse = purchase.shippingStatus;
        } else if (purchase.shipping_status) {
          shippingStatusToUse = purchase.shipping_status;
        } else if (purchase.status && purchase.status.toLowerCase() === 'shipped') {
          shippingStatusToUse = 'shipped';
        } else if (purchase.status && purchase.status.toLowerCase() === 'delivered') {
          shippingStatusToUse = 'delivered';
        }

        // Update the purchase with the missing fields
        const updateData: any = {
          tracking: trackingToUse,
          carrier: carrierToUse,
          shippingStatus: shippingStatusToUse,
          lastRepaired: new Date().toISOString()
        };

        // Only update if we found some data to use
        if (trackingToUse || carrierToUse || shippingStatusToUse !== 'ordered') {
          await updateDocument('purchases', purchase.id, updateData);
          repairedCount++;
          
          results.push({
            orderNumber: purchase.orderNumber || purchase.id,
            status: 'repaired',
            tracking: trackingToUse || 'Not found',
            carrier: carrierToUse || 'Not found',
            shippingStatus: shippingStatusToUse
          });

          console.log(`✅ Repaired purchase ${purchase.orderNumber || purchase.id}: tracking="${trackingToUse}", carrier="${carrierToUse}"`);
        } else {
          results.push({
            orderNumber: purchase.orderNumber || purchase.id,
            status: 'no_data_found',
            message: 'No tracking data found in any field'
          });
        }
      } else {
        alreadyHadTracking++;
        results.push({
          orderNumber: purchase.orderNumber || purchase.id,
          status: 'already_has_tracking',
          tracking: purchase.tracking
        });
      }
    }

    console.log(`🎉 Missing tracking field repair completed!`);
    console.log(`  📊 Total purchases: ${purchases.length}`);
    console.log(`  ✅ Repaired: ${repairedCount}`);
    console.log(`  ✅ Already had tracking: ${alreadyHadTracking}`);

    return NextResponse.json({
      success: true,
      message: 'Missing tracking field repair completed successfully',
      results: {
        totalProcessed: purchases.length,
        repaired: repairedCount,
        alreadyHadTracking: alreadyHadTracking,
        details: results
      }
    });

  } catch (error) {
    console.error('❌ Error running missing tracking field repair:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to repair missing tracking fields',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

