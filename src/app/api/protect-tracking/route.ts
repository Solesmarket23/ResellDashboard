import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('🛡️ Starting tracking data protection...');

    // Get all purchases with existing tracking data
    const purchases = await getDocuments('purchases');
    const purchasesWithTracking = purchases.filter(p => 
      p.tracking && 
      p.tracking !== '' && 
      p.tracking !== 'No tracking' &&
      p.tracking !== null &&
      p.tracking !== undefined
    );

    console.log(`📊 Found ${purchasesWithTracking.length} purchases with tracking data`);

    const results = {
      totalProcessed: 0,
      protected: 0,
      alreadyProtected: 0,
      errors: 0,
      details: [] as any[]
    };

    for (const purchase of purchasesWithTracking) {
      try {
        results.totalProcessed++;

        // Check if already protected
        if (purchase.trackingProtected) {
          results.alreadyProtected++;
          results.details.push({
            orderNumber: purchase.orderNumber,
            status: 'already_protected',
            trackingValue: purchase.tracking
          });
          continue;
        }

        // Create protection data
        const protectionData = {
          trackingValue: purchase.tracking,
          carrier: purchase.carrier || 'Unknown',
          shippingStatus: purchase.shippingStatus || purchase.status || 'ordered',
          protectedAt: new Date().toISOString(),
          protectionVersion: '1.0'
        };

        // Update with protection flag
        const updateData = {
          trackingProtected: true,
          trackingBackup: protectionData,
          lastProtected: new Date().toISOString()
        };

        await updateDocument('purchases', purchase.id, updateData);

        results.protected++;
        results.details.push({
          orderNumber: purchase.orderNumber,
          status: 'protected',
          trackingValue: purchase.tracking,
          carrier: purchase.carrier
        });

        console.log(`🛡️ Protected tracking for ${purchase.orderNumber}: ${purchase.tracking}`);

      } catch (error) {
        results.errors++;
        results.details.push({
          orderNumber: purchase.orderNumber,
          status: 'error',
          error: error.message
        });
        console.error(`❌ Error protecting ${purchase.orderNumber}:`, error);
      }
    }

    console.log('🎉 Tracking protection completed!');
    console.log(`📈 Results: ${results.protected} protected, ${results.alreadyProtected} already protected, ${results.errors} errors`);

    return NextResponse.json({
      success: true,
      message: 'Tracking data protection completed successfully',
      results
    });

  } catch (error) {
    console.error('❌ Error running tracking protection:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to protect tracking data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

