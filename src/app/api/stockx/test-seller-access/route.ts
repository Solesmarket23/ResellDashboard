import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;

  console.log('🏪 Seller API Test:', {
    hasAccessToken: !!accessToken,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : 'none'
  });

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing STOCKX_API_KEY environment variable',
      message: 'Please add your StockX API key to .env.local'
    }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({
      success: false,
      error: 'Missing access token',
      message: 'Please authenticate with StockX first'
    }, { status: 401 });
  }

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'StockX-ResellDashboard/1.0'
  };

  const sellerEndpoints = [
    {
      name: 'User Profile',
      url: 'https://api.stockx.com/v2/users/me',
      description: 'Get current user profile and seller status'
    },
    {
      name: 'Seller Listings',
      url: 'https://api.stockx.com/v2/selling/listings?pageNumber=1&pageSize=5',
      description: 'Get your active listings (official seller endpoint)'
    },
    {
      name: 'Seller Orders',
      url: 'https://api.stockx.com/v2/selling/orders?pageNumber=1&pageSize=5',
      description: 'Get your orders (official seller endpoint)'
    },
    {
      name: 'Seller Dashboard',
      url: 'https://api.stockx.com/v2/selling/dashboard',
      description: 'Get seller dashboard data'
    },
    {
      name: 'Seller Analytics',
      url: 'https://api.stockx.com/v2/selling/analytics',
      description: 'Get seller analytics data'
    },
    {
      name: 'Seller Inventory',
      url: 'https://api.stockx.com/v2/selling/inventory',
      description: 'Get seller inventory data'
    },
    {
      name: 'Basic Search (Should Work)',
      url: 'https://api.stockx.com/catalog/search?query=nike&pageSize=1',
      description: 'Basic product search - should work for all users'
    }
  ];

  const results = [];
  
  for (const endpoint of sellerEndpoints) {
    try {
      console.log(`🧪 Testing: ${endpoint.name} - ${endpoint.url}`);
      
      const response = await fetch(endpoint.url, {
        method: 'GET',
        headers: headers
      });

      const statusText = response.status === 200 ? 'SUCCESS' : 
                        response.status === 403 ? 'FORBIDDEN' : 
                        response.status === 401 ? 'UNAUTHORIZED' : 'FAILED';

      let responseData;
      try {
        responseData = await response.json();
      } catch {
        responseData = { message: await response.text() };
      }

      const result = {
        name: endpoint.name,
        url: endpoint.url,
        description: endpoint.description,
        status: response.status,
        statusText,
        success: response.status === 200,
        error: response.status !== 200 ? responseData : null,
        dataPreview: response.status === 200 ? 
          (responseData.data ? `Found ${Object.keys(responseData.data).length} fields` : 
           responseData.length ? `${responseData.length} items` : 'Data returned') : null
      };

      results.push(result);
      console.log(`✅ ${endpoint.name}: ${response.status} ${statusText}`);
      
    } catch (error) {
      const result = {
        name: endpoint.name,
        url: endpoint.url,
        description: endpoint.description,
        status: 500,
        statusText: 'ERROR',
        success: false,
        error: { message: error.message },
        dataPreview: null
      };
      results.push(result);
      console.log(`❌ ${endpoint.name}: ERROR - ${error.message}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const analysis = {
    totalEndpoints: results.length,
    successfulEndpoints: successCount,
    failedEndpoints: results.length - successCount,
    hasSellerAccess: results.some(r => r.name.includes('Seller') && r.success),
    hasBasicAccess: results.some(r => r.name.includes('Basic') && r.success),
    mostCommonError: results.filter(r => !r.success).length > 0 ? 
      results.filter(r => !r.success)[0].status : null
  };

  // Generate recommendations
  const recommendations = [];
  
  if (analysis.hasBasicAccess && !analysis.hasSellerAccess) {
    recommendations.push("✅ Basic API access works - Your authentication is correct");
    recommendations.push("❌ Seller API access blocked - Contact StockX developer support");
    recommendations.push("📧 Email: developer-support@stockx.com");
    recommendations.push("💬 Mention you're a top-tier seller needing API access");
  } else if (!analysis.hasBasicAccess) {
    recommendations.push("❌ No API access - Check API key configuration");
    recommendations.push("🔑 Verify API key is correct in .env.local");
    recommendations.push("🏪 Confirm API key is linked to your seller account");
  } else if (analysis.hasSellerAccess) {
    recommendations.push("🎉 Seller API access works! You're all set!");
    recommendations.push("🚀 You can now use all seller endpoints");
  }

  return NextResponse.json({
    success: true,
    message: 'Seller API test completed',
    analysis,
    results,
    recommendations,
    sellerAccountStatus: analysis.hasSellerAccess ? 'Active' : 'Needs Setup',
    nextSteps: analysis.hasSellerAccess ? 
      ['Start using seller endpoints', 'Build your seller dashboard'] :
      ['Contact StockX developer support', 'Request seller API access']
  });
} 