import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict, OrderInfo } from '../../../../lib/email/orderConfirmationParser';

// Global sync state (in production, use Redis or database)
let syncState = {
  isRunning: false,
  currentBatch: 0,
  totalBatches: 0,
  totalFound: 0,
  totalProcessed: 0,
  purchases: [] as any[],
  error: null as string | null,
  startTime: null as number | null
};

// Batch configuration
const BATCH_SIZE = 50;
const MAX_BATCHES_PER_REQUEST = 3;
const TIMEOUT_PER_EMAIL = 10000;
const PARALLEL_EMAILS = 8;

interface SyncProgress {
  isRunning: boolean;
  currentBatch: number;
  totalBatches: number;
  totalFound: number;
  totalProcessed: number;
  purchases: any[];
  error: string | null;
  startTime: number | null;
  elapsedTime: number;
}

// Helper to bound long-running Google API requests
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    )
  ]) as Promise<T>;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'status') {
      // Return current sync status
      const elapsedTime = syncState.startTime ? Date.now() - syncState.startTime : 0;
      const progress: SyncProgress = {
        ...syncState,
        elapsedTime
      };
      return NextResponse.json(progress);
    }

    if (action === 'stop') {
      // Stop the sync
      syncState.isRunning = false;
      syncState.error = null;
      return NextResponse.json({ success: true, message: 'Sync stopped' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in background sync status:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'start') {
      // Start background sync
      if (syncState.isRunning) {
        return NextResponse.json({ error: 'Sync already running' }, { status: 400 });
      }
      
      // Stop any existing sync first
      syncState.isRunning = false;

      // Reset state
      syncState = {
        isRunning: true,
        currentBatch: 0,
        totalBatches: 0,
        totalFound: 0,
        totalProcessed: 0,
        purchases: [],
        error: null,
        startTime: Date.now()
      };

      // Start background sync asynchronously (don't await)
      startBackgroundSync().catch(error => {
        console.error('❌ Background sync error:', error);
        syncState.error = error.message;
        syncState.isRunning = false;
      });

      return NextResponse.json({ success: true, message: 'Background sync started' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error starting background sync:', error);
    return NextResponse.json({ error: 'Failed to start sync' }, { status: 500 });
  }
}

async function startBackgroundSync() {
  try {
    console.log('🚀 Starting background Gmail sync...');
    
    // Set a timeout to prevent infinite running
    const syncTimeout = setTimeout(() => {
      if (syncState.isRunning) {
        console.log('⏰ Background sync timeout after 5 minutes');
        syncState.isRunning = false;
        syncState.error = 'Sync timeout after 5 minutes';
      }
    }, 5 * 60 * 1000); // 5 minutes timeout

    // Get Gmail tokens
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      syncState.error = 'Gmail not connected';
      syncState.isRunning = false;
      return;
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/gmail/callback'
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      ...(refreshToken && { refresh_token: refreshToken })
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search query for StockX purchases - more inclusive
    const query = 'from:noreply@stockx.com -subject:"You Sold" -subject:"Sale" -subject:"Payout" -subject:"Ship your"';
    
    console.log(`🔍 Gmail search query: ${query}`);

    // First, let's test if there are ANY emails from StockX
    console.log('🔍 Testing basic StockX email search...');
    const testResponse = await withTimeout(gmail.users.messages.list({
      userId: 'me',
      q: 'from:noreply@stockx.com',
      maxResults: 5
    }), 15000, 'Gmail basic search');
    console.log(`🔍 Basic StockX test: Found ${testResponse.data.messages?.length || 0} emails`);

    let pageToken: string | undefined;
    let batchIndex = 0;

    while (syncState.isRunning) {
      console.log(`📦 BATCH ${batchIndex}: Starting batch processing...`);

      // Get emails for this batch
      const response = await withTimeout(gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: BATCH_SIZE * MAX_BATCHES_PER_REQUEST,
        pageToken: pageToken
      }), 60000, 'Gmail batch list');

      const messages = response.data.messages || [];
      const totalFound = messages.length;

      console.log(`📦 BATCH ${batchIndex}: Gmail API response:`, {
        totalFound,
        hasMessages: !!response.data.messages,
        nextPageToken: !!response.data.nextPageToken
      });

      if (totalFound === 0) {
        console.log('📦 No more emails found, sync complete');
        break;
      }

      syncState.totalFound += totalFound;
      syncState.currentBatch = batchIndex;
      syncState.totalBatches = batchIndex + 1;

      console.log(`📦 BATCH ${batchIndex}: Found ${totalFound} emails`);

      // Process emails in parallel batches
      const batchPurchases: any[] = [];
      let processedInBatch = 0;

      for (let i = 0; i < messages.length; i += PARALLEL_EMAILS) {
        if (!syncState.isRunning) break; // Check if sync was stopped

        const batchSlice = messages.slice(i, i + PARALLEL_EMAILS);
        console.log(`📧 BATCH ${batchIndex}: Processing emails ${i + 1}-${Math.min(i + PARALLEL_EMAILS, messages.length)} in parallel`);

        const promises = batchSlice.map((message, index) => 
          processEmail(message, i + index, gmail)
        );

        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            batchPurchases.push(result.value);
            processedInBatch++;
            syncState.totalProcessed++;
          }
        }

        // Update progress
        syncState.purchases = [...syncState.purchases, ...batchPurchases];
        console.log(`📦 BATCH ${batchIndex}: Processed ${processedInBatch}/${messages.length} emails, found ${batchPurchases.length} purchases`);
      }

      // Check if there are more pages
      pageToken = response.data.nextPageToken;
      if (!pageToken) {
        console.log('📦 No more pages, sync complete');
        break;
      }

      batchIndex++;
    }

    syncState.isRunning = false;
    clearTimeout(syncTimeout);
    console.log(`✅ Background sync complete! Found ${syncState.purchases.length} total purchases`);

  } catch (error) {
    console.error('❌ Background sync error:', error);
    syncState.error = error instanceof Error ? error.message : 'Unknown error';
    syncState.isRunning = false;
    clearTimeout(syncTimeout);
  }
}

