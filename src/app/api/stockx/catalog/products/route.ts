import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';

interface ProductCatalogResponse {
  productId: string;
  brand: string;
  productName: string;
  category?: string;
  retailPrice?: number;
  imageUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { productIds } = await request.json();
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: 'Product IDs array is required' },
        { status: 400 }
      );
    }

    // Get access token from cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

    if (!accessToken || !apiKey) {
      return NextResponse.json(
        { 
          error: 'Missing authentication', 
          message: 'Please authenticate with StockX first'
        },
        { status: 401 }
      );
    }

    console.log(`🔍 Fetching brand data for ${productIds.length} unique products`);

    let currentAccessToken = accessToken;
    const productBrandMap: Record<string, ProductCatalogResponse> = {};
    const errors: string[] = [];
    let successCount = 0;

    // Process products in batches to avoid overwhelming the API
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      batches.push(productIds.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      // Process batch concurrently but with rate limiting
      const batchPromises = batch.map(async (productId: string) => {
        try {
          // Add small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const catalogUrl = `https://api.stockx.com/v2/catalog/products/${productId}`;
          
          const response = await fetch(catalogUrl, {
            headers: {
              'x-api-key': apiKey,
              'Authorization': `Bearer ${currentAccessToken}`,
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
          });

          if (response.status === 401 && refreshToken) {
            // Token expired, refresh and retry once
            const refreshResult = await refreshStockXTokens(refreshToken);
            if (refreshResult.success && refreshResult.accessToken) {
              currentAccessToken = refreshResult.accessToken;
              
              // Retry with new token
              const retryResponse = await fetch(catalogUrl, {
                headers: {
                  'x-api-key': apiKey,
                  'Authorization': `Bearer ${currentAccessToken}`,
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
              });

              if (retryResponse.ok) {
                const productData = await retryResponse.json();
                return { productId, data: productData };
              }
            }
            throw new Error('Authentication failed');
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const productData = await response.json();
          return { productId, data: productData };
          
        } catch (error) {
          console.error(`❌ Failed to fetch product ${productId}:`, error);
          errors.push(`Product ${productId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process successful results
      batchResults.forEach(result => {
        if (result && result.data) {
          try {
            const product = result.data.product || result.data;
            
            productBrandMap[result.productId] = {
              productId: result.productId,
              brand: product.brand || product.brandName || extractBrandFromName(product.productName || product.name) || 'Unknown Brand',
              productName: product.productName || product.name || 'Unknown Product',
              category: product.category,
              retailPrice: product.retailPrice,
              imageUrl: product.imageUrl || product.image
            };
            
            successCount++;
          } catch (parseError) {
            console.error(`❌ Failed to parse product data for ${result.productId}:`, parseError);
            errors.push(`Product ${result.productId}: Failed to parse response`);
          }
        }
      });

      // Log progress
      console.log(`✅ Processed batch: ${successCount}/${productIds.length} products successful`);
    }

    console.log(`🎉 Brand enrichment complete: ${successCount}/${productIds.length} successful, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      productBrandMap,
      stats: {
        total: productIds.length,
        successful: successCount,
        failed: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Catalog products endpoint error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch product catalog data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to extract brand from product name as fallback
function extractBrandFromName(productName: string): string | null {
  if (!productName) return null;
  
  const brands = [
    'Nike', 'Jordan', 'Adidas', 'Yeezy', 'New Balance', 'Asics', 'Puma', 
    'Vans', 'Converse', 'Reebok', 'Under Armour', 'Fear of God', 'Polo Ralph Lauren',
    'Off-White', 'Travis Scott', 'Stone Island', 'Supreme', 'BAPE', 'Kith',
    'UGG', 'Timberland', 'Dr. Martens', 'Balenciaga', 'Gucci', 'Louis Vuitton'
  ];
  
  const productNameLower = productName.toLowerCase();
  
  for (const brand of brands) {
    if (productNameLower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  
  return null;
}
