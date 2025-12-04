import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict, OrderInfo } from '../../../../lib/email/orderConfirmationParser';
import { STATUS_PRIORITIES, consolidatePurchasesByOrderNumber } from '../../../../lib/utils/statusPriority';

// Default configuration if none is provided
function getDefaultConfig() {
  return {
    emailCategories: {
      orderPlaced: {
        name: "Order Placed",
        status: "Ordered",
        statusColor: "orange",
        subjectPatterns: [
          "Order Confirmed:",        // StockX format with colon
          "Order Confirmation:",     // StockX format with colon
          "Xpress Order Confirmed:", // StockX Xpress format with colon
          "Order Confirmed",         // Fallback without colon
          "Order Confirmation",      // Fallback without colon
          "Xpress Order",            // Fallback partial match
          "Order Placed",
          "Your Order"
        ]
      },
      orderShipped: {
        name: "Order Shipped",
        status: "Shipped", 
        statusColor: "blue",
        subjectPatterns: [
          "Order Verified & Shipped:", // StockX format with colon
          "Order Shipped:",            // StockX format with colon
          "Xpress Order Shipped:",     // StockX Xpress format with colon
          "Order Verified & Shipped",  // Fallback without colon
          "Order Shipped",             // Fallback without colon
          "Order Verified",
          "Shipped",
          "Your order has shipped",
          "Package shipped"
        ]
      },
      orderDelivered: {
        name: "Order Delivered",
        status: "Delivered",
        statusColor: "green", 
        subjectPatterns: [
          "Order Delivered:",              // StockX format with colon
          "Xpress Ship Order Delivered:",  // StockX Xpress format with colon
          "Order Delivered",               // Fallback without colon
          "Delivered",
          "Package delivered",
          "Your order has been delivered"
        ]
      },
      orderDelayed: {
        name: "Order Delayed",
        status: "Delayed",
        statusColor: "yellow",
        subjectPatterns: [
          "Encountered a Delay",     // StockX exact format
          "Order Delayed:",
          "Order delayed",
          "Delay"
        ]
      },
      orderCanceled: {
        name: "Order Canceled/Refunded", 
        status: "Canceled",
        statusColor: "red",
        subjectPatterns: [
          "Refund Issued:",          // StockX format with colon
          "Order Canceled:",
          "Order canceled",
          "Refund Issued"
        ]
      }
    },
    marketplaces: {
      stockx: {
        name: "StockX",
        emailDomain: "stockx.com",
        senderEmails: [
          "noreply@stockx.com",
          "orders@stockx.com",
          "support@stockx.com"
        ],
        enabled: true,
        available: true
      },
      goat: {
        name: "GOAT",
        emailDomain: "goat.com", 
        enabled: false,
        available: false,
        comingSoon: true
      },
      alias: {
        name: "Alias",
        emailDomain: "alias.com",
        enabled: false,
        available: false,
        comingSoon: true
      },
      ebay: {
        name: "eBay", 
        emailDomain: "ebay.com",
        enabled: false,
        available: false,
        comingSoon: true
      }
    }
  };
}

