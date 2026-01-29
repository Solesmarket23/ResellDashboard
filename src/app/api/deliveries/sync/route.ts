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
      purchase?.product?.imageUrl,
      purchase?.product?.image_url,
      purchase?.product?.thumbnail,
      purchase?.product?.thumbnailUrl,
      purchase?.product?.thumb,
      Array.isArray(purchase?.product?.images) ? purchase.product.images[0] : null,
      Array.isArray(purchase?.images) ? purchase.images[0] : null,
      purchase?.productImageUrl,
      purchase?.productImage,
      purchase?.image,
      purchase?.imageUrl,
      purchase?.product?.img
    ) || null
  );
}

function buildGmailEmailUrl(args: { emailId?: unknown; orderNumber?: unknown; trackingNumber?: unknown }): string | null {
  const emailId = typeof args.emailId === 'string' ? args.emailId.trim() : '';
  if (emailId && !emailId.startsWith('manual:')) {
    // Avoid hardcoding /u/0 which can be the wrong account when users have multiple Gmail accounts.
    return `https://mail.google.com/mail/#all/${encodeURIComponent(emailId)}`;
  }
  const orderNumber = typeof args.orderNumber === 'string' ? args.orderNumber.trim() : '';
  if (orderNumber) {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(`"${orderNumber}"`)}`;
  }
  const trackingNumber = typeof args.trackingNumber === 'string' ? args.trackingNumber.trim() : '';
  if (trackingNumber) {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(`"${trackingNumber}"`)}`;
  }
  return null;
}

function normalizeTrackingError(error: unknown): string | null {
  if (typeof error !== 'string') return null;
  const msg = error.trim();
  if (!msg) return null;
  const lower = msg.toLowerCase();

  if (
    lower.includes('tracking not found') ||
    lower.includes('no tracking results') ||
    lower.includes('unable to locate') ||
    (lower.includes('not found') && lower.includes('tracking'))
  ) {
    return 'Tracking not found — check the number';
  }

  if (lower.includes('api not configured') || lower.includes('no tracking apis configured')) {
    return 'Live tracking not configured';
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Tracking lookup timed out — try again';
  }

  // Keep it user-friendly; raw carrier errors can be noisy.
  return 'Tracking lookup error — try again';
}

