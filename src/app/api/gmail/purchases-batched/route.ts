import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict, OrderInfo } from '../../../../lib/email/orderConfirmationParser';

// Batch configuration
const BATCH_SIZE = 15; // Process 15 emails per batch
const MAX_BATCHES_PER_REQUEST = 3; // Max 3 batches per API call (45 emails)
const TIMEOUT_PER_EMAIL = 8000; // 8 seconds per email

interface BatchProgress {
  batchIndex: number;
  totalBatches: number;
  currentBatchSize: number;
  processedInBatch: number;
  totalProcessed: number;
  totalFound: number;
  hasMore: boolean;
  nextPageToken?: string;
}

// Default configuration
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
          "Order canceled",
          "Refund Issued:"
        ]
      }
    },
    marketplaces: {
      stockx: {
        name: "StockX",
        emailDomain: "stockx.com",
        enabled: true,
        available: true
      }
    }
  };
}

// Generate Gmail search queries
function generateQueries(config: any) {
  const queries = [];
  const enabledMarketplaces = Object.entries(config.marketplaces)
    .filter(([key, marketplace]) => (marketplace as any).enabled && (marketplace as any).available)
    .map(([key, marketplace]) => ({ key, ...(marketplace as any) }));

  for (const marketplace of enabledMarketplaces) {
    const baseQuery = `from:noreply@${marketplace.emailDomain}`;
    
    for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
      const subjectPatterns = (category as any).subjectPatterns;
      if (subjectPatterns && subjectPatterns.length > 0) {
        for (const pattern of subjectPatterns) {
          queries.push(`${baseQuery} subject:"${pattern}"`);
        }
      }
    }
  }
  
  return queries;
}

// Priority system for consolidating emails
const STATUS_PRIORITIES = {
  'Delivered': 5,
  'Shipped': 4,
  'Delayed': 3,
  'Ordered': 2,
  'Canceled': 1
};

function consolidateOrderEmails(purchases: any[]) {
  const orderMap = new Map();
  
  purchases.forEach((purchase) => {
    const orderNumber = purchase.orderNumber;
    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, []);
    }
    orderMap.get(orderNumber).push(purchase);
  });
  
  const consolidatedPurchases = [];
  for (const [orderNumber, orderEmails] of orderMap.entries()) {
    if (orderEmails.length === 1) {
      consolidatedPurchases.push(orderEmails[0]);
    } else {
      const sortedEmails = orderEmails.sort((a, b) => {
        const priorityA = STATUS_PRIORITIES[a.status] || 1;
        const priorityB = STATUS_PRIORITIES[b.status] || 1;
        return priorityB - priorityA;
      });
      
      const primaryEmail = sortedEmails[0];
      primaryEmail.consolidatedFrom = sortedEmails.length;
      primaryEmail.allStatuses = sortedEmails.map(e => e.status);
      consolidatedPurchases.push(primaryEmail);
    }
  }
  
  return consolidatedPurchases;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    // Get parameters
    const url = new URL(request.url);
    const batchIndex = parseInt(url.searchParams.get('batch') || '0');
    const pageToken = url.searchParams.get('pageToken') || undefined;
    const reset = url.searchParams.get('reset') === 'true';

    console.log(`📦 BATCH ${batchIndex}: Starting batch processing...`);

    // Set up OAuth2 client
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const config = getDefaultConfig();

    // Use primary StockX query for batching
    const primaryQuery = 'from:noreply@stockx.com';
    
    console.log(`📦 BATCH ${batchIndex}: Searching with query: ${primaryQuery}`);

    // Get emails for this batch
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: primaryQuery,
      maxResults: BATCH_SIZE * MAX_BATCHES_PER_REQUEST, // Get enough for multiple batches
      pageToken: pageToken
    });

    const allMessages = response.data.messages || [];
    const totalFound = allMessages.length;
    
    console.log(`📦 BATCH ${batchIndex}: Found ${totalFound} total messages`);

    if (totalFound === 0) {
      return NextResponse.json({
        purchases: [],
        progress: {
          batchIndex,
          totalBatches: 1,
          currentBatchSize: 0,
          processedInBatch: 0,
          totalProcessed: 0,
          totalFound: 0,
          hasMore: false
        },
        isComplete: true
      });
    }

    // Calculate batch boundaries
    const startIndex = 0; // Always start from 0 since we're using pagination
    const endIndex = Math.min(BATCH_SIZE, totalFound);
    const batchMessages = allMessages.slice(startIndex, endIndex);
    
    console.log(`📦 BATCH ${batchIndex}: Processing emails ${startIndex} to ${endIndex - 1}`);

    const batchPurchases: any[] = [];
    let processedInBatch = 0;

    // Process each email in the batch with timeout protection
    for (const message of batchMessages) {
      try {
        console.log(`📧 BATCH ${batchIndex}: Processing email ${processedInBatch + 1}/${batchMessages.length}`);
        
        const emailPromise = gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        // Add timeout protection per email
        const emailData = await Promise.race([
          emailPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Email timeout')), TIMEOUT_PER_EMAIL)
          )
        ]) as any;
        
        const fromHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'From')?.value || '';
        const subjectHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
        
        console.log(`📧 BATCH ${batchIndex}: Email from="${fromHeader}", subject="${subjectHeader}"`);
        
        const purchase = await parseEmailMessage(emailData.data, config, gmail);
        if (purchase) {
          console.log(`✅ BATCH ${batchIndex}: Parsed purchase: ${purchase.product.name} - ${purchase.orderNumber}`);
          batchPurchases.push(purchase);
        } else {
          console.log(`❌ BATCH ${batchIndex}: Email filtered out or failed to parse`);
        }
        
        processedInBatch++;
        
        // Small delay to prevent overwhelming Gmail API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ BATCH ${batchIndex}: Error processing email:`, error);
        processedInBatch++;
        continue; // Continue with next email
      }
    }

    // Consolidate purchases in this batch
    const consolidatedPurchases = consolidateOrderEmails(batchPurchases);
    
    console.log(`📦 BATCH ${batchIndex}: Completed! Processed ${processedInBatch}/${batchMessages.length} emails, found ${consolidatedPurchases.length} purchases`);

    // Calculate if there are more batches
    const hasMoreInPage = endIndex < totalFound;
    const hasNextPage = !!response.data.nextPageToken;
    const hasMore = hasMoreInPage || hasNextPage;

    const progress: BatchProgress = {
      batchIndex,
      totalBatches: Math.ceil(totalFound / BATCH_SIZE),
      currentBatchSize: batchMessages.length,
      processedInBatch,
      totalProcessed: (batchIndex * BATCH_SIZE) + processedInBatch,
      totalFound,
      hasMore,
      nextPageToken: response.data.nextPageToken
    };

    return NextResponse.json({
      purchases: consolidatedPurchases,
      progress,
      isComplete: !hasMore,
      debug: {
        batchIndex,
        startIndex,
        endIndex,
        totalMessages: totalFound,
        processedInBatch,
        foundPurchases: consolidatedPurchases.length,
        hasNextPage: !!response.data.nextPageToken
      }
    });

  } catch (error) {
    console.error('❌ Batch processing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process email batch',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Custom email parsing function for batch processing
async function parseEmailMessage(emailData: any, config: any, gmail: any) {
  try {
    // Use the imported parseGmailApiMessage function
    const orderInfo = await parseGmailApiMessage(emailData, config, gmail);
    if (orderInfo) {
      return orderInfoToDict(orderInfo);
    }

    return null;
  } catch (error) {
    console.error('Error parsing email:', error);
    return null;
  }
}