// Generate Gmail search queries based on configuration
function generateQueries(config: any) {
  const queries = [];
  
  // Get enabled and available marketplaces
  const enabledMarketplaces = Object.entries(config.marketplaces)
    .filter(([_, marketplace]: [string, any]) => marketplace.enabled && marketplace.available);

  // Generate queries for each enabled marketplace
  for (const [marketplaceKey, marketplace] of enabledMarketplaces) {
    const mp = marketplace as any;
    
    // Generate sender email queries if marketplace has sender emails
    if (mp.senderEmails && mp.senderEmails.length > 0) {
      for (const senderEmail of mp.senderEmails) {
        // CRITICAL FIX FOR 100% ACCURACY:
        // Use BROAD queries to capture ALL emails from the sender
        // Then filter programmatically to avoid missing any purchase emails
        // This ensures we don't miss emails with non-standard subject lines
          queries.push(`from:${senderEmail}`);
        
        // Also add domain-level query as backup
        if (mp.emailDomain) {
          queries.push(`from:@${mp.emailDomain}`);
        }
      }
    } else {
      // Fallback for marketplaces without specific sender emails
      // Use broad domain-based filtering
      if (mp.emailDomain) {
        queries.push(`from:@${mp.emailDomain}`);
      }
    }
  }

  // Simplified and more inclusive StockX purchase queries
  // These are broader and should catch more purchase-related emails
  
  // Primary StockX purchase queries (exclude ALL sales-related emails)
  queries.push('from:noreply@stockx.com -subject:"You Sold" -subject:"Sale" -subject:"Payout" -subject:"Ask was matched" -subject:"Ship your" -subject:"Reminder" -subject:"Time to Ship" -subject:"Ship Your Item" -subject:"Shipped To StockX"');
  queries.push('from:stockx.com -subject:"You Sold" -subject:"Sale" -subject:"Payout" -subject:"Ask was matched" -subject:"Ship your" -subject:"Reminder" -subject:"Time to Ship" -subject:"Ship Your Item" -subject:"Shipped To StockX"');
  
  // Purchase-specific subject patterns (these are what StockX sends for purchases)
  queries.push('from:noreply@stockx.com subject:"Order Confirmation"');
  queries.push('from:noreply@stockx.com subject:"Order Verified"');
  queries.push('from:noreply@stockx.com subject:"Order Shipped"');
  queries.push('from:noreply@stockx.com subject:"Order Delivered"');
  queries.push('from:noreply@stockx.com subject:"Xpress Order"');
  queries.push('from:noreply@stockx.com subject:"Your order"');
  queries.push('from:noreply@stockx.com subject:"Package"');
  
  // Additional StockX email patterns
  queries.push('from:noreply@stockx.com subject:"Your StockX"');
  queries.push('from:noreply@stockx.com subject:"StockX Order"');
  queries.push('from:noreply@stockx.com subject:"Order Status"');
  queries.push('from:noreply@stockx.com subject:"Order Update"');
  
  // Fallback: Very broad StockX query (exclude ALL sales emails)
  queries.push('from:noreply@stockx.com -subject:"You Sold" -subject:"Sale" -subject:"Payout" -subject:"Ask was matched" -subject:"Ship your" -subject:"Reminder" -subject:"Time to Ship" -subject:"Ship Your Item" -subject:"Shipped To StockX" -subject:"Your Sale" -subject:"Payout is Ready"');
  
  // Add fallback queries for subject patterns
  const fallbackQueries = [];
  
  // If no marketplace-specific queries were generated, create fallback queries
  if (queries.length <= 3) { // Only the StockX queries above
    const subjectPatterns = [];
    for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
      const cat = category as any;
      subjectPatterns.push(...cat.subjectPatterns);
    }
    
    if (subjectPatterns.length > 0) {
      for (const pattern of subjectPatterns) {
        fallbackQueries.push(`subject:"${pattern}"`);
      }
    }
  }
  
  // Add fallback queries to main queries array
  queries.push(...fallbackQueries);
  
  return queries;
}


// Determine email category and status based on subject line
function categorizeEmail(subject: string, config: any) {
  console.log(`🎯 CATEGORIZATION DEBUG: Processing subject "${subject}"`);
  
  // Hard subject mapping per spec
  if (/(xpress\s*order\s*confirmed:|order\s*confirmed:|order\s*confirmation:)/i.test(subject)) {
    return { status: 'Ordered', statusColor: 'orange', priority: STATUS_PRIORITIES['Ordered'] };
  }
  if (/encountered\s+a\s+delay/i.test(subject)) {
    return { status: 'Delayed', statusColor: 'yellow', priority: STATUS_PRIORITIES['Delayed'] };
  }
  if (/(order\s*verified\s*&\s*shipped:|order\s*shipped:|xpress\s*order\s*shipped:)/i.test(subject)) {
    return { status: 'Shipped', statusColor: 'blue', priority: STATUS_PRIORITIES['Shipped'] };
  }
  if (/refund\s+issued:/i.test(subject)) {
    return { status: 'Refund Issued', statusColor: 'red', priority: STATUS_PRIORITIES['Refund Issued'] };
  }
  if (/(xpress\s*ship\s*order\s*delivered:|order\s*delivered:)/i.test(subject)) {
    return { status: 'Delivered', statusColor: 'green', priority: STATUS_PRIORITIES['Delivered'] };
  }
  
  // Fallback to configured patterns
  for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
    for (const pattern of (category as any).subjectPatterns) {
      console.log(`🔍 CATEGORIZATION DEBUG: Checking pattern "${pattern}" against "${subject}"`);
      if (subject.toLowerCase().includes((pattern as string).toLowerCase())) {
        return {
          status: (category as any).status,
          statusColor: (category as any).statusColor,
          priority: STATUS_PRIORITIES[(category as any).status] || 1
        };
      }
    }
  }
  // Default if no match found
  console.log(`❌ CATEGORIZATION DEBUG: No patterns matched for "${subject}" - defaulting to Ordered`);
  return {
    status: 'Ordered',
    statusColor: 'orange',
    priority: 1
  };
}

