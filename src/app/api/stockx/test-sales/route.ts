import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

  if (!accessToken) {
    return NextResponse.json(
      { error: 'No access token found', message: 'Please authenticate with StockX first' },
      { status: 401 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing StockX API key' },
      { status: 500 }
    );
  }

  // Test official StockX API endpoints based on documentation
  const testEndpoints = [
    // Official seller endpoints from documentation
    'https://api.stockx.com/v2/selling/listings',
    'https://api.stockx.com/v2/selling/orders', 
    'https://api.stockx.com/v2/selling/batch/create-listing',
    
    // Potential order management endpoints
    'https://api.stockx.com/v2/orders',
    'https://api.stockx.com/v2/selling/operations',
    
    // Previous attempts (for comparison)
    'https://api.stockx.com/seller/orders',
    'https://api.stockx.com/seller/sales',
    
    // Alternative possibilities
    'https://api.stockx.com/v1/selling/listings',
    'https://api.stockx.com/v1/selling/orders',
    'https://api.stockx.com/selling/listings',
    'https://api.stockx.com/selling/orders',
    
    // General endpoints
    'https://api.stockx.com/orders',
    'https://api.stockx.com/sales',
    'https://api.stockx.com/user/orders'
  ];

  const results = [];

  console.log(`🧪 Testing ${testEndpoints.length} potential StockX sales endpoints...`);

  for (const endpoint of testEndpoints) {
    try {
      console.log(`🔍 Testing endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'FlipFlow/1.0'
        }
      });

      const statusCode = response.status;
      let responseData;
      let contentType = response.headers.get('content-type') || '';

      try {
        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
      } catch (parseError) {
        responseData = 'Unable to parse response';
      }

      const result = {
        endpoint,
        status: statusCode,
        statusText: response.statusText,
        contentType,
        success: response.ok,
        data: responseData
      };

      console.log(`📊 ${endpoint}: ${statusCode} ${response.statusText}`);
      results.push(result);

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.log(`❌ Error testing ${endpoint}:`, error);
      results.push({
        endpoint,
        status: 'ERROR',
        statusText: 'Network Error',
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
  }

  // Categorize results
  const successful = results.filter(r => r.success);
  const forbidden = results.filter(r => r.status === 403);
  const unauthorized = results.filter(r => r.status === 401);
  const notFound = results.filter(r => r.status === 404);
  const serverErrors = results.filter(r => r.status >= 500);
  const other = results.filter(r => !r.success && r.status !== 403 && r.status !== 401 && r.status !== 404 && r.status < 500);

  console.log(`✅ Test Summary:
    - Successful: ${successful.length}
    - Forbidden (403): ${forbidden.length}
    - Unauthorized (401): ${unauthorized.length}
    - Not Found (404): ${notFound.length}
    - Server Errors (5xx): ${serverErrors.length}
    - Other: ${other.length}`);

  return NextResponse.json({
    success: true,
    message: `Tested ${testEndpoints.length} endpoints`,
    summary: {
      total: results.length,
      successful: successful.length,
      forbidden: forbidden.length,
      unauthorized: unauthorized.length,
      notFound: notFound.length,
      serverErrors: serverErrors.length,
      other: other.length
    },
    results: {
      successful,
      forbidden,
      unauthorized,
      notFound,
      serverErrors,
      other,
      all: results
    },
    recommendations: generateRecommendations(results)
  });
}

function generateRecommendations(results: any[]) {
  const recommendations = [];

  const successful = results.filter(r => r.success);
  const forbidden = results.filter(r => r.status === 403);
  const unauthorized = results.filter(r => r.status === 401);

  if (successful.length > 0) {
    recommendations.push({
      type: 'success',
      message: `Found ${successful.length} working endpoint(s)!`,
      endpoints: successful.map(r => r.endpoint)
    });
  }

  if (forbidden.length > 0) {
    recommendations.push({
      type: 'seller_permissions_needed',
      message: `${forbidden.length} endpoint(s) require seller permissions`,
      solution: 'Apply for StockX seller account at stockx.com/sell'
    });
  }

  if (unauthorized.length > 0) {
    recommendations.push({
      type: 'auth_issue',
      message: `${unauthorized.length} endpoint(s) have authentication issues`,
      solution: 'Check OAuth scopes or token permissions'
    });
  }

  if (successful.length === 0 && forbidden.length > 0) {
    recommendations.push({
      type: 'fallback',
      message: 'Consider implementing manual sales tracking',
      solution: 'Create a system to manually log sales until seller API access is available'
    });
  }

  return recommendations;
} 