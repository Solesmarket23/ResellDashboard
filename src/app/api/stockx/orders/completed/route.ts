import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'StockX not connected. Please authenticate first.' },
        { status: 401 }
      );
    }

    console.log('🔍 Fetching completed StockX orders...');

    // Call StockX API for order history with completed status
    const response = await fetch('https://api.stockx.com/v2/selling/orders/history?status=completed', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    if (!response.ok) {
      console.error('❌ StockX API error:', response.status, response.statusText);
      
      // Return mock data for development
      const mockOrders = [
        {
          id: '3',
          orderNumber: 'SX-2024-001236',
          productName: 'Nike Dunk Low "Panda"',
          productBrand: 'Nike',
          size: '11',
          sku: 'DD1391-100',
          status: 'completed',
          salePrice: 120,
          fees: 12,
          payout: 108,
          orderDate: '2024-01-05T16:45:00Z',
          shippedDate: '2024-01-06T11:30:00Z',
          completedDate: '2024-01-08T14:20:00Z',
          buyerLocation: 'Chicago, IL',
          shippingMethod: 'Standard',
          trackingNumber: '773039582965',
          imageUrl: 'https://picsum.photos/400/400?random=3'
        }
      ];
      
      return NextResponse.json({
        orders: mockOrders,
        total: mockOrders.length,
        source: 'mock'
      });
    }

    const data = await response.json();
    console.log('✅ Completed orders fetched successfully:', data);

    // Transform StockX API response to our format
    const transformedOrders = data.orders?.map((order: any) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      productName: order.variant?.product?.name || 'Unknown Product',
      productBrand: order.variant?.product?.brand || 'Unknown Brand',
      size: order.variant?.size || 'N/A',
      sku: order.variant?.sku || 'N/A',
      status: 'completed',
      salePrice: order.amount / 100, // Convert cents to dollars
      fees: order.fees / 100,
      payout: order.payout / 100,
      orderDate: order.createdAt,
      shippedDate: order.shippedAt,
      completedDate: order.completedAt,
      buyerLocation: order.shippingAddress?.city || 'Unknown',
      shippingMethod: order.shippingMethod || 'Standard',
      trackingNumber: order.trackingNumber,
      imageUrl: order.variant?.product?.media?.imageUrl
    })).filter((order: any) => order.status === 'completed') || [];

    return NextResponse.json({
      orders: transformedOrders,
      total: transformedOrders.length,
      source: 'stockx'
    });

  } catch (error) {
    console.error('❌ Error fetching completed orders:', error);
    
    // Return mock data on error
    const mockOrders = [
      {
        id: '3',
        orderNumber: 'SX-2024-001236',
        productName: 'Nike Dunk Low "Panda"',
        productBrand: 'Nike',
        size: '11',
        sku: 'DD1391-100',
        status: 'completed',
        salePrice: 120,
        fees: 12,
        payout: 108,
        orderDate: '2024-01-05T16:45:00Z',
        shippedDate: '2024-01-06T11:30:00Z',
        completedDate: '2024-01-08T14:20:00Z',
        buyerLocation: 'Chicago, IL',
        shippingMethod: 'Standard',
        trackingNumber: '773039582965',
        imageUrl: 'https://picsum.photos/400/400?random=3'
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