import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 TEST: Getting all purchases to debug');
    
    // Get all purchases without filtering
    const allPurchases = await getDocumentsServer('purchases', {
      orderBy: { field: 'purchaseDate', direction: 'desc' }
    });

    console.log(`✅ TEST: Found ${allPurchases.length} total purchases in database`);

    // Show sample data
    const samplePurchases = allPurchases.slice(0, 3).map(p => ({
      id: p.id,
      userId: p.userId,
      uid: p.uid,
      orderNumber: p.orderNumber,
      tracking: p.tracking,
      trackingNumber: p.trackingNumber,
      tracking_number: p.tracking_number,
      shipment: p.shipment
    }));

    return NextResponse.json({ 
      success: true, 
      totalPurchases: allPurchases.length,
      samplePurchases,
      allPurchases: allPurchases.map(p => ({
        id: p.id,
        userId: p.userId,
        uid: p.uid,
        orderNumber: p.orderNumber
      }))
    });

  } catch (error) {
    console.error('❌ TEST: Error loading purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to load purchases',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

