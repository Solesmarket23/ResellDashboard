import { NextRequest, NextResponse } from 'next/server';

// Copy the eBay search function for testing
async function testEbaySearch(query: string): Promise<any[]> {
  const ebayAppId = process.env.EBAY_APP_ID;
  const ebayClientSecret = process.env.EBAY_CLIENT_SECRET;
  
  console.log(`🔍 eBay search called with query: "${query}"`);
  console.log(`🔑 eBay App ID configured: ${ebayAppId ? 'YES' : 'NO'}`);
  console.log(`🔑 eBay Client Secret configured: ${ebayClientSecret ? 'YES' : 'NO'}`);

  if (!ebayAppId || !ebayClientSecret) {
    throw new Error('eBay API credentials not configured');
  }

  try {
    // Get application token
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${ebayAppId}:${ebayClientSecret}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`eBay token error: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Search eBay
    const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search`;
    
    const params = new URLSearchParams({
      q: query,
      limit: '20',
      sort: 'price',
      fieldgroups: 'MATCHING_ITEMS,EXTENDED'
    });

    // Add category filter for sneakers
    params.append('category_ids', '15709');
    params.append('filter', 'conditions:{NEW,USED_EXCELLENT,USED_VERY_GOOD}');

    console.log(`🌐 eBay API URL: ${apiUrl}?${params}`);
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=<ePNCampaignId>,affiliateReferenceId=<referenceId>'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`eBay search error: ${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ eBay search successful, found ${data.itemSummaries?.length || 0} items`);
    console.log(`📊 Total results: ${data.total || 0}`);
    
    return data.itemSummaries || [];

  } catch (error) {
    console.error(`💥 Error searching eBay:`, error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || 'Nike Dunk Low';
    
    console.log(`🧪 Testing eBay search for: "${query}"`);
    
    const results = await testEbaySearch(query);
    
    return NextResponse.json({
      success: true,
      message: 'eBay search test complete',
      query,
      totalResults: results.length,
      sampleResults: results.slice(0, 3).map(item => ({
        title: item.title,
        price: item.price?.value,
        currency: item.price?.currency,
        condition: item.condition,
        itemId: item.itemId
      })),
      fullResults: results
    });

  } catch (error) {
    console.error('❌ eBay search test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      query: request.nextUrl.searchParams.get('query') || 'Nike Dunk Low'
    }, { status: 500 });
  }
}
