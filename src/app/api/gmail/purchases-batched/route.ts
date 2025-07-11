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

    // Use primary StockX query for purchases only - ONLY Order Confirmed emails for size info
    const primaryQuery = 'from:noreply@stockx.com (subject:"Order Confirmed" OR subject:"Xpress Order Confirmed") -subject:"You Sold" -subject:"Sale" -subject:"Payout" -subject:"Ship your"';
    
    console.log(`📦 BATCH ${batchIndex}: Searching with query: ${primaryQuery}`);

    // Get emails for this batch
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: primaryQuery,
      maxResults: BATCH_SIZE, // Just get one batch worth of emails
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

    // Process all messages from this batch (no slicing needed since we only requested BATCH_SIZE)
    const batchMessages = allMessages;
    
    console.log(`📦 BATCH ${batchIndex}: Processing ${batchMessages.length} emails`);

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
    const hasMore = !!response.data.nextPageToken;

    const progress: BatchProgress = {
      batchIndex,
      totalBatches: hasMore ? batchIndex + 2 : batchIndex + 1, // Estimate: current + 1, or current + 1 more if hasMore
      currentBatchSize: batchMessages.length,
      processedInBatch,
      totalProcessed: (batchIndex * BATCH_SIZE) + processedInBatch,
      totalFound: (batchIndex * BATCH_SIZE) + totalFound, // Cumulative estimate
      hasMore,
      nextPageToken: response.data.nextPageToken
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

    // Additional filtering for sales emails in subject/content
    if (subjectHeader.toLowerCase().includes('you sold') ||
        subjectHeader.toLowerCase().includes('sale price') ||
        subjectHeader.toLowerCase().includes('payout') ||
        subjectHeader.toLowerCase().includes('ship your') ||
        subjectHeader.toLowerCase().includes('ask was matched') ||
        subjectHeader.toLowerCase().includes('shipping label')) {
      console.log(`🚫 Filtering out sales email: ${subjectHeader}`);
      return null;
    }

    // Use the imported parseGmailApiMessage function
    const orderInfo = parseGmailApiMessage(emailData);
    if (!orderInfo || !orderInfo.order_number) {
      return null;
    }

    // Categorize the email based on subject
    const category = categorizeEmail(subjectHeader, config);
    
    // Extract actual brand from product name
    const brand = extractBrandFromProductName(orderInfo.product_name || '');
    const market = 'StockX';
    
    // Format pricing
    const price = `$${(orderInfo.total_amount || 0).toFixed(2)}`;
    
    // Format dates
    const emailDate = new Date(dateHeader);
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
      subject: subjectHeader,
      email_id: emailData.id
    });

    // Return in the expected UI format
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
      status: category.status,
      statusColor: category.statusColor,
      priority: category.priority,
      tracking: 'No tracking',
      market,
      price,
      originalPrice: `${price} + $0.00`,
      purchasePrice: orderInfo.purchase_price || 0,
      totalPayment: orderInfo.total_amount || 0,
      purchaseDate,
      dateAdded,
      verified: 'pending',
      verifiedColor: 'orange',
      emailId: emailData.id,
      subject: subjectHeader,
      sender: fromHeader,
      emailDate: dateHeader
    };

  } catch (error) {
    console.error('Error parsing email:', error);
    return null;
  }
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