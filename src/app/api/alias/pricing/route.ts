import { NextRequest, NextResponse } from 'next/server';

// GET - Get pricing insights
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
    const insightType = searchParams.get('type') || 'availability';
    const catalogId = searchParams.get('catalog_id');
    const size = searchParams.get('size');
    const productCondition = searchParams.get('product_condition');
    const packagingCondition = searchParams.get('packaging_condition');
    const consigned = searchParams.get('consigned');
    const regionId = searchParams.get('region_id');

    if (!catalogId) {
      return NextResponse.json(
        { error: 'Catalog ID is required' },
        { status: 400 }
      );
    }

    let endpoint = '';
    const params = new URLSearchParams();

    switch (insightType) {
      case 'availability':
        // Get pricing for specific variant
        endpoint = '/api/v1/pricing_insights/availability';
        params.append('catalog_id', catalogId);
        if (size) params.append('size', size);
        if (productCondition) params.append('product_condition', productCondition);
        if (packagingCondition) params.append('packaging_condition', packagingCondition);
        if (consigned) params.append('consigned', consigned);
        if (regionId) params.append('region_id', regionId);
        break;
        
      case 'availabilities':
        // Get pricing for all variants
        endpoint = `/api/v1/pricing_insights/availabilities/${catalogId}`;
        if (consigned) params.append('consigned', consigned);
        if (regionId) params.append('region_id', regionId);
        break;
        
      case 'offerHistogram':
        endpoint = '/api/v1/pricing_insights/offer_histogram';
        params.append('catalog_id', catalogId);
        if (size) params.append('size', size);
        if (productCondition) params.append('product_condition', productCondition);
        if (packagingCondition) params.append('packaging_condition', packagingCondition);
        if (regionId) params.append('region_id', regionId);
        break;
        
      case 'recentSales':
        endpoint = '/api/v1/pricing_insights/recent_sales';
        params.append('catalog_id', catalogId);
        if (size) params.append('size', size);
        if (productCondition) params.append('product_condition', productCondition);
        if (packagingCondition) params.append('packaging_condition', packagingCondition);
        if (consigned) params.append('consigned', consigned);
        if (regionId) params.append('region_id', regionId);
        const limit = searchParams.get('limit') || '10';
        params.append('limit', limit);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid insight type' },
          { status: 400 }
        );
    }

    const url = `https://api.alias.org${endpoint}?${params}`;
    
    const response = await fetch(url, {
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
          error: `Failed to fetch pricing insights: ${response.status}`,
          details: error 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      type: insightType,
      data
    });

  } catch (error) {
    console.error('Alias pricing insights error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch pricing insights',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}