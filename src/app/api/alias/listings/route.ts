import { NextRequest, NextResponse } from 'next/server';

// GET - Search/list listings
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
    const searchTerm = searchParams.get('searchTerm');
    const pageSize = searchParams.get('pageSize') || '50';
    const paginationToken = searchParams.get('paginationToken');
    const facetFilters = searchParams.getAll('facetFilter');
    const numericFilters = searchParams.getAll('numericFilter');
    
    if (searchTerm) params.append('search_term', searchTerm);
    params.append('page_size', pageSize);
    if (paginationToken) params.append('pagination_token', paginationToken);
    facetFilters.forEach(filter => params.append('facet_filters', filter));
    numericFilters.forEach(filter => params.append('numeric_filters', filter));

    const response = await fetch(`https://api.alias.org/api/v1/listings?${params}`, {
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
          error: `Failed to fetch listings: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      listings: data.listings || [],
      pagination: data.pagination || {}
    });

  } catch (error) {
    console.error('Alias listings fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch listings',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Create a new listing
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
    const {
      catalog_id,
      price_cents,
      condition,
      packaging_condition,
      size,
      size_unit,
      activate,
      metadata,
      defects,
      additional_defects
    } = body;

    // Validate required fields
    if (!catalog_id || !price_cents || !condition || !packaging_condition || !size || !size_unit) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      catalog_id,
      price_cents: price_cents.toString(),
      condition,
      packaging_condition,
      size: size.toString(),
      size_unit,
      ...(activate !== undefined && { activate: activate.toString() })
    });

    // Add optional fields
    if (metadata) params.append('metadata', JSON.stringify(metadata));
    if (defects) defects.forEach((defect: string) => params.append('defects', defect));
    if (additional_defects) params.append('additional_defects', additional_defects);

    const response = await fetch(`https://api.alias.org/api/v1/listings?${params}`, {
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
          error: `Failed to create listing: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      listing: data.listing
    });

  } catch (error) {
    console.error('Alias create listing error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create listing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a listing
export async function DELETE(request: NextRequest) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;
    
    if (!bearerToken) {
      return NextResponse.json(
        { error: 'Alias API token not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get('id');

    if (!listingId) {
      return NextResponse.json(
        { error: 'Listing ID is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`https://api.alias.org/api/v1/listings/${listingId}`, {
      method: 'DELETE',
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
          error: `Failed to delete listing: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      deletedId: data.id
    });

  } catch (error) {
    console.error('Alias delete listing error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete listing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}