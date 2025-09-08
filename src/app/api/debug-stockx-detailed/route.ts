import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('\n🔍 === DETAILED STOCKX DEBUG START ===');
    
    // Test with a simple, common query that should definitely work
    const testQuery = 'Jordan 1';
    
    console.log(`🎯 Testing StockX search for: "${testQuery}"`);
    
    // Check if we have the necessary cookies
    const cookies = request.cookies.toString();
    console.log(`🍪 Request cookies: ${cookies ? 'Present' : 'None'}`);
    
    // Test the same exact call that the arbitrage finder makes
    const baseUrl = 'https://www.solesmarket.com';
    const apiUrl = `${baseUrl}/api/stockx/search?query=${encodeURIComponent(testQuery)}&limit=10`;
    
    console.log(`🌐 StockX API URL: ${apiUrl}`);
    console.log(`🔑 Forwarding cookies: ${cookies}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; solesmarket-arbitrage)',
        'Cookie': cookies // Forward authentication cookies
      }
    });
    
    console.log(`📡 StockX Response Status: ${response.status}`);
    console.log(`📋 StockX Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ StockX Response Data:`, JSON.stringify(data, null, 2));
      
      return NextResponse.json({
        success: true,
        message: 'StockX API test successful',
        query: testQuery,
        status: response.status,
        data: data,
        productCount: data.products?.length || 0,
        sampleProduct: data.products?.[0] || null
      });
    } else {
      const errorText = await response.text();
      console.log(`❌ StockX Error Response: ${errorText}`);
      
      return NextResponse.json({
        success: false,
        message: 'StockX API test failed',
        query: testQuery,
        status: response.status,
        error: errorText,
        rawResponse: errorText
      });
    }
    
  } catch (error) {
    console.error('💥 Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
