import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  console.log('🔐 Testing StockX Orders API');
  console.log('Has access token:', !!accessToken);
  console.log('Has API key:', !!apiKey);

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  try {
    // Test the history endpoint with minimal parameters
    const historyUrl = 'https://api.stockx.com/v2/selling/orders/history?pageSize=10&pageNumber=1';
    console.log('📍 Testing:', historyUrl);
    
    const response = await fetch(historyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      
      return NextResponse.json({
        error: 'StockX API Error',
        status: response.status,
        statusText: response.statusText,
        details: errorText,
        headers: Object.fromEntries(response.headers.entries())
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('✅ Success! Data structure:', Object.keys(data));

    return NextResponse.json({
      success: true,
      endpoint: historyUrl,
      dataStructure: Object.keys(data),
      sampleData: data,
      totalItems: data.length || data.totalCount || data.total || 0
    });

  } catch (error: any) {
    console.error('💥 Fetch error:', error);
    return NextResponse.json({
      error: 'Fetch failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}