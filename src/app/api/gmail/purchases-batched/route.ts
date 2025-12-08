import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict, OrderInfo } from '../../../../lib/email/orderConfirmationParser';
import { consolidatePurchasesByOrderNumber } from '../../../../lib/utils/statusPriority';

// Batch configuration
const BATCH_SIZE = 100; // Process 100 emails per batch (increased from 50)
const MAX_BATCHES_PER_REQUEST = 1; // Max 1 batch per API call (100 emails total) - reduced for faster testing
const MAX_TOTAL_EMAILS = 20000; // Maximum total emails to process (20,000 for ~2 years of history)
const TIMEOUT_PER_EMAIL = 10000; // 10 seconds per email (increased to handle slow emails)
const PARALLEL_EMAILS = 4; // Increased from 2 to 4 for faster processing while still showing frequent updates

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
          "Order Confirmed:",
          "Xpress Order Confirmed:",
          "Order Confirmation:",
          "Order Confirmation",
          "Purchase Confirmed",
          "Item Arrived For Verification" // StockX sends this when order is placed
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
          "🎉 Xpress Ship Order Delivered:",
          "Xpress Ship Order Delivered",
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
  // Normalize purchase objects to have consistent status field
  const normalizedPurchases = purchases.map(purchase => {
    // Map shipping_status to status if needed
    if (purchase.shipping_status && !purchase.status) {
      purchase.status = purchase.shipping_status;
    }
    // Normalize status values
    if (purchase.status === 'refunded') {
      purchase.status = 'Refund Issued';
    } else if (purchase.status === 'delivered') {
      purchase.status = 'Delivered';
    } else if (purchase.status === 'shipped') {
      purchase.status = 'Shipped';
    } else if (purchase.status === 'ordered') {
      purchase.status = 'Ordered';
    }
    return purchase;
  });
  
  // Use the shared consolidation utility with priority system
  return consolidatePurchasesByOrderNumber(normalizedPurchases);
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
    const quick = url.searchParams.get('quick') === 'true';

    const startTime = Date.now();
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

    // Quick connection test for first batch to verify auth works (non-blocking)
    if (batchIndex === 0 && reset) {
      try {
        // Quick test query to verify connection - don't wait for full results
        const testPromise = gmail.users.messages.list({
          userId: 'me',
          q: 'from:noreply@stockx.com',
          maxResults: 1
        });
        // Don't await - let it run in background, just verify it starts
        testPromise.catch(() => {}); // Ignore errors, main query will handle them
        console.log('🔍 Quick connection test initiated');
      } catch (e) {
        // Ignore test errors
      }
    }

    // Build a rotating set of queries from config to cover confirmation, shipped, delivered etc.
    const queries = generateQueries(config);
    
    // CRITICAL: Split queries by date range to avoid Gmail API timeouts
    // Use narrower date ranges so Gmail API can return results faster
    // This ensures order confirmation emails and delivery emails are fetched together within each date range
    // Use specific queries for purchase confirmation, shipping, and delivery emails
    // Exclude sales-related emails at the Gmail query level for better performance
    const baseQuery = 'from:noreply@stockx.com (subject:"Order Confirmed" OR subject:"Xpress Order Confirmed" OR subject:"Order Delivered" OR subject:"Order Verified & Shipped") -subject:"Arrived At StockX" -subject:"Shipped To StockX" -subject:"Ship your"';
    
    // Replace all queries with date-based queries (most recent first)
    // Split into smaller date ranges to handle large volumes and avoid timeouts
    queries.length = 0; // Clear existing queries
    queries.push(
      `${baseQuery} newer_than:7d`,                    // Last 7 days
      `${baseQuery} older_than:7d newer_than:1m`,      // 1 week - 1 month
      `${baseQuery} older_than:1m newer_than:3m`,      // 1-3 months
      `${baseQuery} older_than:3m newer_than:6m`,      // 3-6 months
      `${baseQuery} older_than:6m newer_than:1y`,      // 6 months - 1 year
      `${baseQuery} older_than:1y newer_than:18m`,     // 1 year - 18 months
      `${baseQuery} older_than:18m newer_than:2y`,     // 18 months - 2 years
      `${baseQuery} older_than:2y`                     // 2+ years (for completeness)
    );

    const queryIndexParam = parseInt(url.searchParams.get('qIndex') || '0');
    const qIndex = Math.max(0, Math.min(queryIndexParam, queries.length - 1));
    // Removed timeFilter - search all emails, not just recent ones
    // const timeFilter = quick ? ' newer_than:30d' : '';
    const activeQuery = queries[qIndex].trim();
    console.log(`📦 BATCH ${batchIndex}: Searching with query [${qIndex + 1}/${queries.length}]: ${activeQuery.substring(0, 100)}...`);
    console.log(`📦 BATCH ${batchIndex}: Total queries available: ${queries.length}, Current query index: ${qIndex}`);

    // Get emails. Support limit parameter for chunked processing
    const isFirstBatch = batchIndex === 0 && reset;
    const limitParam = url.searchParams.get('limit');
    // If limit is specified, use it (for chunked processing), otherwise use default
    // Use smaller batch sizes to avoid timeouts - 50 emails per batch is a good balance
    const maxResults = limitParam ? Math.min(parseInt(limitParam), 50) : 50;
    // Add timeout to Gmail API call to prevent hanging
    // Gmail API returns messages sorted by internalDate descending (newest first) by default
    // This ensures we process today's emails first, then go backwards
    const gmailListPromise = gmail.users.messages.list({
      userId: 'me',
      q: activeQuery,
      maxResults,
      pageToken
      // Note: Gmail API doesn't support orderBy parameter, but defaults to newest first
      // Messages are returned sorted by internalDate descending (newest to oldest)
    });
    
    // Increase timeout for first few batches as they may take longer
    // Batch 0 (first batch): 45s, Batch 1: 90s (may need to fetch more emails), Others: 60s
    const timeoutDuration = (batchIndex === 0 && reset) ? 45000 : (batchIndex === 1 ? 90000 : 60000);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Gmail API timeout after ${timeoutDuration/1000} seconds`)), timeoutDuration)
    );
    
    const queryStartTime = Date.now();
    console.log(`⏱️ BATCH ${batchIndex}: Starting Gmail API query (timeout: ${timeoutDuration/1000}s)...`);
    
    const response = await Promise.race([gmailListPromise, timeoutPromise]) as any;
    
    const queryDuration = Date.now() - queryStartTime;
    console.log(`⏱️ BATCH ${batchIndex}: Gmail API query completed in ${queryDuration}ms`);

    const allMessages = response.data.messages || [];
    // Gmail API returns newest first, but let's ensure we preserve that order
    // Messages are already sorted by internalDate descending (newest to oldest)
    const totalFound = allMessages.length;
    
    console.log(`📦 BATCH ${batchIndex}: Found ${totalFound} total messages (limited to ${maxResults} max, newest first)`);

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

    // Process all messages from multiple batches
    const batchMessages = allMessages;
    
    console.log(`📦 BATCH ${batchIndex}: Processing ${batchMessages.length} emails (${isFirstBatch ? 1 : MAX_BATCHES_PER_REQUEST} batches of ${BATCH_SIZE} each)`);

    const batchPurchases: any[] = [];
    const filteredEmails: Array<{subject: string, reason: string, orderNumber?: string}> = [];
    let processedInBatch = 0;

    // Process emails in parallel batches for much better performance
    const processEmail = async (message: any, emailIndex: number) => {
      let subjectHeader = 'Unknown';
      try {
        // First, try to get just the subject with a quick metadata call (faster, less likely to timeout)
        try {
          const metadataPromise = gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From']
          });
          const metadata = await Promise.race([
            metadataPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Metadata timeout')), 2000))
          ]) as any;
          subjectHeader = metadata.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'Unknown';
        } catch (metaError) {
          // If metadata fetch fails, continue with Unknown subject
          console.log(`⚠️ BATCH ${batchIndex}: Could not fetch subject for email ${emailIndex + 1}`);
        }

        // Now fetch the full email
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
        // Update subject from full email if we got it
        const fullSubject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value;
        if (fullSubject) {
          subjectHeader = fullSubject;
        }
        
        // Only log every 5th email to reduce noise
        if (emailIndex % 5 === 0) {
          console.log(`📧 BATCH ${batchIndex}: Processing email ${emailIndex + 1}/${batchMessages.length} - ${subjectHeader}`);
        }
        
        const purchase = await parseEmailMessage(emailData.data, config, gmail, false); // Disable debug for performance
        
        // Check if it was filtered
        if (purchase && (purchase as any).filtered) {
          const filteredEntry = {
            subject: (purchase as any).subject,
            reason: (purchase as any).reason,
            orderNumber: (purchase as any).orderNumber
          };
          filteredEmails.push(filteredEntry);
          console.log(`🚫 BATCH ${batchIndex}: Filtered email: "${filteredEntry.subject}" - Reason: ${filteredEntry.reason}`);
          return { type: 'filtered', data: purchase };
        } else if (purchase) {
          console.log(`✅ BATCH ${batchIndex}: Parsed purchase: ${purchase.product.name} - ${purchase.orderNumber}`);
          return { type: 'purchase', data: purchase };
        } else {
          // Track filtered emails with unknown reason
          const filteredEntry = {
            subject: subjectHeader,
            reason: 'Unknown (parsing failed)'
          };
          filteredEmails.push(filteredEntry);
          console.log(`🚫 BATCH ${batchIndex}: Filtered email (parsing failed): "${filteredEntry.subject}"`);
          return { type: 'filtered', subject: subjectHeader };
        }
        
      } catch (error) {
        const isTimeout = error instanceof Error && error.message === 'Email timeout';
        console.error(`❌ BATCH ${batchIndex}: Error processing email ${emailIndex + 1} (${subjectHeader}):`, error);
        // Track error as filtered
        const errorEntry = {
          subject: subjectHeader,
          reason: isTimeout ? 'Timeout (email took too long to fetch)' : `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
        filteredEmails.push(errorEntry);
        console.log(`🚫 BATCH ${batchIndex}: Filtered email (${isTimeout ? 'timeout' : 'error'}): "${errorEntry.subject}" - ${errorEntry.reason}`);
        return null;
      }
    };

    // Process emails in parallel batches
    for (let i = 0; i < batchMessages.length; i += PARALLEL_EMAILS) {
      const batchSlice = batchMessages.slice(i, i + PARALLEL_EMAILS);
      console.log(`📧 BATCH ${batchIndex}: Processing emails ${i + 1}-${Math.min(i + PARALLEL_EMAILS, batchMessages.length)} in parallel`);
      
      const promises = batchSlice.map((message, index) => 
        processEmail(message, i + index)
      );
      
      const results = await Promise.all(promises);
      
      // Add successful purchases to batch
      results.forEach(result => {
        if (result && result.type === 'purchase') {
          batchPurchases.push(result.data);
        } else if (result && result.type === 'filtered') {
          console.log(`🔍 BATCH ${batchIndex}: Confirmed filtered result in forEach loop`);
        }
        processedInBatch++;
      });
      
      // Small delay between parallel batches to prevent overwhelming Gmail API
      if (i + PARALLEL_EMAILS < batchMessages.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Track consolidation details before consolidating
    const consolidationDetails: Array<{orderNumber: string, emails: Array<{subject: string, status: string}>}> = [];
    const orderGroups = new Map<string, any[]>();
    batchPurchases.forEach(p => {
      const orderNum = p.orderNumber;
      if (!orderGroups.has(orderNum)) {
        orderGroups.set(orderNum, []);
      }
      orderGroups.get(orderNum)!.push(p);
    });
    
    // Track which orders had multiple emails
    orderGroups.forEach((purchases, orderNumber) => {
      if (purchases.length > 1) {
        console.log(`🔄 BATCH ${batchIndex}: Order ${orderNumber} has ${purchases.length} emails:`, 
          purchases.map(p => `${p.status || p.shipping_status} (${p.subject?.substring(0, 50)})`));
        consolidationDetails.push({
          orderNumber,
          emails: purchases.map(p => ({
            subject: p.subject || p.email_subject || 'Unknown',
            status: p.status || p.shipping_status || 'Unknown'
          }))
        });
      }
    });
    
    // Consolidate purchases in this batch
    console.log(`📦 BATCH ${batchIndex}: Before consolidation: ${batchPurchases.length} purchases`);
    const consolidatedPurchases = consolidateOrderEmails(batchPurchases);
    console.log(`📦 BATCH ${batchIndex}: After consolidation: ${consolidatedPurchases.length} purchases`);
    console.log(`📦 BATCH ${batchIndex}: Consolidation details tracked: ${consolidationDetails.length} orders with multiple emails`);
    
    // Sort purchases by date (newest first) to ensure we prioritize recent purchases
    // Gmail API already returns messages newest first, but we sort here to be explicit
    consolidatedPurchases.sort((a: any, b: any) => {
      const dateA = new Date(a.emailDate || a.purchaseDate || a.createdAt || 0);
      const dateB = new Date(b.emailDate || b.purchaseDate || b.createdAt || 0);
      return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
    });
    
    const totalDuration = Date.now() - startTime;
    console.log(`📦 BATCH ${batchIndex}: Completed! Processed ${processedInBatch}/${batchMessages.length} emails, found ${consolidatedPurchases.length} purchases in ${totalDuration}ms (sorted newest first)`);

    // Calculate if there are more batches across pages/queries
    const nextPageToken = response.data.nextPageToken;
    // Backend doesn't track cumulative total across batches, so just check if more emails are available
    // Frontend will enforce MAX_TOTAL_EMAILS limit by tracking cumulative total
    const hasMorePages = !!nextPageToken; // More emails available in current query
    const hasMoreQueries = !nextPageToken && (qIndex + 1 < queries.length); // More queries to try
    const hasMore = hasMorePages || hasMoreQueries;
    
    console.log(`📦 BATCH ${batchIndex}: hasMorePages=${hasMorePages}, hasMoreQueries=${hasMoreQueries}, hasMore=${hasMore}, nextPageToken=${!!nextPageToken}, qIndex=${qIndex}/${queries.length - 1}`);

    const progress: BatchProgress = {
      batchIndex,
      totalBatches: hasMore ? batchIndex + 2 : batchIndex + 1, // simple estimate
      currentBatchSize: batchMessages.length,
      processedInBatch,
      totalProcessed: processedInBatch, // Emails processed in this batch (frontend tracks cumulative)
      totalFound: totalFound, // Emails found in this batch
      hasMore,
      nextPageToken,
      // extra metadata to let the client advance queries if needed
      qIndex,
      totalQueries: queries.length
    };

    // Log filtered emails before sending response
    const expectedFiltered = processedInBatch - consolidatedPurchases.length;
    console.log(`📊 BATCH ${batchIndex}: Processed ${processedInBatch} emails, found ${consolidatedPurchases.length} purchases`);
    console.log(`📊 BATCH ${batchIndex}: Expected filtered count: ${expectedFiltered} (${processedInBatch} - ${consolidatedPurchases.length})`);
    console.log(`📊 BATCH ${batchIndex}: Actual filteredEmails array length: ${filteredEmails.length}`);
    console.log(`📊 BATCH ${batchIndex}: filteredEmails array contents:`, JSON.stringify(filteredEmails, null, 2));
    
    if (expectedFiltered !== filteredEmails.length) {
      console.warn(`⚠️ BATCH ${batchIndex}: MISMATCH! Expected ${expectedFiltered} filtered but have ${filteredEmails.length} in array`);
      console.warn(`⚠️ This means ${expectedFiltered - filteredEmails.length} emails were filtered but not tracked`);
    }
    
    return NextResponse.json({
      purchases: consolidatedPurchases,
      progress,
      isComplete: !hasMore,
      debug: {
        batchIndex,
        totalMessages: totalFound,
        processedInBatch,
        foundPurchases: consolidatedPurchases.length,
        hasNextPage: !!response.data.nextPageToken,
        filteredSubjects: filteredEmails,  // Include filtered emails in response
        filteredCount: filteredEmails.length, // Also add count for easier debugging
        consolidationDetails // Include consolidation details
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
    // Get headers
    const headers = emailData.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Filter by marketplace - only process StockX emails
    if (!fromHeader.includes('stockx.com')) {
      return { filtered: true, reason: 'Not from StockX', subject: subjectHeader };
    }

    // Additional filtering for sales/non-purchase emails in subject/content
    const loweredSubject = subjectHeader.toLowerCase();
    const nonPurchaseSubjects = [
      'you sold',
      'sale price',
      'payout',
      'ship your',
      'shipping label',
      'ask was matched',
      'ask updated',
      'your bid',
      'bid expired',
      'bid updated',
      'your ask',
      'offer',
      'price drop',
      'place a new bid',
      'arrived at stockx',
      'shipped to stockx'
    ];
    
    for (const keyword of nonPurchaseSubjects) {
      if (loweredSubject.includes(keyword)) {
        console.log(`🚫 Filtering out non-purchase email: ${subjectHeader}`);
        return { filtered: true, reason: `Contains "${keyword}" (sales/marketing)`, subject: subjectHeader };
      }
    }

    // Use the imported parseGmailApiMessage function (disable debug for performance)
    const orderInfo = parseGmailApiMessage(emailData, false);

    // DISABLED: Tracking extraction - user will manually enter tracking numbers
    // Using "View Shipped Email" link instead for better accuracy
    // if (!orderInfo.tracking_number && (orderInfo.shipping_status === 'Shipped' || orderInfo.shipping_status === 'Delivered')) {
    //   try {
    //     const fallback = await extractTrackingNumber(orderInfo.order_number, gmail);
    //     if (fallback) {
    //       orderInfo.tracking_number = fallback.toUpperCase();
    //       if (orderInfo.tracking_number.startsWith('1Z')) {
    //         orderInfo.carrier = 'UPS';
    //       } else if (/^\d{12}$/.test(orderInfo.tracking_number)) {
    //         orderInfo.carrier = 'FedEx';
    //       }
    //     }
    //   } catch (e) {
    //     console.error('TRACKING fallback (batched) failed:', e);
    //   }
    // }
    // Set tracking to empty so UI shows "View Shipped Email" link
    orderInfo.tracking_number = null;
    orderInfo.carrier = null;
    // Validate order number to avoid false positives (e.g., "0" or missing)
    const isValidOrderNumber = !!(orderInfo && orderInfo.order_number && orderInfo.order_number !== '0' && (
      /^(\d{8})$/i.test(orderInfo.order_number) || // 8 digits (e.g., 77937890)
      /^(\d{8}-\d{8})$/i.test(orderInfo.order_number) || // 8-8 numeric (e.g., 12345678-87654321)
      /^(\d{2}-[A-Z0-9]+)$/i.test(orderInfo.order_number) // 2-ALPHANUM (e.g., 03-LAWT94ALGY)
    ));
    if (!isValidOrderNumber) {
      console.log(`⚠️ Filtering out email with invalid/missing order number: "${subjectHeader}" (order_number: "${orderInfo?.order_number || 'MISSING'}")`);
      return { 
        filtered: true, 
        reason: 'Invalid or missing order number', 
        subject: subjectHeader,
        orderNumber: orderInfo?.order_number || 'N/A'
      };
    }

    // Categorize the email based on subject
    const category = categorizeEmail(subjectHeader, config);
    
    // Extract actual brand from product name
    const brand = extractBrandFromProductName(orderInfo.product_name || '');
    const market = 'StockX';
    
    // Format pricing
    const price = `$${(orderInfo.total_amount || 0).toFixed(2)}`;
    
    // Use OrderInfo email_date if available, otherwise parse from dateHeader
    // OrderInfo.email_date comes from the parser and is already correctly extracted
    const emailDateStr = orderInfo.email_date || dateHeader;
    const emailDate = new Date(emailDateStr);
    
    // Format purchase date - CRITICAL: Only set for order confirmation emails
    // For delivery/shipped emails, leave it blank - consolidation will fill it in later
    const isOrderConfirmation = category.status === 'Ordered' && (
      subjectHeader.toLowerCase().includes('order confirmed') ||
      subjectHeader.toLowerCase().includes('order confirmation') ||
      subjectHeader.toLowerCase().includes('xpress order confirmed') ||
      subjectHeader.toLowerCase().includes('item arrived for verification')
    );
    
    let purchaseDate: string;
    if (isOrderConfirmation) {
      // Only set purchase date for order confirmation emails
      purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      console.log(`📅 ORDER CONFIRMATION EMAIL: ${subjectHeader} - Order: ${orderInfo.order_number} - Purchase Date: ${purchaseDate}`);
    } else {
      // For delivery/shipped emails, use a placeholder - consolidation will set the real date
      purchaseDate = 'TBD'; // Will be replaced during consolidation
      if (category.status === 'Delivered') {
        console.log(`📦 DELIVERY EMAIL: ${subjectHeader} - Order: ${orderInfo.order_number} - Delivery Date: ${emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (purchase date pending order confirmation)`);
      } else if (category.status === 'Shipped') {
        console.log(`🚚 SHIPPED EMAIL: ${subjectHeader} - Order: ${orderInfo.order_number} - Ship Date: ${emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (purchase date pending order confirmation)`);
      }
    }
    const dateAdded = emailDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    }) + '\\n' + emailDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });

    // Get product image
    const productImage = orderInfo.product_image_url || 'https://picsum.photos/200/200?random=' + orderInfo.order_number;

    console.log(`🔍 PARSED ORDER INFO:`, {
      order_number: orderInfo.order_number,
      product_name: orderInfo.product_name,
      extracted_brand: brand,
      size: orderInfo.size,
      total_amount: orderInfo.total_amount,
      tracking_number: orderInfo.tracking_number,
      carrier: orderInfo.carrier,
      shipping_status: orderInfo.shipping_status,
      subject: subjectHeader,
      email_date: orderInfo.email_date,
      email_id: emailData.id
    });

    // Return in the expected UI format
    // IMPORTANT: Use OrderInfo fields directly (like test parser does) for consolidation
    // Spread orderInfo to include all fields like email_date, email_subject, purchase_date, etc.
    return {
      id: orderInfo.order_number || `email-${emailData.id}`,
      product: {
        name: orderInfo.product_name || 'Unknown Product',
        brand,
        size: orderInfo.size || 'Unknown Size',
        image: productImage,
        bgColor: getBrandColor(brand)
      },
      orderNumber: orderInfo.order_number || 'No Order Number',
      order_number: orderInfo.order_number, // snake_case for consolidation
      status: category.status,
      shipping_status: orderInfo.shipping_status || category.status, // snake_case for consolidation
      statusColor: category.statusColor,
      priority: category.priority,
      tracking: '', // Empty tracking - UI will show "View Shipped Email" link
      market,
      price,
      originalPrice: `${price} + $0.00`,
      purchasePrice: orderInfo.purchase_price || 0,
      totalPayment: orderInfo.total_amount || 0,
      purchaseDate, // This will be overwritten by consolidation if order confirmation email is found
      dateAdded,
      verified: 'pending',
      verifiedColor: 'orange',
      emailId: emailData.id,
      subject: subjectHeader, // camelCase for UI
      email_subject: subjectHeader, // snake_case for consolidation (explicitly set)
      sender: fromHeader,
      emailDate: dateHeader, // camelCase for UI (raw date header string)
      // Use OrderInfo fields directly (like test parser) - these are already correctly set
      ...orderInfo, // Spread all OrderInfo fields including email_date, email_subject, purchase_date, etc.
      // Ensure createdAt is set for fallback
      createdAt: orderInfo.email_date ? new Date(orderInfo.email_date).toISOString() : emailDate.toISOString()
    };

  } catch (error) {
    console.error('Error parsing email:', error);
    return null;
  }
}