async function processEmail(message: any, emailIndex: number, gmail: any) {
  try {
    const emailPromise = gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'full'
    });

    const emailData = await withTimeout(emailPromise, TIMEOUT_PER_EMAIL, 'Email get');

    const fromHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';

    if (!fromHeader.includes('stockx.com')) {
      return null;
    }

    // Parse the email (use new parser; enable debug if EMAIL_PARSER_DEBUG=true)
    const debug = process.env.EMAIL_PARSER_DEBUG === 'true';
    const orderInfo = await parseGmailApiMessage(emailData.data, debug);
    
    if (!orderInfo || !orderInfo.order_number) {
      return null;
    }

    // Fallback tracking extraction: if shipped/delivered and no tracking yet, search shipping email
    if (!orderInfo.tracking_number && (orderInfo.shipping_status === 'Shipped' || orderInfo.shipping_status === 'Delivered')) {
      try {
        const fallbackTracking = await extractTrackingNumber(orderInfo.order_number, gmail);
        if (fallbackTracking) {
          orderInfo.tracking_number = fallbackTracking.toUpperCase();
          if (orderInfo.tracking_number.startsWith('1Z')) {
            orderInfo.carrier = 'UPS';
          } else if (/^\d{12}$/.test(orderInfo.tracking_number)) {
            orderInfo.carrier = 'FedEx';
          }
        }
      } catch (e) {
        console.error('TRACKING fallback failed:', e);
      }
    }

    // Convert to purchase format with proper nested structure
    const purchase = {
      id: `gmail_${message.id}`,
      orderNumber: orderInfo.order_number,
      product: {
        name: orderInfo.product_name || 'Unknown Product',
        brand: 'Unknown Brand',
        size: orderInfo.size || 'Unknown Size',
        image: orderInfo.product_image_url || '',
        bgColor: 'bg-gray-100', // Default background color
        textColor: 'text-gray-800' // Default text color
      },
      status: orderInfo.shipping_status || 'Ordered',
      statusColor: orderInfo.status_color || 'orange',
      purchaseDate: orderInfo.purchase_date || new Date().toISOString(),
      price: orderInfo.total_amount || orderInfo.purchase_price || 0,
      tracking: orderInfo.tracking_number || '',
      carrier: orderInfo.carrier || 'Unknown',
      verified: 'pending',
      verifiedColor: 'orange',
      emailId: message.id,
      subject: subjectHeader,
      fromEmail: fromHeader
    };

    return purchase;

  } catch (error) {
    console.error(`❌ Error processing email ${emailIndex}:`, error);
    return null;
  }
}

