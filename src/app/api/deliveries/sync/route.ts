import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';

// Simple in-memory storage for manual tracking during testing
const manualTrackingStorage = new Map<string, any[]>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const testTrackingNumber = searchParams.get('trackingNumber');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    console.log(`🔄 Starting delivery sync for user: ${userId}${testTrackingNumber ? ` with tracking: ${testTrackingNumber}` : ''}`);

    // Get all purchases for the user
    const [purchasesByUserId, purchasesByUid] = await Promise.all([
      getDocumentsServer('purchases', {
        where: [{ field: 'userId', operator: '==', value: userId }]
      }),
      getDocumentsServer('purchases', {
        where: [{ field: 'uid', operator: '==', value: userId }]
      })
    ]);

    // Combine and deduplicate purchases
    const allPurchases = [...purchasesByUserId, ...purchasesByUid];
    const uniquePurchases = allPurchases.filter((purchase, index, self) => 
      index === self.findIndex(p => p.id === purchase.id)
    );

    console.log(`📦 Found ${uniquePurchases.length} total purchases for user`);

    // Filter purchases with tracking numbers
    let purchasesWithTracking = uniquePurchases.filter((purchase: any) => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number ||
                           purchase.shipment?.tracking ||
                           purchase.shipment?.trackingNumber;
      return trackingValue && 
             trackingValue.trim() !== '' && 
             trackingValue !== 'TBD';
    });

    console.log(`📦 Found ${purchasesWithTracking.length} purchases with tracking numbers`);

    // If no purchases found, add some test data for demonstration
    if (purchasesWithTracking.length === 0) {
      console.log('🧪 No purchases found, adding test data for demonstration');
      
      if (testTrackingNumber) {
        // Use the provided tracking number for testing
        purchasesWithTracking = [
          {
            id: 'test-custom',
            orderNumber: 'TEST-001',
            productName: 'Test Package',
            productBrand: 'Test Brand',
            productSize: 'Test Size',
            status: 'shipped',
            tracking: testTrackingNumber,
            trackingNumber: testTrackingNumber,
            carrier: 'UPS',
            purchaseDate: new Date().toISOString(),
            price: 100.00,
            platform: 'Test',
            userId: userId,
            uid: userId
          }
        ];
        console.log(`🧪 Using custom tracking number: ${testTrackingNumber}`);
      } else {
        // Default test data
        purchasesWithTracking = [
          {
            id: 'test-1',
            orderNumber: 'STX-001',
            productName: 'Air Jordan 1 Retro High OG',
            productBrand: 'Jordan',
            productSize: '10.5',
            status: 'shipped',
            tracking: '1ZR1H0140329378751',
            trackingNumber: '1ZR1H0140329378751',
            carrier: 'UPS',
            purchaseDate: new Date().toISOString(),
            price: 180.00,
            platform: 'StockX',
            userId: userId,
            uid: userId
          },
          {
            id: 'test-2',
            orderNumber: 'STX-002',
            productName: 'Nike Dunk Low Panda',
            productBrand: 'Nike',
            productSize: '9',
            status: 'in_transit',
            tracking: '1Z999BB9876543210',
            trackingNumber: '1Z999BB9876543210',
            carrier: 'UPS',
            purchaseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            price: 120.00,
            platform: 'StockX',
            userId: userId,
            uid: userId
          }
        ];
      }
    }

    // Extract tracking numbers
    const trackingNumbers = purchasesWithTracking.map((purchase: any) => {
      return purchase.tracking || 
             purchase.trackingNumber || 
             purchase.tracking_number ||
             purchase.shipment?.tracking ||
             purchase.shipment?.trackingNumber;
    });

    // Get live tracking data for all tracking numbers
    const liveTrackingData = await trackingService.getBulkTrackingInfo(trackingNumbers);
    
    // Merge live tracking data with purchases
    const deliveriesWithLiveTracking = purchasesWithTracking.map((purchase: any) => {
      const trackingNumber = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number ||
                           purchase.shipment?.tracking ||
                           purchase.shipment?.trackingNumber;
      
      const liveTracking = liveTrackingData.find(tracking => 
        tracking.trackingNumber === trackingNumber
      );

      return {
        id: purchase.id,
        trackingNumber: trackingNumber,
        carrier: liveTracking?.carrier || purchase.carrier || 'Unknown',
        productName: purchase.productName || 'Unknown Product',
        productBrand: purchase.productBrand || 'Unknown Brand',
        productSize: purchase.productSize || 'Unknown Size',
        status: liveTracking?.status || purchase.status || 'unknown',
        estimatedDelivery: liveTracking?.estimatedDelivery || purchase.estimatedDelivery || 'TBD',
        actualDelivery: liveTracking?.actualDelivery || purchase.actualDelivery,
        origin: liveTracking?.origin || purchase.origin || 'Unknown',
        destination: liveTracking?.destination || purchase.destination || 'Unknown',
        lastUpdate: liveTracking?.lastUpdate || purchase.lastUpdated || new Date().toISOString(),
        updates: liveTracking?.updates || [],
        liveTracking: liveTracking,
        isLiveTrackingEnabled: true,
        // Additional fields
        orderNumber: purchase.orderNumber,
        purchaseDate: purchase.purchaseDate,
        price: purchase.price,
        platform: purchase.platform
      };
    });

    const liveTrackingCount = deliveriesWithLiveTracking.filter(d => d.liveTracking && !d.liveTracking.error).length;
    const errorCount = deliveriesWithLiveTracking.filter(d => d.liveTracking?.error).length;

    console.log(`✅ Delivery sync completed: ${deliveriesWithLiveTracking.length} deliveries, ${liveTrackingCount} with live data, ${errorCount} errors`);

    return NextResponse.json({
      success: true,
      deliveries: deliveriesWithLiveTracking,
      count: deliveriesWithLiveTracking.length,
      liveTrackingCount,
      errorCount,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error syncing deliveries:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Add manual tracking to in-memory storage
export async function PUT(request: NextRequest) {
  try {
    const { userId, trackingNumber, productName, productBrand, productSize, carrier } = await request.json();
    
    if (!userId || !trackingNumber) {
      return NextResponse.json({ error: 'User ID and tracking number are required' }, { status: 400 });
    }

    const manualTracking = {
      id: `manual-${Date.now()}`,
      userId: userId,
      orderNumber: `manual-${Date.now()}`,
      tracking: trackingNumber,
      trackingNumber: trackingNumber,
      carrier: carrier || 'UPS',
      productName: productName || 'Manual Test Package',
      productBrand: productBrand || 'Test Brand',
      productSize: productSize || 'Unknown',
      status: 'shipped',
      purchaseDate: new Date().toISOString(),
      price: 0,
      platform: 'Manual Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in memory
    if (!manualTrackingStorage.has(userId)) {
      manualTrackingStorage.set(userId, []);
    }
    manualTrackingStorage.get(userId)!.push(manualTracking);

    return NextResponse.json({
      success: true,
      message: 'Manual tracking added successfully',
      tracking: manualTracking
    });

  } catch (error) {
    console.error('❌ Error adding manual tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Delete manual tracking from in-memory storage
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const trackingNumber = searchParams.get('trackingNumber');
    
    if (!userId || !trackingNumber) {
      return NextResponse.json({ error: 'User ID and tracking number are required' }, { status: 400 });
    }

    if (manualTrackingStorage.has(userId)) {
      const userTrackings = manualTrackingStorage.get(userId)!;
      const filteredTrackings = userTrackings.filter(t => t.trackingNumber !== trackingNumber);
      manualTrackingStorage.set(userId, filteredTrackings);
    }

    return NextResponse.json({
      success: true,
      message: 'Manual tracking deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting manual tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, forceRefresh = false } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    console.log(`🔄 Starting delivery sync for user: ${userId}`);

    // Get all purchases for the user
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

    // Filter purchases with tracking numbers
    let purchasesWithTracking = uniquePurchases.filter((purchase: any) => {
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

    // If no purchases found, add some test data for demonstration
    if (purchasesWithTracking.length === 0) {
      console.log('🧪 No purchases found, adding test data for demonstration');
      purchasesWithTracking = [
        {
          id: 'test-1',
          orderNumber: 'STX-001',
          productName: 'Air Jordan 1 Retro High OG',
          productBrand: 'Jordan',
          productSize: '10.5',
          status: 'shipped',
          tracking: '1ZR1H0140329378751',
          trackingNumber: '1ZR1H0140329378751',
          carrier: 'UPS',
          purchaseDate: new Date().toISOString(),
          price: 180.00,
          platform: 'StockX',
          userId: userId,
          uid: userId
        },
        {
          id: 'test-2',
          orderNumber: 'STX-002',
          productName: 'Nike Dunk Low Panda',
          productBrand: 'Nike',
          productSize: '9',
          status: 'in_transit',
          tracking: '1Z999BB9876543210',
          trackingNumber: '1Z999BB9876543210',
          carrier: 'UPS',
          purchaseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          price: 120.00,
          platform: 'StockX',
          userId: userId,
          uid: userId
        }
      ];
    }

    // Extract tracking numbers
    const trackingNumbers = purchasesWithTracking.map((purchase: any) => {
      return purchase.tracking || 
             purchase.trackingNumber || 
             purchase.tracking_number ||
             purchase.shipment?.tracking ||
             purchase.shipment?.trackingNumber;
    });

    // Get live tracking data for all tracking numbers
    const liveTrackingData = await trackingService.getBulkTrackingInfo(trackingNumbers);
    
    // Create delivery items with live tracking data
    const deliveries = purchasesWithTracking.map((purchase: any) => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number ||
                           purchase.shipment?.tracking ||
                           purchase.shipment?.trackingNumber;
      
      const liveTracking = liveTrackingData.find(lt => lt.trackingNumber === trackingValue);
      
      // Determine delivery status from live tracking or purchase status
      let deliveryStatus = 'shipped';
      if (liveTracking) {
        deliveryStatus = liveTracking.status;
      } else {
        // Map purchase status to delivery status
        switch (purchase.status?.toLowerCase()) {
          case 'delivered':
            deliveryStatus = 'delivered';
            break;
          case 'shipped':
            deliveryStatus = 'shipped';
            break;
          case 'in transit':
          case 'in_transit':
            deliveryStatus = 'in_transit';
            break;
          case 'out for delivery':
          case 'out_for_delivery':
            deliveryStatus = 'out_for_delivery';
            break;
          default:
            deliveryStatus = 'shipped';
        }
      }

      // Determine carrier
      const getCarrier = (tracking: string, storedCarrier?: string) => {
        if (storedCarrier) return storedCarrier;
        if (tracking.startsWith('1Z')) return 'UPS';
        if (/^[0-9]{12,15}$/.test(tracking)) return 'FedEx';
        if (/^9[0-9]{19,21}$/.test(tracking)) return 'USPS';
        if (/^[0-9]{10}$/.test(tracking)) return 'DHL';
        return 'Unknown';
      };

      const carrier = getCarrier(trackingValue, purchase.carrier);

      // Use live tracking estimated delivery or fallback to calculated
      let estimatedDelivery = 'TBD';
      
      // Priority order for estimated delivery:
      // 1. Manual delivery date (highest priority)
      // 2. Live tracking estimated delivery
      // 3. Purchase estimated delivery
      // 4. Calculated estimate
      
      if (purchase.manualDeliveryDate) {
        console.log(`📦 Using manual delivery date: ${purchase.manualDeliveryDate} for ${trackingValue}`);
        estimatedDelivery = purchase.manualDeliveryDate;
      } else if (liveTracking?.estimatedDelivery) {
        console.log(`📦 Using live tracking estimated delivery: ${liveTracking.estimatedDelivery} for ${trackingValue}`);
        estimatedDelivery = liveTracking.estimatedDelivery;
      } else if (purchase.estimatedDelivery) {
        console.log(`📦 Using purchase estimated delivery: ${purchase.estimatedDelivery} for ${trackingValue}`);
        estimatedDelivery = purchase.estimatedDelivery;
      } else {
        // Calculate estimated delivery (purchase date + 5 days)
        const purchaseDate = new Date(purchase.createdAt || purchase.purchaseDate);
        const estimated = new Date(purchaseDate);
        estimated.setDate(estimated.getDate() + 5);
        estimatedDelivery = estimated.toISOString().split('T')[0];
        console.log(`📦 Using calculated estimated delivery: ${estimatedDelivery} for ${trackingValue}`);
      }

      return {
        id: purchase.id || purchase.orderNumber,
        trackingNumber: trackingValue,
        carrier: carrier,
        productName: purchase.product?.name || purchase.productName || 'Unknown Product',
        productBrand: purchase.product?.brand || purchase.brand || 'Unknown Brand',
        productSize: purchase.product?.size || purchase.size || 'Unknown Size',
        status: deliveryStatus,
        estimatedDelivery: estimatedDelivery,
        actualDelivery: deliveryStatus === 'delivered' ? estimatedDelivery : undefined,
        origin: liveTracking?.origin || 'Unknown Origin',
        destination: liveTracking?.destination || 'Your Address',
        lastUpdate: liveTracking?.lastUpdate || purchase.updatedAt || purchase.createdAt || new Date().toISOString(),
        updates: liveTracking?.updates || [{
          timestamp: purchase.updatedAt || purchase.createdAt || new Date().toISOString(),
          location: deliveryStatus === 'delivered' ? 'Your Address' : 'In Transit',
          status: deliveryStatus === 'delivered' ? 'Delivered' : 
                 deliveryStatus === 'out_for_delivery' ? 'Out for Delivery' :
                 deliveryStatus === 'in_transit' ? 'In Transit' : 'Shipped',
          description: deliveryStatus === 'delivered' ? 'Package delivered' :
                      deliveryStatus === 'out_for_delivery' ? 'Package is out for delivery' :
                      deliveryStatus === 'in_transit' ? 'Package in transit' : 'Package shipped'
        }],
        liveTracking: liveTracking,
        isLiveTrackingEnabled: !!liveTracking && !liveTracking.error,
        // Additional courier information
        courierEstimatedDelivery: liveTracking?.courierEstimatedDelivery,
        afterShipEstimatedDelivery: liveTracking?.afterShipEstimatedDelivery,
        transitTime: liveTracking?.transitTime,
        deliveryType: liveTracking?.deliveryType,
        signatureRequired: liveTracking?.signatureRequired,
        courierTrackingLink: liveTracking?.courierTrackingLink,
        onTimeStatus: liveTracking?.onTimeStatus
      };
    });

    // Deduplicate by tracking number (keep most recent)
    const uniqueDeliveries = deliveries.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex(delivery => delivery.trackingNumber === current.trackingNumber);
      
      if (existingIndex === -1) {
        acc.push(current);
      } else {
        const existing = acc[existingIndex];
        const currentDate = new Date(current.lastUpdate);
        const existingDate = new Date(existing.lastUpdate);
        
        if (currentDate > existingDate) {
          acc[existingIndex] = current;
        }
      }
      
      return acc;
    }, []);

    console.log(`✅ Synced ${uniqueDeliveries.length} deliveries (${deliveries.length - uniqueDeliveries.length} duplicates removed)`);

    return NextResponse.json({
      success: true,
      deliveries: uniqueDeliveries,
      count: uniqueDeliveries.length,
      liveTrackingCount: liveTrackingData.filter(lt => !lt.error).length,
      errorCount: liveTrackingData.filter(lt => lt.error).length,
      lastSync: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error syncing deliveries:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}