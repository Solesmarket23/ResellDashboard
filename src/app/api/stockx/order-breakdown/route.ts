import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orderNumber = searchParams.get('orderNumber');
  
  if (!orderNumber) {
    return NextResponse.json(
      { error: 'Order number is required' },
      { status: 400 }
    );
  }

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  async function fetchWithAuth(url: string, token: string) {
    return fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
  }

  try {
    // Try to fetch the specific order with full details
    let response = await fetchWithAuth(
      `https://api.stockx.com/v2/selling/orders/${orderNumber}`,
      accessToken
    );

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, refreshing...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        response = await fetchWithAuth(
          `https://api.stockx.com/v2/selling/orders/${orderNumber}`,
          refreshResult.accessToken
        );
        
        // Set new tokens in response
        const successResponse = NextResponse.json(await response.json());
        setStockXTokenCookies(
          successResponse, 
          refreshResult.accessToken, 
          refreshResult.refreshToken || refreshToken
        );
        return successResponse;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('StockX API Error:', {
        status: response.status,
        error: errorText
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch order details',
          details: errorText,
          status: response.status
        },
        { status: response.status }
      );
    }

    const orderData = await response.json();
    
    // Extract complete payout breakdown
    const breakdown = {
      orderNumber: orderData.orderNumber,
      status: orderData.status,
      product: {
        name: orderData.product?.productName || orderData.product?.name,
        brand: orderData.product?.brand,
        sku: orderData.product?.sku,
        imageUrl: orderData.product?.imageUrl
      },
      variant: {
        size: orderData.variant?.variantValue || orderData.variant?.size,
        variantId: orderData.variant?.variantId
      },
      pricing: {
        salePrice: orderData.payout?.salePrice || orderData.amount,
        totalPayout: orderData.payout?.totalPayout,
        totalFees: orderData.payout?.totalAdjustments,
        currency: orderData.currency || 'USD'
      },
      fees: {
        breakdown: orderData.payout?.adjustments?.map((adj: any) => ({
          type: adj.adjustmentType,
          description: adj.description,
          amount: adj.amount,
          percentage: adj.percentage,
          isCredit: adj.isCredit
        })) || [],
        // Also capture individual fee fields if present
        transactionFee: orderData.transactionFee,
        paymentProcessingFee: orderData.paymentProcessingFee,
        shippingFee: orderData.shippingFee
      },
      dates: {
        created: orderData.createdAt,
        updated: orderData.updatedAt,
        shipped: orderData.shippedAt,
        payoutDate: orderData.payoutDate
      },
      rawData: orderData // Include full response for debugging
    };

    console.log('✅ Order breakdown fetched:', {
      orderNumber,
      salePrice: breakdown.pricing.salePrice,
      totalFees: breakdown.pricing.totalFees,
      totalPayout: breakdown.pricing.totalPayout
    });

    return NextResponse.json({
      success: true,
      breakdown: breakdown
    });

  } catch (error) {
    console.error('Error fetching order breakdown:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch order breakdown',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}