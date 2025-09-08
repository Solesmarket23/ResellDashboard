import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    console.log(`🔍 Simple eBay test for: "${query}"`);

    // Get eBay access token
    const CLIENT_ID = process.env.EBAY_CLIENT_ID;
    const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('Missing eBay credentials');
    }

    // Get access token
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error('❌ eBay token error:', tokenError);
      throw new Error(`Token request failed: ${tokenError}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ Got eBay access token');

    // Simple search with minimal parameters
    const apiUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    const params = new URLSearchParams({
      q: query,
      limit: '10'
    });

    console.log(`🌐 eBay API URL: ${apiUrl}?${params}`);
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    console.log(`📡 eBay API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ eBay API error:', response.status, errorText);
      return NextResponse.json({ 
        error: `eBay API failed: ${response.status}`,
        details: errorText,
        url: `${apiUrl}?${params}`
      }, { status: 500 });
    }

    const data = await response.json();
    console.log(`📦 eBay API response:`, {
      total: data.total,
      itemCount: data.itemSummaries?.length || 0,
      firstItem: data.itemSummaries?.[0]?.title || 'No items'
    });

    return NextResponse.json({
      success: true,
      total: data.total,
      itemCount: data.itemSummaries?.length || 0,
      items: data.itemSummaries?.slice(0, 3).map((item: any) => ({
        title: item.title,
        price: item.price?.value,
        currency: item.price?.currency,
        itemId: item.itemId
      })) || []
    });

  } catch (error: any) {
    console.error('❌ Debug eBay error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}
