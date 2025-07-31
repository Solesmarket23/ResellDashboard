import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getDocuments, addDocument, updateDocument } from '@/lib/firebase/firebaseUtils';
import { auth } from '@/lib/firebase/firebase-admin';
import { StockXSale } from '@/lib/types/stockx';

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
          
          // Process the sales data
          const processedSales = processSalesData(salesData);
          
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
    
    // Process the sales data
    const processedSales = processSalesData(salesData);

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
    // Log any order that has payout info
    const orderWithPayout = orders.find(o => o.payout || o.totalPayout || o.payoutAmount);
    if (orderWithPayout) {
      console.log('🔍 Order with payout info:', JSON.stringify(orderWithPayout, null, 2));
    } else {
      console.log('⚠️ No orders found with payout information in fields: payout, totalPayout, payoutAmount');
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

    // Calculate total fees from individual fee components or total
    const processingFee = parseFloat(order.processingFee || '0');
    const transactionFee = parseFloat(order.transactionFee || '0');
    const shippingFee = parseFloat(order.shippingFee || '0');
    const paymentProcessingFee = parseFloat(order.paymentProcessingFee || '0');
    
    const sellerFees = parseFloat(order.payout?.totalFee || order.totalFees || '0') || 
      (processingFee + transactionFee + shippingFee + paymentProcessingFee);

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
        variantId: order.variant?.id || order.variantId || '',
        size: order.variant?.size || order.size || 'Unknown',
        sizeType: order.variant?.sizeType
      },
      pricing: {
        salePrice: parseFloat(order.amount || order.salePrice || order.price || '0'),
        buyerPaid: parseFloat(order.amount || order.buyerPaid || order.salePrice || order.price || '0'),
        sellerFees,
        processingFee,
        shippingFee,
        transactionFee,
        paymentProcessingFee,
        // Calculate totalPayout: salePrice - all fees
        totalPayout: parseFloat(order.payout?.amount || order.payout || order.totalPayout || '0') || 
                    (parseFloat(order.amount || order.salePrice || order.price || '0') - sellerFees),
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
      source: 'stockx_api'
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