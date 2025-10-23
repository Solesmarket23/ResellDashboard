// Search Alias catalog
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
    const query = searchParams.get('query');
    const limit = searchParams.get('limit');
    const paginationToken = searchParams.get('pagination_token');

    if (!query) {
      return NextResponse.json({
        success: false,
        error: 'Query parameter is required'
      }, { status: 400 });
    }

    const aliasApi = new AliasApiService({ bearerToken });
    const result = await aliasApi.catalog.searchCatalog({
      query,
      limit: limit ? parseInt(limit) : undefined,
      pagination_token: paginationToken || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Alias catalog search error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
