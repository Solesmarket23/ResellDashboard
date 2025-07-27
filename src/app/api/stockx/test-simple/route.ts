import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: 'Missing auth' }, { status: 401 });
  }

  // Test the simplest possible request
  const testUrls = [
    'https://api.stockx.com/v2/selling/orders/history',
    'https://api.stockx.com/v2/selling/orders/active',
    'https://api.stockx.com/v2/selling/listings'
  ];

  const results = [];

  for (const url of testUrls) {
    try {
      console.log(`Testing: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const responseText = await response.text();
      
      results.push({
        url,
        status: response.status,
        ok: response.ok,
        response: responseText.substring(0, 200),
        headers: Object.fromEntries(response.headers.entries())
      });
      
    } catch (error: any) {
      results.push({
        url,
        error: error.message
      });
    }
  }

  return NextResponse.json({ results });
}