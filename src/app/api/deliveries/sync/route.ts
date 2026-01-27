import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';

// Simple in-memory storage for manual tracking during testing
const manualTrackingStorage = new Map<string, any[]>();

function firstNonEmptyString(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) return s;
    }
  }
  return undefined;
}

function pickProductName(purchase: any): string {
  return (
    firstNonEmptyString(
      purchase?.product?.name,
      purchase?.product?.productName,
      purchase?.product?.title,
      purchase?.productName,
      purchase?.name,
      purchase?.title,
      purchase?.itemName
    ) || 'Unknown Product'
  );
}

function pickBrand(purchase: any): string {
  return (
    firstNonEmptyString(
      purchase?.product?.brand,
      purchase?.productBrand,
      purchase?.brand,
      purchase?.product?.manufacturer
    ) || 'Unknown Brand'
  );
}

function pickSize(purchase: any): string {
  return (
    firstNonEmptyString(
      purchase?.product?.size,
      purchase?.productSize,
      purchase?.size
    ) || 'Unknown Size'
  );
}

function pickImage(purchase: any): string | null {
  return (
    firstNonEmptyString(
      purchase?.product?.image,
      purchase?.productImage,
      purchase?.image,
      purchase?.product?.img
    ) || null
  );
}

function sortDeliveriesNewestFirst(deliveries: any[]) {
  return deliveries.sort((a, b) => {
    const da = new Date(a?.lastUpdate || 0).getTime();
    const db = new Date(b?.lastUpdate || 0).getTime();
    return db - da;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const testTrackingNumber = searchParams.get('trackingNumber');
    const clientPurchases = searchParams.get('purchases'); // New: Accept purchases from client
    const includeLiveTracking =
      searchParams.get('includeLiveTracking') === null
        ? true
        : searchParams.get('includeLiveTracking') !== '0' && searchParams.get('includeLiveTracking') !== 'false';
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    console.log(`🔄 Starting delivery sync for user: ${userId}${testTrackingNumber ? ` with tracking: ${testTrackingNumber}` : ''}`);

    let uniquePurchases: any[] = [];

    // If client sends purchases (localStorage users), use those
    if (clientPurchases) {
      try {
        uniquePurchases = JSON.parse(decodeURIComponent(clientPurchases));
        console.log(`📦 Received ${uniquePurchases.length} purchases from client (localStorage)`);
      } catch (error) {
        console.error('❌ Failed to parse client purchases:', error);
        return NextResponse.json({ error: 'Invalid purchases data' }, { status: 400 });
      }
    } else {
      // Get all purchases from Firebase for the user
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
      uniquePurchases = allPurchases.filter((purchase, index, self) => 
        index === self.findIndex(p => p.id === purchase.id)
      );

      console.log(`📦 Found ${uniquePurchases.length} total purchases for user from Firebase`);
    }

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

    // Include any manual trackings added via PUT (in-memory during this process lifetime)
    const manualFromMemory = manualTrackingStorage.get(userId) || [];
    if (manualFromMemory.length > 0) {
      console.log(`📝 Including ${manualFromMemory.length} manual tracking entr${manualFromMemory.length === 1 ? 'y' : 'ies'} from memory`);
      purchasesWithTracking = [...manualFromMemory, ...purchasesWithTracking];
    }

    console.log(`📦 Found ${purchasesWithTracking.length} purchases with tracking numbers (including manual if any)`);

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

    // Extract tracking numbers (deduped) - and skip live tracking calls for delivered items
    const purchasesNeedingLiveTracking = includeLiveTracking
      ? purchasesWithTracking.filter((p: any) => String(p?.status || '').toLowerCase() !== 'delivered')
      : [];
    const trackingNumbers = includeLiveTracking
      ? Array.from(
          new Set(
            purchasesNeedingLiveTracking
              .map((purchase: any) => {
                return (
                  purchase.tracking ||
                  purchase.trackingNumber ||
                  purchase.tracking_number ||
                  purchase.shipment?.tracking ||
                  purchase.shipment?.trackingNumber
                );
              })
              .filter((v: any) => typeof v === 'string' && v.trim() !== '')
          )
        )
      : [];

    // Get live tracking data for all tracking numbers (if enabled)
    const liveTrackingData = includeLiveTracking ? await trackingService.getBulkTrackingInfo(trackingNumbers) : [];
    
    // Merge live tracking data with purchases
    const deliveriesWithLiveTracking = purchasesWithTracking.map((purchase: any) => {
      const trackingNumber = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number ||
                           purchase.shipment?.tracking ||
                           purchase.shipment?.trackingNumber;
      
      const liveTracking = liveTrackingData.find((tracking) => tracking.trackingNumber === trackingNumber);
      const hasValidLiveTracking = !!(liveTracking && !liveTracking.error);

      const toIsoDate = (raw: unknown): string | null => {
        if (!raw) return null;
        const dt = new Date(String(raw));
        if (Number.isNaN(dt.getTime())) return null;
        return dt.toISOString().split('T')[0];
      };

      // Always produce a delivery date so the UI never shows TBD.
      // Priority:
      // 1) Manual override
      // 2) Live tracking (estimated/actual)
      // 3) Purchase stored estimate
      // 4) Calculated (purchaseDate/createdAt + 5 days)
      const calcFallback = () => {
        const base =
          purchase?.purchaseDate ||
          purchase?.createdAt ||
          purchase?.updatedAt ||
          purchase?.timestamp ||
          null;
        const baseIso = toIsoDate(base);
        const dt = baseIso ? new Date(baseIso) : new Date();
        dt.setDate(dt.getDate() + 5);
        return dt.toISOString().split('T')[0];
      };

      const liveEstimated =
        hasValidLiveTracking
          ? toIsoDate(liveTracking?.estimatedDelivery) ||
            toIsoDate(liveTracking?.courierEstimatedDelivery) ||
            toIsoDate(liveTracking?.afterShipEstimatedDelivery)
          : null;
      const liveActual = hasValidLiveTracking ? toIsoDate(liveTracking?.actualDelivery) : null;
      const purchaseEstimate = toIsoDate(purchase?.estimatedDelivery);
      const manual = toIsoDate(purchase?.manualDeliveryDate);

      const computedEstimatedDelivery = manual || liveActual || liveEstimated || purchaseEstimate || calcFallback();

      return {
        id: purchase.id,
        trackingNumber: trackingNumber,
        carrier: (hasValidLiveTracking ? liveTracking?.carrier : undefined) || purchase.carrier || 'Unknown',
        productName: pickProductName(purchase),
        productBrand: pickBrand(purchase),
        productSize: pickSize(purchase),
        status: (hasValidLiveTracking ? liveTracking?.status : undefined) || (purchase.status || 'unknown'),
        estimatedDelivery: computedEstimatedDelivery,
        actualDelivery:
          liveActual ||
          toIsoDate(purchase?.actualDelivery) ||
          (String((hasValidLiveTracking ? liveTracking?.status : purchase?.status) || '').toLowerCase().trim() === 'delivered'
            ? computedEstimatedDelivery
            : undefined),
        origin: (hasValidLiveTracking ? liveTracking?.origin : undefined) || purchase.origin || 'Unknown',
        destination: (hasValidLiveTracking ? liveTracking?.destination : undefined) || purchase.destination || 'Unknown',
        lastUpdate:
          (hasValidLiveTracking ? liveTracking?.lastUpdate : undefined) ||
          firstNonEmptyString(purchase.updatedAt, purchase.lastUpdated, purchase.createdAt, purchase.purchaseDate) ||
          '1970-01-01T00:00:00.000Z',
        updates: (hasValidLiveTracking ? liveTracking?.updates : undefined) || [],
        liveTracking: liveTracking,
        isLiveTrackingEnabled: hasValidLiveTracking,
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
      deliveries: sortDeliveriesNewestFirst(deliveriesWithLiveTracking),
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
      carrier: carrier || undefined, // allow auto-detect downstream
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
    const {
      userId,
      forceRefresh = false,
      purchases: clientPurchases,
      fromLocalStorage = false,
      includeLiveTracking = true,
    } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    console.log(`🔄 Starting delivery sync for user: ${userId}${fromLocalStorage ? ' (localStorage)' : ' (Firebase)'}`);

    let uniquePurchases: any[] = [];

    // If client sends purchases (localStorage users), use those
    if (fromLocalStorage && clientPurchases) {
      uniquePurchases = clientPurchases;
      console.log(`📦 Received ${uniquePurchases.length} purchases from localStorage`);
    } else {
      // Get all purchases for the user from Firebase
      const [purchasesByUserId, purchasesByUid] = await Promise.all([
        getDocumentsServer('purchases', {
          where: [{ field: 'userId', operator: '==', value: userId }]
        }),
        getDocumentsServer('purchases', {
          where: [{ field: 'uid', operator: '==', value: userId }]
        })
      ]);

      const allPurchases = [...purchasesByUserId, ...purchasesByUid];
      uniquePurchases = allPurchases.filter((purchase, index, self) => 
        index === self.findIndex(p => p.id === purchase.id)
      );

      console.log(`📦 Found ${uniquePurchases.length} purchases from Firebase`);
    }

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

    // Extract tracking numbers (deduped) - and skip live tracking calls for delivered items
    const purchasesNeedingLiveTracking = includeLiveTracking
      ? purchasesWithTracking.filter((p: any) => String(p?.status || '').toLowerCase() !== 'delivered')
      : [];
    const trackingNumbers = includeLiveTracking
      ? Array.from(
          new Set(
            purchasesNeedingLiveTracking
              .map((purchase: any) => {
                return (
                  purchase.tracking ||
                  purchase.trackingNumber ||
                  purchase.tracking_number ||
                  purchase.shipment?.tracking ||
                  purchase.shipment?.trackingNumber
                );
              })
              .filter((v: any) => typeof v === 'string' && v.trim() !== '')
          )
        )
      : [];

    // Get live tracking data for all tracking numbers (if enabled)
    const liveTrackingData = includeLiveTracking ? await trackingService.getBulkTrackingInfo(trackingNumbers) : [];
    
    // Create delivery items with live tracking data
    const deliveries = purchasesWithTracking.map((purchase: any) => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number ||
                           purchase.shipment?.tracking ||
                           purchase.shipment?.trackingNumber;
      
      const liveTracking = liveTrackingData.find((lt) => lt.trackingNumber === trackingValue);
      const hasValidLiveTracking = !!(liveTracking && !liveTracking.error);
      
      // Determine delivery status from live tracking or purchase status
      let deliveryStatus = 'shipped';
      if (hasValidLiveTracking) {
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
      } else if (hasValidLiveTracking && liveTracking?.estimatedDelivery) {
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
        productName: pickProductName(purchase),
        productBrand: pickBrand(purchase),
        productSize: pickSize(purchase),
        productImage: pickImage(purchase),
        status: deliveryStatus,
        estimatedDelivery: estimatedDelivery,
        actualDelivery: deliveryStatus === 'delivered' ? estimatedDelivery : undefined,
        origin: (hasValidLiveTracking ? liveTracking?.origin : undefined) || 'Unknown Origin',
        destination: liveTracking?.destination || 'Your Address',
        lastUpdate:
          (hasValidLiveTracking ? liveTracking?.lastUpdate : undefined) ||
          firstNonEmptyString(purchase.updatedAt, purchase.createdAt, purchase.purchaseDate) ||
          '1970-01-01T00:00:00.000Z',
        updates: (hasValidLiveTracking ? liveTracking?.updates : undefined) || [{
          timestamp:
            firstNonEmptyString(purchase.updatedAt, purchase.createdAt, purchase.purchaseDate) ||
            '1970-01-01T00:00:00.000Z',
          location: deliveryStatus === 'delivered' ? 'Your Address' : 'In Transit',
          status: deliveryStatus === 'delivered' ? 'Delivered' : 
                 deliveryStatus === 'out_for_delivery' ? 'Out for Delivery' :
                 deliveryStatus === 'in_transit' ? 'In Transit' : 'Shipped',
          description: deliveryStatus === 'delivered' ? 'Package delivered' :
                      deliveryStatus === 'out_for_delivery' ? 'Package is out for delivery' :
                      deliveryStatus === 'in_transit' ? 'Package in transit' : 'Package shipped'
        }],
        liveTracking: liveTracking,
        isLiveTrackingEnabled: hasValidLiveTracking,
        // Additional courier information
        courierEstimatedDelivery: hasValidLiveTracking ? liveTracking?.courierEstimatedDelivery : undefined,
        afterShipEstimatedDelivery: hasValidLiveTracking ? liveTracking?.afterShipEstimatedDelivery : undefined,
        transitTime: hasValidLiveTracking ? liveTracking?.transitTime : undefined,
        deliveryType: hasValidLiveTracking ? liveTracking?.deliveryType : undefined,
        signatureRequired: hasValidLiveTracking ? liveTracking?.signatureRequired : undefined,
        courierTrackingLink: hasValidLiveTracking ? liveTracking?.courierTrackingLink : undefined,
        onTimeStatus: hasValidLiveTracking ? liveTracking?.onTimeStatus : undefined
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
      deliveries: sortDeliveriesNewestFirst(uniqueDeliveries),
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