import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;

    // If no token from cookies(), try reading from raw cookie header
    if (!accessToken) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
        );
        accessToken = cookies.stockx_access_token;
      }
    }

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No access token found',
        debug: {
          cookieHeader: request.headers.get('cookie'),
          domain: request.headers.get('host')
        }
      }, { status: 401 });
    }

    console.log('🔍 Testing StockX Catalog API Access...');

    // Test data - using a known product ID from the logs
    const testProductId = '552035be-bf4d-4b24-a81f-3b5cea428fad'; // Denim Tears product from logs

    const testEndpoints = [
      {
        name: 'Search API (current)',
        url: 'https://api.stockx.com/v2/catalog/search?query=test&limit=1',
        description: 'Basic search endpoint we currently use'
      },
      {
        name: 'Product Details v2',
        url: `https://api.stockx.com/v2/catalog/products/${testProductId}`,
        description: 'Full product details (may include images)'
      },
      {
        name: 'Product Details v1', 
        url: `https://api.stockx.com/v1/catalog/products/${testProductId}`,
        description: 'v1 product details endpoint'
      },
      {
        name: 'Market Data v2',
        url: `https://api.stockx.com/v2/catalog/products/${testProductId}/market-data`,
        description: 'Market pricing data (working in logs)'
      },
      {
        name: 'Product Variants',
        url: `https://api.stockx.com/v2/catalog/products/${testProductId}/variants`,
        description: 'Product variants with potential image data'
      },
      {
        name: 'Catalog Browse',
        url: 'https://api.stockx.com/v2/catalog/browse?limit=1',
        description: 'General catalog browsing'
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
            'Accept': 'application/json',
            'User-Agent': 'StockX/4.0.0 (iPhone; iOS 14.0; Scale/3.00)',
          },
        });

        const statusColor = response.status === 200 ? '✅' : response.status === 403 ? '❌' : '⚠️';
        console.log(`${statusColor} ${endpoint.name}: Status ${response.status}`);

        let responseData = null;
        let hasImages = false;
        let imageFields = [];

        if (response.status === 200) {
          try {
            responseData = await response.json();
            
            // Check for image-related fields
            const responseStr = JSON.stringify(responseData);
            const imagePatterns = [
              'image', 'thumb', 'photo', 'media', 'picture', 'productImage', 
              'smallImageUrl', 'imageUrl', 'thumbUrl', 'mediaUrl'
            ];
            
            imageFields = imagePatterns.filter(pattern => 
              responseStr.toLowerCase().includes(pattern.toLowerCase())
            );
            
            hasImages = imageFields.length > 0;

            if (hasImages) {
              console.log(`🖼️ Found image fields in ${endpoint.name}:`, imageFields);
            }
          } catch (e) {
            console.log(`⚠️ Could not parse JSON response for ${endpoint.name}`);
          }
        }

        results.push({
          name: endpoint.name,
          description: endpoint.description,
          url: endpoint.url,
          status: response.status,
          accessible: response.status === 200,
          hasImages,
          imageFields,
          dataKeys: responseData ? Object.keys(responseData).slice(0, 10) : null
        });

      } catch (error) {
        console.error(`❌ Error testing ${endpoint.name}:`, error);
        results.push({
          name: endpoint.name,
          description: endpoint.description,
          url: endpoint.url,
          status: 'ERROR',
          accessible: false,
          error: error.message
        });
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    const accessibleEndpoints = results.filter(r => r.accessible);
    const imageEndpoints = results.filter(r => r.hasImages);
    
    console.log('\n📊 CATALOG API ACCESS SUMMARY:');
    console.log(`✅ Accessible endpoints: ${accessibleEndpoints.length}/${results.length}`);
    console.log(`🖼️ Endpoints with image data: ${imageEndpoints.length}/${results.length}`);
    
    if (imageEndpoints.length > 0) {
      console.log('🎯 IMAGE DATA FOUND IN:');
      imageEndpoints.forEach(endpoint => {
        console.log(`  - ${endpoint.name}: ${endpoint.imageFields.join(', ')}`);
      });
    }

    return NextResponse.json({
      summary: {
        totalEndpoints: results.length,
        accessibleEndpoints: accessibleEndpoints.length,
        imageEndpoints: imageEndpoints.length,
        hasFullCatalogAccess: accessibleEndpoints.length >= 4,
        hasImageAccess: imageEndpoints.length > 0
      },
      results,
      recommendations: imageEndpoints.length > 0 
        ? `✅ Image data found! Use ${imageEndpoints[0].name} endpoint for product images.`
        : '❌ No image data found in accessible endpoints. May need Catalog API approval.'
    });

  } catch (error) {
    console.error('🚨 Catalog API test failed:', error);
    return NextResponse.json({ 
      error: 'Failed to test catalog API access',
      details: error.message 
    }, { status: 500 });
  }
} 