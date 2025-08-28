import { NextRequest, NextResponse } from 'next/server';
import { getStockXApiCredentials } from '@/lib/utils/userApiKeyHelper';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { addDocument, getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

interface RepricingItem {
  listingId: string;
  currentPrice: number;
  newAskPrice: number;
  productName?: string;
  size?: string;
}

interface BatchUpdateItem {
  id: string;
  ask: {
    amount: number;
    currency: string;
  };
}

// Helper to track rate limits
async function getRateLimitTracker(userId: string) {
  try {
    const trackers = await getDocuments('rateLimitTrackers');
    const userTracker = trackers.find(t => t.userId === userId);
    
    if (!userTracker) {
      // Create new tracker
      const newTracker = {
        userId,
        dailyRequests: 0,
        dailyBatchItems: 0,
        lastReset: new Date().toISOString(),
        lastBatchTime: new Date(0).toISOString(), // Long ago
        createdAt: new Date().toISOString()
      };
      
      const docId = await addDocument('rateLimitTrackers', newTracker);
      return { id: docId, ...newTracker };
    }
    
    // Check if we need to reset daily limits (12 AM UTC)
    const lastReset = new Date(userTracker.lastReset);
    const now = new Date();
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    if (lastReset < utcMidnight) {
      // Reset daily limits
      await updateDocument('rateLimitTrackers', userTracker.id, {
        dailyRequests: 0,
        dailyBatchItems: 0,
        lastReset: utcMidnight.toISOString()
      });
      
      return {
        ...userTracker,
        dailyRequests: 0,
        dailyBatchItems: 0,
        lastReset: utcMidnight.toISOString()
      };
    }
    
    return userTracker;
  } catch (error) {
    console.error('Error getting rate limit tracker:', error);
    throw error;
  }
}

async function updateRateLimitTracker(trackerId: string, itemCount: number) {
  const now = new Date();
  await updateDocument('rateLimitTrackers', trackerId, {
    dailyBatchItems: itemCount,
    lastBatchTime: now.toISOString(),
    updatedAt: now.toISOString()
  });
}

export async function POST(request: NextRequest) {
  try {
    const { items, strategy, dryRun = false } = await request.json();
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No items provided for repricing' },
        { status: 400 }
      );
    }
    
    // Get user credentials
    const credentials = await getStockXApiCredentials(request);
    if (!credentials.accessToken || !credentials.apiKey) {
      return NextResponse.json(
        { error: 'Missing StockX authentication' },
        { status: 401 }
      );
    }
    
    const userId = credentials.userId;
    
    // Check rate limits
    const tracker = await getRateLimitTracker(userId);
    const timeSinceLastBatch = Date.now() - new Date(tracker.lastBatchTime).getTime();
    
    // Check 5-minute cooldown
    if (timeSinceLastBatch < 5 * 60 * 1000 && tracker.dailyBatchItems > 0) {
      const waitTime = Math.ceil((5 * 60 * 1000 - timeSinceLastBatch) / 1000);
      return NextResponse.json({
        error: 'Rate limit cooldown',
        waitSeconds: waitTime,
        nextAvailable: new Date(new Date(tracker.lastBatchTime).getTime() + 5 * 60 * 1000).toISOString()
      }, { status: 429 });
    }
    
    // Check daily limit
    if (tracker.dailyBatchItems + items.length > 50000) {
      return NextResponse.json({
        error: 'Daily batch item limit exceeded',
        dailyLimit: 50000,
        used: tracker.dailyBatchItems,
        requested: items.length,
        available: 50000 - tracker.dailyBatchItems
      }, { status: 429 });
    }
    
    // Chunk items into batches of 500
    const BATCH_SIZE = 500;
    const batches: RepricingItem[][] = [];
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 Batch repricing: ${items.length} items in ${batches.length} batches (strategy: ${strategy})`);
    
    // If dry run, just return what would happen
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        wouldProcess: {
          totalItems: items.length,
          batches: batches.length,
          estimatedTime: (batches.length - 1) * 5, // minutes
          strategy
        }
      });
    }
    
    const results = [];
    let totalUpdated = 0;
    let totalFailed = 0;
    let processedItems = 0;
    
    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const isLastBatch = i === batches.length - 1;
      
      console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} items)`);
      
      try {
        // Prepare batch update payload
        const updates: BatchUpdateItem[] = batch.map(item => ({
          id: item.listingId,
          ask: {
            amount: Math.round(item.newAskPrice), // StockX requires integer cents
            currency: 'USD'
          }
        }));
        
        // Make batch update request to StockX
        // Using the batch endpoint for updating multiple listings at once
        const response = await fetch('https://api.stockx.com/v2/selling/batch/listings', {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'x-api-key': credentials.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ 
            listings: updates.map(update => ({
              id: update.id,
              ask: {
                amount: String(update.ask.amount), // StockX expects string
                currencyCode: update.ask.currency
              }
            }))
          })
        });
        
        processedItems += batch.length;
        
        if (response.ok) {
          const data = await response.json();
          
          const batchResult = {
            batch: i + 1,
            success: true,
            processed: batch.length,
            updated: data.successful?.length || 0,
            failed: data.failed?.length || 0,
            details: data
          };
          
          totalUpdated += batchResult.updated;
          totalFailed += batchResult.failed;
          results.push(batchResult);
          
          console.log(`✅ Batch ${i + 1}: ${batchResult.updated} updated, ${batchResult.failed} failed`);
          
          // Log successful updates to Firebase for history
          if (data.successful?.length > 0) {
            await addDocument('repricingHistory', {
              userId,
              batchNumber: i + 1,
              strategy,
              timestamp: new Date().toISOString(),
              successful: data.successful,
              failed: data.failed || []
            });
          }
          
        } else if (response.status === 429) {
          // Rate limited - this shouldn't happen if we respect cooldowns
          const errorText = await response.text();
          console.error(`⚠️ Rate limited on batch ${i + 1}:`, errorText);
          
          results.push({
            batch: i + 1,
            success: false,
            error: 'Rate limited',
            details: errorText
          });
          
          // Stop processing further batches
          break;
          
        } else if (response.status === 401) {
          // Token expired, try to refresh
          console.log('🔄 Token expired, attempting refresh...');
          
          if (credentials.refreshToken) {
            const refreshResult = await refreshStockXTokens(credentials.refreshToken);
            if (refreshResult.success && refreshResult.accessToken) {
              // Retry this batch with new token
              credentials.accessToken = refreshResult.accessToken;
              i--; // Decrement to retry this batch
              continue;
            }
          }
          
          return NextResponse.json(
            { error: 'Authentication failed. Please re-authenticate with StockX.' },
            { status: 401 }
          );
          
        } else {
          // Other error
          const errorText = await response.text();
          console.error(`❌ Error on batch ${i + 1}:`, response.status, errorText);
          
          results.push({
            batch: i + 1,
            success: false,
            error: `HTTP ${response.status}`,
            details: errorText
          });
        }
        
        // Update rate limit tracker after each batch
        await updateRateLimitTracker(tracker.id, tracker.dailyBatchItems + processedItems);
        
        // Wait 5 minutes between batches (except for the last one)
        if (!isLastBatch && response.ok) {
          console.log(`⏳ Waiting 5 minutes before next batch...`);
          
          // Return partial results with continuation token
          return NextResponse.json({
            success: true,
            partial: true,
            completed: i + 1,
            total: batches.length,
            totalItems: items.length,
            totalUpdated,
            totalFailed,
            results,
            continuation: {
              token: Buffer.from(JSON.stringify({
                originalRequest: { items: items.slice(processedItems), strategy },
                progress: { completed: i + 1, totalUpdated, totalFailed }
              })).toString('base64'),
              nextBatchAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              remainingBatches: batches.length - (i + 1)
            }
          });
        }
        
      } catch (error) {
        console.error(`❌ Error processing batch ${i + 1}:`, error);
        results.push({
          batch: i + 1,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Final response
    return NextResponse.json({
      success: totalFailed === 0,
      partial: false,
      completed: batches.length,
      total: batches.length,
      totalItems: items.length,
      totalUpdated,
      totalFailed,
      results,
      strategy,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Batch repricing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process batch repricing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Continue a partial batch operation
export async function PUT(request: NextRequest) {
  try {
    const { continuationToken } = await request.json();
    
    if (!continuationToken) {
      return NextResponse.json(
        { error: 'Missing continuation token' },
        { status: 400 }
      );
    }
    
    // Decode continuation token
    const continuation = JSON.parse(Buffer.from(continuationToken, 'base64').toString());
    
    // Continue with remaining items
    return POST(new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        ...continuation.originalRequest,
        _continuation: continuation.progress
      })
    }));
    
  } catch (error) {
    console.error('Continuation error:', error);
    return NextResponse.json(
      { error: 'Invalid continuation token' },
      { status: 400 }
    );
  }
}