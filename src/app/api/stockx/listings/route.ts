import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

// Best-effort in-memory cache to reduce repeated upstream calls (works per serverless instance).
// This endpoint is frequently polled by the dashboard; StockX can 429 if we call too often.
const LISTINGS_CACHE_TTL_MS = 60 * 1000; // 60s
const listingsCache = new Map<
  string,
  { ts: number; payload: any; status: number; tokenRefreshed: boolean; newAccessToken?: string; newRefreshToken?: string }
>();

function parseStockXMoneyToDollars(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // StockX is inconsistent across endpoints. Some return dollars (e.g. "113"),
  // others return cents (e.g. "11300"). Use a heuristic.
  return n >= 1000 ? n / 100 : n;
}

function looksLikeHtml(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || t.startsWith('<head') || t.startsWith('<body') || t.startsWith('<');
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterListingId = searchParams.get('listingId')?.trim() || null;
    const includeMarket = searchParams.get('includeMarket') === '1' || searchParams.get('includeMarket') === 'true';
    const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    // Get access token from cookies
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
    const siteUserId = cookieStore.get('site-user-id')?.value || null;

    if (!accessToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'No access token found. Please authenticate first.' 
      }, { status: 401 });
    }

    // Cache key should never mix users. Prefer site-user-id when available; otherwise fall back to token prefix.
    const cacheKey = `${siteUserId || accessToken.slice(0, 16)}|listingId=${filterListingId || ''}|includeMarket=${includeMarket ? '1' : '0'}`;
    const cached = listingsCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.ts < LISTINGS_CACHE_TTL_MS) {
      const res = NextResponse.json(cached.payload, { status: cached.status });
      // If we refreshed the token during the cached fetch, preserve that on cached responses too.
      if (cached.tokenRefreshed && cached.newAccessToken) {
        setStockXTokenCookies(res, cached.newAccessToken, cached.newRefreshToken);
      }
      return res;
    }

    console.log('🛍️ Fetching StockX listings...');
    console.log('🔑 API Key:', process.env.STOCKX_API_KEY ? 'Present' : 'Missing');
    console.log('🔐 Client ID:', process.env.STOCKX_CLIENT_ID ? 'Present' : 'Missing');
    console.log('🎫 Access token:', accessToken ? 'Present' : 'Missing');

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const fetchWithBackoff = async (url: string, init: RequestInit, maxAttempts = 5) => {
      let attempt = 0;
      while (attempt < maxAttempts) {
        const res = await fetch(url, init);
        if (res.status !== 429) return res;

        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
        const backoffMs = Number.isFinite(retryAfterSeconds)
          ? Math.min(30_000, Math.max(500, retryAfterSeconds * 1000))
          : Math.min(30_000, 500 * Math.pow(2, attempt));

        // Drain body so the connection can be reused
        await res.text().catch(() => '');
        await sleep(backoffMs);
        attempt += 1;
      }
      return await fetch(url, init);
    };

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
      console.log('🔐 Using API Key:', apiKey ? 'Present' : 'EMPTY');
      
      const response = await fetchWithBackoff(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ResellDashboard/1.0'
        }
      }, 5);
      
      console.log('📊 Response status:', response.status);
      
      return response;
    };

    // Fetch first page
    let response = await fetchPage(1, accessToken);

    // Handle token refresh if needed
    let tokenRefreshed = false;
    let newAccessToken = accessToken;
    let newRefreshToken = refreshToken;
    
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Store the new tokens
        newAccessToken = refreshResult.accessToken;
        newRefreshToken = refreshResult.refreshToken || refreshToken;
        tokenRefreshed = true;
        
        // Retry with new token
        response = await fetchPage(1, newAccessToken);
      } else {
        return NextResponse.json({ 
          success: false, 
          error: 'Authentication expired. Please re-authenticate.' 
        }, { status: 401 });
      }
    }

    // If we are still rate-limited after backoff, surface it as a real 429 to the UI.
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
      const bodyText = await response.text().catch(() => '');
      const payload = {
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limited by StockX (429). Please wait and retry.',
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        upstream: {
          status: response.status,
          statusText: response.statusText,
          snippet: bodyText.slice(0, 1000),
        },
      };
      const rateRes = NextResponse.json(payload, { status: 429 });
      if (Number.isFinite(retryAfterSeconds)) {
        rateRes.headers.set('Retry-After', String(retryAfterSeconds));
      }
      if (tokenRefreshed) {
        setStockXTokenCookies(rateRes, newAccessToken, newRefreshToken);
      }
      // Cache the 429 briefly too, to avoid hammering when multiple tabs refresh simultaneously.
      listingsCache.set(cacheKey, { ts: Date.now(), payload, status: 429, tokenRefreshed, newAccessToken, newRefreshToken });
      return rateRes;
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

    const firstPageText = await response.text();
    if (looksLikeHtml(firstPageText)) {
      // StockX sometimes returns an HTML challenge page (CAPTCHA / auth wall) instead of JSON.
      // Never bubble raw HTML back to the client; return a JSON error the UI can handle.
      const payload = 
        {
          success: false,
          error: 'StockX returned an HTML challenge page (not JSON). Please re-authenticate.',
          upstream: {
            kind: 'html',
            status: response.status,
            statusText: response.statusText,
            snippet: firstPageText.slice(0, 3000)
          }
        };
      const htmlRes = NextResponse.json(payload, { status: 502 });
      if (tokenRefreshed) {
        setStockXTokenCookies(htmlRes, newAccessToken, newRefreshToken);
      }
      listingsCache.set(cacheKey, { ts: Date.now(), payload, status: 502, tokenRefreshed, newAccessToken, newRefreshToken });
      return htmlRes;
    }

    const data = safeJsonParse(firstPageText);
    if (!data) {
      const payload = 
        {
          success: false,
          error: 'StockX returned an unexpected response (not valid JSON).',
          upstream: {
            kind: 'unknown',
            status: response.status,
            statusText: response.statusText,
            snippet: firstPageText.slice(0, 3000)
          }
        };
      const badJsonRes = NextResponse.json(payload, { status: 502 });
      if (tokenRefreshed) {
        setStockXTokenCookies(badJsonRes, newAccessToken, newRefreshToken);
      }
      listingsCache.set(cacheKey, { ts: Date.now(), payload, status: 502, tokenRefreshed, newAccessToken, newRefreshToken });
      return badJsonRes;
    }
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
    
    // Check for expired asks using expiration dates
    const now = new Date();
    
    // Check expiration dates (the only reliable method)
    const expiredListings = rawListings.filter((l: any) => {
      if (l.ask?.askExpiresAt) {
        const expirationDate = new Date(l.ask.askExpiresAt);
        return expirationDate <= now;
      }
      return false;
    });
    console.log(`📅 Listings with expired dates: ${expiredListings.length}`);
    
    // Create a set of expired listing IDs - use both id and listingId for comprehensive matching
    const expiredListingIds = new Set();
    expiredListings.forEach((l: any) => {
      if (l.id) expiredListingIds.add(l.id);
      if (l.listingId) expiredListingIds.add(l.listingId);
    });
    
    console.log(`⏰ Listings with expired asks: ${expiredListings.length}`);
    console.log(`🆔 Expired listing IDs collected: ${expiredListingIds.size}`);
    
    // Debug: Show first few expired listings
    if (expiredListings.length > 0) {
      console.log('🔍 First 3 expired listings:');
      expiredListings.slice(0, 3).forEach((l: any, i: number) => {
        console.log(`  ${i + 1}. ${l.productName || l.product?.productName || 'Unknown'}`);
        console.log(`     id: ${l.id}, listingId: ${l.listingId}`);
        console.log(`     expires: ${l.ask?.askExpiresAt}`);
      });
    }
    
    console.log(`🎯 Expected active listings after filtering expired: ${rawListings.length - expiredListings.length}`);

    // Function to fetch market data for a product/variant
    const fetchMarketData = async (productId: string, variantId: string, token: string) => {
      try {
        const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`;
        const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
        
        const response = await fetch(marketUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });
        
        if (response.ok) {
          const text = await response.text();
          if (looksLikeHtml(text)) {
            return { lowestAsk: null, flexLowestAsk: null, highestBid: null, lastSale: null };
          }
          const data = safeJsonParse(text);
          if (!data) {
            return { lowestAsk: null, flexLowestAsk: null, highestBid: null, lastSale: null };
          }
          // The market data endpoint often returns { variants: [...] }
          const variants = data?.variants || data;
          const variantData = Array.isArray(variants)
            ? variants.find((item: any) => item.variantId === variantId)
            : variants;
          
          if (variantData) {
            const standardAsk = parseStockXMoneyToDollars(variantData.lowestAskAmount);
            const flexAsk = parseStockXMoneyToDollars(variantData.flexLowestAskAmount);
            return {
              lowestAsk: standardAsk, // standard lowest ask
              flexLowestAsk: flexAsk, // flex lowest ask
              highestBid: parseStockXMoneyToDollars(variantData.highestBidAmount),
              lastSale: parseStockXMoneyToDollars(variantData.lastSaleAmount)
            };
          }
        }
      } catch (error) {
        console.error(`Error fetching market data for ${productId}/${variantId}:`, error);
      }
      return { lowestAsk: null, flexLowestAsk: null, highestBid: null, lastSale: null };
    };

    // Transform the data to match our component's expectations
    const transformedListings = await Promise.all(rawListings.map(async (listing: any, index: number) => {
      // Log the structure of the first listing to understand the format
      if (index === 0) {
        console.log('Sample listing structure:', {
          keys: Object.keys(listing),
          hasAsk: !!listing.ask,
          askKeys: listing.ask ? Object.keys(listing.ask) : [],
          askExpiresAt: listing.ask?.askExpiresAt,
          id: listing.id,
          listingId: listing.listingId,
          listing: listing
        });
      }
      
      const productId = listing.productId || listing.product?.productId || listing.product?.id || '';
      const variantId = listing.variantId || listing.variant?.variantId || listing.variant?.id || '';
      
      // Don't fetch market data during initial load unless explicitly requested for a single listing
      let marketData = { lowestAsk: null, highestBid: null, lastSale: null };
      if (includeMarket && filterListingId) {
        const id = listing.listingId || listing.id || `listing-${index}`;
        if (id === filterListingId && productId && variantId) {
          marketData = await fetchMarketData(productId, variantId, newAccessToken);
        }
      }
      
      return {
        listingId: listing.listingId || listing.id || `listing-${index}`,
        productId: productId,
        variantId: variantId,
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
        // Keep standard + flex separate; also include bestAsk for convenience
        lowestAsk: (marketData as any).lowestAsk ?? parseFloat(listing.product?.lowestAsk || listing.lowestAsk || '0'),
        flexLowestAsk: (marketData as any).flexLowestAsk ?? null,
        highestBid: marketData.highestBid || parseFloat(listing.product?.highestBid || listing.highestBid || '0'),
        lastSale: marketData.lastSale || parseFloat(listing.product?.lastSale || listing.lastSale || '0'),
        category: listing.product?.category || listing.category || '',
        inventoryType: listing.inventoryType || '',
        // UUID fields
        productUuid: listing.productUuid || listing.product?.uuid,
        variantUuid: listing.variantUuid || listing.variant?.uuid,
        listingUuid: listing.uuid || listing.listingUuid
      };
    }));
    
    // Strict filtering for truly active listings that can be repriced
    let filteredListingsAnalysis: any[] = [];
    const activeListings = transformedListings.filter((listing: any, index: number) => {
      const status = listing.status?.toUpperCase();
      
      // Find the corresponding raw listing by ID
      const rawListing = rawListings.find((r: any) => {
        const rawId = r.id || r.listingId;
        return rawId === listing.listingId || 
               rawId === listing.listingUuid;
      });
      
      // Criteria for a truly active listing:
      // 1. Status must be ACTIVE
      // 2. No associated order (not MATCHED)
      // 3. Has an active ask
      // 4. reason !== 'Ask expired' (StockX provides this directly!)
      const hasActiveStatus = status === 'ACTIVE';
      const hasNoOrder = !rawListing?.order;
      const hasAsk = !!rawListing?.ask;
      
      // Check expiration date
      let notExpired = true;
      if (rawListing?.ask?.askExpiresAt) {
        const expirationDate = new Date(rawListing.ask.askExpiresAt);
        const now = new Date();
        notExpired = expirationDate > now;
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
        // Check all possible ID variations
        const possibleIds = [
          listing.listingId,
          listing.listingUuid,
          listing.productId + '-' + listing.variantId,
          rawListing?.id,
          rawListing?.listingId
        ].filter(Boolean);
        
        // Check if this listing was marked as expired but still made it through
        const isExpired = possibleIds.some(id => expiredListingIds.has(id));
        if (isExpired) {
          console.log(`🚨 EXPIRED LISTING SLIPPED THROUGH: ${listing.productName} - Size ${listing.size}`);
          console.log(`   IDs checked: ${possibleIds.join(', ')}`);
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
    
    // Final safety check - remove any expired listings that might have slipped through
    console.log(`\n🔍 Final cleanup check on ${deduplicatedListings.length} listings...`);
    const finalListings = deduplicatedListings.filter((listing: any, index: number) => {
      let rawListing = rawListings.find((r: any) => {
        const rawId = r.id || r.listingId;
        return rawId === listing.listingId || 
               rawId === listing.listingUuid;
      });
      
      if (!rawListing) {
        // Try harder to find the raw listing - check if this listing's ID matches any raw listing
        rawListing = rawListings.find((r: any) => {
          // The transformed listingId might be the raw listing's id OR listingId
          return listing.listingId === r.id || 
                 listing.listingId === r.listingId ||
                 listing.listingUuid === r.id ||
                 listing.listingUuid === r.listingId ||
                 listing.listingUuid === r.uuid;
        });
        
        if (!rawListing) {
          console.log(`⚠️ Could not find raw listing for ${listing.productName} (ID: ${listing.listingId}) - REMOVING as potentially expired`);
          return false; // Remove it if we can't find the raw data - likely expired
        }
      }
      
      // Log first few listings to debug
      if (index < 5) {
        console.log(`Checking ${listing.productName}:`, {
          hasAsk: !!rawListing.ask,
          askExpiresAt: rawListing.ask?.askExpiresAt,
          isExpired: rawListing.ask?.askExpiresAt ? new Date(rawListing.ask.askExpiresAt) <= now : 'N/A'
        });
      }
      
      // Check expiration date
      if (rawListing.ask?.askExpiresAt) {
        const expirationDate = new Date(rawListing.ask.askExpiresAt);
        if (expirationDate <= now) {
          console.log(`🧹 Final cleanup: Removing expired listing ${listing.productName} - Size ${listing.size}`);
          console.log(`   Expired at: ${expirationDate.toISOString()}, Current time: ${now.toISOString()}`);
          return false;
        }
      }
      
      return true;
    });
    
    if (finalListings.length !== deduplicatedListings.length) {
      console.log(`\n🧹 Final cleanup removed ${deduplicatedListings.length - finalListings.length} expired listings`);
      console.log(`Final count: ${finalListings.length} listings`);
      deduplicatedListings = finalListings;
    } else {
      console.log(`\n✅ No expired listings found in final cleanup`);
      console.log(`Final count: ${deduplicatedListings.length} listings`);
    }
    
    // If we still have more than 51, log which ones they are
    if (deduplicatedListings.length > 51) {
      console.log(`\n🚨 Still have ${deduplicatedListings.length - 51} extra listings!`);
      console.log('Listing all products to identify extras:');
      deduplicatedListings.forEach((listing: any, index: number) => {
        const rawListing = rawListings.find((r: any) => 
          listing.listingId === r.id || listing.listingId === r.listingId
        );
        console.log(`${index + 1}. ${listing.productName} - Size ${listing.size}`);
        if (rawListing?.ask?.askExpiresAt) {
          const expDate = new Date(rawListing.ask.askExpiresAt);
          const isExpired = expDate <= now;
          if (isExpired) {
            console.log(`   🚨 EXPIRED: ${expDate.toISOString()}`);
          }
        }
      });
    }
    
    // CRITICAL: Log what we're about to return
    console.log(`\n📤 ABOUT TO RETURN ${deduplicatedListings.length} LISTINGS`);
    if (deduplicatedListings.length !== 51) {
      console.log(`⚠️ WARNING: Expected 51 but returning ${deduplicatedListings.length}`);
    }
    
    // Debug: Check a few listings to see if they're expired
    const debugSample = deduplicatedListings.slice(0, 10).map((listing: any) => {
      const rawListing = rawListings.find((r: any) => {
        const rawId = r.id || r.listingId;
        return rawId === listing.listingId || 
               rawId === listing.listingUuid;
      });
      return {
        productName: listing.productName,
        size: listing.size,
        listingId: listing.listingId,
        hasRawListing: !!rawListing,
        askExpiresAt: rawListing?.ask?.askExpiresAt,
        isExpired: rawListing?.ask?.askExpiresAt ? 
          new Date(rawListing.ask.askExpiresAt) <= now : null
      };
    });

    // Capture filtering details for client
    const filteringDetails = {
      mathCheck: {
        totalFromAPI: rawListings.length,
        expiredListings: expiredListings.length,
        listingsWithOrders: listingsWithOrders.length,
        calculated: rawListings.length - expiredListings.length - listingsWithOrders.length,
        actual: activeListings.length
      },
      suspiciousListings: [] as any[]
    };

    // If discrepancy, find suspicious listings
    if (deduplicatedListings.length !== 51) {
      console.log(`\n🔍 Checking ${deduplicatedListings.length} deduplicated listings for expired items...`);
      
      deduplicatedListings.forEach((listing: any) => {
        const rawListing = rawListings.find((r: any) => 
          (r.id || r.listingId) === (listing.listingId || listing.listingUuid)
        );
        
        if (rawListing?.ask?.askExpiresAt) {
          const expirationDate = new Date(rawListing.ask.askExpiresAt);
          const now = new Date();
          if (expirationDate <= now) {
            console.log(`🚨 FOUND EXPIRED IN FINAL LIST: ${listing.productName} - Size ${listing.size}`);
            filteringDetails.suspiciousListings.push({
              productName: listing.productName,
              size: listing.size,
              listingId: listing.listingId,
              expiredAt: expirationDate.toISOString(),
              currentTime: now.toISOString()
            });
          }
        }
      });
      
      if (filteringDetails.suspiciousListings.length > 0) {
        console.log(`\n⚠️  Found ${filteringDetails.suspiciousListings.length} expired listings in final output!`);
      }
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
        trueDuplicatesRemoved: duplicateListingIds.length,
        mathCheck: filteringDetails.mathCheck,
        suspiciousListings: filteringDetails.suspiciousListings
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

    const filtered = filterListingId
      ? deduplicatedListings.filter((l: any) => l.listingId === filterListingId)
      : deduplicatedListings;

    const successResponse = NextResponse.json({
      success: true,
      listings: filtered,
      totalCount: filtered.length,
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
      actualCount: filtered.length,
      testListingCount: filterListingId ? 0 : testListings.length,
      debugInfo: filterListingId ? undefined : debugInfo, // avoid huge logs when requesting a single listing
      timestamp: new Date().toISOString()
    });

    // If we refreshed the token, set the new cookies
    if (tokenRefreshed) {
      setStockXTokenCookies(successResponse, newAccessToken, newRefreshToken);
    }

    // Cache successful response for a short time.
    try {
      const payload = {
        success: true,
        listings: filtered,
        totalCount: filtered.length,
        rawCount: activeListings.length,
        trueDuplicatesRemoved: duplicateListingIds.length,
        duplicateListingIds: duplicateListingIds,
        investigation: {
          productSizeGroupsWithMultiples: potentialDuplicates.length,
          totalPotentialDuplicates: potentialDuplicates.reduce((sum, [_, listings]) => sum + (listings.length - 1), 0),
          trueDuplicateGroups: trueDuplicateGroups.length,
          message: trueDuplicateGroups.length > 0
            ? `Removed ${duplicateListingIds.length} true duplicates`
            : 'No true duplicates found - all listings appear to be legitimate variations',
        },
        actualCount: filtered.length,
        testListingCount: filterListingId ? 0 : testListings.length,
        debugInfo: filterListingId ? undefined : debugInfo,
        timestamp: new Date().toISOString(),
      };
      listingsCache.set(cacheKey, {
        ts: Date.now(),
        payload,
        status: 200,
        tokenRefreshed,
        newAccessToken,
        newRefreshToken,
      });
    } catch {
      // ignore cache failures
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching listings:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    const message = error instanceof Error ? error.message : 'Unknown error';
    const is429 = /(^|\b)(429|too many requests)(\b|$)/i.test(message);
    return NextResponse.json(
      { 
        success: false, 
        error: is429 ? 'Too Many Requests' : 'Failed to fetch listings', 
        message,
        details: error instanceof Error ? error.stack : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: is429 ? 429 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, listingIds, newPrice, updates } = await request.json();
    
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
      
      // Use updates array if provided, otherwise fall back to single price
      const priceUpdates = updates || listingIds.map(id => ({ listingId: id, newPrice }));
      
      for (const update of priceUpdates) {
        try {
          // Find the specific price for this listing
          const listingPrice = update.newPrice || newPrice;
          
          const response = await fetch(`https://api.stockx.com/v2/selling/listings/${update.listingId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              amount: listingPrice.toString()
            })
          });

          if (response.ok) {
            const updatedListing = await response.json();
            results.push({
              listingId: update.listingId,
              success: true,
              oldPrice: update.currentPrice,
              newPrice: listingPrice,
              marketPrice: update.marketPrice,
              listing: updatedListing
            });
          } else {
            const errorText = await response.text();
            results.push({
              listingId: update.listingId,
              success: false,
              error: `Failed to update: ${response.status} - ${errorText}`
            });
          }
          
          // Rate limiting - wait between requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          results.push({
            listingId: update.listingId,
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