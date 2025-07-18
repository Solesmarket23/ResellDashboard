import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'StockX not connected. Please authenticate first.' },
        { status: 401 }
      );
    }

    console.log('🔍 Fetching active StockX orders...');

    // Call StockX API for active orders
    let response = await fetch('https://api.stockx.com/v2/selling/orders/active', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        response = await fetch('https://api.stockx.com/v2/selling/orders/active', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });
        
        // Store the new access token for later use
        accessToken = refreshResult.accessToken;
      } else {
        return NextResponse.json(
          { error: 'Authentication expired. Please re-authenticate with StockX.' },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      console.error('❌ StockX API error:', response.status, response.statusText);
      
      // Return mock data for development
      const mockOrders = [
        {
          id: '1',
          orderNumber: 'SX-2024-001234',
          productName: 'Air Jordan 1 Retro High OG "Chicago"',
          productBrand: 'Nike',
          size: '10.5',
          sku: 'DZ5485-612',
          status: 'active',
          salePrice: 450,
          fees: 45,
          payout: 405,
          orderDate: new Date().toISOString(),
          buyerLocation: 'New York, NY',
          shippingMethod: 'Standard',
          imageUrl: 'https://picsum.photos/400/400?random=1'
        }
      ];
      
      return NextResponse.json({
        orders: mockOrders,
        total: mockOrders.length,
        source: 'mock'
      });
    }

    const data = await response.json();
    console.log('✅ Active orders fetched successfully:', data);

    // Transform StockX API response to our format
    const transformedOrders = data.orders?.map((order: any) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      productName: order.variant?.product?.name || 'Unknown Product',
      productBrand: order.variant?.product?.brand || 'Unknown Brand',
      size: order.variant?.size || 'N/A',
      sku: order.variant?.sku || 'N/A',
      status: 'active',
      salePrice: order.amount / 100, // Convert cents to dollars
      fees: order.fees / 100,
      payout: order.payout / 100,
      orderDate: order.createdAt,
      buyerLocation: order.shippingAddress?.city || 'Unknown',
      shippingMethod: order.shippingMethod || 'Standard',
      imageUrl: order.variant?.product?.media?.imageUrl
    })) || [];

    const successResponse = NextResponse.json({
      orders: transformedOrders,
      total: transformedOrders.length,
      source: 'stockx'
    });

    // If we refreshed the token, set the new cookies
    if (accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken!);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error fetching active orders:', error);
    
    // Return mock data on error
    const mockOrders = [
      {
        id: '1',
        orderNumber: 'SX-2024-001234',
        productName: 'Air Jordan 1 Retro High OG "Chicago"',
        productBrand: 'Nike',
        size: '10.5',
        sku: 'DZ5485-612',
        status: 'active',
        salePrice: 450,
        fees: 45,
        payout: 405,
        orderDate: new Date().toISOString(),
        buyerLocation: 'New York, NY',
        shippingMethod: 'Standard',
        imageUrl: 'https://picsum.photos/400/400?random=1'
      }
    ];
    
    return NextResponse.json({
      orders: mockOrders,
      total: mockOrders.length,
      source: 'mock',
      error: 'Failed to fetch from StockX API'
    });
  }
}