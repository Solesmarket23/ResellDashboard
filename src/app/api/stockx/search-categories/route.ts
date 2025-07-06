import { NextRequest, NextResponse } from 'next/server';

// Define search categories with optimized keywords
const SEARCH_CATEGORIES = {
  sneakers: {
    keywords: ["Nike", "Jordan", "Adidas", "Yeezy", "Dunk", "Air Force", "Air Max", "Retro", "Boost"],
    filters: {
      productTypes: ["sneakers", "shoes", "footwear"],
      excludeKeywords: ["shirt", "hoodie", "hat", "cap", "jacket"]
    }
  },
  jordans: {
    keywords: ["Jordan 1", "Jordan 4", "Jordan 11", "Jordan 3", "Jordan 6", "Jordan 12", "Air Jordan"],
    filters: {
      productTypes: ["sneakers"],
      includeKeywords: ["jordan", "air jordan"]
    }
  },
  yeezys: {
    keywords: ["Yeezy 350", "Yeezy 700", "Yeezy 500", "Yeezy Boost", "Yeezy Foam", "Yeezy Slide"],
    filters: {
      productTypes: ["sneakers"],
      includeKeywords: ["yeezy"]
    }
  },
  dunks: {
    keywords: ["Dunk Low", "Dunk High", "Nike Dunk", "SB Dunk"],
    filters: {
      productTypes: ["sneakers"],
      includeKeywords: ["dunk"]
    }
  },
  apparel: {
    keywords: ["Hoodie", "T-Shirt", "Sweatshirt", "Jacket", "Pants", "Shorts"],
    filters: {
      productTypes: ["apparel", "clothing"],
      excludeKeywords: ["sneakers", "shoes"]
    }
  },
  accessories: {
    keywords: ["Hat", "Cap", "Bag", "Backpack", "Belt", "Watch"],
    filters: {
      productTypes: ["accessories"],
      excludeKeywords: ["sneakers", "shoes", "shirt"]
    }
  },
  collaborations: {
    keywords: ["Travis Scott", "Off-White", "Fragment", "Dior", "Louis Vuitton", "Supreme"],
    filters: {
      includeKeywords: ["x", "collab", "collaboration"]
    }
  },
  popular: {
    keywords: ["Chicago", "Bred", "Royal", "Shadow", "Panda", "Pine Green", "Court Purple"],
    filters: {
      includeKeywords: ["retro", "og", "original"]
    }
  }
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category')?.toLowerCase() || '';
  const limit = searchParams.get('limit') || '20';
  const arbitrageMode = searchParams.get('arbitrageMode') === 'true';
  const minSpreadPercent = parseFloat(searchParams.get('minSpreadPercent') || '0');

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

  if (!accessToken) {
    return NextResponse.json(
      { 
        error: 'No access token found', 
        message: 'Please authenticate with StockX first',
        authRequired: true
      },
      { status: 401 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing StockX API key' },
      { status: 500 }
    );
  }

  // Validate category
  if (!category || !SEARCH_CATEGORIES[category]) {
    return NextResponse.json({
      error: 'Invalid category',
      availableCategories: Object.keys(SEARCH_CATEGORIES),
      message: 'Please specify a valid category'
    }, { status: 400 });
  }

  const categoryConfig = SEARCH_CATEGORIES[category];
  console.log(`🏷️ Searching category: ${category} with ${categoryConfig.keywords.length} keywords`);

  try {
    const allResults = [];
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'FlipFlow/1.0'
    };

    // Search using each keyword for the category
    for (const keyword of categoryConfig.keywords) {
      try {
        const searchUrl = `https://api.stockx.com/catalog/search?query=${encodeURIComponent(keyword)}&pageNumber=1&pageSize=10`;
        console.log(`🔍 Searching keyword: ${keyword}`);

        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: headers
        });

        if (response.ok) {
          const data = await response.json();
          if (data.products && data.products.length > 0) {
            // Apply category-specific filtering
            const filteredProducts = data.products.filter(product => {
              const title = product.title?.toLowerCase() || '';
              const productType = product.productType?.toLowerCase() || '';
              
              // Apply include filters
              if (categoryConfig.filters.includeKeywords) {
                const hasIncludeKeyword = categoryConfig.filters.includeKeywords.some(keyword => 
                  title.includes(keyword.toLowerCase())
                );
                if (!hasIncludeKeyword) return false;
              }
              
              // Apply exclude filters
              if (categoryConfig.filters.excludeKeywords) {
                const hasExcludeKeyword = categoryConfig.filters.excludeKeywords.some(keyword => 
                  title.includes(keyword.toLowerCase())
                );
                if (hasExcludeKeyword) return false;
              }
              
              // Apply product type filters
              if (categoryConfig.filters.productTypes) {
                const matchesProductType = categoryConfig.filters.productTypes.some(type => 
                  productType.includes(type) || title.includes(type)
                );
                if (!matchesProductType) return false;
              }
              
              return true;
            });

            allResults.push(...filteredProducts);
          }
        } else {
          console.log(`❌ Failed to search ${keyword}: ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ Error searching ${keyword}:`, error);
      }
    }

    // Remove duplicates based on product ID
    const uniqueResults = allResults.filter((product, index, self) => 
      index === self.findIndex(p => p.productId === product.productId)
    );

    // Limit results
    const limitedResults = uniqueResults.slice(0, parseInt(limit));

    console.log(`✅ Found ${limitedResults.length} unique products for category: ${category}`);

    return NextResponse.json({
      success: true,
      data: {
        products: limitedResults,
        totalCount: limitedResults.length,
        category: category,
        keywordsSearched: categoryConfig.keywords.length,
        uniqueProducts: uniqueResults.length,
        limitedTo: parseInt(limit)
      },
      searchStrategy: {
        description: `Multi-keyword search for ${category} category`,
        keywords: categoryConfig.keywords,
        filters: categoryConfig.filters,
        note: "StockX API doesn't support native category filtering, so we search multiple keywords and filter results"
      },
      recommendations: {
        forBetterResults: [
          "Use specific model names (e.g., 'Jordan 1 Chicago' instead of just 'Jordan')",
          "Try collaboration names (e.g., 'Travis Scott Jordan')",
          "Search popular colorways (e.g., 'Bred', 'Royal', 'Pine Green')"
        ],
        alternativeApproach: [
          "Search specific brands first, then filter client-side",
          "Use our arbitrage mode for profit-focused searches",
          "Consider using size-specific searches"
        ]
      }
    });

  } catch (error) {
    console.error('Category search error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to search category',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, limit = 20, arbitrageMode = false, minSpreadPercent = 0 } = body;

    // Redirect to GET with query parameters
    const url = new URL(request.url);
    url.searchParams.set('category', category);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('arbitrageMode', arbitrageMode.toString());
    url.searchParams.set('minSpreadPercent', minSpreadPercent.toString());

    return await GET(new NextRequest(url, {
      headers: request.headers,
      method: 'GET'
    }));
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
} 