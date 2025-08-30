import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { StockXSale } from '@/lib/types/stockx';
import { addDocument, getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

// This endpoint handles chunked imports, storing progress in Firebase
export async function POST(request: NextRequest) {
  const { 
    action, // 'start', 'continue', 'status'
    importId,
    userId,
    status = 'completed',
    maxSalesPerChunk = 30,
    enrichPayouts = true
  } = await request.json();

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: 'Missing authentication' },
      { status: 401 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing userId' },
      { status: 400 }
    );
  }

  try {
    switch (action) {
      case 'start':
        return await startImport(userId, status, maxSalesPerChunk, enrichPayouts);
      
      case 'continue':
        if (!importId) {
          return NextResponse.json({ error: 'Missing importId' }, { status: 400 });
        }
        return await continueImport(
          importId, 
          userId, 
          accessToken, 
          refreshToken || '', 
          apiKey,
          maxSalesPerChunk,
          enrichPayouts
        );
      
      case 'status':
        if (!importId) {
          return NextResponse.json({ error: 'Missing importId' }, { status: 400 });
        }
        return await getImportStatus(importId, userId);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Chunked import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function startImport(
  userId: string, 
  status: string, 
  maxSalesPerChunk: number,
  enrichPayouts: boolean
): Promise<NextResponse> {
  // Create a new import session
  const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const importSession = {
    id: importId,
    userId,
    status: 'in_progress',
    filter: { status },
    startedAt: new Date().toISOString(),
    totalSalesFetched: 0,
    totalSalesEnriched: 0,
    currentPage: 1,
    hasMorePages: true,
    chunks: [],
    config: {
      maxSalesPerChunk,
      enrichPayouts
    }
  };

  // Store in Firebase
  await addDocument('stockxImportSessions', {
    ...importSession,
    userId
  });

  return NextResponse.json({
    success: true,
    importId,
    message: 'Import session started',
    nextAction: 'continue'
  });
}

async function continueImport(
  importId: string,
  userId: string,
  accessToken: string,
  refreshToken: string,
  apiKey: string,
  maxSalesPerChunk: number,
  enrichPayouts: boolean
): Promise<NextResponse> {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 8000; // 8s to be safe

  // Get import session
  const sessions = await getDocuments('stockxImportSessions');
  const session = sessions.find(s => s.id === importId && s.userId === userId);
  
  if (!session) {
    return NextResponse.json({ error: 'Import session not found' }, { status: 404 });
  }

  if (session.status === 'completed') {
    return NextResponse.json({ 
      success: true, 
      message: 'Import already completed',
      totalSales: session.totalSalesFetched
    });
  }

  let currentAccessToken = accessToken;
  const chunkSales: StockXSale[] = [];
  let hasMoreInChunk = true;
  let currentPage = session.currentPage || 1;

  // Phase 1: Fetch sales for this chunk
  while (
    hasMoreInChunk && 
    chunkSales.length < maxSalesPerChunk &&
    Date.now() - startTime < MAX_EXECUTION_TIME / 2 // Use half time for fetching
  ) {
    const queryParams = new URLSearchParams({
      pageNumber: currentPage.toString(),
      pageSize: Math.min(50, maxSalesPerChunk - chunkSales.length).toString()
    });
    
    if (session.filter.status === 'completed') {
      queryParams.set('orderStatus', 'COMPLETED');
    }
    
    const apiUrl = session.filter.status === 'completed' 
      ? `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`
      : `https://api.stockx.com/v2/selling/orders/active?${queryParams.toString()}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${currentAccessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const pageSales = processSalesData(data);
        chunkSales.push(...pageSales);
        
        hasMoreInChunk = data.hasNextPage && chunkSales.length < maxSalesPerChunk;
        session.hasMorePages = data.hasNextPage;
        currentPage++;
      } else {
        console.error(`Failed to fetch page ${currentPage}: ${response.status}`);
        hasMoreInChunk = false;
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
      hasMoreInChunk = false;
    }
  }

  // Phase 2: Optionally enrich with payout data
  let enrichedSales = chunkSales;
  if (enrichPayouts && chunkSales.length > 0) {
    const remainingTime = MAX_EXECUTION_TIME - (Date.now() - startTime);
    if (remainingTime > 2000) {
      enrichedSales = await enrichSalesWithPayouts(
        chunkSales,
        currentAccessToken,
        refreshToken,
        apiKey,
        remainingTime - 1000
      );
    }
  }

  // Save chunk data to Firebase
  const chunkId = `chunk_${Date.now()}`;
  await addDocument('stockxImportChunks', {
    importId,
    chunkId,
    userId,
    sales: enrichedSales,
    createdAt: new Date().toISOString()
  });

  // Update session
  const updatedSession = {
    ...session,
    currentPage,
    totalSalesFetched: (session.totalSalesFetched || 0) + chunkSales.length,
    totalSalesEnriched: (session.totalSalesEnriched || 0) + enrichedSales.filter(s => s.pricing.totalPayout > 0).length,
    chunks: [...(session.chunks || []), chunkId],
    lastUpdatedAt: new Date().toISOString(),
    status: !session.hasMorePages || currentPage > 100 ? 'completed' : 'in_progress'
  };

  await updateDocument('stockxImportSessions', session.id, updatedSession);

  return NextResponse.json({
    success: true,
    importId,
    chunkId,
    salesInChunk: enrichedSales.length,
    totalSalesFetched: updatedSession.totalSalesFetched,
    totalSalesEnriched: updatedSession.totalSalesEnriched,
    hasMore: updatedSession.status === 'in_progress',
    executionTime: Date.now() - startTime,
    nextAction: updatedSession.status === 'in_progress' ? 'continue' : 'complete'
  });
}

async function getImportStatus(importId: string, userId: string): Promise<NextResponse> {
  const sessions = await getDocuments('stockxImportSessions');
  const session = sessions.find(s => s.id === importId && s.userId === userId);
  
  if (!session) {
    return NextResponse.json({ error: 'Import session not found' }, { status: 404 });
  }

  // Get all chunks if completed
  let allSales: StockXSale[] = [];
  if (session.status === 'completed' && session.chunks?.length > 0) {
    const chunks = await getDocuments('stockxImportChunks');
    const sessionChunks = chunks.filter(c => 
      c.importId === importId && 
      c.userId === userId &&
      session.chunks.includes(c.chunkId)
    );
    
    allSales = sessionChunks.flatMap(chunk => chunk.sales || []);
  }

  return NextResponse.json({
    success: true,
    session: {
      id: session.id,
      status: session.status,
      totalSalesFetched: session.totalSalesFetched,
      totalSalesEnriched: session.totalSalesEnriched,
      startedAt: session.startedAt,
      lastUpdatedAt: session.lastUpdatedAt,
      chunksProcessed: session.chunks?.length || 0
    },
    sales: session.status === 'completed' ? allSales : [],
    message: session.status === 'completed' 
      ? `Import completed with ${session.totalSalesFetched} sales`
      : `Import in progress... ${session.totalSalesFetched} sales fetched so far`
  });
}

// Helper function to process sales data
function processSalesData(rawData: any): StockXSale[] {
  let orders = [];
  if (rawData.orders && Array.isArray(rawData.orders)) {
    orders = rawData.orders;
  } else if (rawData.data && Array.isArray(rawData.data)) {
    orders = rawData.data;
  } else if (Array.isArray(rawData)) {
    orders = rawData;
  }

  return orders.map((order: any): StockXSale => {
    let orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS' = 'STANDARD';
    if (order.orderNumber?.startsWith('02-')) {
      orderType = 'FLEX';
    } else if (order.orderNumber?.startsWith('06-')) {
      orderType = 'DIRECT';
    }

    const mapStatus = (status: string) => {
      const statusMap: Record<string, any> = {
        'MATCHED': 'PENDING',
        'SHIPPED': 'SHIPPED',
        'RECEIVED': 'RECEIVED',
        'AUTHENTICATING': 'AUTHENTICATING',
        'AUTHENTICATED': 'AUTHENTICATED',
        'PAYOUTPENDING': 'PAYOUT_PENDING',
        'PAYOUTCOMPLETED': 'PAYOUT_COMPLETED',
        'CANCELED': 'CANCELLED',
        'AUTHFAILED': 'AUTHENTICATION_FAILED',
        'RETURNED': 'RETURNED'
      };
      return statusMap[status] || status;
    };

    const salePrice = parseFloat(order.amount || order.salePrice || order.price || '0');
    const payoutData = order.payout || order.payoutDetails || {};
    let sellerFees = 0;
    
    if (payoutData.totalAdjustments !== undefined) {
      sellerFees = Math.abs(parseFloat(payoutData.totalAdjustments || '0'));
    }

    return {
      id: order.id || order.orderId || order.orderNumber,
      orderNumber: order.orderNumber || order.id,
      orderType,
      status: mapStatus(order.status),
      product: {
        productId: order.product?.id || '',
        productName: order.product?.productName || order.product?.name || 'Unknown Product',
        brand: order.product?.brand || 'Unknown Brand',
        styleId: order.product?.sku || order.sku,
        retailPrice: order.product?.retailPrice,
        imageUrl: order.product?.imageUrl,
        category: order.product?.category,
        urlKey: order.product?.urlKey
      },
      variant: {
        variantId: order.variant?.variantId || '',
        size: order.variant?.variantValue || order.size || 'Unknown',
        sizeType: order.variant?.sizeType,
        variantName: order.variant?.variantName
      },
      pricing: {
        salePrice,
        buyerPaid: salePrice,
        sellerFees,
        processingFee: parseFloat(order.processingFee || '0'),
        shippingFee: parseFloat(order.shippingFee || '0'),
        transactionFee: parseFloat(order.transactionFee || '0'),
        paymentProcessingFee: parseFloat(order.paymentProcessingFee || '0'),
        totalPayout: 0, // Will be enriched
        currency: order.currency || 'USD',
        sellerLevel: order.sellerLevel,
        feePercentage: order.feePercentage
      },
      createdAt: order.createdAt || order.created,
      updatedAt: order.updatedAt || order.updated,
      payoutDate: order.payoutDate,
      source: 'stockx_api',
      needsPayoutRefresh: true
    };
  });
}

// Simplified payout enrichment for chunks
async function enrichSalesWithPayouts(
  sales: StockXSale[],
  accessToken: string,
  refreshToken: string,
  apiKey: string,
  timeLimit: number
): Promise<StockXSale[]> {
  const startTime = Date.now();
  const enrichedSales: StockXSale[] = [];
  
  for (const sale of sales) {
    if (Date.now() - startTime > timeLimit) {
      // Out of time, return what we have + the rest
      return [...enrichedSales, ...sales.slice(enrichedSales.length)];
    }
    
    try {
      const response = await fetch(
        `https://api.stockx.com/v2/selling/orders/${sale.orderNumber}`,
        {
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const detailData = await response.json();
        const payoutData = detailData.payout || {};
        
        enrichedSales.push({
          ...sale,
          pricing: {
            ...sale.pricing,
            totalPayout: parseFloat(payoutData.amount || '0'),
            sellerFees: Math.abs(parseFloat(payoutData.totalAdjustments || '0'))
          },
          needsPayoutRefresh: false
        });
      } else {
        enrichedSales.push(sale);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      enrichedSales.push(sale);
    }
  }
  
  return enrichedSales;
}