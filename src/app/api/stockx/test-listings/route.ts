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

    console.log('📝 Testing StockX Listings API Access...');

    const listingsEndpoints = [
      {
        name: 'Get All Listings',
        url: 'https://api.stockx.com/v1/listings',
        method: 'GET',
        description: 'Retrieve all your active listings'
      },
      {
        name: 'Get Listing Operations',
        url: 'https://api.stockx.com/v1/listings/operations',
        method: 'GET', 
        description: 'Get operations/history for your listings'
      },
      {
        name: 'Get Listing by ID (Test)',
        url: 'https://api.stockx.com/v1/listings/test-id-123',
        method: 'GET',
        description: 'Test endpoint access (will likely 404 but shows permissions)'
      },
      {
        name: 'Listings Base Endpoint',
        url: 'https://api.stockx.com/v1/listings/',
        method: 'GET',
        description: 'Base listings endpoint'
      }
    ];

    const results = [];

    for (const endpoint of listingsEndpoints) {
      try {
        console.log(`🧪 Testing: ${endpoint.name} - ${endpoint.url}`);
        
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'StockX/4.0.0 (iPhone; iOS 14.0; Scale/3.00)',
          },
        });

        const statusColor = response.status === 200 ? '✅' : 
                          response.status === 401 ? '🔒' : 
                          response.status === 403 ? '❌' : 
                          response.status === 404 ? '🔍' : '⚠️';
        
        console.log(`${statusColor} ${endpoint.name}: Status ${response.status}`);

        let responseData = null;
        let hasListings = false;
        let listingCount = 0;

        if (response.status === 200) {
          try {
            responseData = await response.json();
            
            // Check if this contains listing data
            if (Array.isArray(responseData)) {
              hasListings = responseData.length > 0;
              listingCount = responseData.length;
            } else if (responseData && responseData.listings) {
              hasListings = responseData.listings.length > 0;
              listingCount = responseData.listings.length;
            } else if (responseData && responseData.data) {
              hasListings = Array.isArray(responseData.data) && responseData.data.length > 0;
              listingCount = Array.isArray(responseData.data) ? responseData.data.length : 0;
            }

            if (hasListings) {
              console.log(`📋 Found ${listingCount} listings in ${endpoint.name}`);
            }
          } catch (e) {
            console.log(`⚠️ Could not parse JSON response for ${endpoint.name}`);
          }
        }

        results.push({
          name: endpoint.name,
          description: endpoint.description,
          url: endpoint.url,
          method: endpoint.method,
          status: response.status,
          accessible: response.status === 200,
          hasListings,
          listingCount,
          dataKeys: responseData ? Object.keys(responseData).slice(0, 10) : null,
          statusMeaning: response.status === 200 ? 'Success' :
                       response.status === 401 ? 'Unauthorized (no access)' :
                       response.status === 403 ? 'Forbidden (no permissions)' :
                       response.status === 404 ? 'Not Found (endpoint may not exist or no data)' :
                       'Other error'
        });

      } catch (error) {
        console.error(`❌ Error testing ${endpoint.name}:`, error);
        results.push({
          name: endpoint.name,
          description: endpoint.description,
          url: endpoint.url,
          method: endpoint.method,
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
    const endpointsWithListings = results.filter(r => r.hasListings);
    const totalListings = endpointsWithListings.reduce((sum, r) => sum + (r.listingCount || 0), 0);
    
    console.log('\n📊 LISTINGS API ACCESS SUMMARY:');
    console.log(`✅ Accessible endpoints: ${accessibleEndpoints.length}/${results.length}`);
    console.log(`📋 Endpoints with listings: ${endpointsWithListings.length}/${results.length}`);
    console.log(`🏷️ Total listings found: ${totalListings}`);
    
    if (accessibleEndpoints.length > 0) {
      console.log('🎯 LISTINGS API ACCESS CONFIRMED!');
      accessibleEndpoints.forEach(endpoint => {
        console.log(`  - ${endpoint.name}: ${endpoint.status}`);
      });
    }

    return NextResponse.json({
      summary: {
        totalEndpoints: results.length,
        accessibleEndpoints: accessibleEndpoints.length,
        endpointsWithListings: endpointsWithListings.length,
        totalListings,
        hasListingsAccess: accessibleEndpoints.length >= 2,
        canManageListings: accessibleEndpoints.some(e => e.name.includes('Get All Listings'))
      },
      results,
      recommendations: accessibleEndpoints.length > 0 
        ? `✅ Listings API access confirmed! You can ${accessibleEndpoints.length >= 2 ? 'fully manage' : 'partially access'} listings.`
        : '❌ No Listings API access. May need seller account or different permissions.',
      nextSteps: accessibleEndpoints.length > 0
        ? [
            'Test creating a new listing',
            'Implement listing management UI',
            'Add seller dashboard features',
            'Create inventory management system'
          ]
        : [
            'Check if you have a StockX seller account',
            'Verify API permissions include listing management',
            'Contact StockX support for Listings API access'
          ]
    });

  } catch (error) {
    console.error('🚨 Listings API test failed:', error);
    return NextResponse.json({ 
      error: 'Failed to test listings API access',
      details: error.message 
    }, { status: 500 });
  }
} 