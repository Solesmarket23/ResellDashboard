import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer, updateDocument } from '@/lib/firebase/firebaseServerUtils';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber, deliveryDate, userId } = await request.json();
    
    if (!trackingNumber || !deliveryDate || !userId) {
      return NextResponse.json({ 
        error: 'Tracking number, delivery date, and user ID are required' 
      }, { status: 400 });
    }

    console.log(`📅 Setting manual delivery date for ${trackingNumber}: ${deliveryDate}`);

    // Find the purchase with this tracking number
    const [purchasesByUserId, purchasesByUid] = await Promise.all([
      getDocumentsServer('purchases', {
        where: [{ field: 'userId', operator: '==', value: userId }]
      }),
      getDocumentsServer('purchases', {
        where: [{ field: 'uid', operator: '==', value: userId }]
      })
    ]);

    const allPurchases = [...purchasesByUserId, ...purchasesByUid];
    const uniquePurchases = allPurchases.filter((purchase, index, self) => 
      index === self.findIndex(p => p.id === purchase.id)
    );

    // Find the purchase with this tracking number
    const purchase = uniquePurchases.find((p: any) => {
      const trackingValue = p.tracking || 
                           p.trackingNumber || 
                           p.tracking_number ||
                           p.shipment?.tracking ||
                           p.shipment?.trackingNumber;
      return trackingValue === trackingNumber;
    });

    if (!purchase) {
      return NextResponse.json({ 
        error: `No purchase found with tracking number ${trackingNumber}` 
      }, { status: 404 });
    }

    // Update the purchase with the manual delivery date
    await updateDocument('purchases', purchase.id, {
      estimatedDelivery: deliveryDate,
      manualDeliveryDate: deliveryDate,
      lastUpdated: new Date().toISOString()
    });

    console.log(`✅ Updated purchase ${purchase.id} with delivery date ${deliveryDate}`);

    return NextResponse.json({
      success: true,
      message: `Delivery date set to ${deliveryDate} for tracking ${trackingNumber}`,
      purchaseId: purchase.id,
      deliveryDate: deliveryDate
    });

  } catch (error) {
    console.error('❌ Error setting delivery date:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
