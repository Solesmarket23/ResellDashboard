import { NextRequest, NextResponse } from 'next/server';

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
    const query = searchParams.get('query');
    const limit = searchParams.get('limit') || '50';
    const paginationToken = searchParams.get('paginationToken');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      query,
      limit,
      ...(paginationToken && { pagination_token: paginationToken })
    });

    const response = await fetch(`https://api.alias.org/api/v1/catalog?${params}`, {
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
          error: `Catalog search failed: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      catalogItems: data.catalog_items || [],
      nextPaginationToken: data.next_pagination_token,
      hasMore: data.has_more || false
    });

  } catch (error) {
    console.error('Alias catalog search error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to search catalog',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}