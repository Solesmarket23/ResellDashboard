// Get Alias pricing insights
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

    if (!catalogId || !size || !productCondition || !packagingCondition) {
      return NextResponse.json({
        success: false,
        error: 'catalog_id, size, product_condition, and packaging_condition are required'
      }, { status: 400 });
    }

    const aliasApi = new AliasApiService({ bearerToken });
    const result = await aliasApi.pricing.getPricingInsights({
      catalog_id: catalogId,
      size: parseFloat(size),
      product_condition: productCondition,
      packaging_condition: packagingCondition,
      consigned: consigned ? consigned === 'true' : undefined,
      region_id: regionId || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Alias pricing insights error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
