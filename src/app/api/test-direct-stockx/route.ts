import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing direct StockX function call...');
    
    // Import the StockX search function directly
    const { GET: stockxSearchHandler } = await import('../stockx/search/route');
    
    // Create a test request for "Jordan 1" 
    const testQuery = 'Jordan 1';
    const mockUrl = new URL(`http://localhost:3000/api/stockx/search?query=${encodeURIComponent(testQuery)}&limit=5`);
    const mockRequest = new Request(mockUrl.toString(), {
      method: 'GET',
      headers: request.headers,
    });
    
    // Copy NextRequest properties
    Object.defineProperty(mockRequest, 'nextUrl', {
      value: mockUrl,
      writable: false
    });
    Object.defineProperty(mockRequest, 'cookies', {
      value: request.cookies,
      writable: false
    });
    
    console.log('🔑 Request cookies:', request.cookies.toString() ? 'Present' : 'Missing');
    console.log('🔍 Calling StockX search with query:', testQuery);
    
    // Call the StockX search directly
    const response = await stockxSearchHandler(mockRequest as NextRequest);
    const data = await response.json();
    
    console.log('📡 StockX Response Status:', response.status);
    console.log('📦 StockX Response Data:', JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Direct StockX call test complete',
      stockxStatus: response.status,
      stockxData: data,
      cookiesPresent: !!request.cookies.toString(),
      testQuery
    });
    
  } catch (error) {
    console.error('❌ Test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
