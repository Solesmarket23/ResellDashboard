import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  
  try {
    const { styleId } = await request.json();
    
    if (!styleId) {
      return NextResponse.json({
        success: false,
        error: 'StyleId is required',
        logs: ['❌ No StyleId provided']
      });
    }

    logs.push(`🔍 Testing StyleId: ${styleId}`);

    // Get StockX credentials
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

    if (!accessToken) {
      logs.push('❌ No StockX access token found');
      logs.push('💡 You need to authenticate with StockX first');
      return NextResponse.json({
        success: false,
        styleId,
        error: 'Not authenticated with StockX. Please log in to StockX in your dashboard first.',
        logs
      });
    }

    if (!apiKey) {
      logs.push('❌ No StockX API key configured');
      return NextResponse.json({
        success: false,
        styleId,
        error: 'StockX API key not configured in environment',
        logs
      });
    }

    logs.push('✅ StockX credentials found');
    logs.push('');

    // Step 1: Search by StyleId
    const searchQuery = encodeURIComponent(styleId);
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${searchQuery}&pageSize=5`;
    
    logs.push(`🔎 Searching StockX: ${searchUrl}`);

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    logs.push(`📡 Search API response: ${searchResponse.status} ${searchResponse.statusText}`);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logs.push(`❌ Search failed: ${errorText}`);
      return NextResponse.json({
        success: false,
        styleId,
        error: `Search API returned ${searchResponse.status}: ${errorText}`,
        logs
      });
    }

    const searchData = await searchResponse.json();
    const products = searchData.results || searchData.Products || [];

    logs.push(`📦 Found ${products.length} product(s)`);

    if (products.length === 0) {
      logs.push(`❌ No products found for StyleId: ${styleId}`);
      logs.push('💡 This StyleId might not exist on StockX, or it might be spelled incorrectly');
      return NextResponse.json({
        success: false,
        styleId,
        error: `No products found for StyleId: ${styleId}`,
        logs
      });
    }

    // Get first product
    const product = products[0];
    const productId = product.id || product.uuid || product.productId;
    const productTitle = product.title || product.name || 'Unknown';
    const productBrand = product.brand || product.primaryCategory || 'Unknown';
    const productUrlKey = product.urlKey || product.slug || '';

    logs.push(`✅ Found product: "${productTitle}"`);
    logs.push(`   Brand: ${productBrand}`);
    logs.push(`   Product ID: ${productId}`);
    logs.push('');

    // Step 2: Get market data
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    
    logs.push(`💰 Fetching market data: ${marketUrl}`);

    const marketResponse = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    logs.push(`📡 Market data API response: ${marketResponse.status} ${marketResponse.statusText}`);

    if (!marketResponse.ok) {
      const errorText = await marketResponse.text();
      logs.push(`❌ Market data fetch failed: ${errorText}`);
      return NextResponse.json({
        success: false,
        styleId,
        product: {
          id: productId,
          title: productTitle,
          brand: productBrand,
          urlKey: productUrlKey
        },
        error: `Market data API returned ${marketResponse.status}: ${errorText}`,
        logs
      });
    }

    const marketData = await marketResponse.json();
    const variants = Array.isArray(marketData) ? marketData : [];

    logs.push(`📊 Found ${variants.length} variant(s) (sizes)`);
    logs.push('');

    // Process variants
    const processedVariants = variants.map((variant: any) => {
      const variantId = variant.variantId;
      const size = variant.variantValue || variant.size || variant.sizeValue || variant.shoeSize || 'Unknown';
      
      // Prices are in cents, convert to dollars
      const lowestAskCents = parseInt(variant.lowestAskAmount) || 0;
      const flexAskCents = parseInt(variant.flexLowestAskAmount) || 0;
      const bidCents = parseInt(variant.highestBidAmount) || 0;
      const lastSaleCents = parseInt(variant.lastSaleAmount) || 0;

      // Use lowest of standard or flex ask
      let bestAskCents = 0;
      if (lowestAskCents > 0 && flexAskCents > 0) {
        bestAskCents = Math.min(lowestAskCents, flexAskCents);
      } else if (lowestAskCents > 0) {
        bestAskCents = lowestAskCents;
      } else if (flexAskCents > 0) {
        bestAskCents = flexAskCents;
      }

      const lowestAsk = bestAskCents / 100;
      const highestBid = bidCents / 100;
      const lastSale = lastSaleCents / 100;

      logs.push(`   Size ${size}: Ask $${lowestAsk}, Bid $${highestBid}, Last Sale $${lastSale}`);

      return {
        variantId,
        size,
        lowestAsk,
        highestBid,
        lastSale
      };
    });

    logs.push('');
    logs.push(`✅ Successfully fetched market data for ${processedVariants.length} sizes!`);

    return NextResponse.json({
      success: true,
      styleId,
      product: {
        id: productId,
        title: productTitle,
        brand: productBrand,
        urlKey: productUrlKey
      },
      marketData: {
        variants: processedVariants
      },
      logs
    });

  } catch (error) {
    console.error('Test StyleId error:', error);
    logs.push(`❌ Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return NextResponse.json({
      success: false,
      styleId: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      logs
    }, { status: 500 });
  }
}

