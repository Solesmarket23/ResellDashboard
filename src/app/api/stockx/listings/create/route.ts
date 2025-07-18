import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

interface CreateListingRequest {
  productId: string;
  variantId: string;
  amount: number; // Price in dollars
  quantity?: number; // Default to 1
  active?: boolean; // Whether to create as active or inactive
  condition?: 'new' | 'used'; // Default to 'new'
}

export async function POST(request: NextRequest) {
  try {
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

    // Parse request body
    const body: CreateListingRequest = await request.json();
    const { productId, variantId, amount, quantity = 1, active = true, condition = 'new' } = body;

    // Validate required fields
    if (!productId || !variantId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: productId, variantId, and amount are required' },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Prepare the listing data
    const listingData = {
      productId,
      variantId,
      amount: Math.round(amount * 100), // Convert to cents
      quantity,
      active,
      condition
    };

    console.log('🏷️ Creating StockX listing:', listingData);

    // Make API request to create listing
    let response = await fetch('https://api.stockx.com/v2/selling/listings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      },
      body: JSON.stringify(listingData)
    });

    // Handle token refresh if needed
    if (response.status === 401 && refreshToken) {
      console.log('🔄 Token expired, attempting refresh...');
      const refreshResult = await refreshStockXTokens(refreshToken);
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Retry with new token
        response = await fetch('https://api.stockx.com/v2/selling/listings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${refreshResult.accessToken}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          },
          body: JSON.stringify(listingData)
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
      console.error('❌ StockX listing creation failed:', response.status, errorData);
      
      return NextResponse.json(
        { 
          error: 'Failed to create listing',
          status: response.status,
          details: errorData
        },
        { status: response.status }
      );
    }

    // Parse the operation response
    const operation = await response.json();
    console.log('✅ Listing operation created:', operation);

    // Create success response
    const successResponse = NextResponse.json({
      success: true,
      operation: {
        listingId: operation.listingId,
        operationId: operation.operationId,
        operationType: operation.operationType,
        operationStatus: operation.operationStatus,
        operationUrl: operation.operationUrl,
        createdAt: operation.createdAt
      },
      message: `Listing ${active ? 'created and activated' : 'created as inactive'}. Operation ID: ${operation.operationId}`
    });

    // Update tokens if refreshed
    if (accessToken !== request.cookies.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;

  } catch (error) {
    console.error('❌ Error creating listing:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}