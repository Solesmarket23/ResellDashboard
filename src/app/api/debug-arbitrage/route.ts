import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 DEBUG: Testing arbitrage system step by step');
    
    // Step 1: Check StockX authentication
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;
    
    console.log('🔐 StockX Auth Check:', {
      hasAccessToken: !!accessToken,
      hasApiKey: !!apiKey,
      accessTokenLength: accessToken?.length || 0
    });
    
    if (!accessToken) {
      return NextResponse.json({
        step: 'authentication',
        status: 'failed',
        message: 'No StockX access token found - need to authenticate first',
        nextStep: 'Go to dashboard and click "Connect StockX"'
      });
    }
    
    if (!apiKey) {
      return NextResponse.json({
        step: 'configuration',
        status: 'failed',
        message: 'No StockX API key configured',
        nextStep: 'Check environment variables'
      });
    }
    
    // Step 2: Test StockX search
    console.log('🔍 Testing StockX search...');
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=nike&pageNumber=1&pageSize=5`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });
    
    console.log('📡 StockX search response:', searchResponse.status);
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      return NextResponse.json({
        step: 'stockx_search',
        status: 'failed',
        message: `StockX search failed: ${searchResponse.status}`,
        error: errorText,
        nextStep: 'Check StockX authentication or API key'
      });
    }
    
    const searchData = await searchResponse.json();
    const products = searchData.products || [];
    
    console.log('📦 StockX products found:', products.length);
    
    if (products.length === 0) {
      return NextResponse.json({
        step: 'stockx_search',
        status: 'failed',
        message: 'No StockX products found for "nike"',
        nextStep: 'Check StockX API or try different query'
      });
    }
    
    // Step 3: Test market data for first product
    const firstProduct = products[0];
    const productId = firstProduct.id || firstProduct.productId || firstProduct.uuid;
    
    console.log('💰 Testing market data for product:', productId);
    
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    const marketResponse = await fetch(marketUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });
    
    console.log('📊 Market data response:', marketResponse.status);
    
    if (!marketResponse.ok) {
      const errorText = await marketResponse.text();
      return NextResponse.json({
        step: 'market_data',
        status: 'failed',
        message: `Market data failed: ${marketResponse.status}`,
        error: errorText,
        nextStep: 'Check product ID or StockX API'
      });
    }
    
    const marketData = await marketResponse.json();
    const variants = Array.isArray(marketData) ? marketData : [];
    
    console.log('📈 Market data variants:', variants.length);
    
    return NextResponse.json({
      step: 'complete',
      status: 'success',
      message: 'All systems working!',
      results: {
        stockxProducts: products.length,
        marketDataVariants: variants.length,
        sampleProduct: {
          id: firstProduct.id,
          title: firstProduct.title,
          brand: firstProduct.brand
        },
        sampleMarketData: variants[0] || null
      }
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    return NextResponse.json({
      step: 'error',
      status: 'failed',
      message: 'Unexpected error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
