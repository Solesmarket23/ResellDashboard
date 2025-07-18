import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const operationId = params.id;
    
    // Get tokens from cookies
    let accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Not authenticated with StockX' },
        { status: 401 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'StockX API key not configured' },
        { status: 500 }
      );
    }

    if (!operationId) {
      return NextResponse.json(
        { error: 'Operation ID is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking operation status: ${operationId}`);

    // Extract listing ID from the operation URL if provided
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get('listingId');

    if (!listingId) {
      return NextResponse.json(
        { error: 'Listing ID is required' },
        { status: 400 }
      );
    }

    // Make API request to check operation status
    const operationUrl = `https://api.stockx.com/v2/selling/listings/${listingId}/operations/${operationId}`;
    
    let response = await fetch(operationUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        response = await fetch(operationUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'X-API-Key': apiKey,
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });
        
        // Store the new access token for response
        accessToken = refreshResult.accessToken;
      } else {
        return NextResponse.json(
          { error: 'Authentication expired. Please re-authenticate with StockX.' },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Failed to get operation status:', response.status, errorData);
      
      return NextResponse.json(
        { 
          error: 'Failed to get operation status',
          status: response.status,
          details: errorData
        },
        { status: response.status }
      );
    }

    // Parse the operation response
    const operation = await response.json();
    console.log('✅ Operation status retrieved:', operation.operationStatus);

    // Create success response
    const successResponse = NextResponse.json({
      success: true,
      operation: {
        listingId: operation.listingId,
        operationId: operation.operationId,
        operationType: operation.operationType,
        operationStatus: operation.operationStatus,
        operationInitiatedBy: operation.operationInitiatedBy,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
        error: operation.error,
        changes: operation.changes
      },
      isComplete: operation.operationStatus !== 'PENDING',
      isSuccessful: operation.operationStatus === 'SUCCEEDED',
      isFailed: operation.operationStatus === 'FAILED'
    });

    // Update tokens if refreshed
    if (accessToken !== request.cookies.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error checking operation status:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}