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
    apiKeySource: process.env.STOCKX_API_KEY ? 'STOCKX_API_KEY' : 'STOCKX_CLIENT_ID'
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
    return NextResponse.json(
      { error: 'Missing StockX API key configuration' },
      { status: 500 }
    );
  }

  try {
    // Build API URL for seller orders/sales
    const pageNumber = Math.floor(parseInt(offset) / parseInt(limit)) + 1;
    const pageSize = Math.min(parseInt(limit), 50); // API max is 50
    
    const queryParams = new URLSearchParams({
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString()
    });

    // Add status filter if provided
    if (status) {
      queryParams.set('status', status);
    }

    // StockX API endpoint for seller orders - use history endpoint for completed sales
    // and active endpoint for pending sales based on status filter
    let apiUrl: string;
    if (status === 'completed') {
      apiUrl = `https://api.stockx.com/v2/selling/orders/history?orderStatus=COMPLETED&${queryParams.toString()}`;
    } else if (status === 'pending' || status === 'active') {
      apiUrl = `https://api.stockx.com/v2/selling/orders/active?${queryParams.toString()}`;
    } else {
      // Default to history endpoint without status filter to get all orders
      apiUrl = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
    }
    console.log(`🛒 Fetching StockX seller orders: ${apiUrl}`);

    // Make API call to StockX
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    if (response.status === 401 && refreshToken) {
      // Access token expired, try to refresh
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry the request with new token using the same URL
        const retryResponse = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
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
            totalCount: salesData.totalCount || processedSales.length,
            pageNumber,
            pageSize,
            tokenRefreshed: true
          });

          // Update tokens using helper function
          setStockXTokenCookies(successResponse, refreshResult.accessToken, refreshResult.refreshToken || refreshToken);

          return successResponse;
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('StockX Sales API Error:', errorText);
      
      if (response.status === 401) {
        return NextResponse.json(
          { 
            success: false,
            error: 'Authentication failed', 
            details: errorText,
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
            details: errorText,
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
            details: errorText,
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
      totalCount: salesData.totalCount || processedSales.length,
      pageNumber,
      pageSize,
      appliedFilters: {
        status: status || 'all'
      }
    });

  } catch (error) {
    console.error('Error fetching StockX sales:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch sales data',
        details: error instanceof Error ? error.message : 'Unknown error'
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

    // Calculate total fees
    const sellerFees = parseFloat(order.totalFees || '0') || 
      (parseFloat(order.processingFee || '0') + 
       parseFloat(order.transactionFee || '0') + 
       parseFloat(order.shippingFee || '0'));

    const saleData: StockXSale = {
      id: order.id || order.orderId || order.orderNumber,
      orderNumber: order.orderNumber || order.id,
      orderType,
      status: mapStatus(order.status),
      product: {
        productId: order.product?.id || order.productId || '',
        productName: order.product?.name || order.productName || 'Unknown Product',
        brand: order.product?.brand || order.brand || '',
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
        salePrice: parseFloat(order.salePrice || order.price || '0'),
        buyerPaid: parseFloat(order.buyerPaid || order.salePrice || order.price || '0'),
        sellerFees,
        processingFee: parseFloat(order.processingFee || '0'),
        shippingFee: parseFloat(order.shippingFee || '0'),
        transactionFee: parseFloat(order.transactionFee || '0'),
        paymentProcessingFee: parseFloat(order.paymentProcessingFee || '0'),
        totalPayout: parseFloat(order.payout || order.totalPayout || '0'),
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