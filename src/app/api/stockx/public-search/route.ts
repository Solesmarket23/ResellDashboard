import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || '';
  const limit = searchParams.get('limit') || '10';

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

  try {
    // Try StockX public search endpoints (no auth required)
    const publicEndpoints = [
      // StockX public search - sometimes works without auth
      `https://stockx.com/api/products?query=${encodeURIComponent(query)}&limit=${limit}`,
      // Alternative public endpoint
      `https://stockx.com/api/browse?query=${encodeURIComponent(query)}&limit=${limit}`,
      // GraphQL endpoint that might be public
      `https://stockx.com/api/graphql`
    ];

    console.log(`🔍 Trying public StockX endpoints for query: ${query}`);

    for (const endpoint of publicEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://stockx.com',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        console.log(`📡 Response from ${endpoint}: ${response.status}`);

        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Success from ${endpoint}`);
          
          return NextResponse.json({
            success: true,
            data: data,
            source: endpoint,
            query: query,
            message: 'Data retrieved from public StockX endpoint'
          });
        }

      } catch (error) {
        console.log(`❌ Error with ${endpoint}:`, error);
        continue;
      }
    }

    // If all public endpoints fail, return structured error
    return NextResponse.json({
      success: false,
      error: 'No public StockX endpoints available',
      message: 'StockX requires authentication for all product data',
      alternatives: [
        'Use authenticated StockX API with proper permissions',
        'Try alternative sneaker APIs (GOAT, eBay, etc.)',
        'Use demo/mock data for development'
      ]
    }, { status: 503 });

  } catch (error) {
    console.error('Public StockX search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to search public StockX endpoints',
      details: error.message
    }, { status: 500 });
  }
} 