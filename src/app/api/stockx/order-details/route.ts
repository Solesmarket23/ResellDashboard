import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orderId = searchParams.get('orderId');
  
  if (!orderId) {
    return NextResponse.json(
      { error: 'Order ID is required' },
      { status: 400 }
    );
  }

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  try {
    // Try different endpoints to get order details
    const endpoints = [
      `https://api.stockx.com/v2/selling/orders/${orderId}`,
      `https://api.stockx.com/api/v1/customers/selling/orders/${orderId}`,
      `https://api.stockx.com/v1/orders/${orderId}`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const data = await response.json();
          
          console.log(`✅ Order details fetched from: ${endpoint}`);
          console.log('Order details structure:', JSON.stringify(data, null, 2));
          
          return NextResponse.json({
            success: true,
            endpoint: endpoint,
            data: data
          });
        } else if (response.status !== 404) {
          console.log(`❌ Failed at ${endpoint}: ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ Error at ${endpoint}:`, error);
      }
    }

    return NextResponse.json({
      success: false,
      message: 'Could not fetch order details from any endpoint'
    }, { status: 404 });

  } catch (error) {
    console.error('Error fetching order details:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}