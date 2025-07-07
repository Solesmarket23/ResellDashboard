import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

  console.log('🔑 API Key Test:', {
    hasAccessToken: !!accessToken,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : 'none'
  });

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing STOCKX_API_KEY environment variable',
      message: 'Please add your StockX API key to .env.local',
      hasApiKey: false
    }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({
      success: false,
      error: 'Missing access token',
      message: 'Please authenticate with StockX first',
      hasApiKey: true,
      authRequired: true
    }, { status: 401 });
  }

  // Test various endpoints to see what access we have
  const testEndpoints = [
    {
      name: 'Basic Search',
      url: 'https://api.stockx.com/catalog/search?query=nike&pageSize=1',
      description: 'Test basic catalog search access'
    },
    {
      name: 'Market Data',
      url: 'https://api.stockx.com/v2/catalog/products',
      description: 'Test market data access'
    },
    {
      name: 'User Profile',
      url: 'https://api.stockx.com/v2/users/me',
      description: 'Test user profile access'
    }
  ];

  const results = [];

  for (const endpoint of testEndpoints) {
    try {
      console.log(`🧪 Testing: ${endpoint.name} - ${endpoint.url}`);
      
      const response = await fetch(endpoint.url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'FlipFlow/1.0'
        }
      });

      const responseText = await response.text();
      let responseData = null;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { rawResponse: responseText };
      }

      results.push({
        name: endpoint.name,
        url: endpoint.url,
        status: response.status,
        success: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        data: response.ok ? responseData : null,
        error: !response.ok ? responseData : null,
        description: endpoint.description
      });

      console.log(`✅ ${endpoint.name}: ${response.status} ${response.ok ? 'SUCCESS' : 'FAILED'}`);

    } catch (error) {
      console.error(`❌ ${endpoint.name} failed:`, error);
      results.push({
        name: endpoint.name,
        url: endpoint.url,
        status: 'ERROR',
        success: false,
        error: error.message,
        description: endpoint.description
      });
    }
  }

  // Analyze results
  const successfulEndpoints = results.filter(r => r.success);
  const authErrors = results.filter(r => r.status === 401);
  const permissionErrors = results.filter(r => r.status === 403);

  return NextResponse.json({
    success: true,
    message: 'API key test completed',
    summary: {
      totalEndpoints: results.length,
      successful: successfulEndpoints.length,
      authErrors: authErrors.length,
      permissionErrors: permissionErrors.length,
      hasApiKey: true,
      hasAccessToken: true
    },
    results,
    analysis: {
      apiKeyWorking: successfulEndpoints.length > 0,
      needsReauth: authErrors.length > 0,
      needsPermissions: permissionErrors.length > 0,
      recommendations: successfulEndpoints.length === 0 
        ? ['Check API key validity', 'Verify OAuth tokens', 'Contact StockX support']
        : ['API access confirmed', 'Can proceed with development']
    }
  });
} 