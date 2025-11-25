import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * Debug endpoint that mimics the exact cron flow
 */
export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';

    // Step 1: Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.stockxTokens?.access_token) {
      return NextResponse.json({ 
        step: 'user_data',
        error: 'No StockX tokens',
        userId 
      });
    }

    // Step 2: Fetch listings from StockX
    const params = new URLSearchParams({
      listingStatuses: 'ACTIVE',
      pageSize: '100',
      pageNumber: '1'
    });
    
    const listingsResponse = await fetch(`https://api.stockx.com/v2/selling/listings?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userData.stockxTokens.access_token}`,
        'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    if (!listingsResponse.ok) {
      return NextResponse.json({ 
        step: 'fetch_listings',
        error: `Failed to fetch: ${listingsResponse.status}`,
        userId 
      });
    }

    const listingsData = await listingsResponse.json();
    const listings = listingsData.listings || [];

    // Step 3: Load saved settings
    const settingsSnapshot = await adminDb.collection('stockxPricingSettings')
      .where('userId', '==', userId)
      .get();
    
    const savedSettings = new Map();
    settingsSnapshot.forEach(doc => {
      const data = doc.data();
      savedSettings.set(data.listingId, data);
    });

    // Step 4: Find Nike Giannis listing
    const nikeListing = listings.find((l: any) => l.listingId === '279771c7-5fe9-4049-b959-7c7c9806be97');
    const nikeSettings = savedSettings.get('279771c7-5fe9-4049-b959-7c7c9806be97');

    return NextResponse.json({
      success: true,
      totalListings: listings.length,
      totalSettings: savedSettings.size,
      nikeListing: nikeListing ? {
        listingId: nikeListing.listingId,
        currentPrice: nikeListing.amount,
        productId: nikeListing.product?.productId,
        variantId: nikeListing.variant?.variantId,
        hasProduct: !!nikeListing.product,
        hasVariant: !!nikeListing.variant
      } : null,
      nikeSettings: nikeSettings ? {
        pricingStrategy: nikeSettings.pricingStrategy,
        minPrice: nikeSettings.minPrice,
        maxPrice: nikeSettings.maxPrice
      } : null,
      wouldReprice: nikeListing && nikeSettings && 
                    nikeSettings.pricingStrategy?.type !== 'manual' && 
                    nikeSettings.pricingStrategy?.type !== 'keep_current'
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

