import { NextRequest, NextResponse } from 'next/server';

// Comprehensive sneaker market database for demo
const MARKET_DATABASE = {
  'jordan': [
    {
      id: 'air-jordan-1-chicago',
      name: 'Air Jordan 1 High OG "Chicago"',
      brand: 'Nike',
      styleId: 'DZ5485-612',
      retailPrice: 170,
      category: 'Basketball',
      releaseDate: '2015-04-01',
      colorway: 'White/Black-Varsity Red',
      description: 'The iconic Chicago colorway returns in original form',
      market: {
        lowestAsk: 1850,
        highestBid: 1720,
        lastSale: 1795,
        salesLast72Hours: 23,
        priceChangePercentage: 5.2,
        volatility: 12.5,
        averagePrice: 1780,
        marketCap: 180000000,
        totalSales: 45000
      },
      sizes: {
        '8': { lowestAsk: 1750, highestBid: 1650, lastSale: 1700 },
        '9': { lowestAsk: 1850, highestBid: 1720, lastSale: 1795 },
        '10': { lowestAsk: 1950, highestBid: 1820, lastSale: 1890 },
        '11': { lowestAsk: 2100, highestBid: 1980, lastSale: 2050 }
      }
    },
    {
      id: 'air-jordan-1-bred-toe-low',
      name: 'Air Jordan 1 Low OG "Bred Toe"',
      brand: 'Nike',
      styleId: 'CZ0790-610',
      retailPrice: 140,
      category: 'Basketball',
      releaseDate: '2021-05-12',
      colorway: 'White/Black-Gym Red',
      description: 'Low-top version of the beloved Bred Toe colorway',
      market: {
        lowestAsk: 245,
        highestBid: 220,
        lastSale: 235,
        salesLast72Hours: 47,
        priceChangePercentage: -2.1,
        volatility: 8.3,
        averagePrice: 240,
        marketCap: 12000000,
        totalSales: 28000
      },
      sizes: {
        '8': { lowestAsk: 235, highestBid: 210, lastSale: 225 },
        '9': { lowestAsk: 245, highestBid: 220, lastSale: 235 },
        '10': { lowestAsk: 255, highestBid: 235, lastSale: 245 },
        '11': { lowestAsk: 265, highestBid: 245, lastSale: 255 }
      }
    },
    {
      id: 'air-jordan-4-black-cat',
      name: 'Air Jordan 4 "Black Cat"',
      brand: 'Nike',
      styleId: 'CU1110-010',
      retailPrice: 200,
      category: 'Basketball',
      releaseDate: '2020-01-18',
      colorway: 'Black/Black-Light Graphite',
      description: 'Sleek all-black iteration of the classic Jordan 4',
      market: {
        lowestAsk: 420,
        highestBid: 385,
        lastSale: 405,
        salesLast72Hours: 31,
        priceChangePercentage: 3.7,
        volatility: 15.2,
        averagePrice: 400,
        marketCap: 35000000,
        totalSales: 67000
      },
      sizes: {
        '8': { lowestAsk: 400, highestBid: 365, lastSale: 385 },
        '9': { lowestAsk: 420, highestBid: 385, lastSale: 405 },
        '10': { lowestAsk: 445, highestBid: 410, lastSale: 425 },
        '11': { lowestAsk: 465, highestBid: 430, lastSale: 450 }
      }
    }
  ],
  'dunk': [
    {
      id: 'nike-dunk-low-panda',
      name: 'Nike Dunk Low "Panda"',
      brand: 'Nike',
      styleId: 'DD1391-100',
      retailPrice: 100,
      category: 'Lifestyle',
      releaseDate: '2021-03-10',
      colorway: 'White/Black',
      description: 'The viral sensation that took over social media',
      market: {
        lowestAsk: 135,
        highestBid: 125,
        lastSale: 130,
        salesLast72Hours: 89,
        priceChangePercentage: -1.5,
        volatility: 6.8,
        averagePrice: 132,
        marketCap: 25000000,
        totalSales: 180000
      },
      sizes: {
        '8': { lowestAsk: 130, highestBid: 120, lastSale: 125 },
        '9': { lowestAsk: 135, highestBid: 125, lastSale: 130 },
        '10': { lowestAsk: 140, highestBid: 130, lastSale: 135 },
        '11': { lowestAsk: 145, highestBid: 135, lastSale: 140 }
      }
    }
  ],
  'yeezy': [
    {
      id: 'yeezy-350-v2-zebra',
      name: 'Adidas Yeezy Boost 350 V2 "Zebra"',
      brand: 'Adidas',
      styleId: 'CP9654',
      retailPrice: 220,
      category: 'Running',
      releaseDate: '2017-02-25',
      colorway: 'White/Core Black/Red',
      description: 'One of the most iconic Yeezy colorways ever created',
      market: {
        lowestAsk: 295,
        highestBid: 275,
        lastSale: 285,
        salesLast72Hours: 18,
        priceChangePercentage: 4.1,
        volatility: 9.7,
        averagePrice: 290,
        marketCap: 45000000,
        totalSales: 95000
      },
      sizes: {
        '8': { lowestAsk: 285, highestBid: 265, lastSale: 275 },
        '9': { lowestAsk: 295, highestBid: 275, lastSale: 285 },
        '10': { lowestAsk: 305, highestBid: 285, lastSale: 295 },
        '11': { lowestAsk: 315, highestBid: 295, lastSale: 305 }
      }
    }
  ],
  'travis': [
    {
      id: 'jordan-1-low-travis-scott',
      name: 'Air Jordan 1 Low "Travis Scott"',
      brand: 'Nike',
      styleId: 'CQ4277-001',
      retailPrice: 130,
      category: 'Basketball',
      releaseDate: '2019-05-11',
      colorway: 'Dark Mocha/Black-University Red',
      description: 'Highly sought-after collaboration with rapper Travis Scott',
      market: {
        lowestAsk: 1250,
        highestBid: 1180,
        lastSale: 1215,
        salesLast72Hours: 12,
        priceChangePercentage: 7.3,
        volatility: 18.9,
        averagePrice: 1200,
        marketCap: 85000000,
        totalSales: 15000
      },
      sizes: {
        '8': { lowestAsk: 1200, highestBid: 1130, lastSale: 1165 },
        '9': { lowestAsk: 1250, highestBid: 1180, lastSale: 1215 },
        '10': { lowestAsk: 1300, highestBid: 1230, lastSale: 1265 },
        '11': { lowestAsk: 1350, highestBid: 1280, lastSale: 1315 }
      }
    }
  ]
};