// Extract tracking number by locating shipping emails for the same order
async function extractTrackingNumber(orderNumber: string, gmail: any): Promise<string | null> {
  if (!orderNumber || !gmail) return null;
  try {
    const shippingQueries = [
      `from:noreply@stockx.com AND subject:"Order Verified & Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Order Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Xpress Order Shipped:" AND "${orderNumber}"`,
      `from:stockx.com AND subject:"shipped" AND "${orderNumber}"`
    ];

    for (const q of shippingQueries) {
      const resp = await gmail.users.messages.list({ userId: 'me', q, maxResults: 5 });
      if (resp.data.messages && resp.data.messages.length > 0) {
        const mail = await gmail.users.messages.get({ userId: 'me', id: resp.data.messages[0].id, format: 'full' });
        const t = extractTrackingFromShippingEmail(mail.data);
        if (t) return t.toUpperCase();
      }
    }
  } catch (err) {
    console.error('extractTrackingNumber error:', err);
  }
  return null;
}

// Parse a Gmail message for tracking numbers using robust patterns
function extractTrackingFromShippingEmail(email: any): string | null {
  try {
    let bodyContent = '';
    if (email.payload?.parts) {
      for (const part of email.payload.parts) {
        if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
          if (part.body?.data) {
            bodyContent += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        }
      }
    } else if (email.payload?.body?.data) {
      bodyContent = Buffer.from(email.payload.body.data, 'base64').toString('utf8');
    }

    const patterns = [
      { name: 'UPS', re: /(1Z[0-9A-Z]{16})/gi, valid: (s: string) => /^1Z[0-9A-Z]{16}$/i.test(s) },
      { name: 'FedEx12', re: /(?:tracking|number|track)[^0-9A-Z]*([0-9]{12})\b/gi, valid: (s: string) => /^\d{12}$/.test(s) },
      { name: 'USPS22', re: /(9[0-9]{21})\b/gi, valid: (s: string) => /^9\d{21}$/.test(s) },
      { name: 'USPS20', re: /(9[0-9]{19})\b/gi, valid: (s: string) => /^9\d{19}$/.test(s) }
    ];

    for (const p of patterns) {
      const matches = bodyContent.match(p.re) || [];
      for (const m of matches) {
        const clean = m.replace(/[<>]/g, '').trim();
        if (p.valid(clean)) return clean;
      }
    }
  } catch (e) {
    console.error('extractTrackingFromShippingEmail error:', e);
  }
  return null;
}

function getDefaultConfig() {
  return {
    emailCategories: {
      orderPlaced: {
        name: "Order Placed",
        status: "Ordered",
        statusColor: "orange",
        subjectPatterns: [
          "Order Confirmation:",
          "Xpress Order Confirmed:",
          "Order Confirmation"
        ]
      },
      orderShipped: {
        name: "Order Shipped",
        status: "Shipped", 
        statusColor: "blue",
        subjectPatterns: [
          "Order Verified & Shipped:",
          "Order Shipped:",
          "Xpress Order Shipped:",
          "Your order has shipped"
        ]
      },
      orderDelivered: {
        name: "Order Delivered",
        status: "Delivered",
        statusColor: "green", 
        subjectPatterns: [
          "Order Delivered:",
          "Xpress Ship Order Delivered:",
          "Order delivered",
          "Xpress Order Delivered:",
          "Your order has been delivered",
          "Package delivered"
        ]
      },
      orderDelayed: {
        name: "Order Delayed",
        status: "Delayed",
        statusColor: "yellow",
        subjectPatterns: [
          "Order delayed",
          "Encountered a Delay"
        ]
      },
      orderCanceled: {
        name: "Order Canceled/Refunded", 
        status: "Canceled",
        statusColor: "red",
        subjectPatterns: [
          "Order Canceled",
          "Refund Issued:",
          "Order Refunded"
        ]
      }
    }
  };
}
