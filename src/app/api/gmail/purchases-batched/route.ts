import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict, OrderInfo } from '../../../../lib/email/orderConfirmationParser';
import { consolidatePurchasesByOrderNumber } from '../../../../lib/utils/statusPriority';

// Batch configuration
const BATCH_SIZE = 100; // Process 100 emails per batch (increased from 50)
const MAX_BATCHES_PER_REQUEST = 1; // Max 1 batch per API call (100 emails total) - reduced for faster testing
const MAX_TOTAL_EMAILS = 10000; // Maximum total emails to process (changed from 100 to 10,000 for 1 month history)
const TIMEOUT_PER_EMAIL = 6000; // 6 seconds per email to reduce timeouts
const PARALLEL_EMAILS = 2; // Reduced from 6 to 2 for more frequent updates - user sees purchases appear faster

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
          "Purchase Confirmed"
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

    // Build a rotating set of queries from config to cover confirmation, shipped, delivered etc.
    const queries = generateQueries(config);
    // Prepend a broader fallback covering all StockX purchases but excluding sales/payouts
    const fallbackQuery = '(from:noreply@stockx.com OR from:stockx.com) -subject:"You Sold" -subject:"Sale" -subject:"Payout" -subject:"Ship your" -subject:"Bid" -subject:"Ask was matched" -subject:"Offer" -subject:"expires"';
    if (!queries.includes(fallbackQuery)) {
      queries.unshift(fallbackQuery);
    }

    const queryIndexParam = parseInt(url.searchParams.get('qIndex') || '0');
    const qIndex = Math.max(0, Math.min(queryIndexParam, queries.length - 1));
    // Removed timeFilter - search all emails, not just recent ones
    // const timeFilter = quick ? ' newer_than:30d' : '';
    const activeQuery = queries[qIndex].trim();
    console.log(`📦 BATCH ${batchIndex}: Searching with query [${qIndex + 1}/${queries.length}]: ${activeQuery}`);

    // Get emails. Support limit parameter for chunked processing
    const isFirstBatch = batchIndex === 0 && reset;
    const limitParam = url.searchParams.get('limit');
    // If limit is specified, use it (for chunked processing), otherwise use default
    const maxResults = limitParam ? Math.min(parseInt(limitParam), BATCH_SIZE) : Math.min(100, BATCH_SIZE);
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
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Gmail API timeout after 30 seconds')), 30000)
    );
    
    const response = await Promise.race([gmailListPromise, timeoutPromise]) as any;

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
    let processedInBatch = 0;

    // Process emails in parallel batches for much better performance
    const processEmail = async (message: any, emailIndex: number) => {
      try {
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
        
        // Only log every 5th email to reduce noise
        if (emailIndex % 5 === 0) {
          console.log(`📧 BATCH ${batchIndex}: Processing email ${emailIndex + 1}/${batchMessages.length} - ${subjectHeader}`);
        }
        
        const purchase = await parseEmailMessage(emailData.data, config, gmail, false); // Disable debug for performance
        if (purchase) {
          console.log(`✅ BATCH ${batchIndex}: Parsed purchase: ${purchase.product.name} - ${purchase.orderNumber}`);
          return purchase;
        } else {
          return null;
        }
        
      } catch (error) {
        console.error(`❌ BATCH ${batchIndex}: Error processing email ${emailIndex + 1}:`, error);
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
      results.forEach(purchase => {
        if (purchase) {
          batchPurchases.push(purchase);
        }
        processedInBatch++;
      });
      
      // Small delay between parallel batches to prevent overwhelming Gmail API
      if (i + PARALLEL_EMAILS < batchMessages.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Consolidate purchases in this batch
    const consolidatedPurchases = consolidateOrderEmails(batchPurchases);
    
    // Sort purchases by date (newest first) to ensure we prioritize recent purchases
    // Gmail API already returns messages newest first, but we sort here to be explicit
    consolidatedPurchases.sort((a: any, b: any) => {
      const dateA = new Date(a.emailDate || a.purchaseDate || a.createdAt || 0);
      const dateB = new Date(b.emailDate || b.purchaseDate || b.createdAt || 0);
      return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
    });
    
    console.log(`📦 BATCH ${batchIndex}: Completed! Processed ${processedInBatch}/${batchMessages.length} emails, found ${consolidatedPurchases.length} purchases (sorted newest first)`);

    // Calculate if there are more batches across pages/queries
    const nextPageToken = response.data.nextPageToken;
    // Stop after processing 100 emails total
    const totalProcessedSoFar = (batchIndex * BATCH_SIZE * MAX_BATCHES_PER_REQUEST) + processedInBatch;
    const hasMorePages = !!nextPageToken && totalProcessedSoFar < MAX_TOTAL_EMAILS;
    const hasMoreQueries = !nextPageToken && (qIndex + 1 < queries.length) && totalProcessedSoFar < MAX_TOTAL_EMAILS;
    const hasMore = (hasMorePages || hasMoreQueries) && totalProcessedSoFar < MAX_TOTAL_EMAILS;

    const progress: BatchProgress = {
      batchIndex,
      totalBatches: hasMore ? batchIndex + 2 : batchIndex + 1, // simple estimate
      currentBatchSize: batchMessages.length,
      processedInBatch,
      totalProcessed: (batchIndex * BATCH_SIZE * MAX_BATCHES_PER_REQUEST) + processedInBatch,
      totalFound: (batchIndex * BATCH_SIZE * MAX_BATCHES_PER_REQUEST) + totalFound, // Cumulative estimate
      hasMore,
      nextPageToken,
      // extra metadata to let the client advance queries if needed
      qIndex,
      totalQueries: queries.length
    };

    return NextResponse.json({
      purchases: consolidatedPurchases,
      progress,
      isComplete: !hasMore,
      debug: {
        batchIndex,
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
    // Get headers
    const headers = emailData.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Filter by marketplace - only process StockX emails
    if (!fromHeader.includes('stockx.com')) {
      return null;
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
    if (nonPurchaseSubjects.some(k => loweredSubject.includes(k))) {
      console.log(`🚫 Filtering out non-purchase email: ${subjectHeader}`);
      return null;
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
      /^(\d{8}-\d{8})$/i.test(orderInfo.order_number) || // 8-8 numeric
      /^(\d{2}-[A-Z0-9]+)$/i.test(orderInfo.order_number) // 2-ALPHANUM
    ));
    if (!isValidOrderNumber) {
      return null;
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
    
    // Format purchase date - this will be overwritten by consolidation if order confirmation email is found
    const purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
function categorizeEmail(subject: string, config: any) {
  for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
    for (const pattern of (category as any).subjectPatterns) {
      if (subject.toLowerCase().includes(pattern.toLowerCase())) {
        return {
          status: (category as any).status,
          statusColor: (category as any).statusColor,
          priority: STATUS_PRIORITIES[(category as any).status] || 1
        };
      }
    }
  }
  
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