// Extract tracking number by locating shipping emails for the same order
async function extractTrackingNumber(orderNumber: string, gmail: any): Promise<string | null> {
  if (!orderNumber || !gmail) return null;
  try {
    const queries = [
      `from:noreply@stockx.com AND subject:"Order Verified & Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Order Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Xpress Order Shipped:" AND "${orderNumber}"`,
      `from:stockx.com AND subject:"shipped" AND "${orderNumber}"`
    ];
    for (const q of queries) {
      const resp = await gmail.users.messages.list({ userId: 'me', q, maxResults: 5 });
      if (resp.data.messages && resp.data.messages.length > 0) {
        const m = await gmail.users.messages.get({ userId: 'me', id: resp.data.messages[0].id, format: 'full' });
        const t = extractTrackingFromShippingEmail(m.data);
        if (t) return t.toUpperCase();
      }
    }
  } catch (err) {
    console.error('extractTrackingNumber (batched) error:', err);
  }
  return null;
}

// Parse a Gmail message for tracking numbers using robust patterns
function extractTrackingFromShippingEmail(email: any): string | null {
  try {
    let body = '';
    if (email.payload?.parts) {
      for (const part of email.payload.parts) {
        if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
          if (part.body?.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        }
      }
    } else if (email.payload?.body?.data) {
      body = Buffer.from(email.payload.body.data, 'base64').toString('utf8');
    }
    const patterns = [
      { name: 'UPS', re: /(1Z[0-9A-Z]{16})/gi, valid: (s: string) => /^1Z[0-9A-Z]{16}$/i.test(s) },
      { name: 'FedEx12', re: /(?:tracking|number|track)[^0-9A-Z]*([0-9]{12})\b/gi, valid: (s: string) => /^\d{12}$/.test(s) }
    ];
    for (const p of patterns) {
      const matches = body.match(p.re) || [];
      for (const m of matches) {
        const clean = m.replace(/[<>]/g, '').trim();
        if (p.valid(clean)) return clean;
      }
    }
  } catch (e) {
    console.error('extractTrackingFromShippingEmail (batched) error:', e);
  }
  return null;
}

