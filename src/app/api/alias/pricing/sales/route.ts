// Get Alias recent sales
import { NextRequest, NextResponse } from 'next/server';
import { AliasApiService } from '../../../../../lib/alias/aliasApiService';

export async function GET(request: NextRequest) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;
    
    if (!bearerToken) {
      return NextResponse.json({
        success: false,
        error: 'ALIAS_BEARER_TOKEN not configured'
      }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const catalogId = searchParams.get('catalog_id');
    const size = searchParams.get('size');
    const productCondition = searchParams.get('product_condition');
    const packagingCondition = searchParams.get('packaging_condition');
    const consigned = searchParams.get('consigned');
    const regionId = searchParams.get('region_id');
    const limit = searchParams.get('limit');
    const paginationToken = searchParams.get('pagination_token');

    if (!catalogId) {
      return NextResponse.json({
        success: false,
        error: 'catalog_id is required'
      }, { status: 400 });
    }

    const aliasApi = new AliasApiService({ bearerToken });
    const result = await aliasApi.pricing.getRecentSales({
      catalog_id: catalogId,
      size: size ? parseFloat(size) : undefined,
      product_condition: productCondition || undefined,
      packaging_condition: packagingCondition || undefined,
      consigned: consigned ? consigned === 'true' : undefined,
      region_id: regionId || undefined,
      limit: limit ? parseInt(limit) : undefined,
      pagination_token: paginationToken || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Alias recent sales error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
