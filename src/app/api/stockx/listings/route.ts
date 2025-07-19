import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(request: NextRequest) {
  try {
    // Get access token from cookies
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No access token found. Please authenticate first.' 
      }, { status: 401 });
    }

    console.log('🛍️ Fetching StockX listings...');
    console.log('🔑 API Key:', process.env.STOCKX_API_KEY ? `Present (${process.env.STOCKX_API_KEY.substring(0, 8)}...)` : 'Missing');
    console.log('🔐 Client ID:', process.env.STOCKX_CLIENT_ID ? 'Present' : 'Missing');
    console.log('🎫 Access token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'Missing');

    // Function to fetch a page of listings
    const fetchPage = async (pageNum: number, token: string) => {
      const params = new URLSearchParams({
        pageSize: '100', // Use pageSize instead of limit per API docs
        pageNumber: pageNum.toString(), // Use pageNumber instead of page
        listingStatuses: 'ACTIVE' // Only get active listings that can be repriced
      });
      
      const url = `https://api.stockx.com/v2/selling/listings?${params}`;
      console.log('📍 Fetching from:', url);
      
      const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
      console.log('🔐 Using API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'EMPTY');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ResellDashboard/1.0'
        }
      });
      
      console.log('📊 Response status:', response.status);
      
      return response;
    };

    // Fetch first page
    let response = await fetchPage(1, accessToken);

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Store the new access token for later use
        accessToken = refreshResult.accessToken;
        // Retry with new token
        response = await fetchPage(1, accessToken);
      } else {
        return NextResponse.json({ 
          success: false, 
          error: 'Authentication expired. Please re-authenticate.' 
        }, { status: 401 });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ StockX API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      // Try to parse error details
      let errorMessage = `StockX API error: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) errorMessage = errorData.message;
        if (errorData.error) errorMessage = errorData.error;
      } catch {
        // If not JSON, use the text
        if (errorText) errorMessage = errorText;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Listings response:', {
      hasListings: !!data.listings,
      dataKeys: Object.keys(data),
      count: data.count,
      pageSize: data.pageSize,
      pageNumber: data.pageNumber,
      hasNextPage: data.hasNextPage,
      firstListing: data.listings?.[0]
    });

    // StockX API returns listings in a 'listings' array
    const rawListings = data.listings || data.data || [];
    console.log(`📦 Found ${rawListings.length} listings from API`);
    console.log(`📊 Total count reported by API: ${data.count}`);
    
    // Count by status BEFORE any filtering
    const statusCounts: { [key: string]: number } = {};
    rawListings.forEach((listing: any) => {
      const status = listing.status || 'NO_STATUS';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    console.log('🏷️ Status breakdown from API:', statusCounts);
    
    // Check for listings with orders (MATCHED status)
    const listingsWithOrders = rawListings.filter((l: any) => l.order);
    console.log(`📦 Listings with orders (likely MATCHED): ${listingsWithOrders.length}`);
    
    // Check for expired asks with more detailed logging
    const now = new Date();
    const expiredListings = rawListings.filter((l: any) => {
      if (l.ask?.askExpiresAt) {
        const expirationDate = new Date(l.ask.askExpiresAt);
        const isExpired = expirationDate <= now;
        if (isExpired && rawListings.length <= 10) {
          console.log(`Expired: ${l.product?.title} - ${expirationDate.toISOString()}`);
        }
        return isExpired;
      }
      return false;
    });
    
    // Create a Set of expired listing IDs for easier lookup
    const expiredListingIds = new Set(expiredListings.map((l: any) => l.id || l.listingId));
    
    console.log(`⏰ Listings with expired asks: ${expiredListings.length}`);
    console.log(`🎯 Expected active listings after filtering expired: ${rawListings.length - expiredListings.length}`);

    // Transform the data to match our component's expectations
    const transformedListings = rawListings.map((listing: any, index: number) => {
      // Log the structure of the first listing to understand the format
      if (index === 0) {
        console.log('Sample listing structure:', {
          keys: Object.keys(listing),
          hasAsk: !!listing.ask,
          askKeys: listing.ask ? Object.keys(listing.ask) : [],
          askExpiresAt: listing.ask?.askExpiresAt,
          listing: listing
        });
      }
      
      return {
        listingId: listing.listingId || listing.id || `listing-${index}`,
        productId: listing.productId || listing.product?.productId || listing.product?.id || '',
        variantId: listing.variantId || listing.variant?.variantId || listing.variant?.id || '',
        productName: listing.productName || listing.product?.productName || listing.product?.title || listing.product?.name || 'Unknown Product',
        size: listing.size || listing.variant?.size || listing.variant?.variantValue || listing.variantValue || 'Unknown Size',
        currentPrice: parseFloat(listing.amount || listing.price || '0'),
        originalPrice: parseFloat(listing.amount || listing.price || '0'),
        brand: listing.brand || listing.product?.brand || 'Unknown Brand',
        styleId: listing.styleId || listing.product?.styleId || '',
        colorway: listing.colorway || listing.product?.colorway || '',
        condition: listing.condition || 'new',
        status: listing.status || listing.listingStatus,
        createdAt: listing.createdAt || listing.created_at,
        updatedAt: listing.updatedAt || listing.updated_at,
        // Additional useful fields
        retailPrice: parseFloat(listing.product?.retailPrice || listing.retailPrice || '0'),
        lowestAsk: parseFloat(listing.product?.lowestAsk || listing.lowestAsk || '0'),
        highestBid: parseFloat(listing.product?.highestBid || listing.highestBid || '0'),
        lastSale: parseFloat(listing.product?.lastSale || listing.lastSale || '0'),
        category: listing.product?.category || listing.category || '',
        inventoryType: listing.inventoryType || '',
        // UUID fields
        productUuid: listing.productUuid || listing.product?.uuid,
        variantUuid: listing.variantUuid || listing.variant?.uuid,
        listingUuid: listing.uuid || listing.listingUuid
      };
    });
    
    // Strict filtering for truly active listings that can be repriced
    let filteredListingsAnalysis: any[] = [];
    const activeListings = transformedListings.filter((listing: any, index: number) => {
      const status = listing.status?.toUpperCase();
      
      // Find the corresponding raw listing by ID
      const rawListing = rawListings.find((r: any) => 
        (r.id || r.listingId) === (listing.listingId || listing.listingUuid)
      );
      
      // Criteria for a truly active listing:
      // 1. Status must be ACTIVE
      // 2. No associated order (not MATCHED)
      // 3. Has an active ask
      // 4. Ask is not expired (if expiration date exists)
      const hasActiveStatus = status === 'ACTIVE';
      const hasNoOrder = !rawListing?.order;
      const hasAsk = !!rawListing?.ask;
      
      // More strict expiration check
      let notExpired = true;
      if (rawListing?.ask?.askExpiresAt) {
        const expirationDate = new Date(rawListing.ask.askExpiresAt);
        const now = new Date();
        notExpired = expirationDate > now;
        
        if (!notExpired && index < 5) {
          console.log(`📅 Expired listing: ${listing.productName} - Expired at: ${expirationDate.toISOString()}, Current time: ${now.toISOString()}`);
        }
      }
      
      const isActive = hasActiveStatus && hasNoOrder && hasAsk && notExpired;
      
      if (!isActive) {
        const reason = !hasActiveStatus ? 'Not ACTIVE status' :
                      !hasNoOrder ? 'Has order (MATCHED)' :
                      !hasAsk ? 'No ask price' :
                      !notExpired ? 'Ask expired' : 'Unknown';
        
        if (index < 5) {
          console.log(`🚫 Filtering out listing:`, {
            productName: listing.productName,
            status: listing.status,
            hasOrder: !hasNoOrder,
            hasAsk: hasAsk,
            expired: !notExpired,
            reason: reason
          });
        }
        
        // Track filtered listings for analysis
        if (!filteredListingsAnalysis) {
          filteredListingsAnalysis = [];
        }
        filteredListingsAnalysis.push({
          productName: listing.productName,
          size: listing.size,
          status: listing.status,
          reason: reason,
          order: rawListing?.order,
          inventoryType: rawListing?.inventoryType
        });
      }
      
      return isActive;
    });
    
    console.log(`🎯 Strict filtering: ${activeListings.length} truly active listings (from ${transformedListings.length} total)`);
    console.log(`📊 Filtered out: ${transformedListings.length - activeListings.length} listings`);
    
    // Double-check our math
    console.log('\n📐 Filtering Math Check:');
    console.log(`  Total from API: ${rawListings.length}`);
    console.log(`  - Expired asks: ${expiredListings.length}`);
    console.log(`  - With orders: ${listingsWithOrders.length}`);
    console.log(`  = Should have: ${rawListings.length - expiredListings.length - listingsWithOrders.length} active listings`);
    console.log(`  Actually have: ${activeListings.length} active listings`);
    
    if (activeListings.length !== 51) {
      console.log(`\n⚠️  Discrepancy detected! Expected 51 but got ${activeListings.length}`);
      
      // Find which expired listings might have slipped through
      const suspiciousListings = activeListings.filter((listing: any) => {
        // Find the corresponding raw listing by ID
        const rawListing = rawListings.find((r: any) => 
          (r.id || r.listingId) === (listing.listingId || listing.listingUuid)
        );
        const listingId = listing.listingId || listing.listingUuid;
        
        // Check if this listing was marked as expired but still made it through
        if (expiredListingIds.has(listingId)) {
          console.log(`🚨 EXPIRED LISTING SLIPPED THROUGH: ${listing.productName} - Size ${listing.size}`);
          return true;
        }
        
        // Check if this listing has an expiration date we might have missed
        if (rawListing?.ask?.askExpiresAt) {
          const expirationDate = new Date(rawListing.ask.askExpiresAt);
          if (expirationDate <= now) {
            console.log(`🚨 MISSED EXPIRED LISTING: ${listing.productName} - Expired: ${expirationDate.toISOString()}`);
            return true;
          }
        }
        
        return false;
      });
      
      if (suspiciousListings.length > 0) {
        console.log(`\n🔍 Found ${suspiciousListings.length} suspicious listings that might be expired`);
      }
    }
    
    // Log status breakdown
    const statusBreakdown = transformedListings.reduce((acc: any, listing: any) => {
      const status = listing.status || 'NO_STATUS';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 Status breakdown:', statusBreakdown);
    
    // Identify potential test listings and anomalies
    const testListings = activeListings.filter((listing: any) => 
      listing.currentPrice === 999 || 
      listing.currentPrice === 9999 ||
      listing.currentPrice === 99999 ||
      (listing.productName?.includes('Test') || listing.productName?.includes('test'))
    );
    
    // Find highest priced listings
    const sortedByPrice = [...activeListings].sort((a: any, b: any) => b.currentPrice - a.currentPrice);
    const top10Expensive = sortedByPrice.slice(0, 10);
    
    console.log(`🧪 Found ${testListings.length} potential test listings`);
    console.log('💰 Top 10 most expensive listings:', 
      top10Expensive.map((l: any) => ({
        name: l.productName.substring(0, 40) + (l.productName.length > 40 ? '...' : ''),
        size: l.size,
        price: `$${l.currentPrice}`,
        listingId: l.listingId.substring(0, 8) + '...'
      }))
    );
    
    // Function to find true duplicates based on all relevant factors
    function findTrueDuplicates(listings: any[]) {
      const groups: { [key: string]: any[] } = {};
      
      listings.forEach(listing => {
        // Create unique key including ALL relevant factors
        const key = [
          listing.productId || 'no-product-id',
          listing.variantId || 'no-variant-id',
          listing.listingId || 'no-listing-id',
          listing.status || 'no-status',
          listing.condition || 'no-condition',
          listing.currentPrice || 'no-price'
        ].join('|');
        
        if (!groups[key]) groups[key] = [];
        groups[key].push(listing);
      });
      
      // Return groups with multiple entries as potential duplicates
      return Object.entries(groups).filter(([_, group]) => group.length > 1);
    }
    
    // Analyze what the "duplicates" actually are
    const productSizeGroups = new Map();
    activeListings.forEach((listing: any) => {
      const key = `${listing.productName}-${listing.size}`;
      if (!productSizeGroups.has(key)) {
        productSizeGroups.set(key, []);
      }
      productSizeGroups.get(key).push(listing);
    });
    
    const potentialDuplicates = Array.from(productSizeGroups.entries())
      .filter(([_, listings]) => listings.length > 1);
    
    if (potentialDuplicates.length > 0) {
      console.log('🔍 Investigating potential duplicates...');
      console.log(`Found ${potentialDuplicates.length} product-size combinations with multiple listings`);
      
      // Log detailed information about each group
      potentialDuplicates.forEach(([productSize, listings]) => {
        console.log(`\n📦 ${productSize} (${listings.length} listings):`);
        listings.forEach((listing: any, index: number) => {
          console.log(`  ${index + 1}. Listing ID: ${listing.listingId}`);
          console.log(`     - Price: $${listing.currentPrice}`);
          console.log(`     - Product ID: ${listing.productId}`);
          console.log(`     - Variant ID: ${listing.variantId}`);
          console.log(`     - Status: ${listing.status}`);
          console.log(`     - Condition: ${listing.condition}`);
          console.log(`     - Created: ${listing.createdAt}`);
        });
      });
      
      const totalPotentialDuplicates = potentialDuplicates.reduce((sum, [_, listings]) => sum + (listings.length - 1), 0);
      console.log(`\n📊 Total potential duplicates: ${totalPotentialDuplicates}`);
    }
    
    // Find TRUE duplicates using all factors
    const trueDuplicateGroups = findTrueDuplicates(activeListings);
    let deduplicatedListings = activeListings;
    let duplicateListingIds: string[] = [];
    
    if (trueDuplicateGroups.length > 0) {
      console.log('\n⚠️  Found TRUE duplicates (exact same listing data):');
      trueDuplicateGroups.forEach(([key, duplicates]) => {
        console.log(`  - ${duplicates[0].productName} Size ${duplicates[0].size}: ${duplicates.length} identical listings`);
        console.log(`    IDs: ${duplicates.map((d: any) => d.listingId).join(', ')}`);
      });
      
      // Remove true duplicates only
      const seenListingIds = new Set();
      deduplicatedListings = activeListings.filter((listing: any) => {
        if (seenListingIds.has(listing.listingId)) {
          duplicateListingIds.push(listing.listingId);
          return false;
        }
        seenListingIds.add(listing.listingId);
        return true;
      });
      
      console.log(`\n✅ Removed ${duplicateListingIds.length} true duplicate listings`);
    } else {
      console.log('\n✅ No true duplicates found - all listings appear to be legitimate variations');
    }

    // Add debug information to response
    const debugInfo = {
      apiResponse: {
        totalFromAPI: rawListings.length,
        paginationCount: data.count,
        statusBreakdown: statusCounts,
        listingsWithOrders,
        expiredListings: expiredListings.length
      },
      filtering: {
        afterStatusFilter: transformedListings.length,
        afterStrictFilter: activeListings.length,
        removedByStrictFilter: transformedListings.length - activeListings.length,
        afterDuplicateRemoval: deduplicatedListings.length,
        trueDuplicatesRemoved: duplicateListingIds.length
      },
      discrepancy: {
        expected: 51, // Your actual count
        showing: deduplicatedListings.length,
        difference: deduplicatedListings.length - 51,
        possibleReasons: []
      }
    };

    // Analyze discrepancy
    if (deduplicatedListings.length !== 51) {
      // Count how many were filtered for each reason
      const filterReasons: { [key: string]: number } = {};
      filteredListingsAnalysis.forEach(filtered => {
        filterReasons[filtered.reason] = (filterReasons[filtered.reason] || 0) + 1;
      });
      
      debugInfo.discrepancy.filterReasons = filterReasons;
      
      if (listingsWithOrders > 0) {
        debugInfo.discrepancy.possibleReasons.push(`${listingsWithOrders} listings have orders (MATCHED)`);
      }
      if (expiredListings.length > 0) {
        debugInfo.discrepancy.possibleReasons.push(`${expiredListings.length} listings have expired asks`);
      }
      
      // If we're showing MORE than expected, some expired listings might be slipping through
      if (deduplicatedListings.length > 51) {
        const difference = deduplicatedListings.length - 51;
        debugInfo.discrepancy.possibleReasons.push(`${difference} listings may have slipped through filtering`);
        
        // Sample some of the active listings to check for issues
        const suspiciousListings = deduplicatedListings.slice(0, 10).map((l: any) => ({
          productName: l.productName,
          size: l.size,
          status: l.status,
          hasExpiration: !!rawListings.find((r: any) => r.id === l.listingId)?.ask?.askExpiresAt
        }));
        debugInfo.discrepancy.sampleActiveListings = suspiciousListings;
      }
      
      // Check inventory types
      const inventoryTypes: { [key: string]: number } = {};
      rawListings.forEach((listing: any) => {
        const type = listing.inventoryType || 'STANDARD';
        inventoryTypes[type] = (inventoryTypes[type] || 0) + 1;
      });
      debugInfo.discrepancy.inventoryTypes = inventoryTypes;
      
      // Add first 5 filtered listings to debug info
      debugInfo.discrepancy.filteredListings = filteredListingsAnalysis.slice(0, 5);
    }

    const successResponse = NextResponse.json({
      success: true,
      listings: deduplicatedListings,
      totalCount: deduplicatedListings.length,
      rawCount: activeListings.length,
      trueDuplicatesRemoved: duplicateListingIds.length,
      duplicateListingIds: duplicateListingIds,
      investigation: {
        productSizeGroupsWithMultiples: potentialDuplicates.length,
        totalPotentialDuplicates: potentialDuplicates.reduce((sum, [_, listings]) => sum + (listings.length - 1), 0),
        trueDuplicateGroups: trueDuplicateGroups.length,
        message: trueDuplicateGroups.length > 0 
          ? `Removed ${duplicateListingIds.length} true duplicates` 
          : 'No true duplicates found - all listings appear to be legitimate variations'
      },
      actualCount: deduplicatedListings.length - testListings.filter((t: any) => 
        !duplicateListingIds.includes(t.listingId)
      ).length, // Count without test listings (excluding removed duplicates)
      testListingCount: testListings.length,
      debugInfo, // Include debug info for client
      timestamp: new Date().toISOString()
    });

    // If we refreshed the token, set the new cookies
    if (accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken!);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching listings:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch listings', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, listingIds, newPrice } = await request.json();
    
    // Get access token from cookies
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No access token found. Please authenticate first.' 
      }, { status: 401 });
    }

    console.log(`🛍️ Executing ${action} on listings:`, listingIds);

    if (action === 'update_price') {
      // Update listing prices
      const results = [];
      
      for (const listingId of listingIds) {
        try {
          const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              amount: newPrice.toString()
            })
          });

          if (response.ok) {
            const updatedListing = await response.json();
            results.push({
              listingId,
              success: true,
              newPrice,
              listing: updatedListing
            });
          } else {
            results.push({
              listingId,
              success: false,
              error: `Failed to update: ${response.status}`
            });
          }
          
          // Rate limiting - wait between requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          results.push({
            listingId,
            success: false,
            error: error.message
          });
        }
      }

      return NextResponse.json({
        success: true,
        action,
        results,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'delete') {
      // Delete listings
      const results = [];
      
      for (const listingId of listingIds) {
        try {
          const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
            }
          });

          results.push({
            listingId,
            success: response.ok,
            status: response.status
          });
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          results.push({
            listingId,
            success: false,
            error: error.message
          });
        }
      }

      return NextResponse.json({
        success: true,
        action,
        results,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action. Supported actions: update_price, delete' 
    }, { status: 400 });

  } catch (error) {
    console.error('❌ Error updating listings:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update listings', 
      details: error.message 
    }, { status: 500 });
  }
} 