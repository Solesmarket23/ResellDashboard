import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * Debug endpoint to check the listing structure from StockX API
 * and compare it with saved settings
 */
export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || 'pPK6LZ0u8Qcsdxqj21yra3esJ493';

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.stockxTokens?.access_token) {
      return NextResponse.json({ 
        error: 'No StockX tokens found for user',
        userId 
      });
    }

    // Fetch listings from StockX (same as cron job)
    const params = new URLSearchParams({
      listingStatuses: 'ACTIVE',
      pageSize: '5', // Just get a few for debugging
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
        error: `Failed to fetch listings: ${listingsResponse.status}`,
        userId 
      });
    }

    const listingsData = await listingsResponse.json();
    const listings = listingsData.listings || listingsData.data || [];

    // Get saved settings
    const settingsSnapshot = await adminDb.collection('stockxPricingSettings')
      .where('userId', '==', userId)
      .get();
    
    const savedSettings = new Map();
    const savedSettingsArray: any[] = [];
    settingsSnapshot.forEach(doc => {
      const data = doc.data();
      savedSettings.set(data.listingId, data);
      savedSettingsArray.push({
        listingId: data.listingId,
        pricingStrategy: data.pricingStrategy
      });
    });

    // Analyze first listing
    const firstListing = listings[0];
    const listingAnalysis = firstListing ? {
      allKeys: Object.keys(firstListing),
      id: firstListing.id,
      listingId: firstListing.listingId,
      _id: firstListing._id,
      uuid: firstListing.uuid,
      amount: firstListing.amount,
      productId: firstListing.product?.id,
      variantId: firstListing.variant?.id,
      hasMatchInSettings: savedSettings.has(firstListing.id) || 
                          savedSettings.has(firstListing.listingId) ||
                          savedSettings.has(firstListing._id)
    } : null;

    return NextResponse.json({
      success: true,
      userId,
      totalListingsFromAPI: listings.length,
      totalSavedSettings: savedSettings.size,
      firstListingAnalysis: listingAnalysis,
      savedSettingsListingIds: savedSettingsArray.slice(0, 5),
      matchTest: {
        'firstListing.id': firstListing?.id,
        'hasSetting(id)': savedSettings.has(firstListing?.id),
        'firstListing.listingId': firstListing?.listingId,
        'hasSetting(listingId)': savedSettings.has(firstListing?.listingId)
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