// Categorize emails based on subject patterns
// IMPORTANT: Check order confirmation patterns FIRST to ensure they're not overridden by shipped/delivered patterns
function categorizeEmail(subject: string, config: any) {
  const normalizedSubject = subject.toLowerCase();
  
  // PRIORITY 1: Check for order confirmation patterns FIRST (before shipped/delivered)
  // This ensures order confirmation emails are correctly categorized even if they also mention shipping
  const orderConfirmationPatterns = [
    'order confirmed',
    'order confirmation',
    'xpress order confirmed',
    'item arrived for verification',
    'purchase confirmed'
  ];
  
  for (const pattern of orderConfirmationPatterns) {
    if (normalizedSubject.includes(pattern)) {
      console.log(`✅ Categorized as ORDERED (order confirmation): "${subject}"`);
      return {
        status: 'Ordered',
        statusColor: 'orange',
        priority: STATUS_PRIORITIES['Ordered'] || 1
      };
    }
  }
  
  // PRIORITY 2: Check other categories in config order
  for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
    // Skip orderPlaced category since we already checked it above
    if (categoryKey === 'orderPlaced') continue;
    
    for (const pattern of (category as any).subjectPatterns) {
      if (normalizedSubject.includes(pattern.toLowerCase())) {
        console.log(`✅ Categorized as ${(category as any).status}: "${subject}"`);
        return {
          status: (category as any).status,
          statusColor: (category as any).statusColor,
          priority: STATUS_PRIORITIES[(category as any).status] || 1
        };
      }
    }
  }
  
  // Fallback: default to Ordered
  console.log(`⚠️ No pattern matched for "${subject}" - defaulting to Ordered`);
  return {
    status: 'Ordered',
    statusColor: 'orange',
    priority: 1
  };
}

