// Test Alias API connection
import { NextRequest, NextResponse } from 'next/server';
import { AliasApiService } from '../../../../lib/alias/aliasApiService';

export async function GET(request: NextRequest) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;
    
    if (!bearerToken) {
      // Use mock API when no token is configured
      const mockResponse = await fetch(`${request.nextUrl.origin}/api/alias/mock?endpoint=test`);
      const mockData = await mockResponse.json();
      
      return NextResponse.json({
        success: true,
        data: mockData.data,
        message: 'Using Mock Alias API - No real token configured',
        mock: true,
        version: 'v1.3.4 (Mock)'
      });
    }

    const aliasApi = new AliasApiService({ bearerToken });
    const result = await aliasApi.initialize();

    return NextResponse.json({
      success: result.success,
      error: result.error,
      status: aliasApi.getStatus(),
      version: 'v1.3.4',
      mock: false
    });
  } catch (error) {
    console.error('Alias API test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
