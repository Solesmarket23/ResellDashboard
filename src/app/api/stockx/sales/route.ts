import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getDocuments, addDocument, updateDocument } from '@/lib/firebase/firebaseUtils';
import { auth } from '@/lib/firebase/firebase-admin';
import { StockXSale } from '@/lib/types/stockx';

export async function POST(request: NextRequest) {
  // POST endpoint for complete import without SSE (for Vercel compatibility)
  const { 
    status = 'completed', 
    fromDate, 
    toDate, 
    userId,
    maxSales = 50, // Limit for Vercel timeout constraints
    skipPayoutEnrichment = false // Option to skip payout enrichment for faster imports
  } = await request.json();

  console.log('🚀 StockX Complete Sales Import (POST):', { status, fromDate, toDate, maxSales });

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { 
        error: 'Missing authentication', 
        message: 'Please authenticate with StockX first'
      },
      { status: 401 }
    );
  }

  // Track timing to avoid Vercel timeout
  const startTime = Date.now();
  const TIMEOUT_BUFFER = 8000; // 8s max execution time (leaving 2s buffer for Vercel Hobby)
  const VERCEL_TIER = process.env.VERCEL_TIER || 'hobby'; // 'hobby' = 10s, 'pro' = 15s
  const MAX_EXECUTION_TIME = VERCEL_TIER === 'pro' ? 13000 : TIMEOUT_BUFFER;

  try {
    let currentAccessToken = accessToken;
    let allSales: StockXSale[] = [];
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    // Phase 1: Fetch sales using pagination with timeout awareness
    let hasNextPage = true;
    let pageNumber = 1;
    const pageSize = Math.min(100, maxSales); // Respect both API limit and user limit
    
    while (hasNextPage && allSales.length < maxSales) {
      // Check if we're approaching timeout
      if (Date.now() - startTime > MAX_EXECUTION_TIME - 2000) {
        console.warn('⏱️ Approaching Vercel timeout, stopping import early');
        break;
      }

      const queryParams = new URLSearchParams({
        pageNumber: pageNumber.toString(),
        pageSize: pageSize.toString()
      });
      
      if (status === 'completed') {
        queryParams.set('orderStatus', 'COMPLETED');
      }
      
      const apiUrl = status === 'completed' 
        ? `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`
        : `https://api.stockx.com/v2/selling/orders/active?${queryParams.toString()}`;
        
      console.log(`📄 Fetching page ${pageNumber}: ${apiUrl}`);
      
      try {
        const response = await fetchWithRetry(apiUrl, {
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${currentAccessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        }, retryCount);
        
        if (response.status === 401 && refreshToken) {
          // Token expired, refresh and retry
          const refreshResult = await refreshStockXTokens(refreshToken);
          if (refreshResult.success && refreshResult.accessToken) {
            currentAccessToken = refreshResult.accessToken;
            continue; // Retry this page with new token
          }
        }
        
        if (response.ok) {
          const data = await response.json();
          const pageSales = processSalesData(data);
          allSales.push(...pageSales);
          hasNextPage = data.hasNextPage || false;
          pageNumber++;
          retryCount = 0; // Reset retry count on success
          
          // Limit check
          if (allSales.length >= maxSales) {
            allSales = allSales.slice(0, maxSales);
            break;
          }
          
          // Small delay between pages
          if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else if (response.status === 429) {
          // Rate limited - implement exponential backoff
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
            console.log(`⏳ Rate limited, waiting ${backoffTime}ms before retry ${retryCount}/${MAX_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue; // Retry the same page
          } else {
            console.error('Max retries exceeded for rate limiting');
            hasNextPage = false;
          }
        } else {
          console.error(`Failed to fetch page ${pageNumber}: ${response.status}`);
          hasNextPage = false;
        }
      } catch (error) {
        console.error(`Error fetching page ${pageNumber}:`, error);
        hasNextPage = false;
      }
    }
    
    // Filter by date if provided
    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : new Date('1970-01-01');
      const to = toDate ? new Date(toDate) : new Date();
      allSales = allSales.filter(sale => {
        const saleDate = new Date(sale.createdAt);
        return saleDate >= from && saleDate <= to;
      });
    }
    
    // Phase 2: Optionally fetch complete payout data
    let enhancedSales = allSales;
    let salesWithPayouts = 0;
    
    if (!skipPayoutEnrichment && allSales.length > 0) {
      // Check remaining time
      const remainingTime = MAX_EXECUTION_TIME - (Date.now() - startTime);
      const estimatedTimePerSale = 300; // 300ms per sale
      const maxEnrichableSales = Math.floor(remainingTime / estimatedTimePerSale);
      
      if (maxEnrichableSales > 0) {
        const salesToEnrich = allSales.slice(0, Math.min(maxEnrichableSales, allSales.length));
        console.log(`💰 Enriching ${salesToEnrich.length} of ${allSales.length} sales with payout data`);
        
        enhancedSales = await fetchCompletePayoutDataWithTimeout(
          salesToEnrich,
          currentAccessToken,
          refreshToken || '',
          apiKey,
          remainingTime - 1000 // Leave 1s buffer
        );
        
        // Merge enriched with non-enriched
        if (salesToEnrich.length < allSales.length) {
          enhancedSales = [...enhancedSales, ...allSales.slice(salesToEnrich.length)];
        }
      } else {
        console.warn('⏱️ Insufficient time for payout enrichment');
      }
    }
    
    salesWithPayouts = enhancedSales.filter(s => s.pricing.totalPayout > 0).length;
    
    return NextResponse.json({
      success: true,
      data: enhancedSales,
      totalCount: enhancedSales.length,
      salesWithPayouts,
      hasMore: hasNextPage || allSales.length >= maxSales,
      message: `Successfully imported ${enhancedSales.length} sales with ${salesWithPayouts} having payout data`,
      executionTime: Date.now() - startTime
    });
    
  } catch (error: any) {
    console.error('Error in complete import:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to import sales',
        details: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}

// Helper function for fetch with retry logic
async function fetchWithRetry(url: string, options: RequestInit, retryCount: number = 0): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retryCount < 3) {
      const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return fetchWithRetry(url, options, retryCount + 1);
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get('limit') || '50';
  const offset = searchParams.get('offset') || '0';
  const status = searchParams.get('status') || ''; // 'completed', 'pending', 'cancelled'

  console.log('📊 StockX Sales API Request:', { limit, offset, status });

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  console.log('🔑 Auth check:', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    hasApiKey: !!apiKey,
    apiKeySource: process.env.STOCKX_API_KEY ? 'STOCKX_API_KEY' : 'STOCKX_CLIENT_ID',
    accessTokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'none',
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : 'none'
  });

  if (!accessToken) {
    return NextResponse.json(
      { 
        error: 'No access token found', 
        message: 'Please authenticate with StockX first',
        authRequired: true
      },
      { status: 401 }
    );
  }

  if (!apiKey) {
    console.error('❌ Missing API key - check STOCKX_API_KEY or STOCKX_CLIENT_ID env vars');
    console.log('Environment check:', {
      STOCKX_API_KEY: process.env.STOCKX_API_KEY ? 'Set' : 'Not set',
      STOCKX_CLIENT_ID: process.env.STOCKX_CLIENT_ID ? 'Set' : 'Not set',
      // Check all env vars that start with STOCKX
      allStockXVars: Object.keys(process.env).filter(key => key.includes('STOCKX'))
    });
    return NextResponse.json(
      { error: 'Missing StockX API key configuration' },
      { status: 500 }
    );
  }

  try {
    // Build API URL for seller orders/sales
    const pageNumber = Math.floor(parseInt(offset) / parseInt(limit)) + 1;
    const pageSize = Math.min(parseInt(limit), 100); // Use maximum allowed per docs
    
    // Use the same parameter names as the working listings endpoint
    const queryParams = new URLSearchParams({
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString()
    });
    
    // Note: StockX API doesn't support date filtering on the orders/history endpoint
    // We'll need to fetch all and filter after
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    // StockX API endpoint - use the documented endpoints
    let apiUrl: string;
    if (status === 'completed') {
      // Use history endpoint with COMPLETED status
      queryParams.set('orderStatus', 'COMPLETED');
      apiUrl = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
    } else if (status === 'pending' || status === 'active') {
      apiUrl = `https://api.stockx.com/v2/selling/orders/active?${queryParams.toString()}`;
    } else {
      // Default to history endpoint to get all orders
      apiUrl = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
    }
    console.log(`🛒 Fetching StockX seller orders: ${apiUrl}`);

    // Make API call to StockX with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (response.status === 401 && refreshToken) {
      // Access token expired, try to refresh
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry the request with new token using the same URL
        const retryResponse = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });

        if (retryResponse.ok) {
          const retryResponseText = await retryResponse.text();
          let salesData;
          
          try {
            salesData = JSON.parse(retryResponseText);
          } catch (parseError) {
            console.error('Failed to parse retry response as JSON:', retryResponseText);
            return NextResponse.json(
              { 
                success: false,
                error: 'Invalid response format from StockX', 
                details: retryResponseText.substring(0, 500)
              },
              { status: 500 }
            );
          }
          
          // Process the sales data - the paginated endpoints should already include payout data
          const processedSales = processSalesData(salesData);
          
          console.log(`✅ Processed ${processedSales.length} sales from paginated endpoint`);
          
          // Create response
          const successResponse = NextResponse.json({
            success: true,
            data: processedSales,
            totalCount: salesData.count || salesData.totalCount || processedSales.length,
            pageNumber: salesData.pageNumber || pageNumber,
            pageSize: salesData.pageSize || pageSize,
            hasNextPage: salesData.hasNextPage || false,
            tokenRefreshed: true,
            appliedFilters: {
              status: status || 'all',
              fromDate: fromDate || null,
              toDate: toDate || null
            }
          });

          // Update tokens using helper function
          setStockXTokenCookies(successResponse, refreshResult.accessToken, refreshResult.refreshToken || refreshToken);

          return successResponse;
        } else {
          // Log the error response
          const errorText = await retryResponse.text();
          console.error('Retry failed:', retryResponse.status, errorText);
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('StockX Sales API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorResponse: errorText,
        requestUrl: apiUrl,
        headers: {
          'x-api-key': apiKey ? 'Present' : 'Missing',
          'Authorization': accessToken ? 'Present' : 'Missing'
        }
      });
      
      // Try to parse error details
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.message || errorJson.error || errorText;
      } catch (e) {
        // Use raw text if not JSON
      }
      
      if (response.status === 400) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Bad Request', 
            details: errorDetails,
            message: 'Invalid request format or parameters',
            statusCode: 400,
            requestUrl: apiUrl
          },
          { status: 400 }
        );
      } else if (response.status === 401) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Authentication failed', 
            details: errorDetails,
            authRequired: true,
            message: 'Please re-authenticate with StockX',
            statusCode: 401
          },
          { status: 401 }
        );
      } else if (response.status === 403) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Access forbidden', 
            details: errorDetails,
            message: 'You may not have seller permissions or API access',
            statusCode: 403
          },
          { status: 403 }
        );
      } else {
        return NextResponse.json(
          { 
            success: false,
            error: 'StockX API error', 
            details: errorDetails,
            statusCode: response.status
          },
          { status: response.status }
        );
      }
    }

    const responseText = await response.text();
    let salesData;
    
    try {
      salesData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', responseText);
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid response format from StockX', 
          details: responseText.substring(0, 500)
        },
        { status: 500 }
      );
    }
    
    console.log(`✅ Successfully fetched seller orders:`, {
      hasData: !!salesData,
      dataType: typeof salesData,
      keys: salesData ? Object.keys(salesData) : []
    });
    
    // Process the sales data - the paginated endpoints should already include payout data
    const processedSales = processSalesData(salesData);
    
    console.log(`✅ Processed ${processedSales.length} sales from paginated endpoint`);
    
    // Check if we should fetch complete payout data
    const fetchCompleteData = searchParams.get('fetchCompleteData') === 'true';
    
    if (fetchCompleteData && processedSales.length > 0) {
      console.log('📊 Fetching complete payout data for all sales...');
      
      // Enhance sales with complete payout data
      const enhancedSales = await fetchCompletePayoutData(
        processedSales, 
        accessToken, 
        refreshToken || '', 
        apiKey
      );
      
      return NextResponse.json({
        success: true,
        data: enhancedSales,
        totalCount: salesData.count || salesData.totalCount || enhancedSales.length,
        pageNumber: salesData.pageNumber || pageNumber,
        pageSize: salesData.pageSize || pageSize,
        hasNextPage: salesData.hasNextPage || false,
        appliedFilters: {
          status: status || 'all',
          fromDate: fromDate || null,
          toDate: toDate || null
        },
        payoutDataFetched: true
      });
    }

    return NextResponse.json({
      success: true,
      data: processedSales,
      totalCount: salesData.count || salesData.totalCount || processedSales.length,
      pageNumber: salesData.pageNumber || pageNumber,
      pageSize: salesData.pageSize || pageSize,
      hasNextPage: salesData.hasNextPage || false,
      appliedFilters: {
        status: status || 'all',
        fromDate: fromDate || null,
        toDate: toDate || null
      }
    });

  } catch (error: any) {
    console.error('Error fetching StockX sales:', error);
    console.error('Error stack:', error.stack);
    
    // Handle timeout errors specifically
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { 
          success: false,
          error: 'StockX API timeout',
          message: 'The request took too long. Try again with a smaller page size.',
          details: 'Request aborted after 25 seconds'
        },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch sales data',
        details: error instanceof Error ? error.message : 'Unknown error',
        errorName: error.name,
        errorStack: error.stack
      },
      { status: 500 }
    );
  }
}

