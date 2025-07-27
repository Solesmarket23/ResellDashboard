import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  // Return auth status immediately so you can see in browser
  const authStatus = {
    hasAccessToken: !!accessToken,
    hasApiKey: !!apiKey,
    tokenPreview: accessToken ? `${accessToken.substring(0, 10)}...${accessToken.slice(-5)}` : null,
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : null
  };

  if (!accessToken || !apiKey) {
    return NextResponse.json({ 
      error: 'Missing authentication',
      authStatus,
      message: 'You need both StockX access token and API key'
    }, { status: 200 }); // Return 200 so browser shows the JSON
  }

  // Test different parameter combinations
  const tests = [
    {
      name: 'No parameters',
      url: 'https://api.stockx.com/v2/selling/orders/history'
    },
    {
      name: 'With pageSize only',
      url: 'https://api.stockx.com/v2/selling/orders/history?pageSize=10'
    },
    {
      name: 'With pageNumber and pageSize',
      url: 'https://api.stockx.com/v2/selling/orders/history?pageNumber=1&pageSize=10'
    },
    {
      name: 'With orderStatus',
      url: 'https://api.stockx.com/v2/selling/orders/history?orderStatus=COMPLETED&pageSize=10'
    }
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`\nTesting: ${test.name}`);
      console.log(`URL: ${test.url}`);
      
      const response = await fetch(test.url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey
        }
      });

      const responseText = await response.text();
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${responseText.substring(0, 200)}`);
      
      results.push({
        ...test,
        status: response.status,
        ok: response.ok,
        response: responseText.substring(0, 500)
      });
      
    } catch (error: any) {
      console.error(`Error in ${test.name}:`, error.message);
      results.push({
        ...test,
        error: error.message
      });
    }
  }

  return NextResponse.json({ 
    tests: results,
    summary: {
      successful: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length
    }
  });
}