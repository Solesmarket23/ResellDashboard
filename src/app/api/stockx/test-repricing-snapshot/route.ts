import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

async function fetchWithAuth(url: string, accessToken: string) {
  return fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-API-Key': process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'ResellDashboard/1.0'
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get('listingId') || '';
    const providedProductId = searchParams.get('productId') || undefined;
    const providedVariantId = searchParams.get('variantId') || undefined;

    if (!listingId) {
      return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    }

    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value;
    const refreshToken = cookieStore.get('stockx_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated with StockX' }, { status: 401 });
    }

    // 1) Fetch listing details (for current price and/or IDs)
    let listingResponse = await fetchWithAuth(
      `https://api.stockx.com/v2/selling/listings/${listingId}`,
      accessToken
    );

    // Refresh token on 401
    let tokenRefreshed = false;
    if (listingResponse.status === 401 && refreshToken) {
      const refreshResult = await refreshStockXTokens(refreshToken);
      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken;
        tokenRefreshed = true;
        listingResponse = await fetchWithAuth(
          `https://api.stockx.com/v2/selling/listings/${listingId}`,
          accessToken
        );
      }
    }

    if (!listingResponse.ok) {
      const text = await listingResponse.text();
      return NextResponse.json(
        { error: `Failed to fetch listing (${listingResponse.status})`, details: text },
        { status: listingResponse.status }
      );
    }

    const listing = await listingResponse.json();

    const amountRaw =
      listing?.amount ??
      listing?.askPrice ??
      listing?.data?.amount ??
      listing?.data?.askPrice ??
      null;

    const currentPrice = typeof amountRaw === 'string' ? parseFloat(amountRaw) : Number(amountRaw);

    // Try to discover IDs from listing payload (fallback to provided)
    const productId =
      providedProductId ??
      listing?.product?.productId ??
      listing?.productId ??
      listing?.data?.product?.productId ??
      undefined;
    const variantId =
      providedVariantId ??
      listing?.variant?.variantId ??
      listing?.variantId ??
      listing?.data?.variant?.variantId ??
      undefined;

    // 2) Fetch market data (lowest ask) if IDs are available
    let lowestAsk: number | null = null;
    if (productId && variantId) {
      const marketResponse = await fetchWithAuth(
        `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`,
        accessToken
      );

      if (marketResponse.ok) {
        const marketJson = await marketResponse.json();
        const variants = marketJson?.variants || marketJson;
        const variantObj = Array.isArray(variants)
          ? variants.find((v: any) => v.variantId === variantId)
          : marketJson;
        const lowestAskAmount = variantObj?.lowestAskAmount ?? variantObj?.lowestAsk ?? null;
        if (lowestAskAmount != null) {
          lowestAsk = typeof lowestAskAmount === 'string' ? parseFloat(lowestAskAmount) : Number(lowestAskAmount);
        }
      }
    }

    const response = NextResponse.json({
      success: true,
      listingId,
      productId,
      variantId,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      lowestAsk
    });

    if (tokenRefreshed && refreshToken) {
      setStockXTokenCookies(response, accessToken, refreshToken);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Snapshot failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


