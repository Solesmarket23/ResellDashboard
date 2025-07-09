import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage, orderInfoToDict, OrderInfo } from '../../../../lib/email/orderConfirmationParser';

// Default configuration if none is provided
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
          "Order delivered"
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
        // Create a comprehensive query that includes sender email AND subject patterns
        const subjectPatterns = [];
        for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
          const cat = category as any;
          subjectPatterns.push(...cat.subjectPatterns);
        }
        
        // Create query: from sender AND (subject pattern 1 OR subject pattern 2...)
        if (subjectPatterns.length > 0) {
          const subjectQuery = subjectPatterns
            .map(pattern => `subject:"${pattern}"`)
            .join(' OR ');
          queries.push(`from:${senderEmail} AND (${subjectQuery})`);
        } else {
          // Fallback: just filter by sender if no subject patterns
          queries.push(`from:${senderEmail}`);
        }
      }
    } else {
      // Fallback for marketplaces without specific sender emails
      // Use domain-based filtering with subject patterns
      const subjectPatterns = [];
      for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
        const cat = category as any;
        subjectPatterns.push(...cat.subjectPatterns);
      }
      
      if (subjectPatterns.length > 0) {
        const subjectQuery = subjectPatterns
          .map(pattern => `subject:"${pattern}"`)
          .join(' OR ');
        queries.push(`from:${mp.emailDomain} AND (${subjectQuery})`);
      }
    }
  }

  // Add focused StockX search queries to catch historical emails
  queries.push('from:noreply@stockx.com'); 
  queries.push('from:stockx.com');
  
  // Add specific subject-based queries
  queries.push('subject:"Order Confirmed"');
  queries.push('subject:"Order Verified & Shipped:"');
  queries.push('subject:"Order Shipped"');
  queries.push('subject:"Xpress Order Shipped:"');
  queries.push('subject:"Encountered a Delay"');
  queries.push('subject:"Refund Issued:"');
  
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

// Priority order for purchase statuses (higher number = higher priority)
const STATUS_PRIORITIES = {
  'Ordered': 1,      // Order Placed
  'Shipped': 2,      // Order Shipped  
  'Delayed': 3,      // Order Delayed
  'Delivered': 4,    // Order Delivered
  'Canceled': 5      // Order Canceled/Refunded (highest priority)
};

// Determine email category and status based on subject line
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
  // Default if no match found
  return {
    status: 'Ordered',
    statusColor: 'orange',
    priority: 1
  };
}

// Consolidate multiple emails for the same order using priority system
function consolidateOrderEmails(purchases: any[]) {
  const orderMap = new Map();
  
  // Group emails by order number
  purchases.forEach(purchase => {
    const orderNumber = purchase.orderNumber;
    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, []);
    }
    orderMap.get(orderNumber).push(purchase);
  });
  
  // For each order, select the email with highest priority status
  const consolidatedPurchases = [];
  for (const [orderNumber, orderEmails] of orderMap.entries()) {
    if (orderEmails.length === 1) {
      consolidatedPurchases.push(orderEmails[0]);
    } else {
      // Sort by priority (highest first) and take the first one
      const sortedEmails = orderEmails.sort((a, b) => {
        const priorityA = STATUS_PRIORITIES[a.status] || 1;
        const priorityB = STATUS_PRIORITIES[b.status] || 1;
        return priorityB - priorityA;
      });
      
      // Use the highest priority email but combine information from all emails
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

    // Get limit parameter for controlled testing (default to 50 to prevent timeouts)
    const limit = parseInt(url.searchParams.get('limit') || '50');

    console.log(`Gmail API: Fetching up to ${limit} emails per query`);

    // Generate dynamic queries based on configuration
    const queries = generateQueries(config);
    console.log(`🔍 SEARCH DEBUG: Generated ${queries.length} search queries:`, queries);
    console.log(`🔍 SEARCH DEBUG: First few queries:`, queries.slice(0, 5));

    const allPurchases: any[] = [];

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
            const emailData = await withTimeout(gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            }), 10); // 10 second timeout for each email
            
            // Log email details for debugging
            const fromHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'From')?.value || '';
            const subjectHeader = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
            console.log(`📧 Found email: From="${fromHeader}", Subject="${subjectHeader}"`);
            
            const purchase = parsePurchaseEmail(emailData.data, config);
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
function parsePurchaseEmail(email: any, config: any) {
  try {
    const fromHeader = email.payload.headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = email.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
    const market = identifyMarket(fromHeader);

    console.log(`🔍 Parsing email: "${subjectHeader}" from ${fromHeader}`);

    // FILTER OUT SALES-RELATED EMAILS (these are for items being sold TO marketplaces, not purchased FROM them)
    const salesRelatedPatterns = [
      'Order Shipped To StockX',
      'Order Shipped to StockX',
      'Shipped To StockX',
      'You Sold Your Item',
      'You Sold Your Flex Item',
      'An Update Regarding Your Sale',
      'Your Sale is Confirmed',
      'Your Payout is Ready'
    ];
    
    for (const pattern of salesRelatedPatterns) {
      if (subjectHeader.toLowerCase().includes(pattern.toLowerCase())) {
        console.log(`🚫 Filtering out sales email: ${subjectHeader}`);
        return null; // Exclude this email from purchases
      }
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
    
    // If no order data was extracted, return null (temporarily more lenient)
    if (!orderInfo.product_name && !orderInfo.order_number && !subjectHeader.toLowerCase().includes('stockx')) {
      console.log(`⚠️ No order data extracted from email: ${subjectHeader}`);
      return null;
    }
    
    // If it's a StockX email but no data extracted, create a basic entry for debugging
    if ((!orderInfo.product_name && !orderInfo.order_number) && subjectHeader.toLowerCase().includes('stockx')) {
      console.log(`🔧 Creating debug entry for StockX email: ${subjectHeader}`);
      return {
        id: email.id,
        orderNumber: 'DEBUG-' + email.id.substring(0, 8),
        product: {
          name: `[Debug] ${subjectHeader}`,
          brand: 'StockX',
          size: 'Unknown',
          image: 'https://picsum.photos/200/200?random=debug',
          bgColor: 'bg-red-500'
        },
        status: 'Debug',
        statusColor: 'red',
        priority: 1,
        tracking: 'Debug mode',
        market: 'StockX',
        price: '$0.00',
        originalPrice: '$0.00 + $0.00',
        purchasePrice: 0,
        totalPayment: 0,
        purchaseDate: 'Debug',
        dateAdded: 'Debug',
        verified: 'pending',
        verifiedColor: 'orange',
        emailId: email.id,
        subject: subjectHeader,
        fromEmail: fromHeader
      };
    }

    // Categorize email based on subject line and configuration
    const category = categorizeEmail(subjectHeader, config);

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

    return {
      id: email.id,
      orderNumber: orderInfo.order_number,
      product: {
        name: orderInfo.product_name,
        brand,
        size: orderInfo.size || 'Unknown Size',
        image: productImage,
        bgColor: getBrandColor(brand)
      },
      status: category.status,
      statusColor: category.statusColor,
      priority: category.priority,
      tracking: 'No tracking', // Will be handled by existing tracking extraction logic
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
      parsedPurchaseDate: orderInfo.purchase_date
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

// The old extractPurchaseDetails function has been replaced by the new OrderConfirmationParser
// This function is no longer needed as the new parser handles all email extraction 