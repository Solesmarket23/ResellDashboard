import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const { orderNumber } = await context.params;

    if (!orderNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing orderNumber' },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    const apiKey = process.env.STOCKX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing StockX API key (STOCKX_API_KEY)' },
        { status: 500 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No access token found',
          authRequired: true,
          message: 'Please authenticate with StockX first',
        },
        { status: 401 }
      );
    }

    const apiUrl = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`;

    const doFetch = async (token: string) => {
      return await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'FlipFlow/1.0',
        },
      });
    };

    let response = await doFetch(accessToken);

    if (response.status === 401 && refreshToken) {
      const refreshResult = await refreshStockXTokens(refreshToken);
      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken;
        response = await doFetch(accessToken);
        // We'll set cookies on success below
      } else {
        return NextResponse.json(
          {
            success: false,
            error: 'Authentication expired',
            authRequired: true,
            message: 'Please re-authenticate with StockX',
          },
          { status: 401 }
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: 'StockX API error',
          statusCode: response.status,
          details: errorText,
          authRequired: response.status === 401,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const successResponse = NextResponse.json({
      success: true,
      data,
    });

    // If the token was refreshed, store it for future requests
    if (accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(successResponse, accessToken, refreshToken);
    }

    return successResponse;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch order details',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}


