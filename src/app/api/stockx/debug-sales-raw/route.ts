import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  try {
    // Fetch just one order to see the structure
    const response = await fetch('https://api.stockx.com/v2/selling/orders/history?pageSize=5&pageNumber=1', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const rawData = await response.json();
    
    // Log the full structure of the first order
    if (rawData.orders && rawData.orders.length > 0) {
      const firstOrder = rawData.orders[0];
      console.log('🔍 Full order structure:', JSON.stringify(firstOrder, null, 2));
      
      // Deep search for size-related fields
      const findSizeFields = (obj: any, path: string = ''): any => {
        const sizeFields: any = {};
        
        for (const [key, value] of Object.entries(obj || {})) {
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check if key contains 'size' (case insensitive)
          if (key.toLowerCase().includes('size')) {
            sizeFields[currentPath] = value;
          }
          
          // Recursively search objects (but not arrays to avoid too much data)
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nestedSizes = findSizeFields(value, currentPath);
            Object.assign(sizeFields, nestedSizes);
          }
        }
        
        return sizeFields;
      };
      
      const allSizeFields = findSizeFields(firstOrder);
      
      // If no size found, try to fetch individual order details
      let orderDetails = null;
      let detailsSizeInfo = {};
      
      if (Object.keys(allSizeFields).length === 0 && firstOrder.id) {
        console.log('📝 No size found in list response, fetching order details...');
        
        try {
          // Fetch individual order details
          const detailsResponse = await fetch(`https://api.stockx.com/v2/selling/orders/${firstOrder.id}`, {
            method: 'GET',
            headers: {
              'x-api-key': apiKey,
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
          });
          
          if (detailsResponse.ok) {
            orderDetails = await detailsResponse.json();
            console.log('✅ Got order details:', JSON.stringify(orderDetails, null, 2));
            
            // Search for size in the detailed response
            const detailsSizeFields = findSizeFields(orderDetails);
            detailsSizeInfo = {
              hasDetails: true,
              sizeFieldsInDetails: detailsSizeFields,
              variant: orderDetails.variant,
              product: orderDetails.product,
              item: orderDetails.item
            };
          } else {
            console.log('❌ Could not fetch order details:', detailsResponse.status);
            detailsSizeInfo = {
              hasDetails: false,
              error: `Status ${detailsResponse.status}`
            };
          }
        } catch (err) {
          console.error('Error fetching order details:', err);
          detailsSizeInfo = {
            hasDetails: false,
            error: err.message
          };
        }
      }
      
      return NextResponse.json({
        success: true,
        totalOrders: rawData.orders.length,
        firstOrder: firstOrder,
        orderDetails: orderDetails,
        // Specifically check for size data
        sizeLocations: {
          inVariant: firstOrder.variant?.size,
          inRoot: firstOrder.size,
          inProduct: firstOrder.product?.size,
          inItem: firstOrder.item?.size,
          allKeys: Object.keys(firstOrder),
          // Deep search results
          allSizeFields: allSizeFields,
          // Check specific nested paths that might contain size
          possiblePaths: {
            'lineItem.size': firstOrder.lineItem?.size,
            'orderLineItem.size': firstOrder.orderLineItem?.size,
            'product.traits.size': firstOrder.product?.traits?.size,
            'metadata.size': firstOrder.metadata?.size,
            'attributes.size': firstOrder.attributes?.size
          },
          // Details API results
          detailsApiInfo: detailsSizeInfo
        }
      });
    }

    return NextResponse.json({
      success: false,
      message: 'No orders found',
      rawData: rawData
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}