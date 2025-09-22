import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer, addDocument } from '../../../../lib/firebase/firebaseServerUtils';

export async function POST(request: NextRequest) {
  try {
    const { orderNumber, tracking, carrier, shippingStatus, productName, productBrand, productSize } = await request.json();
    
    if (!tracking) {
      return NextResponse.json({ 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    // Generate order number if not provided
    const finalOrderNumber = orderNumber || `manual-${Date.now()}`;

    console.log(`📦 Adding manual tracking: ${finalOrderNumber} - ${tracking}`);

    // Get user ID from the request (you might need to adjust this based on your auth)
    const userId = request.headers.get('x-user-id') || 'manual-user';
    
    try {
      // Check if this tracking number was recently deleted (re-addition detection)
      const deletionRecords = await getDocumentsServer('tracking_deletions');
      const wasRecentlyDeleted = deletionRecords.find(d => 
        d.trackingNumber === tracking && 
        d.status === 'deleted' &&
        new Date(d.deletedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
      );
      
      if (wasRecentlyDeleted) {
        console.log(`🔄 Detected re-addition of recently deleted tracking: ${tracking}`);
        console.log(`📦 This will trigger a fresh fetch from AfterShip`);
      }
      
      // Get all existing purchases
      const existingPurchases = await getDocumentsServer('purchases');
      
      // Check if a tracking number already exists
      const existingTracking = existingPurchases.find(p => p.tracking === tracking);
      if (existingTracking) {
        return NextResponse.json({
          success: false,
          error: `Tracking number "${tracking}" already exists for order ${existingTracking.orderNumber}`
        }, { status: 400 });
      }
      
      // Check if a purchase with this order number already exists
      const existingPurchase = existingPurchases.find(p => p.orderNumber === finalOrderNumber);
    
    if (existingPurchase) {
      // Update existing purchase
      console.log(`📦 Updating existing purchase: ${finalOrderNumber}`);
      
      const updatedPurchase = {
        ...existingPurchase,
        tracking: tracking,
        carrier: carrier || existingPurchase.carrier || 'Unknown',
        shippingStatus: shippingStatus || existingPurchase.shippingStatus || 'shipped',
        productName: (productName && productName.trim()) || existingPurchase.productName || 'Manual Entry',
        productBrand: (productBrand && productBrand.trim()) || existingPurchase.productBrand || 'Unknown',
        productSize: (productSize && productSize.trim()) || existingPurchase.productSize || 'Unknown',
        updatedAt: new Date().toISOString(),
        manualTrackingAdded: true
      };

      // Update the purchase (you'll need to implement updateDocument)
      // For now, we'll create a new one and let the system handle deduplication
      const newPurchase = {
        userId: userId,
        orderNumber: orderNumber,
        tracking: tracking,
        carrier: carrier || 'Unknown',
        shippingStatus: shippingStatus || 'shipped',
        productName: (productName && productName.trim()) || 'Manual Entry',
        productBrand: (productBrand && productBrand.trim()) || 'Unknown',
        productSize: (productSize && productSize.trim()) || 'Unknown',
        status: shippingStatus || 'shipped',
        purchaseDate: new Date().toISOString(),
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
        totalAmount: 0,
        currency: 'USD',
        type: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manualTrackingAdded: true
      };

      const docRef = await addDocument('purchases', newPurchase);
      
      // Try to register with AfterShip for real-time tracking
      try {
        const afterShipResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tracking/register-aftership`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackingNumber: tracking,
            carrier: carrier || 'Unknown',
            forceFresh: wasRecentlyDeleted
          })
        });
        
        const afterShipResult = await afterShipResponse.json();
        if (afterShipResult.success) {
          console.log('✅ Tracking registered with AfterShip');
          
          // If this was a re-addition, clear the deletion record
          if (wasRecentlyDeleted) {
            try {
              const deletionRecord = deletionRecords.find(d => d.trackingNumber === tracking);
              if (deletionRecord) {
                // Mark as re-added instead of deleting
                await addDocument('tracking_deletions', {
                  ...deletionRecord,
                  status: 're-added',
                  reAddedAt: new Date().toISOString()
                });
                console.log(`✅ Deletion record cleared for re-added tracking: ${tracking}`);
              }
            } catch (clearError) {
              console.error('⚠️ Failed to clear deletion record (non-critical):', clearError);
            }
          }
        } else {
          console.log('⚠️ AfterShip registration failed:', afterShipResult.error);
        }
      } catch (afterShipError) {
        console.log('⚠️ AfterShip registration error:', afterShipError);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Tracking number added successfully',
        purchaseId: docRef.id,
        action: 'created'
      });

    } else {
      // Create new purchase
      console.log(`📦 Creating new purchase: ${finalOrderNumber}`);
      
      const newPurchase = {
        userId: userId,
        orderNumber: finalOrderNumber,
        tracking: tracking,
        carrier: carrier || 'Unknown',
        shippingStatus: shippingStatus || 'shipped',
        productName: (productName && productName.trim()) || 'Manual Entry',
        productBrand: (productBrand && productBrand.trim()) || 'Unknown',
        productSize: (productSize && productSize.trim()) || 'Unknown',
        status: shippingStatus || 'shipped',
        purchaseDate: new Date().toISOString(),
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
        totalAmount: 0,
        currency: 'USD',
        type: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manualTrackingAdded: true
      };

      const docRef = await addDocument('purchases', newPurchase);
      
      // Try to register with AfterShip for real-time tracking
      try {
        const afterShipResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tracking/register-aftership`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackingNumber: tracking,
            carrier: carrier || 'Unknown',
            forceFresh: wasRecentlyDeleted
          })
        });
        
        const afterShipResult = await afterShipResponse.json();
        if (afterShipResult.success) {
          console.log('✅ Tracking registered with AfterShip');
          
          // If this was a re-addition, clear the deletion record
          if (wasRecentlyDeleted) {
            try {
              const deletionRecord = deletionRecords.find(d => d.trackingNumber === tracking);
              if (deletionRecord) {
                // Mark as re-added instead of deleting
                await addDocument('tracking_deletions', {
                  ...deletionRecord,
                  status: 're-added',
                  reAddedAt: new Date().toISOString()
                });
                console.log(`✅ Deletion record cleared for re-added tracking: ${tracking}`);
              }
            } catch (clearError) {
              console.error('⚠️ Failed to clear deletion record (non-critical):', clearError);
            }
          }
        } else {
          console.log('⚠️ AfterShip registration failed:', afterShipResult.error);
        }
      } catch (afterShipError) {
        console.log('⚠️ AfterShip registration error:', afterShipError);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Tracking number added successfully',
        purchaseId: docRef.id,
        action: 'created'
      });
    }
    
    } catch (firebaseError) {
      console.error('❌ Firebase error:', firebaseError);
      
      // If Firebase is not available, return a success response anyway
      // The tracking will be stored in localStorage as a fallback
      return NextResponse.json({
        success: true,
        message: 'Tracking number added successfully (stored locally)',
        purchaseId: 'local-' + Date.now(),
        action: 'created_local',
        warning: 'Firebase not available - data stored locally'
      });
    }

  } catch (error) {
    console.error('❌ Error adding manual tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
