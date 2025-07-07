import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || '';
  const source = searchParams.get('source') || 'ebay'; // Default to eBay

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

  try {
    let data;
    
    switch (source) {
      case 'ebay':
        data = await searchEbay(query);
        break;
      case 'restocks':
        data = await searchRestocks(query);
        break;
      case 'kicksonfire':
        data = await searchKicksOnFire(query);
        break;
      default:
        // Try multiple sources
        data = await searchMultipleSources(query);
    }

    return NextResponse.json({
      success: true,
      data: data,
      source: source,
      query: query,
      message: `Found ${data.length} results from ${source}`
    });

  } catch (error) {
    console.error('Sneaker search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to search sneaker data',
      details: error.message
    }, { status: 500 });
  }
}

// eBay API - Much easier to access
async function searchEbay(query: string) {
  const ebayAppId = process.env.EBAY_APP_ID; // Much easier to get than StockX
  
  if (!ebayAppId) {
    console.log('⚠️ No eBay App ID found, using mock data');
    return generateMockEbayData(query);
  }

  try {
    const response = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=15709&limit=20`,
      {
        headers: {
          'Authorization': `Bearer ${ebayAppId}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.itemSummaries?.map(item => ({
        title: item.title,
        price: item.price?.value || 'N/A',
        currency: item.price?.currency || 'USD',
        image: item.image?.imageUrl || '/placeholder-shoe.png',
        url: item.itemWebUrl,
        seller: item.seller?.username,
        condition: item.condition,
        source: 'eBay'
      })) || [];
    }
  } catch (error) {
    console.log('eBay API error:', error);
  }

  return generateMockEbayData(query);
}

// Restocks API - Public endpoints
async function searchRestocks(query: string) {
  try {
    // Restocks often has public endpoints
    const response = await fetch(
      `https://restocks.net/api/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.products || [];
    }
  } catch (error) {
    console.log('Restocks API error:', error);
  }

  return [];
}

// Kicks On Fire - Public data
async function searchKicksOnFire(query: string) {
  // Often has RSS feeds or public endpoints
  return generateMockKicksOnFireData(query);
}

// Search multiple sources
async function searchMultipleSources(query: string) {
  const results = await Promise.allSettled([
    searchEbay(query),
    searchRestocks(query),
    searchKicksOnFire(query)
  ]);

  const allResults = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
    .flat();

  return allResults;
}

// Mock data generators
function generateMockEbayData(query: string) {
  return [
    {
      title: `${query} - Nike Air Jordan 1 High`,
      price: 299.99,
      currency: 'USD',
      image: '/placeholder-shoe.png',
      url: `https://ebay.com/search?q=${encodeURIComponent(query)}`,
      seller: 'sneaker_store_123',
      condition: 'New',
      source: 'eBay (Demo)'
    },
    {
      title: `${query} - Adidas Yeezy 350 V2`,
      price: 450.00,
      currency: 'USD',
      image: '/placeholder-shoe.png',
      url: `https://ebay.com/search?q=${encodeURIComponent(query)}`,
      seller: 'yeezy_specialist',
      condition: 'New',
      source: 'eBay (Demo)'
    }
  ];
}

function generateMockKicksOnFireData(query: string) {
  return [
    {
      title: `${query} Release Information`,
      releaseDate: '2024-02-15',
      retailPrice: 180,
      image: '/placeholder-shoe.png',
      url: `https://kicksonfire.com/search?q=${encodeURIComponent(query)}`,
      source: 'Kicks On Fire (Demo)'
    }
  ];
} 