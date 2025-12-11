import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict } from '../../../../lib/email/orderConfirmationParser';

// Temporary feature flag to fully disable historical sync backend
const ENABLE_HISTORICAL_SYNC = false;

export async function POST(request: NextRequest) {
  if (!ENABLE_HISTORICAL_SYNC) {
    return new Response('data: ' + JSON.stringify({
      type: 'error',
      message: 'Historical sync is temporarily disabled while we stabilize the feature.',
      error: 'Feature disabled'
    }) + '\n\n', {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  }
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = (data: any) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        console.log('🔄 Starting STREAMING historical sync...');
        
        sendUpdate({
          type: 'start',
          message: 'Starting historical sync...',
          progress: 0,
          totalEmails: 0,
          purchasesFound: 0
        });

        const cookieStore = cookies();
        const accessToken = cookieStore.get('gmail_access_token')?.value;
        const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

        if (!accessToken) {
          sendUpdate({
            type: 'error',
            message: 'Gmail not connected',
            error: 'Gmail not connected'
          });
          controller.close();
          return;
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
          
          // Other potential marketplaces
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
        let totalFoundEmails = 0;
        const maxTotalEmails = 5000;
        const emailsPerQuery = 1000;

        sendUpdate({
          type: 'progress',
          message: `Processing ${historicalQueries.length} queries...`,
          progress: 0,
          totalEmails: 0,
          purchasesFound: 0,
          currentQuery: 0,
          totalQueries: historicalQueries.length
        });

        for (let queryIndex = 0; queryIndex < historicalQueries.length; queryIndex++) {
          const query = historicalQueries[queryIndex];
          
          if (totalProcessedEmails >= maxTotalEmails) {
            console.log(`🛑 Reached maximum email processing limit (${maxTotalEmails}). Stopping.`);
            break;
          }

          try {
            // Calculate progress based on current query
            const queryProgress = ((queryIndex + 1) / historicalQueries.length) * 100;
            
            sendUpdate({
              type: 'query_start',
              message: `Searching: ${query}`,
              progress: queryProgress,
              totalEmails: totalFoundEmails,
              purchasesFound: allPurchases.length,
              currentQuery: queryIndex + 1,
              totalQueries: historicalQueries.length,
              currentQueryText: query
            });

            console.log(`🔍 HISTORICAL QUERY ${queryIndex + 1}/${historicalQueries.length}: "${query}"`);
            
            const response = await gmail.users.messages.list({
              userId: 'me',
              q: query,
              maxResults: emailsPerQuery
            });

            const messages = response.data.messages || [];
            totalFoundEmails += messages.length;
            
            sendUpdate({
              type: 'query_result',
              message: `Found ${messages.length} emails for this query`,
              progress: queryProgress,
              totalEmails: totalFoundEmails,
              purchasesFound: allPurchases.length,
              currentQuery: queryIndex + 1,
              totalQueries: historicalQueries.length,
              emailsInQuery: messages.length
            });

            console.log(`🔍 HISTORICAL RESULT: Found ${messages.length} emails for "${query}"`);

            if (messages.length === 0) {
              // Send update for empty query
              sendUpdate({
                type: 'query_empty',
                message: `No emails found for this query`,
                progress: queryProgress,
                totalEmails: totalFoundEmails,
                purchasesFound: allPurchases.length,
                currentQuery: queryIndex + 1,
                totalQueries: historicalQueries.length
              });
              continue;
            }

            // Process emails in smaller batches to avoid timeouts
            const batchSize = 25; // Smaller batches for better streaming
            const totalBatches = Math.ceil(messages.length / batchSize);
            
            for (let i = 0; i < messages.length; i += batchSize) {
              if (totalProcessedEmails >= maxTotalEmails) break;

              const batch = messages.slice(i, i + batchSize);
              const batchNumber = Math.floor(i/batchSize) + 1;
              
              // Calculate progress: query progress + batch progress within query
              const queryProgress = (queryIndex / historicalQueries.length) * 100;
              const batchProgress = (i / messages.length) * (100 / historicalQueries.length);
              const totalProgress = queryProgress + batchProgress;
              
              sendUpdate({
                type: 'batch_start',
                message: `Processing batch ${batchNumber}/${totalBatches} (${batch.length} emails)`,
                progress: Math.min(totalProgress, 100),
                totalEmails: totalFoundEmails,
                purchasesFound: allPurchases.length,
                currentQuery: queryIndex + 1,
                totalQueries: historicalQueries.length,
                currentBatch: batchNumber,
                totalBatches: totalBatches
              });

              console.log(`📧 Processing batch ${batchNumber}/${totalBatches} (${batch.length} emails)`);

              // Process batch in parallel
              const batchPromises = batch.map(async (message, messageIndex) => {
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
                    console.log(`🔍 HISTORICAL: Processing email - From: ${fromHeader}, Subject: ${subjectHeader}`);
                    
                    const orderInfo = parseGmailApiMessage(emailData.data, true); // Enable debug logging
                    console.log(`🔍 HISTORICAL: Parsed order info:`, {
                      order_number: orderInfo?.order_number,
                      product_name: orderInfo?.product_name,
                      merchant: orderInfo?.merchant,
                      total_amount: orderInfo?.total_amount
                    });
                    
                    // Check if we got valid order information
                    if (orderInfo && orderInfo.order_number && orderInfo.product_name) {
                      // Convert OrderInfo to purchase format
                      const purchase = convertOrderInfoToPurchase(orderInfo, getCurrentUserId());
                      console.log(`✅ HISTORICAL: Found purchase - ${purchase.product?.name} - ${purchase.orderNumber}`);
                      return purchase;
                    } else {
                      console.log(`❌ HISTORICAL: Failed to parse order info from email - order_number: ${orderInfo?.order_number}, product_name: ${orderInfo?.product_name}`);
                    }
                  } else {
                    console.log(`❌ HISTORICAL: Email filtered out - From: ${fromHeader}, Subject: ${subjectHeader}`);
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
              
              // Send live update with new purchases
              if (validPurchases.length > 0) {
                sendUpdate({
                  type: 'purchases_found',
                  message: `Found ${validPurchases.length} new purchases in this batch!`,
                  progress: Math.min(totalProgress, 100),
                  totalEmails: totalFoundEmails,
                  purchasesFound: allPurchases.length,
                  currentQuery: queryIndex + 1,
                  totalQueries: historicalQueries.length,
                  currentBatch: batchNumber,
                  totalBatches: totalBatches,
                  newPurchases: validPurchases,
                  allPurchases: allPurchases // Send all purchases so far
                });
              } else {
                sendUpdate({
                  type: 'batch_complete',
                  message: `Batch ${batchNumber}/${totalBatches} complete - no purchases found`,
                  progress: Math.min(totalProgress, 100),
                  totalEmails: totalFoundEmails,
                  purchasesFound: allPurchases.length,
                  currentQuery: queryIndex + 1,
                  totalQueries: historicalQueries.length,
                  currentBatch: batchNumber,
                  totalBatches: totalBatches
                });
              }

              console.log(`📊 HISTORICAL: Processed ${totalProcessedEmails}/${maxTotalEmails} emails, found ${allPurchases.length} purchases so far`);

              // Small delay between batches
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Send query completion update
            sendUpdate({
              type: 'query_complete',
              message: `Completed query ${queryIndex + 1}/${historicalQueries.length}`,
              progress: ((queryIndex + 1) / historicalQueries.length) * 100,
              totalEmails: totalFoundEmails,
              purchasesFound: allPurchases.length,
              currentQuery: queryIndex + 1,
              totalQueries: historicalQueries.length
            });

          } catch (error) {
            console.error(`❌ Error in historical query "${query}":`, error);
            const queryProgress = ((queryIndex + 1) / historicalQueries.length) * 100;
            sendUpdate({
              type: 'query_error',
              message: `Error processing query: ${query}`,
              progress: queryProgress,
              totalEmails: totalFoundEmails,
              purchasesFound: allPurchases.length,
              currentQuery: queryIndex + 1,
              totalQueries: historicalQueries.length,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        console.log(`🎉 HISTORICAL SYNC COMPLETE: Found ${allPurchases.length} total purchases from ${totalProcessedEmails} emails`);

        // Consolidate duplicate orders
        sendUpdate({
          type: 'consolidating',
          message: 'Consolidating duplicate orders...',
          progress: 95,
          totalEmails: totalFoundEmails,
          purchasesFound: allPurchases.length
        });

        const consolidatedPurchases = consolidateOrderEmails(allPurchases);
        console.log(`📊 HISTORICAL: After consolidation: ${consolidatedPurchases.length} unique purchases`);

        // Final update
        sendUpdate({
          type: 'complete',
          message: `Historical sync complete! Found ${consolidatedPurchases.length} unique purchases from ${totalProcessedEmails} emails`,
          progress: 100,
          totalEmails: totalFoundEmails,
          purchasesFound: consolidatedPurchases.length,
          finalPurchases: consolidatedPurchases,
          stats: {
            totalEmailsProcessed: totalProcessedEmails,
            totalEmailsFound: totalFoundEmails,
            purchasesBeforeConsolidation: allPurchases.length,
            purchasesAfterConsolidation: consolidatedPurchases.length,
            queriesProcessed: historicalQueries.length
          }
        });

        controller.close();

      } catch (error) {
        console.error('❌ Historical sync stream error:', error);
        sendUpdate({
          type: 'error',
          message: 'Historical sync failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
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

// Get current user ID
function getCurrentUserId(): string {
  // Try to get user ID from cookies or headers
  // This is a simplified version - in production you'd get this from auth
  return 'current_user';
}

// Helper function to extract brand from product name
function extractBrandFromProductName(productName: string): string {
  if (!productName) return 'Unknown';
  
  const brandPatterns = [
    { pattern: /^(Nike|Air Jordan|Jordan)\b/i, brand: 'Nike' },
    { pattern: /^(adidas|Adidas|Yeezy)\b/i, brand: 'adidas' },
    { pattern: /^(New Balance)\b/i, brand: 'New Balance' },
    { pattern: /^(Converse)\b/i, brand: 'Converse' },
    { pattern: /^(Vans)\b/i, brand: 'Vans' },
    { pattern: /^(Puma)\b/i, brand: 'Puma' },
    { pattern: /^(UGG)\b/i, brand: 'UGG' },
    { pattern: /^(ASICS|Asics)\b/i, brand: 'ASICS' },
    { pattern: /^(Reebok)\b/i, brand: 'Reebok' },
    { pattern: /^(Denim Tears)\b/i, brand: 'Denim Tears' },
    { pattern: /^(Off-White|Off White)\b/i, brand: 'Off-White' },
    { pattern: /^(Supreme)\b/i, brand: 'Supreme' },
    { pattern: /^(Fear of God|FOG)\b/i, brand: 'Fear of God' },
    { pattern: /^(Stone Island)\b/i, brand: 'Stone Island' }
  ];
  
  for (const { pattern, brand } of brandPatterns) {
    if (pattern.test(productName)) {
      return brand;
    }
  }
  
  // Fallback: take first word
  const firstWord = productName.split(' ')[0];
  return firstWord || 'Unknown';
}

// Convert OrderInfo to purchase format
function convertOrderInfoToPurchase(orderInfo: any, userId: string) {
  const brand = extractBrandFromProductName(orderInfo.product_name);
  
  return {
    id: `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    orderNumber: orderInfo.order_number,
    product: {
      name: orderInfo.product_name,
      brand: brand,
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
    userId: userId,
    totalAmount: orderInfo.total_amount || 0,
    productName: orderInfo.product_name,
    size: orderInfo.size,
    brand: brand,
    productBrand: brand,
    styleId: orderInfo.style_id || null,
    productUrl: orderInfo.product_url || null,
    merchant: orderInfo.merchant,
    shippingStatus: getStatusFromOrderInfo(orderInfo),
    trackingNumber: orderInfo.tracking_number,
    createdAt: new Date().toISOString()
  };
}

// Get status from order info - use the status from OrderInfo (already capitalized)
function getStatusFromOrderInfo(orderInfo: any): string {
  // Use the shipping_status from OrderInfo if available (already capitalized by parser)
  if (orderInfo.shipping_status) {
    return orderInfo.shipping_status; // Already capitalized: "Ordered", "Shipped", "Delivered", "Refunded"
  }
  
  // Fallback: parse from subject if status not available
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
