import { NextRequest, NextResponse } from 'next/server';
import { getEbayApplicationToken } from '@/lib/ebay/auth';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Debug eBay API call...');
    
    const ebayAppId = process.env.EBAY_APP_ID;
    const ebayClientSecret = process.env.EBAY_CLIENT_SECRET;
    
    if (!ebayAppId || !ebayClientSecret) {
      return NextResponse.json({ error: 'eBay credentials not configured' });
    }
    
    // Get access token
    const accessToken = await getEbayApplicationToken(ebayAppId, ebayClientSecret);
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get eBay access token' });
    }
    
    // Simple search
    const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search`;
    const params = new URLSearchParams({
      q: 'Nike shoes',
      limit: '3',
      sort: 'price',
      fieldgroups: 'MATCHING_ITEMS,EXTENDED'
    });
    
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DUS%2Czip%3D90210'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        rawResponse: data,
        itemCount: data.itemSummaries?.length || 0,
        sampleItems: (data.itemSummaries || []).slice(0, 3).map((item: any) => ({
          itemId: item.itemId,
          title: item.title,
          price: item.price,
          condition: item.condition,
          image: item.image,
          seller: item.seller
        }))
      });
    } else {
      const errorText = await response.text();
      return NextResponse.json({
        success: false,
        error: `eBay API error: ${response.status} - ${errorText}`
      });
    }
    
  } catch (error) {
    console.error('❌ Debug eBay error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}