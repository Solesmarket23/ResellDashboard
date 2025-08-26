import { NextRequest, NextResponse } from 'next/server';

// GET - List batch operations or get batch details
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
    const batchId = searchParams.get('batchId');
    const status = searchParams.get('status');
    const paginationToken = searchParams.get('paginationToken');

    let url = 'https://api.alias.org/api/v1/listings/batch';
    const params = new URLSearchParams();

    if (batchId) {
      // Get specific batch details
      url = `https://api.alias.org/api/v1/listings/batch/${batchId}`;
    } else {
      // List batches
      if (status) params.append('status', status);
      if (paginationToken) params.append('pagination_token', paginationToken);
    }

    const response = await fetch(`${url}${params.toString() ? `?${params}` : ''}`, {
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
          error: `Failed to fetch batch data: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Alias batch fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch batch data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Create batch operations
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
    const { operation, data } = body;

    if (!operation || !data) {
      return NextResponse.json(
        { error: 'Operation and data are required' },
        { status: 400 }
      );
    }

    let endpoint = '';
    let requestBody: any = {};

    switch (operation) {
      case 'create':
        endpoint = '/api/v1/listings/batch_create';
        requestBody = { items: data };
        break;
        
      case 'update':
        endpoint = '/api/v1/listings/batch_update';
        requestBody = { items: data };
        break;
        
      case 'activate':
        endpoint = '/api/v1/listings/batch_activate';
        // For URL params
        break;
        
      case 'deactivate':
        endpoint = '/api/v1/listings/batch_deactivate';
        // For URL params
        break;
        
      case 'delete':
        endpoint = '/api/v1/listings/batch_delete';
        // For URL params
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid batch operation' },
          { status: 400 }
        );
    }

    // For operations that use query params instead of body
    let url = `https://api.alias.org${endpoint}`;
    if (['activate', 'deactivate', 'delete'].includes(operation)) {
      const params = new URLSearchParams();
      data.forEach((id: string) => params.append('ids', id));
      url += `?${params}`;
    }

    const response = await fetch(url, {
      method: ['delete'].includes(operation) ? 'DELETE' : 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      ...(Object.keys(requestBody).length > 0 && { body: JSON.stringify(requestBody) })
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { 
          success: false, 
          error: `Batch operation failed: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const responseData = await response.json();
    
    return NextResponse.json({
      success: true,
      batchId: responseData.batch_id,
      status: responseData.status
    });

  } catch (error) {
    console.error('Alias batch operation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to perform batch operation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}