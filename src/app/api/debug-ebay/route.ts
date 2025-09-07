import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint to test eBay API connectivity
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || 'Nike Air Jordan';
  
  console.log('🔍 eBay Debug: Starting test...');
  
  // Check environment variables
  const ebayAppId = process.env.EBAY_APP_ID;
  console.log('🔑 eBay App ID exists:', !!ebayAppId);
  console.log('🔑 eBay App ID (masked):', ebayAppId ? `${ebayAppId.substring(0, 8)}...` : 'NOT SET');
  
  if (!ebayAppId) {
    return NextResponse.json({
      success: false,
      error: 'eBay App ID not configured',
      details: 'Please set EBAY_APP_ID in your environment variables',
      debugInfo: {
        hasAppId: false,
        query
      }
    });
  }
  
  try {
    // Step 1: Get eBay Application Token
    console.log('🔄 Step 1: Getting eBay application token...');
    
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${ebayAppId}:`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });
    
    console.log('📡 Token response status:', tokenResponse.status);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log('❌ Token error:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Failed to get eBay access token',
        details: errorText,
        debugInfo: {
          hasAppId: true,
          tokenStatus: tokenResponse.status,
          query
        }
      });
    }
    
    const tokenData = await tokenResponse.json();
    console.log('✅ Token obtained successfully');
    
    // Step 2: Test eBay Browse API
    console.log('🔄 Step 2: Testing eBay Browse API search...');
    
    const params = new URLSearchParams({
      q: query,
      category_ids: '15709,3034', // Sneakers categories
      limit: '10',
      sort: 'price'
    });
    
    const apiUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    console.log('🌐 eBay API URL:', `${apiUrl}?${params}`);
    
    const searchResponse = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    
    console.log('📡 Search response status:', searchResponse.status);
    
    if (!searchResponse.ok) {
      const searchErrorText = await searchResponse.text();
      console.log('❌ Search error:', searchErrorText);
      return NextResponse.json({
        success: false,
        error: 'eBay search API failed',
        details: searchErrorText,
        debugInfo: {
          hasAppId: true,
          tokenStatus: tokenResponse.status,
          searchStatus: searchResponse.status,
          query
        }
      });
    }
    
    const searchData = await searchResponse.json();
    console.log('📦 Search results:', searchData.total || 0, 'items found');
    
    return NextResponse.json({
      success: true,
      message: 'eBay API working correctly',
      debugInfo: {
        hasAppId: true,
        tokenStatus: tokenResponse.status,
        searchStatus: searchResponse.status,
        query,
        totalResults: searchData.total || 0,
        itemsReturned: searchData.itemSummaries?.length || 0,
        sampleItem: searchData.itemSummaries?.[0] ? {
          title: searchData.itemSummaries[0].title,
          price: searchData.itemSummaries[0].price?.value,
          currency: searchData.itemSummaries[0].price?.currency
        } : null
      },
      rawResponse: searchData
    });
    
  } catch (error) {
    console.error('💥 Debug error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during eBay API test',
      details: error.message,
      debugInfo: {
        hasAppId: !!ebayAppId,
        query
      }
    });
  }
}