function inferTrackingNotFound(liveTracking: any): boolean {
  if (!liveTracking) return false;
  if (liveTracking?.error) return false; // explicit errors handled elsewhere
  const status = String(liveTracking?.status || '').toLowerCase().trim();
  if (status !== 'unknown') return false;

  const updates = Array.isArray(liveTracking?.updates) ? liveTracking.updates : [];
  const hasAnyDates =
    !!liveTracking?.estimatedDelivery ||
    !!liveTracking?.actualDelivery ||
    !!liveTracking?.courierEstimatedDelivery ||
    !!liveTracking?.afterShipEstimatedDelivery ||
    !!liveTracking?.commitmentDate ||
    !!liveTracking?.appointmentDeliveryDate ||
    !!liveTracking?.deliveryTimeWindow?.estimated?.starts ||
    !!liveTracking?.deliveryTimeWindow?.estimated?.ends;

  const hasAnySignal = updates.length > 0 || hasAnyDates;
  return !hasAnySignal;
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
    const includeArchived =
      searchParams.get('includeArchived') === '1' ||
      searchParams.get('includeArchived') === 'true' ||
      searchParams.get('includeArchived') === 'yes';
    
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

    // Purchases eligible for Deliveries:
    // - those with tracking numbers (normal)
    // - AND those missing tracking but still in a shipped/in-progress state (so the user can fix bad/missing tracking)
    const hasTracking = (purchase: any): boolean => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number ||
                           purchase.shipment?.tracking ||
                           purchase.shipment?.trackingNumber;
      return !!(typeof trackingValue === 'string' && trackingValue.trim() !== '' && trackingValue !== 'TBD');
    };

    const isInProgressStatus = (purchase: any): boolean => {
      const s = String(purchase?.status || purchase?.shippingStatus || '').toLowerCase().trim();
      // Keep this intentionally broad; Deliveries will show "Needs tracking" when tracking is missing/cleared.
      return s === 'shipped' || s === 'in transit' || s === 'in_transit' || s === 'out for delivery' || s === 'out_for_delivery';
    };

    const isArchivedPurchase = (purchase: any): boolean => {
      const at = firstNonEmptyString(purchase?.archivedAt, purchase?.archived_at);
      if (at) return true;
      return purchase?.archived === true || purchase?.isArchived === true;
    };

    // Default: hide archived purchases from Deliveries.
    // When includeArchived=1, include them so the UI can restore them, but do not live-track them.
    let purchasesWithTracking = uniquePurchases.filter((purchase: any) => {
      const archived = isArchivedPurchase(purchase);
      if (!includeArchived && archived) return false;
      // Active purchases: include those with tracking or in-progress status
      if (!archived) return hasTracking(purchase) || isInProgressStatus(purchase);
      // Archived purchases: include for restore view
      return true;
    });

    // Include any manual trackings added via PUT (in-memory during this process lifetime)
    const manualFromMemory = manualTrackingStorage.get(userId) || [];
    if (manualFromMemory.length > 0) {
      console.log(`📝 Including ${manualFromMemory.length} manual tracking entr${manualFromMemory.length === 1 ? 'y' : 'ies'} from memory`);
      purchasesWithTracking = [...manualFromMemory, ...purchasesWithTracking];
    }

    console.log(`📦 Found ${purchasesWithTracking.length} purchases eligible for deliveries (tracking + in-progress)`);

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
      ? purchasesWithTracking.filter(
          (p: any) => !isArchivedPurchase(p) && String(p?.status || '').toLowerCase() !== 'delivered' && hasTracking(p)
        )
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
      const trackingStr = typeof trackingNumber === 'string' ? trackingNumber.trim() : '';
      const trackingMissing = trackingStr === '' || trackingStr === 'TBD';
      
      const archivedAt = firstNonEmptyString(purchase?.archivedAt, purchase?.archived_at) || null;
      const isArchived = isArchivedPurchase(purchase);

      const liveTracking =
        trackingMissing || isArchived
          ? undefined
          : liveTrackingData.find((tracking) => tracking.trackingNumber === trackingStr);
      const hasValidLiveTracking = !!(liveTracking && !liveTracking.error);
      const friendlyTrackingError =
        normalizeTrackingError(liveTracking?.error) ||
        (inferTrackingNotFound(liveTracking) ? 'Tracking not found — check the number' : null);

      const toIsoDate = (raw: unknown): string | null => {
        if (!raw) return null;
        const dt = new Date(String(raw));
        if (Number.isNaN(dt.getTime())) return null;
        return dt.toISOString().split('T')[0];
      };

      const manualDate = toIsoDate(purchase?.manualDeliveryDate);
      const purchaseEstimated = toIsoDate(purchase?.estimatedDelivery);

      const liveEstimated =
        hasValidLiveTracking
          ? toIsoDate(liveTracking?.estimatedDelivery) ||
            toIsoDate(liveTracking?.courierEstimatedDelivery) ||
            toIsoDate(liveTracking?.afterShipEstimatedDelivery)
          : null;
      const liveActual =
        hasValidLiveTracking
          ? toIsoDate(liveTracking?.actualDelivery) ||
            // Best-effort: if carrier marks delivered but doesn't provide a date, use lastUpdate / last scan date.
            (String(liveTracking?.status || '').toLowerCase().trim() === 'delivered'
              ? toIsoDate(liveTracking?.lastUpdate) || toIsoDate(liveTracking?.updates?.[0]?.timestamp)
              : null)
          : null;

      const rawStatus = String((hasValidLiveTracking ? liveTracking?.status : purchase?.status) || 'unknown')
        .toLowerCase()
        .trim();
      const normalizedStatus = rawStatus || 'unknown';

      // When live tracking is not included (first-paint "lite" payload), many purchases don't have a reliable
      // `status` field. Use a robust fallback (status/shippingStatus/shipping_status) so the UI doesn't show UNKNOWN.
      const purchaseStatus = String(purchase?.status || purchase?.shippingStatus || purchase?.shipping_status || '')
        .toLowerCase()
        .trim();
      let fallbackStatus: any = 'shipped';
      switch (purchaseStatus) {
        case 'delivered':
          fallbackStatus = 'delivered';
          break;
        case 'shipped':
          fallbackStatus = 'shipped';
          break;
        case 'in transit':
        case 'in_transit':
          fallbackStatus = 'in_transit';
          break;
        case 'out for delivery':
        case 'out_for_delivery':
          fallbackStatus = 'out_for_delivery';
          break;
        case 'label_created':
        case 'pre_transit':
          fallbackStatus = 'shipped';
          break;
        default:
          fallbackStatus = 'shipped';
      }

      // Label-created / awaiting scan: carrier has no ETA and no scan history.
      const hasScans = hasValidLiveTracking ? (Array.isArray(liveTracking?.updates) && liveTracking.updates.length > 0) : false;
      const isLabelCreated =
        hasValidLiveTracking &&
        normalizedStatus === 'shipped' &&
        !hasScans &&
        !liveEstimated &&
        !liveActual;

      let statusNote: string | undefined;
      if (isArchived) statusNote = 'Archived';
      else if (trackingMissing) statusNote = 'Needs tracking — add the correct number';
      else if (friendlyTrackingError) statusNote = friendlyTrackingError;
      else if (isLabelCreated) statusNote = 'Label created — awaiting carrier scan';
      else if (normalizedStatus !== 'delivered' && !manualDate && !liveEstimated && !purchaseEstimated) {
        // On first paint we sometimes return a "lite" payload without live tracking.
        // Avoid implying the carrier has no ETA until we've actually attempted a lookup.
        statusNote = includeLiveTracking ? 'No ETA yet' : 'Verifying tracking…';
      }

      // Delivery date rules:
      // - Label created / no ETA: keep TBD (plus note)
      // - On the way with ETA: show ETA
      // - Delivered: show actual delivery date
      const estimatedDelivery =
        normalizedStatus === 'delivered'
          ? 'TBD'
          : manualDate || liveEstimated || purchaseEstimated || 'TBD';
      const actualDelivery =
        normalizedStatus === 'delivered'
          ? liveActual || toIsoDate(purchase?.actualDelivery) || manualDate || undefined
          : undefined;

      return {
        id: purchase.id,
        trackingNumber: trackingMissing ? '' : trackingStr,
        carrier: (liveTracking?.carrier as any) || purchase.carrier || 'Unknown',
        productName: pickProductName(purchase),
        productBrand: pickBrand(purchase),
        productSize: pickSize(purchase),
        productImage: pickImage(purchase),
        status: (hasValidLiveTracking ? liveTracking?.status : undefined) || (friendlyTrackingError ? 'unknown' : fallbackStatus),
        estimatedDelivery,
        actualDelivery,
        statusNote,
        archivedAt,
        emailUrl: buildGmailEmailUrl({
          emailId: (purchase as any)?.emailId || (purchase as any)?.email_id || (purchase as any)?.gmailEmailId,
          orderNumber: (purchase as any)?.orderNumber,
          trackingNumber: trackingMissing ? undefined : trackingStr,
        }),
        origin: (hasValidLiveTracking ? liveTracking?.origin : undefined) || purchase.origin || 'Unknown',
        destination: (hasValidLiveTracking ? liveTracking?.destination : undefined) || purchase.destination || 'Unknown',
        lastUpdate:
          (hasValidLiveTracking ? liveTracking?.lastUpdate : undefined) ||
          firstNonEmptyString(purchase.updatedAt, purchase.lastUpdated, purchase.createdAt, purchase.purchaseDate) ||
          '1970-01-01T00:00:00.000Z',
        updates: (hasValidLiveTracking ? liveTracking?.updates : undefined) || [],
        liveTracking: liveTracking,
        isLiveTrackingEnabled: !isArchived && hasValidLiveTracking,
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
      includeArchived = false,
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

    // Purchases eligible for Deliveries:
    // - those with tracking numbers (normal)
    // - AND those missing tracking but still in a shipped/in-progress state (so the user can fix bad/missing tracking)
    const hasTracking = (purchase: any): boolean => {
      const v =
        purchase.tracking ||
        purchase.trackingNumber ||
        purchase.tracking_number ||
        purchase.shipment?.tracking ||
        purchase.shipment?.trackingNumber;
      return !!(typeof v === 'string' && v.trim() !== '' && v.trim() !== 'TBD' && v.trim() !== 'N/A' && v.trim() !== 'No tracking');
    };

    const isInProgressStatus = (purchase: any): boolean => {
      const s = String(purchase?.status || purchase?.shippingStatus || '').toLowerCase().trim();
      return s === 'shipped' || s === 'in transit' || s === 'in_transit' || s === 'out for delivery' || s === 'out_for_delivery';
    };

    const isArchivedPurchase = (purchase: any): boolean => {
      const at = firstNonEmptyString(purchase?.archivedAt, purchase?.archived_at);
      if (at) return true;
      return purchase?.archived === true || purchase?.isArchived === true;
    };

    let purchasesWithTracking = uniquePurchases.filter((purchase: any) => {
      const archived = isArchivedPurchase(purchase);
      if (!includeArchived && archived) return false;
      if (!archived) return hasTracking(purchase) || isInProgressStatus(purchase);
      return true;
    });

    console.log(`📦 Found ${purchasesWithTracking.length} purchases eligible for deliveries (tracking + in-progress)`);

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
      ? purchasesWithTracking.filter(
          (p: any) => !isArchivedPurchase(p) && String(p?.status || '').toLowerCase() !== 'delivered' && hasTracking(p)
        )
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
      const trackingStr = typeof trackingValue === 'string' ? trackingValue.trim() : '';
      const trackingMissing = trackingStr === '' || trackingStr === 'TBD';

      const archivedAt = firstNonEmptyString(purchase?.archivedAt, purchase?.archived_at) || null;
      const isArchived = isArchivedPurchase(purchase);
      const liveTracking =
        trackingMissing || isArchived ? undefined : liveTrackingData.find((lt) => lt.trackingNumber === trackingStr);
      const hasValidLiveTracking = !!(liveTracking && !liveTracking.error);
      const friendlyTrackingError =
        normalizeTrackingError(liveTracking?.error) ||
        (inferTrackingNotFound(liveTracking) ? 'Tracking not found — check the number' : null);
      
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
        if (!tracking) return 'Unknown';
        if (tracking.startsWith('1Z')) return 'UPS';
        if (/^[0-9]{12,15}$/.test(tracking)) return 'FedEx';
        if (/^9[0-9]{19,21}$/.test(tracking)) return 'USPS';
        if (/^[0-9]{10}$/.test(tracking)) return 'DHL';
        return 'Unknown';
      };

      const carrier = getCarrier(trackingStr, purchase.carrier);

      // Use live tracking estimated delivery or fallback to calculated
      let estimatedDelivery = 'TBD';
      let actualDelivery: string | undefined;
      let statusNote: string | undefined;

      const toIsoDate = (raw: unknown): string | null => {
        if (!raw) return null;
        const dt = new Date(String(raw));
        if (Number.isNaN(dt.getTime())) return null;
        return dt.toISOString().split('T')[0];
      };
      
      // Priority order for delivery dates:
      // - Label created / no ETA: keep TBD + statusNote
      // - On the way with ETA: show ETA
      // - Delivered: show actual delivery date
      
      const manualDate = toIsoDate(purchase.manualDeliveryDate);
      const purchaseEstimated = toIsoDate(purchase.estimatedDelivery);
      const liveEstimated =
        hasValidLiveTracking
          ? toIsoDate(liveTracking?.estimatedDelivery) ||
            toIsoDate(liveTracking?.courierEstimatedDelivery) ||
            toIsoDate(liveTracking?.afterShipEstimatedDelivery)
          : null;
      const liveActual =
        hasValidLiveTracking
          ? toIsoDate(liveTracking?.actualDelivery) ||
            (String(liveTracking?.status || '').toLowerCase().trim() === 'delivered'
              ? toIsoDate(liveTracking?.lastUpdate) || toIsoDate(liveTracking?.updates?.[0]?.timestamp)
              : null)
          : null;

      const rawStatus = String((hasValidLiveTracking ? liveTracking?.status : purchase?.status) || deliveryStatus)
        .toLowerCase()
        .trim();

      const hasScans = hasValidLiveTracking ? (Array.isArray(liveTracking?.updates) && liveTracking.updates.length > 0) : false;
      const isLabelCreated =
        hasValidLiveTracking &&
        rawStatus === 'shipped' &&
        !hasScans &&
        !liveEstimated &&
        !liveActual;

      if (rawStatus === 'delivered' || deliveryStatus === 'delivered') {
        actualDelivery = liveActual || toIsoDate(purchase.actualDelivery) || manualDate || undefined;
        estimatedDelivery = 'TBD';
        if (!actualDelivery) statusNote = 'Delivered — date not provided by carrier';
      } else {
        estimatedDelivery = manualDate || liveEstimated || purchaseEstimated || 'TBD';
        if (isArchived) statusNote = 'Archived';
        else if (trackingMissing) statusNote = 'Needs tracking — add the correct number';
        else if (friendlyTrackingError) statusNote = friendlyTrackingError;
        else if (isLabelCreated) statusNote = 'Label created — awaiting carrier scan';
        else if (estimatedDelivery === 'TBD') statusNote = includeLiveTracking ? 'No ETA yet' : 'Verifying tracking…';
      }

      return {
        id: purchase.id || purchase.orderNumber,
        trackingNumber: trackingMissing ? '' : trackingStr,
        carrier: carrier,
        productName: pickProductName(purchase),
        productBrand: pickBrand(purchase),
        productSize: pickSize(purchase),
        productImage: pickImage(purchase),
        status: (hasValidLiveTracking ? (liveTracking?.status as any) : undefined) || (friendlyTrackingError ? 'unknown' : deliveryStatus),
        estimatedDelivery: estimatedDelivery,
        actualDelivery,
        statusNote,
        archivedAt,
        emailUrl: buildGmailEmailUrl({
          emailId: (purchase as any)?.emailId || (purchase as any)?.email_id || (purchase as any)?.gmailEmailId,
          orderNumber: (purchase as any)?.orderNumber,
          trackingNumber: trackingMissing ? undefined : trackingStr,
        }),
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
        isLiveTrackingEnabled: !isArchived && hasValidLiveTracking,
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