// Consolidate multiple emails for the same order using priority system
function consolidateOrderEmails(purchases: any[]) {
  console.log('🔄 CONSOLIDATION DEBUG: Starting consolidation with', purchases.length, 'purchases');
  
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
  
  // Use the shared consolidation utility
  const consolidated = consolidatePurchasesByOrderNumber(normalizedPurchases);
  
  console.log('✅ CONSOLIDATION DEBUG: Final result -', consolidated.length, 'consolidated purchases');
  return consolidated;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;
    const gmailConnected = cookieStore.get('gmail_connected')?.value;

    console.log('🔐 Full cookie debug:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasGmailConnected: !!gmailConnected,
      accessTokenLength: accessToken?.length || 0,
      accessTokenPreview: accessToken ? `${accessToken.substring(0, 10)}...` : 'null'
    });

    // Add a delay to ensure cookies are available
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!accessToken) {
      console.log('❌ No access token found in cookies');
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    // Get the current URL to determine the correct redirect URI
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    // Check if token needs refresh before making API calls
    let newTokens = null;
    if (refreshToken) {
      try {
        // Try to refresh the token if it might be expired
        const tokenInfo = await oauth2Client.getAccessToken();
        if (tokenInfo.token && tokenInfo.token !== accessToken) {
          // Token was refreshed, we need to update cookies
          newTokens = {
            access_token: tokenInfo.token,
            refresh_token: refreshToken
          };
          
          // Update the oauth2Client with the new token
          oauth2Client.setCredentials(newTokens);
          console.log('🔄 Token refreshed successfully');
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return NextResponse.json({ 
          error: 'Gmail authentication expired. Please reconnect.', 
          needsReauth: true 
        }, { status: 401 });
      }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get email parsing configuration from request headers (sent by frontend)
    const configHeader = request.headers.get('email-config');
    const config = configHeader ? JSON.parse(configHeader) : getDefaultConfig();

    // Get limit parameter for controlled testing (default to 500 for better historical coverage)
    const limit = parseInt(url.searchParams.get('limit') || '500');

    console.log(`Gmail API: Fetching up to ${limit} emails per query`);

    // Generate dynamic queries based on configuration
    const allQueries = generateQueries(config);
    // Use ALL queries for 100% accuracy - don't limit queries
    const queries = allQueries;
    console.log(`🔍 SEARCH DEBUG: Generated ${allQueries.length} search queries, using ALL queries:`, queries);

    const allPurchases: any[] = [];
    const processedEmailIds = new Set<string>(); // Track processed email IDs to avoid duplicates
    let totalProcessedEmails = 0;
    const maxTotalEmails = 5000; // Increased limit for 100% coverage (was 2000)

    // Create timeout helper function
    const withTimeout = (promise: Promise<any>, seconds: number) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Gmail API timeout after ${seconds} seconds`)), seconds * 1000)
        )
      ]);
    };

    // Test basic Gmail API access first
    try {
      console.log(`🔍 TESTING: Basic Gmail API access...`);
      const testResponse = await withTimeout(gmail.users.messages.list({
        userId: 'me',
        q: '',
        maxResults: 5
      }), 10); // 10 second timeout
      console.log(`🔍 BASIC TEST: Found ${testResponse.data.messages?.length || 0} total emails in account`);
    } catch (testError) {
      console.error(`🔍 BASIC TEST FAILED:`, testError);
    }

    // Test specific StockX query since user confirmed 50+ emails exist
    try {
      console.log(`🔍 TESTING: Specific StockX query...`);
      const stockxResponse = await withTimeout(gmail.users.messages.list({
        userId: 'me',
        q: 'from:noreply@stockx.com',
        maxResults: 10
      }), 10); // 10 second timeout
      console.log(`🔍 STOCKX TEST: Found ${stockxResponse.data.messages?.length || 0} emails from noreply@stockx.com`);
      if (stockxResponse.data.messages && stockxResponse.data.messages.length > 0) {
        console.log(`🔍 STOCKX TEST: First email ID:`, stockxResponse.data.messages[0].id);
      }
    } catch (stockxError) {
      console.error(`🔍 STOCKX TEST FAILED:`, stockxError);
    }

    for (const query of queries) {
      // Check if we've reached the limit before starting next query
      if (totalProcessedEmails >= maxTotalEmails) {
        console.log(`🛑 Reached maximum email processing limit (${maxTotalEmails}). Stopping all queries.`);
        break;
      }
      
      try {
        console.log(`🔍 EXECUTING QUERY: "${query}" with limit ${limit}`);
        const response = await withTimeout(gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: limit
        }), 15); // 15 second timeout for message list
        console.log(`🔍 QUERY RESULT: ${response.data.messages?.length || 0} messages found for "${query}"`);

        if (response.data.messages) {
          console.log(`Gmail API: Found ${response.data.messages.length} emails for query: ${query}`);
          
          for (const message of response.data.messages) {
            // Check if we've processed too many emails
            if (totalProcessedEmails >= maxTotalEmails) {
              console.log(`🛑 Reached maximum email processing limit (${maxTotalEmails}). Stopping.`);
              break;
            }
            
            totalProcessedEmails++;
            const emailData = await withTimeout(gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            }), 10); // 10 second timeout for each email
            
            // Log email details for debugging
            const fromHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'From')?.value || '';
            const subjectHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
            console.log(`📧 Found email: From="${fromHeader}", Subject="${subjectHeader}"`);
            
            const purchase = await parsePurchaseEmail(emailData.data, config, gmail);
            if (purchase) {
              console.log(`✅ Parsed purchase: ${purchase.product.name} - ${purchase.orderNumber}`);
              allPurchases.push(purchase);
            } else {
              console.log(`❌ Email filtered out or failed to parse`);
            }
            
            // Add small delay to avoid overwhelming Gmail API
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          console.log(`Gmail API: No messages found for query: ${query}`);
        }
      } catch (error) {
        console.error(`Error fetching emails for query "${query}":`, error);
      }
    }

    console.log(`Gmail API: Found ${allPurchases.length} total purchases before consolidation`);

    // Consolidate duplicate orders using priority system
    const consolidatedPurchases = consolidateOrderEmails(allPurchases);
    
    console.log(`Gmail API: After consolidation: ${consolidatedPurchases.length} unique purchases`);

    // Check if the problematic order is in the results
    const debugOrder = consolidatedPurchases.find(p => p.orderNumber === '01-47MDU2T9C5');
    
    // Create response
    const response = NextResponse.json({ 
      purchases: consolidatedPurchases,
      totalFound: allPurchases.length,
      afterConsolidation: consolidatedPurchases.length,
      debug: debugOrder ? {
        foundProblematicOrder: true,
        orderNumber: debugOrder.orderNumber,
        trackingNumber: debugOrder.tracking,
        subject: debugOrder.subject,
        message: "Found order 01-47MDU2T9C5 - tracking extraction details logged to console"
      } : {
        foundProblematicOrder: false,
        message: "Order 01-47MDU2T9C5 not found in current results"
      }
    });

    // Update cookies with new tokens if they were refreshed
    if (newTokens) {
      const cookieOptions = {
        httpOnly: false, // Allow client-side access for debugging in development
        secure: false, // Allow localhost (non-HTTPS) 
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 24 * 60 * 60 // 24 hours
      };
      
      response.cookies.set('gmail_access_token', newTokens.access_token, cookieOptions);
      response.cookies.set('gmail_connected', 'true', cookieOptions);
      console.log('🔄 Updated access token in response cookies');
    }

    return response;

  } catch (error) {
    console.error('Error fetching Gmail purchases:', error);
    
    // If it's an authentication error, return 401
    if (error.code === 401 || error.message?.includes('Invalid Credentials')) {
      return NextResponse.json({ 
        error: 'Gmail authentication expired. Please reconnect.', 
        needsReauth: true 
      }, { status: 401 });
    }
    
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 });
  }
}

// Replace the old parsePurchaseEmail function with the new implementation
async function parsePurchaseEmail(email: any, config: any, gmail: any) {
  try {
    const fromHeader = email.payload.headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = email.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
    const market = identifyMarket(fromHeader);

    console.log(`🔍 Parsing email: "${subjectHeader}" from ${fromHeader}`);

    // FILTER OUT SALES-RELATED EMAILS (these are for items being sold TO marketplaces, not purchased FROM them)
    // CRITICAL: Use EXACT phrase matching to avoid false positives
    const salesRelatedPatterns = [
      'Order Shipped To StockX', // Seller shipping to StockX
      'Order Shipped to StockX', // Seller shipping to StockX
      'Shipped To StockX',       // Seller shipping to StockX
      'You Sold Your Item',      // Sale confirmation
      'You Sold Your Flex Item', // Flex sale confirmation
      'Your Sale is Confirmed',  // Sale confirmation
      'Your Payout is Ready',    // Payout notification
      'Reminder: Ship your StockX Order', // Seller reminder
      'Ship your StockX Order',  // Seller reminder
      'Time to Ship',            // Seller reminder
      'Ship Your Item',          // Seller reminder
      'Your Ask Was Matched',    // Seller ask matched
      'Your Bid Was Matched',    // Buyer bid matched (this is actually a purchase, so exclude it)
      'Place a New Bid',         // Bidding prompt
      'Your Bid Expired',        // Bid expired
      'Price Drop',              // Price alert
      'Arrived at StockX'        // Seller's item arrived at StockX
    ];
    
    // Only filter if the ENTIRE phrase matches (not just partial)
    let isSalesEmail = false;
    for (const pattern of salesRelatedPatterns) {
      // EXACT match only - don't filter if it's just a partial match
      if (subjectHeader.toLowerCase().includes(pattern.toLowerCase())) {
        // Additional check: make sure it's NOT a purchase confirmation
        // "Order Confirmed" or "Order Delivered" should NOT be filtered
        const isPurchaseConfirmation = 
          subjectHeader.toLowerCase().includes('order confirmed') ||
          subjectHeader.toLowerCase().includes('order delivered') ||
          subjectHeader.toLowerCase().includes('order shipped:') ||
          subjectHeader.toLowerCase().includes('order verified & shipped:');
        
        if (!isPurchaseConfirmation) {
        console.log(`🚫 Filtering out sales email: ${subjectHeader}`);
          isSalesEmail = true;
          break;
        }
      }
    }
    
    if (isSalesEmail) {
      return null; // Exclude this email from purchases
    }

    console.log(`🔧 Attempting to parse order data...`);
    // Use the new OrderConfirmationParser
    const orderInfo = parseGmailApiMessage(email);
    console.log(`📊 Parsed order info:`, {
      product_name: orderInfo.product_name,
      order_number: orderInfo.order_number,
      total_amount: orderInfo.total_amount,
      purchase_price: orderInfo.purchase_price
    });
    
    // CRITICAL FOR 100% ACCURACY: Be VERY lenient with what we accept
    // Only reject if we have ZERO information AND it's clearly not a purchase email
    const hasAnyPurchaseData = 
      orderInfo.product_name || 
      orderInfo.order_number || 
      orderInfo.total_amount > 0 ||
      orderInfo.purchase_price > 0 ||
      orderInfo.tracking_number;
    
    const isPurchaseRelatedSubject = 
      subjectHeader.toLowerCase().includes('order') ||
      subjectHeader.toLowerCase().includes('confirmed') ||
      subjectHeader.toLowerCase().includes('shipped') ||
      subjectHeader.toLowerCase().includes('delivered') ||
      subjectHeader.toLowerCase().includes('xpress');
    
    // Only filter out if we have NO data AND the subject doesn't look purchase-related
    if (!hasAnyPurchaseData && !isPurchaseRelatedSubject) {
      console.log(`⚠️ No purchase data extracted and subject doesn't look purchase-related: ${subjectHeader}`);
      return null;
    }
    
    // If it's clearly a purchase email but we're missing some data, fill in defaults
    if (!orderInfo.order_number && isPurchaseRelatedSubject) {
      // Try to extract order number from subject or generate a placeholder
      const subjectOrderMatch = subjectHeader.match(/(?:order|#)\s*([A-Z0-9-]+)/i);
      if (subjectOrderMatch) {
        orderInfo.order_number = subjectOrderMatch[1];
      } else {
        // Use email ID as fallback order number
        orderInfo.order_number = 'EMAIL-' + email.id.substring(0, 12);
      }
      console.log(`🔧 Generated order number: ${orderInfo.order_number}`);
    }
    
    // If product name is missing, try to extract from subject
    if (!orderInfo.product_name && isPurchaseRelatedSubject) {
      // Try to extract product from subject after colon
      const colonMatch = subjectHeader.match(/:\s*(.+)$/);
      if (colonMatch && colonMatch[1]) {
        orderInfo.product_name = colonMatch[1].trim();
      } else {
        orderInfo.product_name = 'Product information unavailable';
      }
      console.log(`🔧 Generated product name: ${orderInfo.product_name}`);
    }

    // SPECIAL OVERRIDE: StockX Delivery Status Rule
    // IF email is from StockX AND subject contains delivery keywords
    // THEN force status to "Delivered" (this overrides all other logic)
    let category;
    const isStockXEmail = fromHeader.includes('stockx.com') || fromHeader.includes('noreply@stockx.com');
    const deliveryKeywords = [
      'Xpress Ship Order Delivered:',
      'Order Delivered:',
      'Xpress Order Delivered:',
      'has been delivered',
      'package delivered',
      '🎉 Xpress Ship Order Delivered:', // Add pattern with emoji
      'xpress ship order delivered', // Add lowercase version
      'order delivered' // Add more general pattern
    ];

    const shippedKeywords = [
      'Order Verified & Shipped:',
      'Order Shipped:',
      'Xpress Order Shipped:',
      'has been shipped',
      'package shipped',
      '✅ Order Verified & Shipped:', // Add pattern with emoji
      'order verified & shipped', // Add lowercase version
      'order shipped' // Add more general pattern
    ];
    
    const isDeliveryEmail = deliveryKeywords.some(keyword => 
      subjectHeader.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const isShippedEmail = shippedKeywords.some(keyword => 
      subjectHeader.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // Debug logging for delivery and shipped detection
    console.log(`🔍 STATUS DEBUG: Subject="${subjectHeader}"`);
    console.log(`🔍 STATUS DEBUG: Is StockX Email: ${isStockXEmail}`);
    console.log(`🔍 STATUS DEBUG: Is Delivery Email: ${isDeliveryEmail}`);
    console.log(`🔍 STATUS DEBUG: Is Shipped Email: ${isShippedEmail}`);
    console.log(`🔍 STATUS DEBUG: Delivery keywords:`, deliveryKeywords);
    console.log(`🔍 STATUS DEBUG: Shipped keywords:`, shippedKeywords);
    
    // Test each keyword individually for debugging
    deliveryKeywords.forEach(keyword => {
      const matches = subjectHeader.toLowerCase().includes(keyword.toLowerCase());
      console.log(`🔍 DELIVERY DEBUG: Keyword "${keyword}" matches: ${matches}`);
    });
    
    shippedKeywords.forEach(keyword => {
      const matches = subjectHeader.toLowerCase().includes(keyword.toLowerCase());
      console.log(`🔍 SHIPPED DEBUG: Keyword "${keyword}" matches: ${matches}`);
    });
    
    if (isStockXEmail && isDeliveryEmail) {
      console.log(`🚚 DELIVERY OVERRIDE: StockX delivery email detected - forcing Delivered status`);
      console.log(`🚚 Email: "${subjectHeader}" from ${fromHeader}`);
      console.log(`🚚 Order Number: ${orderInfo.order_number}`);
      
      // Special debug for specific orders
      if (orderInfo.order_number === '01-3KF7CE560J' || orderInfo.order_number === '01-47MDU2T9C5') {
        console.log(`🎯🚚 SPECIAL: Order ${orderInfo.order_number} DELIVERY OVERRIDE TRIGGERED!`);
        console.log(`🎯🚚 Subject: "${subjectHeader}"`);
        console.log(`🎯🚚 This order should now be DELIVERED status!`);
      }
      
      category = {
        status: 'Delivered',
        statusColor: 'green',
        priority: 4
      };
    } else if (isStockXEmail && isShippedEmail) {
      console.log(`📦 SHIPPED OVERRIDE: StockX shipped email detected - forcing Shipped status`);
      console.log(`📦 Email: "${subjectHeader}" from ${fromHeader}`);
      console.log(`📦 Order Number: ${orderInfo.order_number}`);
      
      // Special debug for specific orders
      if (orderInfo.order_number === '77312394' || orderInfo.order_number === '77349364') {
        console.log(`🎯📦 SPECIAL: Order ${orderInfo.order_number} SHIPPED OVERRIDE TRIGGERED!`);
        console.log(`🎯📦 Subject: "${subjectHeader}"`);
        console.log(`🎯📦 This order should now be SHIPPED status!`);
      }
      
      category = {
        status: 'Shipped',
        statusColor: 'blue',
        priority: 3
      };
    } else {
      // Use normal categorization for non-delivery emails
      category = categorizeEmail(subjectHeader, config);
      
      // Additional debugging for the specific order
      if (orderInfo.order_number === '01-3KF7CE560J') {
        console.log(`🎯 SPECIAL DEBUG for 01-3KF7CE560J:`);
        console.log(`  - Subject: "${subjectHeader}"`);
        console.log(`  - From: "${fromHeader}"`);
        console.log(`  - Is StockX: ${isStockXEmail}`);
        console.log(`  - Is Delivery: ${isDeliveryEmail}`);
        console.log(`  - Category Status: ${category.status}`);
        console.log(`  - Category Priority: ${category.priority}`);
      }
    }

    // Log if we found a shipped order
    if (category.status === 'Shipped') {
      console.log(`📦 SHIPPED ORDER FOUND: ${orderInfo.order_number} - "${subjectHeader}"`);
    }

    // Log if we found a delayed order
    if (category.status === 'Delayed') {
      console.log(`⚠️ DELAYED ORDER FOUND: ${orderInfo.order_number} - "${subjectHeader}"`);
    }

    // Log if we found a refunded/cancelled order
    if (category.status === 'Canceled') {
      console.log(`❌ REFUNDED ORDER FOUND: ${orderInfo.order_number} - "${subjectHeader}"`);
    }
    
    // Log if we found a delivered order
    if (category.status === 'Delivered') {
      console.log(`🚚 DELIVERED ORDER FOUND: ${orderInfo.order_number} - "${subjectHeader}"`);
    }
    
    // SPECIAL DEBUG: Log order number extraction for all emails
    console.log(`🔍 ORDER NUMBER DEBUG: "${subjectHeader}" -> Order Number: "${orderInfo.order_number}"`);
    
    // Enhanced order number extraction for refund emails
    if (subjectHeader.toLowerCase().includes('refund issued:') && !orderInfo.order_number) {
      console.log(`🔍 REFUND EMAIL: Attempting enhanced order number extraction...`);
      
      // Try to extract order number from email body or other patterns
      const emailBody = getEmailBody(email);
      const orderNumberPatterns = [
        /Order[:\s#]*([0-9\-]+)/i,
        /Order Number[:\s]*([0-9\-]+)/i,
        /Order ID[:\s]*([0-9\-]+)/i,
        /([0-9]{8}-[0-9]{8})/i, // StockX format
        /([0-9]{8})/i // Single number format
      ];
      
      for (const pattern of orderNumberPatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          orderInfo.order_number = match[1];
          console.log(`🎯 REFUND EMAIL: Found order number in body: ${orderInfo.order_number}`);
          break;
        }
      }
      
      if (!orderInfo.order_number) {
        console.log(`❌ REFUND EMAIL: Could not extract order number from body`);
      }
    }

    // Extract brand from product name
    const brand = extractBrand(orderInfo.product_name);

    // Format date
    const emailDate = email.internalDate ? new Date(parseInt(email.internalDate)) : new Date();
    const purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateAdded = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '\n' + 
                     emailDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Format price - prioritize total_amount, then purchase_price
    const price = orderInfo.total_amount > 0 ? `$${orderInfo.total_amount.toFixed(2)}` : 
                 (orderInfo.purchase_price > 0 ? `$${orderInfo.purchase_price.toFixed(2)}` : '$0.00');

    // Use product image from orderInfo if available
    const productImage = orderInfo.product_image_url || 
                        `https://picsum.photos/200/200?random=${email.id.substring(0, 4)}`;

    // Enhanced size extraction with better fallbacks
    let finalSize = orderInfo.size;
    
    // If no size was extracted, try to extract from product name
    if (!finalSize || finalSize === 'Unknown' || finalSize === 'Unknown Size') {
      console.log(`🔍 No size found in orderInfo, trying to extract from product name: "${orderInfo.product_name}"`);
      
      // Try to extract size from product name using common patterns
      const productNameSizePatterns = [
        /\(Size\s*([^)]+)\)/i,
        /\[Size\s*([^\]]+)\]/i,
        /Size\s*([A-Z0-9\.\s]+?)(?:\s|$)/i,
        /([A-Z0-9\.\s]+?)\s*Size/i,
        /US\s+([A-Z0-9\.\s]+?)(?:\s|$)/i,
        /([A-Z0-9\.\s]+?)\s*US/i
      ];
      
      for (const pattern of productNameSizePatterns) {
        const match = orderInfo.product_name.match(pattern);
        if (match) {
          const extractedSize = match[1].trim();
          // Validate it looks like a real size
          if (extractedSize && extractedSize.length > 0 && extractedSize.length <= 25 && /[A-Za-z0-9]/.test(extractedSize)) {
            finalSize = extractedSize;
            console.log(`✅ Size extracted from product name: "${finalSize}"`);
            break;
          }
        }
      }
    }
    
    // Final fallback - use a more descriptive default
    if (!finalSize || finalSize === 'Unknown' || finalSize === 'Unknown Size') {
      finalSize = 'Size Not Found';
      console.log(`⚠️ No size found for order ${orderInfo.order_number}, using fallback: "${finalSize}"`);
    }

    return {
      id: email.id,
      orderNumber: orderInfo.order_number,
      product: {
        name: orderInfo.product_name,
        brand,
        size: finalSize,
        image: productImage,
        bgColor: getBrandColor(brand)
      },
      status: category.status,
      statusColor: category.statusColor,
      priority: category.priority,
      tracking: orderInfo.tracking_number || 'No tracking', // Use tracking from parsed email
      market,
      price,
      originalPrice: `${price} + $0.00`,
      purchasePrice: orderInfo.purchase_price || 0,
      totalPayment: orderInfo.total_amount || 0,
      purchaseDate,
      dateAdded,
      verified: 'pending',
      verifiedColor: 'orange',
      emailId: email.id,
      subject: subjectHeader,
      fromEmail: fromHeader,
      // Add new fields from OrderInfo
      orderType: orderInfo.order_type,
      productVariant: orderInfo.product_variant,
      condition: orderInfo.condition,
      styleId: orderInfo.style_id,
      processingFee: orderInfo.processing_fee,
      shippingFee: orderInfo.shipping_fee,
      shippingType: orderInfo.shipping_type,
      estimatedDeliveryStart: orderInfo.estimated_delivery_start,
      estimatedDeliveryEnd: orderInfo.estimated_delivery_end,
      parsedPurchaseDate: orderInfo.purchase_date,
      carrier: orderInfo.carrier,
      shippingStatus: orderInfo.shipping_status,
      email_date: emailDate.toISOString(), // Store full email date for consolidation
      createdAt: emailDate.toISOString() // Also store as createdAt for fallback
    };

  } catch (error) {
    console.error('Error parsing purchase email:', error);
    return null;
  }
}

function identifyMarket(fromHeader: string): string {
  // Check for specific sender email addresses first (most precise)
  if (fromHeader.includes('noreply@stockx.com')) return 'StockX';
  
  // Fallback to domain-based identification
  if (fromHeader.includes('stockx.com')) return 'StockX';
  if (fromHeader.includes('goat.com')) return 'GOAT';
  if (fromHeader.includes('flightclub.com')) return 'Flight Club';
  if (fromHeader.includes('deadstock.com')) return 'Deadstock';
  if (fromHeader.includes('novelship.com')) return 'Novelship';
  if (fromHeader.includes('ebay.com')) return 'eBay';
  if (fromHeader.includes('alias.com')) return 'Alias';
  return 'Unknown';
}

function extractBrand(productName: string): string {
  if (productName.toLowerCase().includes('jordan')) return 'Jordan';
  if (productName.toLowerCase().includes('nike')) return 'Nike';
  if (productName.toLowerCase().includes('adidas')) return 'Adidas';
  if (productName.toLowerCase().includes('yeezy')) return 'Yeezy';
  if (productName.toLowerCase().includes('travis scott')) return 'Travis Scott';
  if (productName.toLowerCase().includes('off-white')) return 'Off-White';
  if (productName.toLowerCase().includes('dior')) return 'Dior';
  if (productName.toLowerCase().includes('denim tears')) return 'Denim Tears';
  if (productName.toLowerCase().includes('sp5der')) return 'Sp5der';
  return 'Unknown Brand';
}

function getBrandColor(brand: string): string {
  const brandColors: { [key: string]: string } = {
    'Jordan': 'bg-red-600',
    'Nike': 'bg-orange-500',
    'Adidas': 'bg-blue-600',
    'Yeezy': 'bg-gray-700',
    'Travis Scott': 'bg-amber-900',
    'Off-White': 'bg-gray-100',
    'Dior': 'bg-purple-600',
    'Denim Tears': 'bg-indigo-600',
    'Sp5der': 'bg-pink-600'
  };
  return brandColors[brand] || 'bg-gray-400';
}

// Helper function to extract email body content
function getEmailBody(email: any): string {
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
    
    return bodyContent;
  } catch (error) {
    console.error('Error extracting email body:', error);
    return '';
  }
}

// Enhanced tracking number extraction function
async function extractTrackingNumber(orderNumber: string, gmail: any): Promise<string | null> {
  if (!orderNumber || !gmail) return null;
  
  try {
    console.log(`🔍 TRACKING: Searching for tracking number for order ${orderNumber}`);
    
    // Search for shipping emails containing this order number
    const shippingQueries = [
      `from:noreply@stockx.com AND subject:"Order Verified & Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Order Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Xpress Order Shipped:" AND "${orderNumber}"`,
      `from:stockx.com AND subject:"shipped" AND "${orderNumber}"`
    ];

    for (const query of shippingQueries) {
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 5
        });

        if (response.data.messages && response.data.messages.length > 0) {
          console.log(`📧 TRACKING: Found ${response.data.messages.length} shipping emails for order ${orderNumber}`);
          
          // Get the first shipping email
          const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: response.data.messages[0].id,
            format: 'full'
          });

          const subject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
          console.log(`📧 TRACKING: Processing shipping email: "${subject}"`);

          // Extract tracking number from email content
          const trackingNumber = extractTrackingFromShippingEmail(emailData.data);
          
          if (trackingNumber) {
            console.log(`✅ TRACKING: Found tracking number ${trackingNumber} for order ${orderNumber}`);
            return trackingNumber;
          }
        }
      } catch (error) {
        console.error(`TRACKING: Error searching with query "${query}":`, error);
      }
    }

    console.log(`❌ TRACKING: No tracking number found for order ${orderNumber}`);
    return null;
  } catch (error) {
    console.error(`TRACKING: Error extracting tracking for order ${orderNumber}:`, error);
    return null;
  }
}