// Function to fetch complete payout data with timeout awareness
async function fetchCompletePayoutDataWithTimeout(
  sales: StockXSale[],
  accessToken: string,
  refreshToken: string,
  apiKey: string,
  timeLimit: number
): Promise<StockXSale[]> {
  const startTime = Date.now();
  const enhancedSales: StockXSale[] = [];
  let currentAccessToken = accessToken;
  let batchNumber = 1;
  const batchSize = 5; // Smaller batch size for timeout safety
  let retryCount = 0;
  
  for (let i = 0; i < sales.length; i += batchSize) {
    // Check if we have enough time for another batch
    if (Date.now() - startTime > timeLimit - 1000) {
      console.warn(`⏱️ Timeout approaching, enriched ${enhancedSales.length} of ${sales.length} sales`);
      // Return what we have enriched + the rest as-is
      return [...enhancedSales, ...sales.slice(i)];
    }
    
    const batch = sales.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${batchNumber} of ${Math.ceil(sales.length / batchSize)} (${batch.length} sales)`);
    
    const batchPromises = batch.map(async (sale, index) => {
      // Stagger requests within batch
      await new Promise(resolve => setTimeout(resolve, index * 100));
      
      try {
        const detailUrl = `https://api.stockx.com/v2/selling/orders/${sale.orderNumber}`;
        
        const response = await fetchWithRetry(detailUrl, {
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${currentAccessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 429) {
          // Rate limited - wait and return original
          retryCount++;
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
          console.warn(`⏳ Rate limited on ${sale.orderNumber}, backing off ${backoffTime}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          return sale;
        }
        
        if (response.status === 401 && refreshToken) {
          const refreshResult = await refreshStockXTokens(refreshToken);
          if (refreshResult.success && refreshResult.accessToken) {
            currentAccessToken = refreshResult.accessToken;
            // Retry with new token
            const retryResponse = await fetch(detailUrl, {
              headers: {
                'x-api-key': apiKey,
                'Authorization': `Bearer ${refreshResult.accessToken}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
              }
            });
            
            if (retryResponse.ok) {
              const detailData = await retryResponse.json();
              retryCount = 0; // Reset on success
              return enhanceSaleWithPayoutData(sale, detailData);
            }
          }
        } else if (response.ok) {
          const detailData = await response.json();
          retryCount = 0; // Reset on success
          return enhanceSaleWithPayoutData(sale, detailData);
        }
        
        return sale; // Return original on error
      } catch (error) {
        console.error(`❌ Error fetching payout for order ${sale.orderNumber}:`, error);
        return sale;
      }
    });
    
    // Wait for batch with timeout
    const batchTimeout = Math.min(5000, timeLimit - (Date.now() - startTime));
    const batchResults = await Promise.race([
      Promise.all(batchPromises),
      new Promise<StockXSale[]>(resolve => 
        setTimeout(() => resolve(batch), batchTimeout)
      )
    ]);
    
    enhancedSales.push(...batchResults);
    batchNumber++;
    
    // Add delay between batches if we have time
    if (i + batchSize < sales.length && Date.now() - startTime < timeLimit - 2000) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return enhancedSales;
}

