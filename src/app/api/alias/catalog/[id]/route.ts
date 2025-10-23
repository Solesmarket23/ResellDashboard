// Get Alias catalog item by ID
import { NextRequest, NextResponse } from 'next/server';
import { AliasApiService } from '../../../../../lib/alias/aliasApiService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;
    
    if (!bearerToken) {
      return NextResponse.json({
        success: false,
        error: 'ALIAS_BEARER_TOKEN not configured'
      }, { status: 400 });
    }

    const { id } = params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Catalog ID is required'
      }, { status: 400 });
    }

    const aliasApi = new AliasApiService({ bearerToken });
    const result = await aliasApi.catalog.getCatalogItem(id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Alias catalog item fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
