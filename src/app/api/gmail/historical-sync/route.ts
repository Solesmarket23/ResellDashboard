import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict } from '../../../../lib/email/orderConfirmationParser';

// Temporary feature flag to fully disable historical sync backend
const ENABLE_HISTORICAL_SYNC = false;

export async function POST(request: NextRequest) {
  if (!ENABLE_HISTORICAL_SYNC) {
    return NextResponse.json({
      disabled: true,
      reason: 'Historical sync is temporarily disabled while we stabilize the feature.'
    }, { status: 503 });
  }
  try {
    console.log('🔄 Starting HISTORICAL Gmail sync for comprehensive purchase discovery...');

    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    // Set up OAuth2 client
    const url = new URL(request.url);
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

    // Comprehensive queries for historical data
    const historicalQueries = [
      // StockX queries
      'from:noreply@stockx.com subject:"Order"',
      'from:noreply@stockx.com subject:"Xpress"',
      'from:noreply@stockx.com subject:"Purchase"',
      'from:noreply@stockx.com subject:"Confirmed"',
      'from:noreply@stockx.com subject:"Shipped"',
      'from:noreply@stockx.com subject:"Delivered"',
      'from:noreply@stockx.com subject:"Verified"',
      
      // Broader StockX queries
      'from:stockx.com',
      'from:*.stockx.com',
      
      // Other potential marketplaces (if you use them)
      'from:goat.com subject:"Order"',
      'from:grailed.com subject:"Order"',
      'from:ebay.com subject:"Order"',
      'from:amazon.com subject:"Order"',
      
      // Generic purchase keywords
      'subject:"Order Confirmation"',
      'subject:"Purchase Confirmation"',
      'subject:"Order Shipped"',
      'subject:"Order Delivered"'
    ];

    const allPurchases: any[] = [];
    let totalProcessedEmails = 0;
    const maxTotalEmails = 5000; // Very high limit for historical sync
    const emailsPerQuery = 1000; // Maximum allowed by Gmail API

    console.log(`🔍 HISTORICAL SYNC: Processing ${historicalQueries.length} queries with up to ${emailsPerQuery} emails each`);

    for (const query of historicalQueries) {
      if (totalProcessedEmails >= maxTotalEmails) {
        console.log(`🛑 Reached maximum email processing limit (${maxTotalEmails}). Stopping.`);
        break;
      }

      try {
        console.log(`🔍 HISTORICAL QUERY: "${query}"`);
        
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: emailsPerQuery
        });

        const messages = response.data.messages || [];
        console.log(`🔍 HISTORICAL RESULT: Found ${messages.length} emails for "${query}"`);

        if (messages.length === 0) continue;

        // Process emails in smaller batches to avoid timeouts
        const batchSize = 50;
        for (let i = 0; i < messages.length; i += batchSize) {
          if (totalProcessedEmails >= maxTotalEmails) break;

          const batch = messages.slice(i, i + batchSize);
          console.log(`📧 Processing batch ${Math.floor(i/batchSize) + 1} (${batch.length} emails)`);

          // Process batch in parallel
          const batchPromises = batch.map(async (message) => {
            try {
              const emailData = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
              });

              const fromHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'From')?.value || '';
              const subjectHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
              
              // Only process if it looks like a purchase email
              if (isPurchaseEmail(fromHeader, subjectHeader)) {
                const orderInfo = parseGmailApiMessage(emailData.data, true);
                
                // Check if we got valid order information
                if (orderInfo && orderInfo.order_number && orderInfo.product_name) {
                  // Convert OrderInfo to purchase format
                  const purchase = convertOrderInfoToPurchase(orderInfo);
                  console.log(`✅ HISTORICAL: Found purchase - ${purchase.product?.name} - ${purchase.orderNumber}`);
                  return purchase;
                } else {
                  console.log(`❌ HISTORICAL: Failed to parse order info from email`);
                }
              }
              return null;
            } catch (error) {
              console.error(`❌ Error processing email ${message.id}:`, error);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          const validPurchases = batchResults.filter(p => p !== null);
          allPurchases.push(...validPurchases);
          
          totalProcessedEmails += batch.length;
          console.log(`📊 HISTORICAL: Processed ${totalProcessedEmails}/${maxTotalEmails} emails, found ${allPurchases.length} purchases so far`);

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        console.error(`❌ Error in historical query "${query}":`, error);
      }
    }

    console.log(`🎉 HISTORICAL SYNC COMPLETE: Found ${allPurchases.length} total purchases from ${totalProcessedEmails} emails`);

    // Consolidate duplicate orders
    const consolidatedPurchases = consolidateOrderEmails(allPurchases);
    console.log(`📊 HISTORICAL: After consolidation: ${consolidatedPurchases.length} unique purchases`);

    return NextResponse.json({
      success: true,
      purchases: consolidatedPurchases,
      totalFound: allPurchases.length,
      afterConsolidation: consolidatedPurchases.length,
      emailsProcessed: totalProcessedEmails,
      queriesProcessed: historicalQueries.length
    });

  } catch (error) {
    console.error('❌ Historical sync error:', error);
    return NextResponse.json({ 
      error: 'Historical sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper function to determine if an email looks like a purchase
function isPurchaseEmail(from: string, subject: string): boolean {
  const purchaseKeywords = [
    'order', 'purchase', 'confirmation', 'shipped', 'delivered', 
    'verified', 'xpress', 'stockx', 'goat', 'grailed'
  ];
  
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  
  return purchaseKeywords.some(keyword => 
    fromLower.includes(keyword) || subjectLower.includes(keyword)
  );
}

// Convert OrderInfo to purchase format
function convertOrderInfoToPurchase(orderInfo: any) {
  return {
    id: `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    orderNumber: orderInfo.order_number,
    product: {
      name: orderInfo.product_name,
      brand: orderInfo.product_variant || 'Unknown Brand',
      size: orderInfo.size,
      image: orderInfo.product_image_url || `https://picsum.photos/200/200?random=${orderInfo.order_number}`,
      bgColor: 'bg-gray-500',
      color: 'gray'
    },
    status: getStatusFromOrderInfo(orderInfo),
    tracking: orderInfo.tracking_number || '',
    market: orderInfo.merchant || 'StockX',
    price: orderInfo.total_amount ? `$${orderInfo.total_amount.toFixed(2)}` : '$0.00',
    originalPrice: orderInfo.total_amount ? `$${orderInfo.total_amount.toFixed(2)}` : '$0.00',
    purchaseDate: orderInfo.purchase_date || new Date().toISOString(),
    dateAdded: new Date().toISOString(),
    verified: 'pending',
    verifiedColor: 'orange',
    type: 'gmail',
    userId: 'current_user',
    totalAmount: orderInfo.total_amount || 0,
    productName: orderInfo.product_name,
    size: orderInfo.size,
    brand: orderInfo.product_variant,
    merchant: orderInfo.merchant,
    shippingStatus: getStatusFromOrderInfo(orderInfo),
    trackingNumber: orderInfo.tracking_number,
    createdAt: new Date().toISOString()
  };
}

// Get status from order info
function getStatusFromOrderInfo(orderInfo: any): string {
  const subject = orderInfo.email_subject?.toLowerCase() || '';
  
  if (subject.includes('delivered') || subject.includes('delivery')) {
    return 'Delivered';
  } else if (subject.includes('shipped') || subject.includes('shipping')) {
    return 'Shipped';
  } else if (subject.includes('confirmed') || subject.includes('confirmation')) {
    return 'Ordered';
  } else if (subject.includes('verified')) {
    return 'Verified';
  }
  
  return 'Ordered';
}

// Consolidate duplicate orders
function consolidateOrderEmails(purchases: any[]) {
  const orderMap = new Map();
  
  for (const purchase of purchases) {
    const orderNumber = purchase.orderNumber;
    if (!orderNumber) continue;
    
    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, purchase);
    } else {
      // Keep the most recent or most complete purchase
      const existing = orderMap.get(orderNumber);
      const existingDate = new Date(existing.purchaseDate || existing.createdAt || 0);
      const newDate = new Date(purchase.purchaseDate || purchase.createdAt || 0);
      
      // Prefer the newer purchase, or the one with more complete data
      if (newDate > existingDate || 
          (purchase.tracking && !existing.tracking) ||
          (purchase.status === 'Delivered' && existing.status !== 'Delivered')) {
        orderMap.set(orderNumber, purchase);
      }
    }
  }
  
  return Array.from(orderMap.values());
}

// Default configuration for email parsing
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
          "Xpress Order Delivered:",
          "Your order has been delivered"
        ]
      }
    }
  };
}