// Extract tracking number from shipping email content
function extractTrackingFromShippingEmail(email: any): string | null {
  try {
    // Get email body content
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

    // Enhanced tracking patterns optimized for StockX emails
    const trackingPatterns = [
      { 
        name: 'UPS Tracking', 
        regex: /(1Z[0-9A-Z]{16})/gi,
        validator: (match: string) => /^1Z[0-9A-Z]{16}$/i.test(match)
      },
      { 
        name: 'FedEx 12-digit', 
        regex: /(?:tracking.*?|number.*?|track.*?)([0-9]{12})\b/gi,
        validator: (match: string) => /^[0-9]{12}$/.test(match) && !isCommonExclusion(match)
      },
      { 
        name: 'FedEx 14-digit', 
        regex: /(?:tracking.*?|number.*?|track.*?)([0-9]{14})\b/gi,
        validator: (match: string) => /^[0-9]{14}$/.test(match) && !isCommonExclusion(match)
      },
      { 
        name: 'USPS Priority', 
        regex: /(9[0-9]{21})\b/gi,
        validator: (match: string) => /^9[0-9]{21}$/.test(match)
      },
      { 
        name: 'USPS Standard', 
        regex: /(9[0-9]{19})\b/gi,
        validator: (match: string) => /^9[0-9]{19}$/.test(match)
      },
      { 
        name: 'Generic Long Numbers', 
        regex: /\b([0-9]{10,22})\b/gi,
        validator: (match: string) => match.length >= 10 && !isCommonExclusion(match)
      }
    ];

    // Helper function to exclude common non-tracking numbers
    function isCommonExclusion(num: string): boolean {
      const excluded = [
        // Price-related
        /^(150|173|14|8|00|000)/, 
        // Dates/years
        /^20[0-9]{2}$/, 
        // Common patterns
        /^[0-9]{5}$/, // ZIP codes
        /^[0-9]{10}$/, // Phone numbers
        /^0+$/, // All zeros
        /^1+$/, // All ones
        // StockX order number patterns
        /^[0-9]{2}-/,
        /^[0-9]{8}-[0-9]{8}$/
      ];
      
      return excluded.some(pattern => pattern.test(num));
    }

    // Try patterns in priority order
    for (const pattern of trackingPatterns) {
      const matches = bodyContent.match(pattern.regex) || [];
      
      for (const match of matches) {
        const cleanMatch = match.replace(/[<>]/g, '').trim();
        
        if (pattern.validator(cleanMatch)) {
          console.log(`✅ TRACKING: Found ${pattern.name}: ${cleanMatch}`);
          return cleanMatch;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('TRACKING: Error extracting from email:', error);
    return null;
  }
}

// The old extractPurchaseDetails function has been replaced by the new OrderConfirmationParser
// This function is no longer needed as the new parser handles all email extraction 