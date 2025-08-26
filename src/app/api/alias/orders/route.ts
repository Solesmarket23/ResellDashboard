import { NextRequest, NextResponse } from 'next/server';

// GET - Search orders
export async function GET(request: NextRequest) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;
    
    if (!bearerToken) {
      return NextResponse.json(
        { error: 'Alias API token not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    
    // Add supported query parameters
    const query = searchParams.get('query');
    const pageSize = searchParams.get('pageSize') || '50';
    const paginationToken = searchParams.get('paginationToken');
    const facetFilters = searchParams.getAll('facetFilter');
    
    if (query) params.append('query', query);
    params.append('page_size', pageSize);
    if (paginationToken) params.append('pagination_token', paginationToken);
    facetFilters.forEach(filter => params.append('facet_filters', filter));

    const response = await fetch(`https://api.alias.org/api/v1/orders?${params}`, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to fetch orders: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      orders: data.results || [],
      pagination: data.pagination || {}
    });

  } catch (error) {
    console.error('Alias orders fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch orders',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Perform order operations (confirm, cancel, generate label, ship)
export async function POST(request: NextRequest) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;
    
    if (!bearerToken) {
      return NextResponse.json(
        { error: 'Alias API token not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { orderId, operation, labelType } = body;

    if (!orderId || !operation) {
      return NextResponse.json(
        { error: 'Order ID and operation are required' },
        { status: 400 }
      );
    }

    let endpoint = '';
    const params = new URLSearchParams();

    switch (operation) {
      case 'confirm':
        endpoint = `/api/v1/orders/${orderId}/confirm`;
        break;
      case 'cancel':
        endpoint = `/api/v1/orders/${orderId}/cancel`;
        break;
      case 'generateLabel':
        endpoint = `/api/v1/orders/${orderId}/generate_label`;
        if (labelType) params.append('label_type', labelType);
        break;
      case 'regenerateLabel':
        endpoint = `/api/v1/orders/${orderId}/regenerate_label`;
        if (labelType) params.append('label_type', labelType);
        break;
      case 'ship':
        endpoint = `/api/v1/orders/${orderId}/ship`;
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid operation' },
          { status: 400 }
        );
    }

    const url = `https://api.alias.org${endpoint}${params.toString() ? `?${params}` : ''}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { 
          success: false, 
          error: `Order operation failed: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      order: data.order
    });

  } catch (error) {
    console.error('Alias order operation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to perform order operation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}