// Search algorithm
function searchSneakers(query: string) {
  const searchTerm = query.toLowerCase().trim();
  const results: any[] = [];

  // Direct category match
  if (MARKET_DATABASE[searchTerm as keyof typeof MARKET_DATABASE]) {
    results.push(...MARKET_DATABASE[searchTerm as keyof typeof MARKET_DATABASE]);
  }

  // Fuzzy search through all sneakers
  Object.values(MARKET_DATABASE).flat().forEach(sneaker => {
    const nameMatch = sneaker.name.toLowerCase().includes(searchTerm);
    const brandMatch = sneaker.brand.toLowerCase().includes(searchTerm);
    const colorwayMatch = sneaker.colorway.toLowerCase().includes(searchTerm);
    const styleMatch = sneaker.styleId.toLowerCase().includes(searchTerm);

    if ((nameMatch || brandMatch || colorwayMatch || styleMatch) && 
        !results.find(r => r.id === sneaker.id)) {
      results.push(sneaker);
    }
  });

  return results.slice(0, 5); // Limit to 5 results
}

// Transform to API format
function transformToApiFormat(sneakers: any[], requestedSize?: string) {
  return sneakers.map(sneaker => ({
    shoe: sneaker.name,
    brand: sneaker.brand,
    silhoutte: sneaker.category,
    styleID: sneaker.styleId,
    retailPrice: sneaker.retailPrice,
    thumbnail: '/placeholder-shoe.png',
    links: {
      stockX: `https://stockx.com/search?s=${encodeURIComponent(sneaker.name)}`,
      goat: `https://goat.com/search?query=${encodeURIComponent(sneaker.name)}`,
      flightClub: `https://flightclub.com/catalogsearch/result/?q=${encodeURIComponent(sneaker.name)}`,
      stadiumGoods: `https://stadiumgoods.com/search?q=${encodeURIComponent(sneaker.name)}`
    },
    sizeSpecificData: requestedSize && sneaker.sizes[requestedSize] ? {
      size: requestedSize,
      prices: {
        stockX: sneaker.sizes[requestedSize].lowestAsk,
        goat: Math.round(sneaker.sizes[requestedSize].lowestAsk * 0.98),
        flightClub: Math.round(sneaker.sizes[requestedSize].lowestAsk * 1.05),
        stadiumGoods: Math.round(sneaker.sizes[requestedSize].lowestAsk * 1.02)
      }
    } : null,
    detailedData: {
      lowestAsk: sneaker.market.lowestAsk,
      highestBid: sneaker.market.highestBid,
      lastSale: sneaker.market.lastSale,
      changePercentage: sneaker.market.priceChangePercentage,
      totalSold: sneaker.market.salesLast72Hours,
      volatility: sneaker.market.volatility,
      averagePrice: sneaker.market.averagePrice,
      marketCap: sneaker.market.marketCap,
      totalSales: sneaker.market.totalSales,
      releaseDate: sneaker.releaseDate,
      colorway: sneaker.colorway,
      description: sneaker.description
    }
  }));
}

