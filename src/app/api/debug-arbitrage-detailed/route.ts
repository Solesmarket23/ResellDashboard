import { NextRequest, NextResponse } from 'next/server';

// Debug endpoint to show detailed arbitrage finder process
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || 'Jordan 1 High';
  
  console.log('🔍 === DETAILED ARBITRAGE DEBUG START ===');
  console.log(`🔍 Query: "${query}"`);
  
  try {
    // Step 1: Test eBay API directly
    console.log('📦 Step 1: Testing eBay API...');
    const ebayResponse = await fetch(`${request.nextUrl.origin}/api/ebay-stockx-arbitrage?query=${encodeURIComponent(query)}&limit=3`, {
      headers: {
        'Cookie': request.headers.get('Cookie') || ''
      }
    });
    
    console.log(`📦 eBay API Status: ${ebayResponse.status}`);
    
    if (!ebayResponse.ok) {
      const errorText = await ebayResponse.text();
      console.log('❌ eBay API Error:', errorText);
      return NextResponse.json({
        error: 'eBay API failed',
        status: ebayResponse.status,
        details: errorText
      });
    }
    
    const ebayData = await ebayResponse.json();
    console.log('📦 eBay Response:', {
      success: ebayData.success,
      totalEbayListings: ebayData.totalEbayListings,
      totalOpportunities: ebayData.totalOpportunities,
      opportunitiesLength: ebayData.opportunities?.length || 0,
      message: ebayData.message
    });
    
    // Step 2: Test StockX API directly
    console.log('📈 Step 2: Testing StockX API...');
    const stockxResponse = await fetch(`${request.nextUrl.origin}/api/stockx/search?query=${encodeURIComponent(query)}&limit=3`, {
      headers: {
        'Cookie': request.headers.get('Cookie') || ''
      }
    });
    
    console.log(`📈 StockX API Status: ${stockxResponse.status}`);
    
    let stockxData = null;
    if (stockxResponse.ok) {
      stockxData = await stockxResponse.json();
      console.log('📈 StockX Response:', {
        success: stockxData.success,
        productCount: stockxData.data?.products?.length || 0,
        hasData: !!stockxData.data
      });
    } else {
      const errorText = await stockxResponse.text();
      console.log('❌ StockX API Error:', errorText);
    }
    
    // Step 3: Show sample data
    const sampleEbayListings = ebayData.opportunities?.slice(0, 3) || [];
    const sampleStockxProducts = stockxData?.data?.products?.slice(0, 3) || [];
    
    console.log('📋 Sample eBay listings:');
    sampleEbayListings.forEach((opp, i) => {
      console.log(`  ${i + 1}. ${opp.ebayListing?.title} - $${opp.ebayListing?.price}`);
    });
    
    console.log('📋 Sample StockX products:');
    sampleStockxProducts.forEach((product, i) => {
      console.log(`  ${i + 1}. ${product.title} - $${product.market?.lastSale || 'No price'}`);
    });
    
    // Step 4: Check authentication
    console.log('🔐 Step 4: Checking StockX auth...');
    const authResponse = await fetch(`${request.nextUrl.origin}/api/stockx/auth/status`, {
      headers: {
        'Cookie': request.headers.get('Cookie') || ''
      }
    });
    
    const authData = authResponse.ok ? await authResponse.json() : { error: 'Auth check failed' };
    console.log('🔐 Auth Status:', authData);
    
    return NextResponse.json({
      success: true,
      query,
      debug: {
        ebay: {
          status: ebayResponse.status,
          success: ebayData.success,
          totalListings: ebayData.totalEbayListings,
          totalOpportunities: ebayData.totalOpportunities,
          message: ebayData.message,
          sampleListings: sampleEbayListings.map(opp => ({
            title: opp.ebayListing?.title,
            price: opp.ebayListing?.price,
            profit: opp.profit,
            confidence: opp.confidence
          }))
        },
        stockx: {
          status: stockxResponse.status,
          success: stockxData?.success,
          productCount: stockxData?.data?.products?.length || 0,
          authStatus: authData.isAuthenticated,
          sampleProducts: sampleStockxProducts.map(product => ({
            title: product.title,
            price: product.market?.lastSale,
            brand: product.brand
          }))
        },
        arbitrage: {
          foundEbayProducts: ebayData.totalEbayListings > 0,
          foundStockxProducts: stockxData?.data?.products?.length > 0,
          foundOpportunities: ebayData.totalOpportunities > 0,
          possibleIssues: []
        }
      }
    });
    
  } catch (error) {
    console.error('💥 Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      query
    }, { status: 500 });
  }
}