// Extract brand from product name
function extractBrandFromProductName(productName: string): string {
  if (!productName) return 'Unknown';
  
  const brandPatterns = [
    // Specific brand patterns
    { pattern: /^(Nike|Air Jordan|Jordan)\b/i, brand: 'Nike' },
    { pattern: /^(Adidas|Yeezy)\b/i, brand: 'Adidas' },
    { pattern: /^(New Balance)\b/i, brand: 'New Balance' },
    { pattern: /^(Converse)\b/i, brand: 'Converse' },
    { pattern: /^(Vans)\b/i, brand: 'Vans' },
    { pattern: /^(Puma)\b/i, brand: 'Puma' },
    { pattern: /^(UGG)\b/i, brand: 'UGG' },
    { pattern: /^(Denim Tears)\b/i, brand: 'Denim Tears' },
    { pattern: /^(Off-White|Off White)\b/i, brand: 'Off-White' },
    { pattern: /^(Supreme)\b/i, brand: 'Supreme' },
    { pattern: /^(Balenciaga)\b/i, brand: 'Balenciaga' },
    { pattern: /^(Louis Vuitton|LV)\b/i, brand: 'Louis Vuitton' },
    { pattern: /^(Gucci)\b/i, brand: 'Gucci' },
    { pattern: /^(Fear of God|FOG)\b/i, brand: 'Fear of God' },
    { pattern: /^(Stone Island)\b/i, brand: 'Stone Island' },
    { pattern: /^(Travis Scott)\b/i, brand: 'Travis Scott' },
    { pattern: /^(Kaws)\b/i, brand: 'Kaws' }
  ];
  
  // Check each pattern
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(productName)) {
      return brand;
    }
  }
  
  // Fallback: take first word if no brand matched
  const firstWord = productName.split(' ')[0];
  return firstWord || 'Unknown';
}

// Get brand color for UI
function getBrandColor(brand: string) {
  const brandColors: Record<string, string> = {
    'Nike': 'bg-black',
    'Adidas': 'bg-blue-600',
    'Jordan': 'bg-red-600',
    'New Balance': 'bg-gray-700',
    'UGG': 'bg-amber-700',
    'Denim Tears': 'bg-indigo-600',
    'Off-White': 'bg-gray-800',
    'Supreme': 'bg-red-700',
    'Balenciaga': 'bg-purple-600',
    'Fear of God': 'bg-gray-600',
    'Travis Scott': 'bg-amber-600'
  };
  
  return brandColors[brand] || 'bg-gray-600';
}