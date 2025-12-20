import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getAdminDb, getAdminDocuments, addAdminDocument, updateAdminDocument } from '@/lib/firebase/firebaseAdmin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { StockXSale } from '@/lib/types/stockx';

type PurchaseCandidate = {
  id: string;
  userId?: string;
  orderNumber?: string;
  size?: string;
  styleId?: string | null;
  style_id?: string | null;
  stockxListingId?: string;
  totalAmount?: number | string;
  purchasePrice?: number | string;
  price?: string;
  purchaseDate?: string;
  purchase_date?: string;
  emailDate?: string;
  email_date?: string;
  createdAt?: string;
  actualDelivery?: string;
  linkedSaleOrderNumber?: string;
  linkedSaleId?: string;
  product?: {
    styleId?: string | null;
    size?: string;
  };
  _dateMs?: number | null;
};

function normalizeSize(size: unknown): string {
  return String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseDateMs(val: unknown): number | null {
  if (typeof val !== 'string' || !val) return null;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : null;
}

function parseYmdStartMs(ymd: unknown): number | null {
  if (typeof ymd !== 'string') return null;
  const s = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function parseYmdEndMs(ymd: unknown): number | null {
  if (typeof ymd !== 'string') return null;
  const s = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T23:59:59.999Z`);
  return Number.isFinite(ms) ? ms : null;
}

function getPurchaseStyleId(p: PurchaseCandidate): string | null {
  return (
    (typeof p.styleId === 'string' && p.styleId.trim()) ||
    (typeof p.style_id === 'string' && p.style_id.trim()) ||
    (typeof p.product?.styleId === 'string' && p.product.styleId.trim()) ||
    null
  );
}

function getPurchaseCost(p: PurchaseCandidate): number | null {
  const totalAmount =
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ??
    null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

  const purchasePrice =
    (typeof p.purchasePrice === 'number' ? p.purchasePrice : parseMoney(p.purchasePrice)) ??
    null;
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;

  const priceFromString = parseMoney(p.price);
  if (typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0) return priceFromString;

  return null;
}

function computeFeeAmount(salePrice: number, totalPayout: number): number {
  const fee = salePrice - totalPayout;
  return Number.isFinite(fee) ? Math.max(0, fee) : 0;
}

function getSaleListingId(order: any): string | null {
  const candidates: unknown[] = [
    order?.listingId,
    order?.listingID,
    order?.sellerListingId,
    order?.sellerListingID,
    order?.saleData?.listingId,
    order?.saleData?.listingID,
    order?.saleData?.listing?.id,
    order?.saleData?.listing?.listingId,
    order?.saleData?.sellerListingId,
    order?.saleData?.sellerListingID,
    // Some payloads may carry ask/bid ids; capture them as a last resort.
    order?.askId,
    order?.saleData?.askId
  ];

  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function purchaseKey(styleId: string, size: string): string {
  return `${styleId}::${normalizeSize(size)}`;
}

export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now();
    const { userId, maxSales = 100, fromYmd, toYmd } = await request.json();

    const fromMs = parseYmdStartMs(fromYmd);
    const toMs = parseYmdEndMs(toYmd);

    console.log('🚀 Starting streaming bulk StockX sales import for user:', userId);
    console.log('📋 Request details:', {
      userId,
      maxSales,
      fromYmd: typeof fromYmd === 'string' ? fromYmd : null,
      toYmd: typeof toYmd === 'string' ? toYmd : null,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('User-Agent'),
      origin: request.headers.get('Origin')
    });

  // Prefer cookies (browser), but fall back to Firebase-stored tokens (site-password + ngrok / server-side use).
  let accessToken = request.cookies.get('stockx_access_token')?.value;
  let refreshToken = request.cookies.get('stockx_refresh_token')?.value;

  // Use CLIENT_ID as the API key for v2 endpoints
  const apiKey = process.env.STOCKX_CLIENT_ID;

  // If cookies are missing, try Firebase (tokens are saved on OAuth callback and via /api/stockx/sync-tokens)
  if ((!accessToken || !refreshToken) && userId) {
    try {
      const adminDb = getAdminDb();
      const userDoc = await adminDb.collection('users').doc(String(userId)).get();
      const userData = userDoc.data() as any;

      accessToken = accessToken || userData?.stockxTokens?.access_token;
      refreshToken = refreshToken || userData?.stockxTokens?.refresh_token;

      const expiresAt = userData?.stockxTokens?.expires_at;
      const now = Date.now();
      const isExpired = typeof expiresAt === 'number' && expiresAt > 0 && expiresAt <= now;

      // If token is expired (or we still don't have an access token), refresh using refresh token.
      if ((!accessToken || isExpired) && refreshToken) {
        console.log('🔄 bulk-import-stream: Refreshing StockX access token (Firebase fallback)...', {
          hadAccessToken: !!accessToken,
          isExpired
        });
        const refreshed = await refreshStockXTokens(refreshToken);
        if (refreshed.success && refreshed.accessToken) {
          accessToken = refreshed.accessToken;
          refreshToken = refreshed.refreshToken || refreshToken;

          const nextExpiresAt = now + 3600 * 1000; // default 1h
          await adminDb.collection('users').doc(String(userId)).set(
            {
              stockxTokens: {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: nextExpiresAt,
                updated_at: new Date().toISOString()
              }
            },
            { merge: true }
          );
        }
      }
    } catch (e: any) {
      console.warn('⚠️ bulk-import-stream: failed to load/refresh tokens from Firebase (will rely on cookies):', {
        error: e?.message || String(e)
      });
    }
  }

  async function loadTokensFromFirebase(candidateUserId: string): Promise<{ accessToken?: string; refreshToken?: string } | null> {
    try {
      const adminDb = getAdminDb();
      const userDoc = await adminDb.collection('users').doc(String(candidateUserId)).get();
      const userData = userDoc.data() as any;
      const fbAccess = userData?.stockxTokens?.access_token;
      const fbRefresh = userData?.stockxTokens?.refresh_token;
      if (typeof fbAccess === 'string' && fbAccess && typeof fbRefresh === 'string' && fbRefresh) {
        return { accessToken: fbAccess, refreshToken: fbRefresh };
      }
      return null;
    } catch (e: any) {
      console.warn('⚠️ bulk-import-stream: failed to load tokens from Firebase during retry (non-fatal):', e?.message || String(e));
      return null;
    }
  }

  console.log('🔐 Authentication check:', {
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken?.length || 0,
    hasRefreshToken: !!refreshToken,
    refreshTokenLength: refreshToken?.length || 0,
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey?.length || 0,
    clientId: process.env.STOCKX_CLIENT_ID ? 'present' : 'missing',
    clientSecret: process.env.STOCKX_CLIENT_SECRET ? 'present' : 'missing'
  });

  if (!accessToken || !apiKey) {
    console.error('❌ Authentication failed:', { 
      accessToken: !!accessToken, 
      apiKey: !!apiKey,
      clientId: !!process.env.STOCKX_CLIENT_ID,
      envVars: {
        STOCKX_CLIENT_ID: process.env.STOCKX_CLIENT_ID ? 'set' : 'missing',
        STOCKX_CLIENT_SECRET: process.env.STOCKX_CLIENT_SECRET ? 'set' : 'missing',
        STOCKX_API_KEY: process.env.STOCKX_API_KEY ? 'set' : 'missing'
      }
    });
    return NextResponse.json(
      { 
        error: 'Missing authentication', 
        message: 'Please authenticate with StockX first'
      },
      { status: 401 }
    );
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const sendUpdate = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendUpdate({
          type: 'status',
          phase: 'starting',
          message: 'Connecting to StockX API...',
          progress: 5
        });

        if (fromMs || toMs) {
          sendUpdate({
            type: 'status',
            phase: 'starting',
            message: `Import window: ${typeof fromYmd === 'string' ? fromYmd : '…'} → ${typeof toYmd === 'string' ? toYmd : '…'}`,
            progress: 6
          });
        }

        let currentAccessToken = accessToken;
        let currentRefreshToken = refreshToken;
        let allSales: StockXSale[] = [];
        let pageNumber = 1;
        let hasNextPage = true;
        const pageSize = 100;

        sendUpdate({
          type: 'status',
          phase: 'fetching',
          message: 'Starting to fetch sales data...',
          progress: 10
        });

        // Phase 1: Fetch all sales from ALL statuses with real-time updates
        const statusesToCheck = ['COMPLETED', 'AUTHENTICATED', 'PAYOUT_PENDING', 'SHIPPED', 'RECEIVED', 'AUTHENTICATING'];
        let currentStatusIndex = 0;
        let currentStatus = statusesToCheck[currentStatusIndex];
        
        sendUpdate({
          type: 'status',
          phase: 'fetching',
          message: `Fetching from all order statuses to get complete history (${statusesToCheck.length} statuses to check)...`,
          progress: 12
        });

        while (currentStatusIndex < statusesToCheck.length && allSales.length < maxSales) {
          hasNextPage = true;
          pageNumber = 1;
          currentStatus = statusesToCheck[currentStatusIndex];
          let stopThisStatusDueToDate = false;
          
          sendUpdate({
            type: 'progress',
            phase: 'fetching',
            message: `Checking ${currentStatus} orders... (${allSales.length} total sales found so far)`,
            currentStatus: currentStatus,
            statusProgress: currentStatusIndex + 1,
            totalStatuses: statusesToCheck.length,
            progress: Math.min(15 + (currentStatusIndex * 8), 60)
          });

          // Fetch all pages for current status
          while (hasNextPage && allSales.length < maxSales && !stopThisStatusDueToDate) {
            sendUpdate({
              type: 'progress',
              phase: 'fetching',
              message: `${currentStatus} - Page ${pageNumber}... (${allSales.length} total sales found)`,
              currentPage: pageNumber,
              currentStatus: currentStatus,
              salesFound: allSales.length,
              progress: Math.min(15 + (currentStatusIndex * 8) + (pageNumber * 0.5), 60)
            });

            const queryParams = new URLSearchParams({
              pageNumber: pageNumber.toString(),
              pageSize: pageSize.toString(),
              orderStatus: currentStatus
            });

            // OAuth is issued with audience=gateway.stockx.com, and selling endpoints are served from gateway.
            // Using api.stockx.com can 401 even with a fresh token (audience mismatch).
            const apiUrl = `https://gateway.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;

          try {
          console.log('🌐 Making StockX API request:', {
            url: apiUrl,
            headers: {
              'x-api-key': 'present',
              'Authorization': 'present',
              'Accept': 'application/json'
            }
          });

          let response = await fetch(apiUrl, {
            headers: {
              'x-api-key': apiKey,
              'Authorization': `Bearer ${currentAccessToken}`,
              'Accept': 'application/json',
              'User-Agent': 'ResellDashboard/1.0'
            }
          });

          // Log response headers
          console.log('📥 StockX API Response Headers:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          });

          // Handle 401 - Token refresh
          if (response.status === 401) {
            if (!currentRefreshToken) {
              console.error('❌ No refresh token available');
              throw new Error('Authentication expired. Please reconnect to StockX.');
            }
            
            console.log('🔄 Token expired, attempting refresh...');
            sendUpdate({
              type: 'status',
              phase: 'refreshing',
              message: 'Refreshing authentication...',
              progress: Math.min(10 + (pageNumber * 2), 60)
            });

            const refreshResult = await refreshStockXTokens(currentRefreshToken);
            
            if (refreshResult.success && refreshResult.accessToken) {
              console.log('✅ Token refresh successful, retrying request...');
              currentAccessToken = refreshResult.accessToken;
              currentRefreshToken = refreshResult.refreshToken || currentRefreshToken;
              // Keep outer variables in sync so later code paths use the rotated refresh token too.
              refreshToken = currentRefreshToken;
              accessToken = currentAccessToken;

              // Persist refreshed tokens to Firebase so future imports/cron have the latest tokens.
              if (userId) {
                try {
                  const adminDb = getAdminDb();
                  const now = Date.now();
                  const nextExpiresAt = now + 3600 * 1000; // default 1h
                  await adminDb.collection('users').doc(String(userId)).set(
                    {
                      stockxTokens: {
                        access_token: currentAccessToken,
                        refresh_token: currentRefreshToken,
                        expires_at: nextExpiresAt,
                        updated_at: new Date().toISOString()
                      }
                    },
                    { merge: true }
                  );
                } catch (e: any) {
                  console.warn('⚠️ bulk-import-stream: failed to persist refreshed tokens (non-fatal):', e?.message || String(e));
                }
              }
              
              // Retry the request with the new token
              response = await fetch(apiUrl, {
                headers: {
                  'x-api-key': apiKey,
                  'Authorization': `Bearer ${currentAccessToken}`,
                  'Accept': 'application/json',
                  'User-Agent': 'ResellDashboard/1.0'
                }
              });
              
              console.log('📥 Retry Response:', {
                status: response.status,
                statusText: response.statusText
              });
              
              // If still 401 after refresh, authentication has failed
              if (response.status === 401) {
                // Last-chance recovery: if cookies are stale/rotated, try Firebase-stored tokens for the provided userId.
                if (userId) {
                  const fbTokens = await loadTokensFromFirebase(String(userId));
                  if (fbTokens?.accessToken && fbTokens?.refreshToken) {
                    console.log('🔁 401 after refresh: trying Firebase-stored tokens for retry...');
                    currentAccessToken = fbTokens.accessToken;
                    currentRefreshToken = fbTokens.refreshToken;
                    accessToken = currentAccessToken;
                    refreshToken = currentRefreshToken;

                    response = await fetch(apiUrl, {
                      headers: {
                        'x-api-key': apiKey,
                        'Authorization': `Bearer ${currentAccessToken}`,
                        'Accept': 'application/json',
                        'User-Agent': 'ResellDashboard/1.0'
                      }
                    });

                    console.log('📥 Firebase-token retry response:', {
                      status: response.status,
                      statusText: response.statusText
                    });

                    if (response.ok) {
                      // continue flow; response will be processed below
                    } else if (response.status === 401) {
                      throw new Error('Authentication failed after token refresh (and Firebase token fallback). Please reconnect to StockX.');
                    } else {
                      const errorBody = await response.text();
                      throw new Error(`StockX API Error ${response.status}: ${errorBody || response.statusText}`);
                    }
                  }
                }

                throw new Error('Authentication failed after token refresh. Please reconnect to StockX.');
              }
            } else {
              console.error('❌ Token refresh failed:', refreshResult.error);
              throw new Error(`Token refresh failed: ${refreshResult.error || 'Unknown error'}`);
            }
          }
          
          // Handle other non-OK responses
          if (!response.ok && response.status !== 401) {
            const errorBody = await response.text();
            console.error('❌ StockX API Error Response:', {
              status: response.status,
              statusText: response.statusText,
              body: errorBody,
              url: apiUrl
            });
            throw new Error(`StockX API Error ${response.status}: ${errorBody || response.statusText}`);
          }

          if (response.ok) {
              const responseText = await response.text();
              console.log('📦 Raw API Response Text (first 500 chars):', responseText.substring(0, 500));
              
              let data;
              try {
                data = JSON.parse(responseText);
                console.log('📦 First Order from API:', data.orders?.[0]);
                console.log('📦 Order Structure:', {
                  // Basic info
                  orderInfo: {
                    id: data.orders?.[0]?.id,
                    orderNumber: data.orders?.[0]?.orderNumber,
                    status: data.orders?.[0]?.status
                  },
                  // Product info
                  productInfo: data.orders?.[0]?.product,
                  // Variant info
                  variantInfo: data.orders?.[0]?.variant,
                  // All available fields
                  availableFields: data.orders?.[0] ? Object.keys(data.orders[0]) : []
                });
              } catch (error) {
                console.error('❌ Failed to parse API response:', error);
                throw error;
              }
              
              if (data.orders && Array.isArray(data.orders)) {
                // Log the first order's complete data structure
                if (data.orders.length > 0 && pageNumber === 1) {
                  const firstOrder = data.orders[0];
                  console.log('📦 Raw StockX API Response:', {
                    // Full raw response
                    rawResponse: data,
                    // First order details
                    firstOrder: firstOrder,
                    // Product details
                    productInfo: {
                      product: firstOrder.product,
                      productName: firstOrder.productName,
                      brand: firstOrder.brand,
                      brandName: firstOrder.brandName,
                      brandInfo: firstOrder.brandInfo,
                      metadata: firstOrder.metadata
                    },
                    // Size details
                    sizeInfo: {
                      variant: firstOrder.variant,
                      size: firstOrder.size,
                      variantValue: firstOrder.variant?.variantValue,
                      variantName: firstOrder.variant?.variantName
                    }
                  });
                  
                  // Log all available fields at root level
                  console.log('📦 Available Fields:', Object.keys(firstOrder).sort());
                  
                  // If product object exists, log its structure
                  if (firstOrder.product) {
                    console.log('📦 Product Object Fields:', Object.keys(firstOrder.product).sort());
                  }
                  
                  // If variant object exists, log its structure
                  if (firstOrder.variant) {
                    console.log('📦 Variant Object Fields:', Object.keys(firstOrder.variant).sort());
                  }
                }
                
                const pageSalesRaw = processSalesData(data.orders);
                const pageSales = pageSalesRaw.filter((s) => {
                  const ms = parseDateMs(s.createdAt) ?? parseDateMs((s as any).updatedAt) ?? null;
                  if (typeof toMs === 'number' && typeof ms === 'number' && ms > toMs) return false;
                  if (typeof fromMs === 'number' && typeof ms === 'number' && ms < fromMs) return false;
                  return true;
                });

                allSales.push(...pageSales);
                
                sendUpdate({
                  type: 'progress',
                  phase: 'fetching',
                  message: `${currentStatus} - Page ${pageNumber}: +${pageSales.length} sales (Total: ${allSales.length})`,
                  currentPage: pageNumber,
                  currentStatus: currentStatus,
                  salesFound: allSales.length,
                  pageResults: pageSales.length,
                  progress: Math.min(15 + (currentStatusIndex * 8) + (pageNumber * 0.5), 60)
                });
                
                hasNextPage = data.hasNextPage && data.orders.length > 0;

                // Early-stop this status if we've passed the window (assumes history is sorted newest → oldest).
                if (typeof fromMs === 'number') {
                  const pageOrderMs = (data.orders as any[])
                    .map((o) => parseDateMs(o?.createdAt) ?? parseDateMs(o?.created) ?? null)
                    .filter((v) => typeof v === 'number') as number[];
                  if (pageOrderMs.length > 0) {
                    const maxMs = Math.max(...pageOrderMs);
                    const minMs = Math.min(...pageOrderMs);
                    if (maxMs < fromMs) {
                      stopThisStatusDueToDate = true;
                      hasNextPage = false;
                      sendUpdate({
                        type: 'status',
                        phase: 'fetching',
                        message: `${currentStatus}: reached orders older than ${typeof fromYmd === 'string' ? fromYmd : 'cutoff'} — stopping this status early.`,
                        progress: Math.min(15 + (currentStatusIndex * 8) + (pageNumber * 0.5), 60)
                      });
                    } else if (minMs < fromMs && pageSales.length === 0) {
                      // Mixed page, but nothing in range; likely near the boundary—stop to avoid unnecessary paging.
                      stopThisStatusDueToDate = true;
                      hasNextPage = false;
                      sendUpdate({
                        type: 'status',
                        phase: 'fetching',
                        message: `${currentStatus}: no sales in range on this page — stopping this status.`,
                        progress: Math.min(15 + (currentStatusIndex * 8) + (pageNumber * 0.5), 60)
                      });
                    }
                  }
                }
              } else {
                sendUpdate({
                  type: 'warning',
                  message: `${currentStatus} - Page ${pageNumber}: No orders found or invalid format`,
                  progress: Math.min(15 + (currentStatusIndex * 8) + (pageNumber * 0.5), 60)
                });
                hasNextPage = false;
              }
            } else {
              throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            pageNumber++;
            
            // Small delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));

          } catch (error) {
            sendUpdate({
              type: 'error',
              phase: 'fetching',
              message: `Error on ${currentStatus} page ${pageNumber}: ${error.message}`,
              progress: Math.min(15 + (currentStatusIndex * 8) + (pageNumber * 0.5), 60)
            });
            hasNextPage = false;
          }
        }
        
        // Move to next status
        currentStatusIndex++;
        
        // Send update when finishing a status
        if (currentStatusIndex < statusesToCheck.length) {
          sendUpdate({
            type: 'status',
            phase: 'fetching',
            message: `Finished ${currentStatus} status. Moving to ${statusesToCheck[currentStatusIndex]}... (${allSales.length} total sales found)`,
            progress: Math.min(15 + (currentStatusIndex * 8), 60)
          });
        }
      }

        // Remove duplicates by orderNumber since we might get same sales across different statuses
        const uniqueSalesMap = new Map();
        for (const sale of allSales) {
          const key = sale.orderNumber || sale.id;
          if (!uniqueSalesMap.has(key)) {
            uniqueSalesMap.set(key, sale);
          }
        }
        allSales = Array.from(uniqueSalesMap.values());
        
        sendUpdate({
          type: 'status',
          phase: 'saving',
          message: `Fetching complete! Found ${allSales.length} unique sales (removed duplicates). Now saving to database...`,
          totalSales: allSales.length,
          progress: 70
        });

        if (allSales.length === 0) {
          sendUpdate({
            type: 'complete',
            success: false,
            message: 'No sales found. Check your StockX account or try again.',
            totalSales: 0,
            progress: 100
          });
          controller.close();
          return;
        }

        // Send multiple progress updates during saving to maintain connection
        let saveProgress = 75;

        // Phase 2: Save to Firebase with progress updates
        sendUpdate({
          type: 'status',
          phase: 'saving',
          message: 'Saving to StockX collection...',
          progress: 75
        });

        await saveSalesToStockxCollection(allSales, userId, sendUpdate);

        sendUpdate({
          type: 'status',
          phase: 'saving',
          message: 'Saving to main sales table...',
          progress: 85
        });

        await saveSalesToMainCollection(allSales, userId, sendUpdate);

        const breakdown = {
          completed: allSales.filter(s => s.status === 'PAYOUT_COMPLETED').length,
          authenticated: allSales.filter(s => s.status === 'AUTHENTICATED').length,
          other: allSales.filter(s => !['PAYOUT_COMPLETED', 'AUTHENTICATED'].includes(s.status)).length
        };

        // Send completion message multiple times to ensure delivery
        const completionMessage = {
          type: 'complete',
          success: true,
          message: `✅ Successfully imported ${allSales.length} StockX sales!`,
          totalSales: allSales.length,
          breakdown,
          progress: 100
        };
        
        console.log('📤 Sending completion message:', completionMessage);
        sendUpdate(completionMessage);
        
        // Send a second completion message with slight delay to ensure delivery
        await new Promise(resolve => setTimeout(resolve, 100));
        sendUpdate({
          ...completionMessage,
          message: `✅ Import complete: ${allSales.length} sales saved to database!`
        });
        
        console.log('✅ Import completed successfully - sent completion messages');

      } catch (error: any) {
        console.error('❌ Streaming import failed with detailed error:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
          cause: error.cause,
          timestamp: new Date().toISOString(),
          elapsed: Date.now() - startTime
        });
        
        sendUpdate({
          type: 'error',
          phase: 'failed',
          message: error.message || 'Import failed',
          error: error.stack,
          progress: 100
        });
      } finally {
        console.log('🏁 Streaming import finished, closing controller');
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
  } catch (error) {
    console.error('❌ Fatal error in StockX import route:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}

function processSalesData(orders: any[]): StockXSale[] {
  return orders.map((order: any): StockXSale => {
    // Determine order type
    let orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS' = 'STANDARD';
    if (order.orderNumber?.startsWith('02-')) {
      orderType = 'FLEX';
    } else if (order.orderNumber?.startsWith('06-')) {
      orderType = 'DIRECT';
    }

    // Map status
    const mapStatus = (status: string) => {
      const statusMap: Record<string, string> = {
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
    
    // Extract payout data
    const payoutData = order.payout || order.payoutDetails || {};
    const sellerFees = Math.abs(parseFloat(payoutData.totalAdjustments || '0'));
    const totalPayout = parseFloat(payoutData.totalPayout || payoutData.payout || '0');

    // Debug logging for brand and size data
    console.log('🔍 Complete Sale Data:', JSON.stringify({
      // Basic info
      orderNumber: order.orderNumber || order.id,
      listingId: getSaleListingId(order),
      
      // Full saleData object
      saleData: order.saleData,
      
      // Product info
      product: order.saleData?.product || order.product,
      
      // Brand info from all possible locations
      brandInfo: {
        fromProduct: order.saleData?.product?.brand,
        fromRoot: order.saleData?.brand,
        fromBrandName: order.saleData?.brandName,
        fromMetadata: order.saleData?.metadata?.brand
      },
      
      // Size info from all possible locations
      sizeInfo: {
        fromVariant: order.saleData?.variant?.size,
        fromProduct: order.saleData?.product?.size,
        fromRoot: order.saleData?.size
      }
    }, null, 2));

    return {
      id: order.id || order.orderId || order.orderNumber,
      orderNumber: order.orderNumber || order.id,
      orderType,
      status: mapStatus(order.status),
      listingId: getSaleListingId(order) || undefined,
      product: {
        productId: order.product?.id || order.productId || '',
        productName: order.product?.productName || order.product?.name || order.productName || 'Unknown Product',
        brand: order.product?.brand || order.brand || order.brandName || extractBrandFromName(order.product?.productName || order.product?.name || ''),
        styleId: order.product?.sku || order.sku || order.styleId,
        retailPrice: order.product?.retailPrice,
        imageUrl: order.product?.imageUrl || order.imageUrl,
        category: order.product?.category,
        urlKey: order.product?.urlKey
      },
      variant: {
        variantId: order.variant?.variantId || order.variant?.id || order.variantId || '',
        size: order.variant?.variantValue || order.variant?.size || order.size || order.skuSize || order.productSize || 'Unknown',
        sizeType: order.variant?.sizeType || order.sizeType || order.sizingCategory || order.sizingSystem,
        variantName: order.variant?.variantName
      },
      pricing: {
        salePrice: salePrice,
        buyerPaid: salePrice,
        sellerFees,
        processingFee: parseFloat(order.processingFee || '0'),
        shippingFee: parseFloat(order.shippingFee || '0'),
        transactionFee: parseFloat(order.transactionFee || '0'),
        paymentProcessingFee: parseFloat(order.paymentProcessingFee || '0'),
        totalPayout: totalPayout || (salePrice - sellerFees),
        currency: order.currency || 'USD',
        sellerLevel: order.sellerLevel,
        feePercentage: order.feePercentage
      },
      createdAt: order.createdAt || order.created,
      updatedAt: order.updatedAt || order.updated,
      payoutDate: order.payoutDate,
      source: 'stockx_bulk_import_stream',
      needsPayoutRefresh: false
    };
  });
}

function extractBrandFromName(productName: string): string {
  // Comprehensive list of sneaker and apparel brands with their variations
  const brandMappings: { [key: string]: string } = {
    // Nike & Jordan
    'NIKE': 'Nike',
    'JORDAN': 'Jordan',
    'AIR JORDAN': 'Jordan',
    'NIKE ACG': 'Nike',
    'NIKE SB': 'Nike',
    
    // Adidas & Yeezy
    'ADIDAS': 'Adidas',
    'YEEZY': 'Adidas',
    
    // Other Athletic Brands
    'NEW BALANCE': 'New Balance',
    'PUMA': 'Puma',
    'VANS': 'Vans',
    'CONVERSE': 'Converse',
    'REEBOK': 'Reebok',
    'ASICS': 'ASICS',
    'SAUCONY': 'Saucony',
    'UNDER ARMOUR': 'Under Armour',
    
    // Streetwear & Designer
    'SUPREME': 'Supreme',
    'BAPE': 'Bape',
    'A BATHING APE': 'Bape',
    'PALACE': 'Palace',
    'OFF-WHITE': 'Off-White',
    'TRAVIS SCOTT': 'Travis Scott',
    'CACTUS JACK': 'Travis Scott',
    'FEAR OF GOD': 'Fear of God',
    'FOG': 'Fear of God',
    'ESSENTIALS': 'Fear of God',
    'DENIM TEARS': 'Denim Tears',
    'POP MART': 'Pop Mart',
    
    // Luxury & Designer
    'BALENCIAGA': 'Balenciaga',
    'GUCCI': 'Gucci',
    'LOUIS VUITTON': 'Louis Vuitton',
    'LV': 'Louis Vuitton',
    'DIOR': 'Dior',
    'AMI': 'AMI',
    'STONE ISLAND': 'Stone Island',
    'CHROME HEARTS': 'Chrome Hearts',
    'GALLERY DEPT': 'Gallery Dept',
    
    // Outdoor & Footwear
    'THE NORTH FACE': 'The North Face',
    'TIMBERLAND': 'Timberland',
    'UGG': 'UGG',
    'DR. MARTENS': 'Dr. Martens',
    'CROCS': 'Crocs'
  };

  if (!productName) return 'Unknown Brand';
  
  const upperName = productName.toUpperCase();
  
  // First try to match the start of the product name
  for (const [key, brand] of Object.entries(brandMappings)) {
    if (upperName.startsWith(key)) {
      return brand;
    }
  }
  
  // Then try to find matches anywhere in the name
  for (const [key, brand] of Object.entries(brandMappings)) {
    if (upperName.includes(key)) {
      return brand;
    }
  }
  
  // Special case for Jordan numbers (e.g., "Jordan 1", "Jordan 4")
  if (upperName.match(/JORDAN\s+\d/)) {
    return 'Jordan';
  }

  // Try to extract brand from the first word if it's not a common prefix
  const firstWord = productName.split(' ')[0];
  const commonPrefixes = ['THE', 'NEW', 'ALL', 'MENS', "MEN'S", 'WOMENS', "WOMEN'S", 'KIDS', 'YOUTH'];
  if (firstWord && !commonPrefixes.includes(firstWord.toUpperCase())) {
    return firstWord;
  }

  return 'Unknown Brand';
}

async function saveSalesToStockxCollection(sales: StockXSale[], userId: string, sendUpdate: Function) {
  const existingSales = await getAdminDocuments(COLLECTIONS.STOCKX_SALES);
  const userSalesMap = new Map(
    existingSales
      .filter((sale: any) => sale.userId === userId)
      .map((sale: any) => [sale.stockxOrderId, sale])
  );

  let savedCount = 0;
  let updatedCount = 0;
  const total = sales.length;

  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    const existingSale = userSalesMap.get(sale.orderNumber);
    
    if (existingSale) {
      if (existingSale.saleData.status !== sale.status || 
          existingSale.saleData.pricing.totalPayout !== sale.pricing.totalPayout) {
        await updateAdminDocument(COLLECTIONS.STOCKX_SALES, existingSale.id, {
          saleData: sale,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    } else {
      await addAdminDocument(COLLECTIONS.STOCKX_SALES, {
        userId: userId,
        stockxOrderId: sale.orderNumber,
        saleData: sale,
        createdAt: new Date().toISOString(),
        source: 'stockx_bulk_import_stream'
      });
      savedCount++;
    }

    // Send progress update every 10 sales
    if (i % 10 === 0 || i === sales.length - 1) {
      sendUpdate({
        type: 'progress',
        phase: 'saving',
        message: `Saving to StockX collection: ${i + 1}/${total} (${savedCount} new, ${updatedCount} updated)`,
        progress: 75 + Math.floor((i / total) * 5)
      });
    }
  }
}

async function saveSalesToMainCollection(sales: StockXSale[], userId: string, sendUpdate: Function) {
  // IMPORTANT:
  // The dashboard Sales UI and /api/sales/* endpoints read from `user_sales`.
  // This importer previously wrote into `sales`, which caused imported StockX sales to not appear.
  const MAIN_SALES_COLLECTION = 'user_sales';
  const existingSales = await getAdminDocuments(MAIN_SALES_COLLECTION as any);
  const userSalesMap = new Map(
    existingSales
      .filter((sale: any) => sale.userId === userId)
      .map((sale: any) => [sale.orderNumber, sale])
  );

  // Load purchases once and build an index for auto-linking (FIFO) by styleId + size.
  const allPurchasesRaw = (await getAdminDocuments(COLLECTIONS.PURCHASES)) as PurchaseCandidate[];
  const userPurchases = allPurchasesRaw.filter((p: any) => p?.userId === userId);

  const purchaseIndex = new Map<string, PurchaseCandidate[]>();
  const purchaseByStockxListingId = new Map<string, PurchaseCandidate>();
  const usedPurchaseIds = new Set<string>();

  for (const p of userPurchases) {
    const pid = String((p as any)?.id || '');
    if (!pid) continue;

    // Skip already-linked purchases (one purchase unit should only be used once)
    if (p.linkedSaleOrderNumber || p.linkedSaleId) {
      usedPurchaseIds.add(pid);
      continue;
    }

    const styleId = getPurchaseStyleId(p);
    const size = normalizeSize(p.size ?? p.product?.size);
    if (!styleId || !size) continue;

    const stockxListingId = typeof (p as any)?.stockxListingId === 'string' ? String((p as any).stockxListingId).trim() : '';
    if (stockxListingId && !purchaseByStockxListingId.has(stockxListingId)) {
      purchaseByStockxListingId.set(stockxListingId, { ...p, id: pid });
    }

    // STRICT FIFO: only consider purchases that have an actual delivery timestamp.
    const dateMs = parseDateMs((p as any).actualDelivery) ?? null;
    p._dateMs = dateMs;
    if (dateMs === null) {
      // Not eligible for strict-delivery FIFO matching.
      continue;
    }

    const key = purchaseKey(styleId, size);
    const arr = purchaseIndex.get(key) || [];
    arr.push({ ...p, id: pid });
    purchaseIndex.set(key, arr);
  }

  // Sort FIFO: earliest purchase first; unknown dates go last.
  // Tie-breaker: if same day, use createdAt timestamp to keep ordering deterministic.
  for (const [key, arr] of purchaseIndex.entries()) {
    arr.sort((a, b) => {
      const aMs = typeof a._dateMs === 'number' ? a._dateMs : Number.POSITIVE_INFINITY;
      const bMs = typeof b._dateMs === 'number' ? b._dateMs : Number.POSITIVE_INFINITY;

      if (aMs !== bMs) return aMs - bMs;

      const aCreatedMs = parseDateMs(a.createdAt) ?? Number.POSITIVE_INFINITY;
      const bCreatedMs = parseDateMs(b.createdAt) ?? Number.POSITIVE_INFINITY;
      return aCreatedMs - bCreatedMs;
    });
    purchaseIndex.set(key, arr);
  }

  let savedCount = 0;
  let updatedCount = 0;
  const total = sales.length;
  const batchSize = 10; // Process in batches of 10
  
  console.log(`🔄 Starting to save ${total} sales to main collection`);

  // Process sales in batches
  for (let i = 0; i < sales.length; i += batchSize) {
    const batch = sales.slice(i, i + batchSize);
    const batchPromises = [];
    const batchSavedIds = [];

    console.log(`📦 Processing batch ${i/batchSize + 1}/${Math.ceil(total/batchSize)} (${batch.length} sales)`);

    for (const sale of batch) {
      const existingSale = userSalesMap.get(sale.orderNumber);

      // If this sale already has a linked purchase, preserve it (idempotent imports).
      const existingLinkedPurchaseId =
        (existingSale && (existingSale.linkedPurchaseId || existingSale.matchedPurchaseId)) || null;

      // Prefer exact unit-level linking if StockX provides a listingId and the user assigned that listing to a purchase unit.
      const saleListingId = (sale as any)?.listingId ? String((sale as any).listingId) : '';

      // Auto-link purchase (FIFO) by styleId + size, only if we have a styleId.
      const saleStyleId = (sale.product.styleId || sale.product.productId || '').toString();
      const saleSize = normalizeSize(sale.variant.size);
      const saleCreatedAtMs = parseDateMs(sale.createdAt) ?? parseDateMs(sale.updatedAt) ?? null;

      let linkedPurchase: PurchaseCandidate | null = null;
      let linkedPurchaseCost: number | null = null;

      if (!existingLinkedPurchaseId && saleListingId) {
        const candidate = purchaseByStockxListingId.get(saleListingId) || null;
        const pid = candidate ? String(candidate.id || '') : '';
        if (candidate && pid && !usedPurchaseIds.has(pid)) {
          linkedPurchase = candidate;
          linkedPurchaseCost = getPurchaseCost(candidate);
          usedPurchaseIds.add(pid);
        }
      }

      if (!existingLinkedPurchaseId && !linkedPurchase && saleStyleId && saleSize) {
        const key = purchaseKey(saleStyleId, saleSize);
        const candidates = purchaseIndex.get(key) || [];

        // Choose the first un-used purchase whose date is <= sale date (or has unknown date).
        for (const cand of candidates) {
          const pid = String(cand.id || '');
          if (!pid || usedPurchaseIds.has(pid)) continue;

          // If we know both dates, don't allow "purchase after sale".
          if (
            typeof saleCreatedAtMs === 'number' &&
            typeof cand._dateMs === 'number' &&
            cand._dateMs > saleCreatedAtMs
          ) {
            continue;
          }

          linkedPurchase = cand;
          linkedPurchaseCost = getPurchaseCost(cand);
          usedPurchaseIds.add(pid);
          break;
        }
      }

      const feesAmount = computeFeeAmount(sale.pricing.salePrice, sale.pricing.totalPayout);
      const purchasePrice = existingLinkedPurchaseId
        ? (Number(existingSale?.purchasePrice) || 0)
        : (linkedPurchaseCost || 0);
      const profit = sale.pricing.salePrice - feesAmount - purchasePrice;
      
      const mainSaleData = {
        userId: userId,
        product: sale.product.productName,
        brand: sale.product.brand,
        size: sale.variant.size,
        orderNumber: sale.orderNumber,
        salePrice: sale.pricing.salePrice,
        purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : 0,
        fees: feesAmount,
        payout: sale.pricing.totalPayout,
        profit: Number.isFinite(profit) ? profit : 0,
        date: sale.createdAt,
        platform: 'stockx',
        market: 'StockX',
        status: sale.status === 'PAYOUT_COMPLETED' ? 'completed' : 'pending',
        imageUrl: sale.product.imageUrl || '',
        source: 'stockx_bulk_import_stream',
        styleId: saleStyleId || null,
        listingId: saleListingId || null,
        linkedPurchaseId: existingLinkedPurchaseId || (linkedPurchase ? String(linkedPurchase.id) : null),
        linkedPurchaseOrderNumber: existingLinkedPurchaseId
          ? (existingSale?.linkedPurchaseOrderNumber || null)
          : (linkedPurchase?.orderNumber ? String(linkedPurchase.orderNumber) : null),
        stockxData: {
          orderType: sale.orderType,
          productId: sale.product.productId,
          variantId: sale.variant.variantId,
          totalPayout: sale.pricing.totalPayout,
          listingId: saleListingId || null,
          originalStatus: sale.status
        }
      };
      
      if (existingSale) {
        // Always update existing sales to ensure we have the latest data
        batchPromises.push(
          updateAdminDocument(MAIN_SALES_COLLECTION as any, existingSale.id, {
            ...mainSaleData,
            updatedAt: new Date().toISOString()
          }).then(() => {
            updatedCount++;
            batchSavedIds.push(existingSale.id);
            console.log(`📝 Updated existing sale: ${existingSale.id} (${mainSaleData.product})`);
          })
        );
      } else {
        // Add new sale
        batchPromises.push(
          addAdminDocument(MAIN_SALES_COLLECTION as any, {
            ...mainSaleData,
            createdAt: new Date().toISOString()
          }).then((docId) => {
            savedCount++;
            batchSavedIds.push(docId);
            console.log(`✨ Added new sale: ${docId} (${mainSaleData.product})`);
          })
        );
      }

      // Persist purchase → sale linkage so we don't reuse the same purchase unit twice.
      // Best-effort: failures here shouldn't break the import.
      if (!existingLinkedPurchaseId && linkedPurchase && linkedPurchase.id) {
        batchPromises.push(
          updateAdminDocument(COLLECTIONS.PURCHASES, String(linkedPurchase.id), {
            linkedSaleOrderNumber: sale.orderNumber,
            linkedSalePlatform: 'stockx',
            linkedAt: new Date().toISOString()
          }).catch((e: any) => {
            console.warn('⚠️ Failed to persist purchase linkage (non-fatal):', {
              purchaseId: String(linkedPurchase?.id),
              saleOrderNumber: sale.orderNumber,
              error: e?.message || String(e)
            });
          })
        );
      }
    }

    // Wait for batch to complete
    await Promise.all(batchPromises);
    
    // Send detailed progress update after each batch
    const processedCount = Math.min(i + batchSize, total);
    console.log(`✅ Batch complete: ${processedCount}/${total} processed (${savedCount} new, ${updatedCount} updated)`);
    
    sendUpdate({
      type: 'progress',
      phase: 'saving',
      message: `Saving to main sales table: ${processedCount}/${total} (${savedCount} new, ${updatedCount} updated)`,
      progress: 85 + Math.floor((processedCount / total) * 10),
      batchComplete: true,
      batchNumber: Math.floor(i/batchSize) + 1,
      totalBatches: Math.ceil(total/batchSize),
      savedInBatch: batchSavedIds.length,
      totalSaved: savedCount + updatedCount
    });

    // Small delay between batches to allow frontend to update
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
