import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  // Test different endpoint variations
  const endpoints = [
    'https://api.stockx.com/v2/selling/orders',
    'https://api.stockx.com/v2/selling',
    'https://api.stockx.com/v1/customers/selling',
    'https://api.stockx.com/api/v1/portfolio?type=seller',
    'https://api.stockx.com/api/browse/selling'
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const result: any = {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      };

      if (!response.ok) {
        const errorText = await response.text();
        result.error = errorText.substring(0, 200);
      } else {
        const data = await response.text();
        result.preview = data.substring(0, 200);
        
        // Try to parse as JSON
        try {
          const jsonData = JSON.parse(data);
          result.dataStructure = Object.keys(jsonData);
        } catch (e) {
          result.dataStructure = 'Not JSON';
        }
      }

      results.push(result);
    } catch (error: any) {
      results.push({
        endpoint,
        error: error.message
      });
    }
  }

  return NextResponse.json({
    tested: results,
    summary: {
      successful: results.filter(r => r.ok).map(r => r.endpoint),
      failed: results.filter(r => !r.ok).map(r => ({ endpoint: r.endpoint, status: r.status }))
    }
  });
}