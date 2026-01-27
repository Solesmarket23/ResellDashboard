import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || 'nike';
  const userId = (searchParams.get('userId') || '').trim();
  
  try {
    console.log(`🔍 Testing StockX search for: "${query}"`);
    
    // Get authentication tokens from cookies
    let accessToken = request.cookies.get('stockx_access_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;
    
    // Fallback for non-cookie contexts (e.g. Cursor browser): use stored refresh token if userId is provided.
    if (!accessToken && userId) {
      try {
        const db = getAdminDb();
        const snap = await db.collection('users').doc(userId).get();
        const data = snap.exists ? (snap.data() as any) : null;
        const refreshToken = (data?.stockxTokens?.refresh_token || data?.stockxTokens?.refreshToken || '').toString().trim();
        if (refreshToken) {
          const refreshed = await refreshStockXTokens(refreshToken);
          if (refreshed.success && refreshed.accessToken) {
            accessToken = refreshed.accessToken;
          }
        }
      } catch (e) {
        console.warn('⚠️ test-stockx-search: failed to refresh token from Firebase:', e);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No StockX access token found',
          message: userId
            ? 'No StockX access token found (cookie missing; Firebase refresh token missing/invalid)'
            : 'Please authenticate with StockX first (or pass ?userId=...)',
        },
        { status: 401 }
      );
    }
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'No StockX API key configured'
      }, { status: 500 });
    }
    
    // Test StockX search API
    const searchApiParams = new URLSearchParams({
      query: query,
      pageNumber: '1',
      pageSize: '5'
    });

    const searchUrl = `https://api.stockx.com/v2/catalog/search?${searchApiParams.toString()}`;
    console.log(`🌐 Testing StockX API call: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });
    
    console.log(`📡 StockX API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      const products = data.products || [];
      
      console.log(`📦 StockX search successful:`, {
        productCount: products.length,
        totalResults: data.totalResults || 0,
        hasProducts: products.length > 0
      });
      
      // Test market data for first product if available
      let marketDataTest = null;
      if (products.length > 0) {
        const firstProduct = products[0];
        const productId = firstProduct.id || firstProduct.productId || firstProduct.uuid;
        
        console.log(`🔍 Testing market data for product: ${productId}`);
        
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
        
        if (marketResponse.ok) {
          marketDataTest = await marketResponse.json();
          console.log(`✅ Market data test successful:`, {
            isArray: Array.isArray(marketDataTest),
            variantCount: Array.isArray(marketDataTest) ? marketDataTest.length : 0,
            sampleVariant: Array.isArray(marketDataTest) ? marketDataTest[0] : null
          });
        } else {
          console.log(`❌ Market data test failed: ${marketResponse.status}`);
        }
      }
      
      return NextResponse.json({
        success: true,
        authMode: request.cookies.get('stockx_access_token')?.value ? 'cookie' : userId ? 'firebase_refresh' : 'unknown',
        query: query,
        searchResults: {
          productCount: products.length,
          totalResults: data.totalResults || 0,
          products: products.map((p: any) => ({
            id: p.id || p.uuid || p.productId,
            title: p.title || p.name,
            brand: p.brand,
            urlKey: p.urlKey,
            productId: p.productId
          }))
        },
        marketDataTest: marketDataTest ? {
          isArray: Array.isArray(marketDataTest),
          variantCount: Array.isArray(marketDataTest) ? marketDataTest.length : 0,
          sampleVariant: Array.isArray(marketDataTest) ? marketDataTest[0] : null
        } : null
      });
      
    } else {
      const errorText = await response.text();
      console.log(`❌ StockX search failed (${response.status}): ${errorText}`);
      
      return NextResponse.json({
        success: false,
        error: 'StockX search failed',
        status: response.status,
        details: errorText
      }, { status: response.status });
    }
    
  } catch (error) {
    console.error('❌ StockX test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

