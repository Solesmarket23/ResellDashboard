import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * Debug endpoint to test the repricing API call with actual user data
 */
export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
    const baseUrl = request.nextUrl.origin;

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.stockxTokens?.access_token) {
      return NextResponse.json({ 
        error: 'No StockX tokens found for user',
        userId 
      });
    }

    // Create a test repricing request
    const testData = {
      listings: [
        {
          listingId: '279771c7-5fe9-4049-b959-7c7c9806be97',
          productId: '1b48c647-e0b3-4ebf-a202-6f12a2ccd86d',
          variantId: 'acb10ad1-07a2-4453-8963-86e66ac0ee64',
          currentPrice: 100,
          pricingStrategy: {
            type: 'match_lowest',
            value: 1
          },
          minPrice: 75,
          maxPrice: 100
        }
      ],
      strategy: {
        type: 'competitive',
        settings: {
          minProfitMargin: 5,
          maxPriceReduction: 20,
          competitiveBuffer: 1,
          aggressiveness: 'moderate'
        }
      },
      dryRun: true, // Use dry run for testing
      useIndividualStrategies: true
    };

    // Call the repricing API
    const repriceResponse = await fetch(`${baseUrl}/api/stockx/repricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.stockxTokens.access_token}`,
        'x-api-key': process.env.STOCKX_API_KEY || '',
        'x-user-id': userId
      },
      body: JSON.stringify(testData)
    });

    const responseText = await repriceResponse.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json({
      success: repriceResponse.ok,
      status: repriceResponse.status,
      statusText: repriceResponse.statusText,
      headers: Object.fromEntries(repriceResponse.headers.entries()),
      response: responseData,
      sentData: {
        hasAccessToken: !!userData.stockxTokens.access_token,
        baseUrl,
        listingsCount: testData.listings.length
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