// Quick StockX API attempt (will fail but keeps the integration ready)
async function attemptStockXAPI(itemName: string) {
  const apiKey = process.env.STOCKX_API_KEY;
  const clientId = process.env.STOCKX_CLIENT_ID;
  
  if (!apiKey || !clientId) return null;

  console.log('🔄 Quick StockX API attempt...');
  
  try {
    // Try the most likely correct endpoint based on typical API patterns
    const response = await fetch(`https://api.stockx.com/v1/products/search?query=${encodeURIComponent(itemName)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(2000) // Quick timeout
    });

    if (response.ok) {
      console.log('🎉 StockX API Success! Check logs for details.');
      return await response.json();
    }
  } catch (error) {
    console.log('❌ StockX API blocked (expected) - using demo data');
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { itemName, size } = await request.json();
    
    if (!itemName) {
      return NextResponse.json(
        { error: 'Item name is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Searching for: ${itemName}${size ? ` in size ${size}` : ''}`);

    // Quick StockX attempt
    const stockxData = await attemptStockXAPI(itemName);
    if (stockxData) {
      // Process real StockX data here when we get it working
      console.log('Processing real StockX data...');
    }

    // Use enhanced demo database
    const matchedSneakers = searchSneakers(itemName);
    const results = transformToApiFormat(matchedSneakers, size);

    console.log(`✅ Found ${results.length} products in market database`);

    // Generate market insights
    const totalValue = results.reduce((sum, item) => sum + (item.detailedData?.lowestAsk || 0), 0);
    const avgChange = results.reduce((sum, item) => sum + (item.detailedData?.changePercentage || 0), 0) / results.length;

    return NextResponse.json({
      success: true,
      data: results,
      searchTerm: itemName,
      requestedSize: size,
      dataSource: 'enhanced-market-db',
      note: '📊 Professional market data demo - StockX integration pending developer portal setup',
      timestamp: new Date().toISOString(),
      marketInsights: {
        totalSearchValue: Math.round(totalValue),
        averagePriceChange: Math.round(avgChange * 10) / 10,
        totalProducts: results.length,
        suggestedSearches: ['jordan 1 chicago', 'dunk panda', 'yeezy zebra', 'travis scott'],
        nextSteps: [
          'Contact StockX developer support for API access',
          'Verify IP whitelisting requirements',
          'Complete application approval process'
        ]
      }
    });

  } catch (error) {
    console.error('Market search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to search market data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
