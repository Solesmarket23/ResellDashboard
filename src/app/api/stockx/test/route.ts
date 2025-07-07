import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

  if (!accessToken || !apiKey) {
    return NextResponse.json({
      error: 'Missing token or API key',
      hasAccessToken: !!accessToken,
      hasApiKey: !!apiKey
    }, { status: 401 });
  }

  // Test different API endpoints to see what permissions we have
  const testEndpoints = [
    {
      name: 'User Profile',
      url: 'https://api.stockx.com/v2/user/me',
      description: 'Basic user info - should work with basic OAuth'
    },
    {
      name: 'Search',
      url: 'https://api.stockx.com/v2/catalog/search?query=nike&limit=1',
      description: 'Product search - requires catalog access'
    },
    {
      name: 'Auth Check',
      url: 'https://api.stockx.com/v2/auth/check',
      description: 'Check authentication status'
    }
  ];

  const results = [];

  for (const endpoint of testEndpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'FlipFlow/1.0'
        }
      });

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
  }

      results.push({
        endpoint: endpoint.name,
        url: endpoint.url,
        description: endpoint.description,
        status: response.status,
        success: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
      });

    } catch (error) {
      results.push({
        endpoint: endpoint.name,
        url: endpoint.url,
        description: endpoint.description,
        status: 'ERROR',
        success: false,
        error: error.message
      });
    }
  }

  return NextResponse.json({
    message: 'StockX API Access Test',
    accessTokenPresent: true,
    apiKeyPresent: true,
    results: results,
    summary: {
      workingEndpoints: results.filter(r => r.success).length,
      totalEndpoints: results.length,
      hasBasicAccess: results.some(r => r.endpoint === 'User Profile' && r.success),
      hasCatalogAccess: results.some(r => r.endpoint === 'Search' && r.success)
    }
  });
} 