// Function to fetch complete payout data for sales
async function fetchCompletePayoutData(
  sales: StockXSale[],
  accessToken: string,
  refreshToken: string,
  apiKey: string
): Promise<StockXSale[]> {
  const enhancedSales: StockXSale[] = [];
  let currentAccessToken = accessToken;
  let batchNumber = 1;
  const batchSize = 10; // Process in batches of 10 to avoid timeouts
  
  // Split sales into batches
  for (let i = 0; i < sales.length; i += batchSize) {
    const batch = sales.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${batchNumber} of ${Math.ceil(sales.length / batchSize)} (${batch.length} sales)`);
    
    // Process batch in parallel with controlled concurrency
    const batchPromises = batch.map(async (sale, index) => {
      // Add delay to avoid rate limits (stagger requests within batch)
      await new Promise(resolve => setTimeout(resolve, index * 200));
      
      try {
        const detailUrl = `https://api.stockx.com/v2/selling/orders/${sale.orderNumber}`;
        
        const response = await fetch(detailUrl, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${currentAccessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 401 && refreshToken) {
          // Try to refresh token once
          const refreshResult = await refreshStockXTokens(refreshToken);
          if (refreshResult.success && refreshResult.accessToken) {
            currentAccessToken = refreshResult.accessToken;
            
            // Retry with new token
            const retryResponse = await fetch(detailUrl, {
              method: 'GET',
              headers: {
                'x-api-key': apiKey,
                'Authorization': `Bearer ${refreshResult.accessToken}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
              }
            });
            
            if (retryResponse.ok) {
              const detailData = await retryResponse.json();
              return enhanceSaleWithPayoutData(sale, detailData);
            }
          }
        } else if (response.ok) {
          const detailData = await response.json();
          return enhanceSaleWithPayoutData(sale, detailData);
        }
        
        // If we couldn't get detailed data, return original sale
        console.warn(`⚠️ Could not fetch payout data for order ${sale.orderNumber}`);
        return sale;
        
      } catch (error) {
        console.error(`❌ Error fetching payout for order ${sale.orderNumber}:`, error);
        return sale; // Return original sale on error
      }
    });
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);
    enhancedSales.push(...batchResults);
    
    console.log(`✅ Completed batch ${batchNumber}`);
    batchNumber++;
    
    // Add delay between batches to avoid rate limits
    if (i + batchSize < sales.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  const salesWithPayouts = enhancedSales.filter(s => s.pricing.totalPayout > 0).length;
  console.log(`💰 Enhanced ${salesWithPayouts} of ${sales.length} sales with payout data`);
  
  return enhancedSales;
}

// Helper function to enhance sale with payout data
function enhanceSaleWithPayoutData(sale: StockXSale, detailData: any): StockXSale {
  const payoutData = detailData.payout || detailData.payoutDetails || {};
  
  // Extract accurate payout and fee data
  const totalPayout = parseFloat(
    payoutData.amount || 
    payoutData.totalPayout || 
    detailData.totalPayout || 
    detailData.sellerPayout || 
    '0'
  );
  
  const totalFees = parseFloat(
    payoutData.totalAdjustments || 
    detailData.totalAdjustments || 
    detailData.totalFees || 
    '0'
  );
  
  return {
    ...sale,
    pricing: {
      ...sale.pricing,
      totalPayout: totalPayout > 0 ? totalPayout : sale.pricing.totalPayout,
      sellerFees: totalFees > 0 ? Math.abs(totalFees) : sale.pricing.sellerFees,
      // Add any adjustment details if available
      adjustments: detailData.adjustments || payoutData.adjustments
    },
    // Add payout details if available
    payoutDetails: payoutData.amount ? {
      amount: payoutData.amount,
      currency: payoutData.currency || 'USD',
      status: payoutData.status,
      date: payoutData.date || detailData.payoutDate,
      method: payoutData.method,
      adjustments: detailData.adjustments || []
    } : undefined,
    needsPayoutRefresh: false // Mark as no longer needing refresh
  };
}

// Helper function to extract size from product title
function extractSizeFromTitle(title: string): string | null {
  if (!title) return null;
  
  // Common size patterns in sneaker titles
  const patterns = [
    /\bSize\s+([\d.]+)/i,              // "Size 10"
    /\bSZ\s+([\d.]+)/i,                // "SZ 10"
    /\s+([\d.]+)(?:\s*[MWY])?$/,       // "10" or "10M" at end
    /\s+\(([\d.]+)\)/,                 // "(10)"
    /\s+([\d.]+)\s+(?:US|UK|EU)/i,    // "10 US"
    /(?:^|\s)([\d.]+)(?:\s|$)/         // Any standalone number
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const size = match[1];
      // Validate it's a reasonable shoe size
      const numSize = parseFloat(size);
      if (numSize >= 3.5 && numSize <= 18) {
        return size;
      }
    }
  }
  
  return null;
}

// Function to process and format sales data
function processSalesData(rawData: any): StockXSale[] {
  console.log(`🔄 Processing seller orders data:`, rawData);
  
  // Handle different response formats
  let orders = [];
  if (rawData.orders && Array.isArray(rawData.orders)) {
    orders = rawData.orders;
  } else if (rawData.data && Array.isArray(rawData.data)) {
    orders = rawData.data;
  } else if (Array.isArray(rawData)) {
    orders = rawData;
  }

  // Debug: Log first few orders to see structure
  if (orders.length > 0) {
    console.log('🔍 First StockX order from API:', JSON.stringify(orders[0], null, 2));
    
    // Check specifically for payout data in the first order
    const firstOrder = orders[0];
    console.log('💰 Payout data structure:', {
      hasPayout: !!firstOrder.payout,
      payoutKeys: firstOrder.payout ? Object.keys(firstOrder.payout) : 'No payout object',
      payoutDetails: firstOrder.payout || 'No payout data',
      // Also check other possible locations
      hasPayoutDetails: !!firstOrder.payoutDetails,
      hasPricing: !!firstOrder.pricing,
      pricingKeys: firstOrder.pricing ? Object.keys(firstOrder.pricing) : 'No pricing object',
      // Check if payout is nested in another field
      orderKeys: Object.keys(firstOrder)
    });
    
    // Debug: Check where size data might be
    console.log('📏 Size data debug:', {
      productName: firstOrder.product?.productName || firstOrder.product?.name || firstOrder.productName,
      variant_variantValue: firstOrder.variant?.variantValue, // THIS IS WHERE SIZE SHOULD BE!
      variant_variantName: firstOrder.variant?.variantName,
      variant_size: firstOrder.variant?.size,
      root_size: firstOrder.size,
      productSize: firstOrder.productSize,
      product_size: firstOrder.product?.size,
      item_size: firstOrder.item?.size,
      lineItem_size: firstOrder.lineItem?.size,
      // Check all keys that might contain size
      allKeysWithSize: Object.keys(firstOrder).filter(key => 
        key.toLowerCase().includes('size') || 
        (typeof firstOrder[key] === 'object' && firstOrder[key] && 'size' in firstOrder[key])
      ),
      // Try to extract from title
      extractedFromTitle: extractSizeFromTitle(firstOrder.product?.productName || firstOrder.product?.name || firstOrder.productName || '')
    });
    
    // Log the variant structure if it exists
    if (firstOrder.variant) {
      console.log('🔍 Variant structure:', JSON.stringify(firstOrder.variant, null, 2));
      console.log('✅ SIZE FOUND:', firstOrder.variant.variantValue || 'NOT IN variantValue');
    }
    
    // If we have multiple orders, check if payout data varies
    if (orders.length > 1) {
      const ordersWithPayout = orders.filter((o: any) => o.payout && o.payout.totalPayout);
      console.log(`📊 ${ordersWithPayout.length} out of ${orders.length} orders have payout.totalPayout data`);
    }
  }

  return orders.map((order: any): StockXSale => {
    // Determine order type based on order number format
    let orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS' = 'STANDARD';
    if (order.orderNumber?.startsWith('02-')) {
      orderType = 'FLEX';
    } else if (order.orderNumber?.startsWith('06-')) {
      orderType = 'DIRECT';
    }

    // Map status to our TypeScript enum
    const mapStatus = (status: string) => {
      const statusMap: Record<string, any> = {
        'MATCHED': 'PENDING',
        'SHIPPED': 'SHIPPED',
        'RECEIVED': 'RECEIVED',
        'AUTHENTICATING': 'AUTHENTICATING',
        'AUTHENTICATED': 'AUTHENTICATED',
        'PAYOUTPENDING': 'PAYOUT_PENDING',
        'PAYOUTCOMPLETED': 'PAYOUT_COMPLETED',
        'CANCELED': 'CANCELLED',
        'AUTHFAILED': 'AUTHENTICATION_FAILED',
        'RETURNED': 'RETURNED'
      };
      return statusMap[status] || status;
    };

    // Extract payout data if available per StockX documentation
    // The payout object should contain: totalPayout, totalAdjustments, and adjustments array
    const payoutData = order.payout || order.payoutDetails || {};
    
    // Only use actual payout data from StockX - no calculations
    const salePrice = parseFloat(order.amount || order.salePrice || order.price || '0');
    let sellerFees = 0;
    let hasFeeData = false;
    
    if (payoutData.totalAdjustments !== undefined) {
      // Use the actual totalAdjustments from payout data
      sellerFees = Math.abs(parseFloat(payoutData.totalAdjustments || '0'));
      hasFeeData = true;
      console.log(`💰 Order ${order.orderNumber || order.id}: Using payout.totalAdjustments = ${sellerFees}`);
    } else if (order.totalFees) {
      // Only use if explicitly provided by StockX
      sellerFees = parseFloat(order.totalFees || '0');
      hasFeeData = true;
    }
    
    // Log when no fee data is available
    if (!hasFeeData && salePrice > 0) {
      console.warn(`⚠️ Order ${order.orderNumber || order.id}: No fee data from StockX API - needs payout refresh`);
    }

    const saleData: StockXSale = {
      id: order.id || order.orderId || order.orderNumber,
      orderNumber: order.orderNumber || order.id,
      orderType,
      status: mapStatus(order.status),
      product: {
        productId: order.product?.id || order.productId || '',
        productName: order.product?.productName || order.product?.name || order.productName || 'Unknown Product',
        brand: order.product?.brand || order.brand || 'Unknown Brand',
        styleId: order.product?.sku || order.sku || order.styleId,
        retailPrice: order.product?.retailPrice,
        imageUrl: order.product?.imageUrl || order.imageUrl,
        category: order.product?.category,
        urlKey: order.product?.urlKey
      },
      variant: {
        variantId: order.variant?.variantId || order.variant?.id || order.variantId || '',
        // According to StockX API docs, size is in variant.variantValue
        size: order.variant?.variantValue || 
              order.variantValue ||
              order.variant?.size || 
              order.size || 
              order.productSize || 
              order.product?.size || 
              order.item?.size || 
              order.lineItem?.size ||
              order.metadata?.size ||
              order.attributes?.size ||
              // If we have a product title, try to extract size from it
              extractSizeFromTitle(order.product?.productName || order.product?.name || order.productName || '') ||
              'Size not available',
        sizeType: order.variant?.sizeType || order.sizeType,
        variantName: order.variant?.variantName
      },
      pricing: {
        salePrice: salePrice,
        buyerPaid: salePrice,
        sellerFees,
        processingFee: parseFloat(order.processingFee || '0'),
        shippingFee: parseFloat(order.shippingFee || '0'),
        transactionFee: parseFloat(order.transactionFee || '0'),
        paymentProcessingFee: parseFloat(order.paymentProcessingFee || '0'),
        // Only use actual payout data from StockX - with minimum fee adjustment
        totalPayout: (() => {
          let payout = 0;
          
          // If we have payout data from API, use it
          if (payoutData.totalPayout !== undefined) {
            payout = parseFloat(payoutData.totalPayout || '0');
          } else if (hasFeeData) {
            // Calculate payout if we have fee data
            payout = salePrice - sellerFees;
          }
          
          // Apply StockX minimum fee rule ONLY for sales ≤$71
          // For sales above $71, we rely on API data only
          if (salePrice > 0 && salePrice <= 71 && payout > 0) {
            // For sales ≤$71, ensure the $5 minimum transaction fee is applied
            const minimumTransactionFee = 5.00;
            const processingFee = salePrice * 0.03; // 3% payment processing
            const shippingFee = parseFloat(order.shippingFee || order.shipping?.fee || '0');
            const minimumTotalFees = minimumTransactionFee + processingFee + shippingFee;
            
            const currentFees = salePrice - payout;
            
            // If current fees are less than what they should be with the minimum, adjust
            if (currentFees < minimumTotalFees) {
              payout = salePrice - minimumTotalFees;
              console.log(`💵 Order ${order.orderNumber || order.id}: Applied minimum fee structure for $${salePrice} sale`);
              console.log(`   Min Transaction: $${minimumTransactionFee.toFixed(2)}, Processing: $${processingFee.toFixed(2)}, Shipping: $${shippingFee.toFixed(2)}`);
              console.log(`   Adjusted payout: $${payout.toFixed(2)}`);
            }
          }
          
          return payout;
        })(),
        currency: order.currency || 'USD',
        sellerLevel: order.sellerLevel,
        feePercentage: order.feePercentage
      },
      authentication: order.authenticationDetails ? {
        status: order.authenticationDetails.status || 'PENDING',
        verificationDate: order.authenticationDetails.verifiedAt,
        failureReason: order.authenticationDetails.failureReason
      } : undefined,
      shipping: order.shipping || order.shipment ? {
        trackingNumber: order.tracking || order.shipment?.trackingNumber,
        carrier: order.carrier || order.shipment?.carrier,
        shippedDate: order.shippedAt || order.shipment?.shippedAt,
        deliveredDate: order.deliveredAt || order.shipment?.deliveredAt,
        shippingLabel: order.shippingLabel,
        isDirectShip: orderType === 'DIRECT'
      } : undefined,
      createdAt: order.createdAt || order.created,
      updatedAt: order.updatedAt || order.updated,
      payoutDate: order.payoutDate,
      source: 'stockx_api',
      // Flag to indicate if this order needs payout data refresh
      needsPayoutRefresh: !hasFeeData && salePrice > 0
    };

    return saleData;
  });
}

// Function to calculate profit (if cost data is available)
function calculateProfit(order: any) {
  const salePrice = order.salePrice || order.price || 0;
  const totalFees = order.totalFees || 0;
  const netPayout = order.payout || (salePrice - totalFees);
  
  // You could store/track purchase cost separately
  // For now, we'll just return the net payout
  return {
    salePrice,
    totalFees,
    netPayout,
    // profitAmount: netPayout - purchaseCost, // Would need cost tracking
    // profitMargin: ((netPayout - purchaseCost) / purchaseCost) * 100
  };
} 