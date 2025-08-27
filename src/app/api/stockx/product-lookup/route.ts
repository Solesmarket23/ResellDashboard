import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const productId = searchParams.get('productId');
  
  if (!productId) {
    return NextResponse.json(
      { error: 'Product ID is required' },
      { status: 400 }
    );
  }

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  try {
    // Try to fetch product details which should include size information
    const response = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (response.ok) {
      const productData = await response.json();
      
      // Extract variants/sizes from product data
      const variants = productData.variants || productData.data?.variants || [];
      const sizes = variants.map((v: any) => ({
        id: v.id,
        size: v.size || v.traits?.size || v.sizeUS || v.sizeEU || 'Unknown',
        sizeUS: v.sizeUS,
        sizeEU: v.sizeEU,
        sizeUK: v.sizeUK
      }));
      
      return NextResponse.json({
        success: true,
        productId: productId,
        productName: productData.title || productData.name,
        variants: sizes,
        rawData: productData
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Failed to fetch product: ${response.status}`
      }, { status: response.status });
    }

  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}