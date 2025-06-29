import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

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
        statusColor: "orange",
        subjectPatterns: [
          "Order delayed"
        ]
      },
      orderCanceled: {
        name: "Order Canceled/Refunded", 
        status: "Canceled",
        statusColor: "red",
        subjectPatterns: [
          "Order canceled"
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

  // If no marketplace-specific queries were generated, create fallback queries
  if (queries.length === 0) {
    const subjectPatterns = [];
    for (const [categoryKey, category] of Object.entries(config.emailCategories)) {
      const cat = category as any;
      subjectPatterns.push(...cat.subjectPatterns);
    }
    
    if (subjectPatterns.length > 0) {
      for (const pattern of subjectPatterns) {
        queries.push(`subject:"${pattern}"`);
      }
    }
  }
  
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

    console.log('🔐 Cookie check:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      accessTokenLength: accessToken?.length || 0
    });

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

    // Get limit parameter for controlled testing (default to 10 if not specified)
    const limit = parseInt(url.searchParams.get('limit') || '10');

    console.log(`Gmail API: Fetching up to ${limit} emails per query`);

    // Generate dynamic queries based on configuration
    const queries = generateQueries(config);

    const allPurchases: any[] = [];

    for (const query of queries) {
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: limit
        });

        if (response.data.messages) {
          console.log(`Gmail API: Found ${response.data.messages.length} emails for query: ${query}`);
          
          for (const message of response.data.messages) {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });
            
            const purchase = parsePurchaseEmail(emailData.data, config);
            if (purchase) {
              allPurchases.push(purchase);
            }
          }
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
      response.cookies.set('gmail_access_token', newTokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600 // 1 hour
      });
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

function parsePurchaseEmail(email: any, config: any) {
  try {
    const fromHeader = email.payload.headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = email.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
    const market = identifyMarket(fromHeader);

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

    // Categorize email based on subject line and configuration
    const category = categorizeEmail(subjectHeader, config);

    // Use the new comprehensive extraction function
    const details = extractPurchaseDetails(email, category.status);

    // Extract brand from product name
    const brand = extractBrand(details.productName);

    // Format date
    const emailDate = details.timestamp;
    const purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateAdded = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '\n' + 
                     emailDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Format price
    const price = details.totalPayment ? `$${details.totalPayment.toFixed(2)}` : 
                 (details.purchasePrice ? `$${details.purchasePrice.toFixed(2)}` : '$0.00');

    return {
      id: email.id,
      orderNumber: details.orderNumber,
      product: {
        name: details.productName,
        brand,
        size: details.size || 'Unknown Size',
        image: `https://picsum.photos/200/200?random=${email.id.substring(0, 4)}`,
        bgColor: getBrandColor(brand)
      },
      status: category.status,
      statusColor: category.statusColor,
      priority: category.priority,
      tracking: details.trackingNumber || 'No tracking',
      market,
      price,
      originalPrice: `${price} + $0.00`,
      purchasePrice: details.purchasePrice,
      totalPayment: details.totalPayment,
      purchaseDate,
      dateAdded,
      verified: 'pending',
      verifiedColor: 'orange',
      emailId: email.id,
      subject: subjectHeader,
      fromEmail: fromHeader
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

function extractPurchaseDetails(email: any, status: string): any {
  try {
    const subject = email.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
    
    // Get email body content
    let bodyContent = '';
    if (email.payload?.parts) {
      for (const part of email.payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          bodyContent += Buffer.from(part.body.data, 'base64').toString();
        }
      }
    } else if (email.payload?.body?.data) {
      bodyContent += Buffer.from(email.payload.body.data, 'base64').toString();
    }

    // Extract product name from subject line
    let productName = 'Unknown Product';
    
    // For StockX emails, extract product from subject after the status
    const subjectPatterns = [
      /Order Confirmation:\s*(.+)/i,
      /Order Shipped:\s*(.+)/i,
      /Xpress Order Confirmed:\s*(.+)/i,
      /Xpress Order Shipped:\s*(.+)/i,
      /Order Delivered:\s*(.+)/i,
      /Xpress Ship Order Delivered:\s*(.+)/i,
      /Refund Issued:\s*(.+?)\s*\(Size/i,  // Special handling for refund emails
      /You Sold Your Item!\s*(.+)/i,
      /You Sold Your Flex Item\s*(.+)/i
    ];
    
    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match) {
        productName = match[1].trim();
        // Remove emoji and clean up
        productName = productName.replace(/[👍✅📦🎉]/g, '').trim();
        break;
      }
    }

    // Extract order number from email body
    let orderNumber = null;
    const orderPatterns = [
      /Order number:\s*([0-9A-Z\-]+)/i,  // Primary pattern for both formats
      /<li[^>]*>Order number:\s*([0-9A-Z\-]+)<\/li>/i,  // HTML list format
      /Order #:\s*([0-9A-Z\-]+)/i,
      /Order ID:\s*([0-9A-Z\-]+)/i,
      /Your Order #([0-9A-Z\-]+)/i,  // For delay emails: "Your Order #75499688-75399447"
      /Order:\s*([0-9A-Z\-]+)/i
    ];
    
    for (const pattern of orderPatterns) {
      const match = bodyContent.match(pattern);
      if (match) {
        orderNumber = match[1].trim();
        break;
      }
    }

    // Extract size from email body OR subject line (for refund emails)
    let size = null;
    
    // First try to extract from subject line (for refund emails)
    if (subject.includes('Refund Issued:')) {
      const subjectSizeMatch = subject.match(/\(Size\s+([^)]+)\)/i);
      if (subjectSizeMatch) {
        size = `US ${subjectSizeMatch[1]}`;
      }
    }
    
    // If not found in subject, extract from email body
    if (!size) {
      const sizePatterns = [
        /Size:\s*US\s*([A-Z0-9\.]+)/i,
        /<li[^>]*>Size:\s*US\s*([A-Z0-9\.]+)<\/li>/i,
        /<li[^>]*>US\s*([A-Z0-9\.]+)<\/li>/i,  // Handle different format
        /Size:\s*([A-Z0-9\.]+)/i
      ];
      
      for (const pattern of sizePatterns) {
        const match = bodyContent.match(pattern);
        if (match) {
          size = `US ${match[1]}`;
          break;
                 }
       }
     }

    // Extract purchase price from email body
    let purchasePrice = null;
    const pricePatterns = [
      /Purchase Price:\s*\$([0-9,]+\.?[0-9]*)/i,
      /<td[^>]*>Purchase Price:<\/td>\s*<td[^>]*>\$([0-9,]+\.?[0-9]*)<\/td>/i,
      /Purchase Price:<\/td>\s*<td[^>]*>\$([0-9,]+\.?[0-9]*)/i
    ];
    
    for (const pattern of pricePatterns) {
      const match = bodyContent.match(pattern);
      if (match) {
        purchasePrice = parseFloat(match[1].replace(',', ''));
        break;
      }
    }

    // Extract total payment from email body
    let totalPayment = null;
    const totalPatterns = [
      /Total Payment[^$]*\$([0-9,]+\.?[0-9]*)/i,
      /TOTAL PAYMENT[^$]*\$([0-9,]+\.?[0-9]*)/i,
      /<td[^>]*>Total Payment<\/td>\s*<td[^>]*>\$([0-9,]+\.?[0-9]*)/i,
      /Amount Refunded[^$]*\$([0-9,]+\.?[0-9]*)/i,  // For refund emails
      /<td[^>]*>\$([0-9,]+\.?[0-9]*)<\/td>/i  // Look for price in table cells
    ];
    
    for (const pattern of totalPatterns) {
      const match = bodyContent.match(pattern);
      if (match) {
        totalPayment = parseFloat(match[1].replace(',', ''));
        break;
      }
    }

    // Extract tracking number from email body with improved context-aware logic
    let trackingNumber = null;
    
    // Log the email content for debugging (first 500 chars)
    console.log(`🔍 Debugging tracking extraction for subject: "${subject}"`);
    console.log(`📄 Body content preview: ${bodyContent.substring(0, 500)}...`);
    
    // STEP 1: Remove URLs and encoded content to avoid false matches
    let cleanBodyContent = bodyContent;
    
    // First decode HTML entities and URL encoding
    cleanBodyContent = cleanBodyContent.replace(/&amp;/g, '&')
                                      .replace(/&lt;/g, '<')
                                      .replace(/&gt;/g, '>')
                                      .replace(/&quot;/g, '"')
                                      .replace(/&#39;/g, "'");
    
    // Decode URL-encoded content (like %3C, %3E, etc)
    try {
      cleanBodyContent = decodeURIComponent(cleanBodyContent.replace(/\+/g, ' '));
    } catch (e) {
      // If decode fails, continue with original
    }
    
    // Extract ALL potential tracking numbers for debugging and fallback (declare early)
    const allNumbers = cleanBodyContent.match(/[0-9]{8,22}/g) || [];
    
    // Extract ALL potential UPS tracking numbers FIRST (before any filtering)
    const upsPattern = /(1Z[0-9A-Z]{16})/gi;
    const upsMatches = bodyContent.match(upsPattern) || [];
    const cleanUpsMatches = cleanBodyContent.match(upsPattern) || [];
    const allUpsMatches = [...new Set([...upsMatches, ...cleanUpsMatches])];
    
    console.log(`🎯 UPS tracking search in raw content: ${upsMatches.join(', ') || 'none'}`);
    console.log(`🎯 UPS tracking search in clean content: ${cleanUpsMatches.join(', ') || 'none'}`);
    
    // If we found UPS tracking numbers, use the first valid one immediately
    if (allUpsMatches.length > 0) {
      for (const match of allUpsMatches) {
        const candidate = match.replace(/[<>]/g, '').trim();
        if (/^1Z[0-9A-Z]{16}$/i.test(candidate)) {
          trackingNumber = candidate.toUpperCase();
          console.log(`✅ Found UPS tracking number (priority): ${trackingNumber}`);
          break;
        }
      }
    }
    
    // Only continue with other patterns if no UPS tracking found
    if (!trackingNumber) {
      // Remove StockX tracking URLs and encoded parameters
      cleanBodyContent = cleanBodyContent.replace(/https?:\/\/[^\s<>"']+/g, ' ');
      // Remove URL-encoded content (contains %2B, %2F, etc.)
      cleanBodyContent = cleanBodyContent.replace(/[A-Za-z0-9+\/=%\-]{50,}/g, ' ');
      // Remove base64-like strings and long encoded parameters
      cleanBodyContent = cleanBodyContent.replace(/[A-Za-z0-9+\/=\-]{30,}/g, ' ');
    }
    
    // STEP 2: Look for tracking numbers in clean, structured content first
    const structuredTrackingPatterns = [
      // Direct tracking number display in StockX emails
      /<td[^>]*style[^>]*font-weight:\s*600[^>]*>([0-9]{12})<\/td>/i,
      /<td[^>]*>([0-9]{12})<\/td>/i,
      // Tracking numbers in list items or spans
      /<(?:li|span)[^>]*>([0-9]{12})<\/(?:li|span)>/i,
      // Numbers after explicit tracking labels
      /tracking\s*(?:number)?[:\s]*([0-9]{12})/i,
      /shipment\s*(?:number)?[:\s]*([0-9]{12})/i
    ];
    
    console.log(`🎯 Trying structured tracking patterns on clean content...`);
    for (const pattern of structuredTrackingPatterns) {
      const match = cleanBodyContent.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        console.log(`🎯 Found structured tracking candidate: ${candidate}`);
        
        // Validate: should be exactly 12 digits for StockX
        if (/^[0-9]{12}$/.test(candidate)) {
          // Additional validation: should start with 8 or 9 for StockX tracking
          if (candidate.startsWith('8') || candidate.startsWith('9')) {
            trackingNumber = candidate;
            console.log(`✅ Found valid StockX tracking number: ${trackingNumber}`);
            break;
          }
        }
      }
    }
    
    // STEP 3: If no structured match, try contextual patterns on original content
    if (!trackingNumber) {
      const contextualTrackingPatterns = [
        // UPS tracking (1Z + 16 characters) - HIGHEST PRIORITY
        /(1Z[0-9A-Z]{16})/gi,
        // Look for tracking numbers explicitly mentioned with context
        /(?:tracking[^:]*:?\s*|track[^:]*:?\s*|shipment[^:]*:?\s*)([1-9][0-9A-Z]{8,21})/i,
        /(?:ups[^:]*:?\s*|fedex[^:]*:?\s*|usps[^:]*:?\s*)([1-9][0-9A-Z]{8,21})/i,
        // Look for numbers in tracking-related table cells or spans
        /<(?:td|span|div)[^>]*(?:track|ship)[^>]*>([0-9]{10,22})<\/(?:td|span|div)>/i,
        // Numbers immediately after "tracking" or "shipment" keywords
        /(?:shipped\s+via[^0-9]*|tracking\s*(?:number)?[^0-9]*|shipment[^0-9]*)([0-9]{10,22})/i
      ];
      
      console.log(`🎯 Trying contextual tracking patterns...`);
      for (const pattern of contextualTrackingPatterns) {
        // Special handling for UPS tracking numbers
        if (pattern.flags && pattern.flags.includes('g') && pattern.source.includes('1Z')) {
          const matches = bodyContent.match(pattern);
          if (matches && matches.length > 0) {
            for (const match of matches) {
              const candidate = match.replace(/[<>]/g, '').trim();
              console.log(`🎯 Found UPS tracking candidate: ${candidate}`);
              
              // UPS tracking: 1Z followed by exactly 16 alphanumeric characters
              if (/^1Z[0-9A-Z]{16}$/i.test(candidate)) {
                trackingNumber = candidate.toUpperCase();
                console.log(`✅ Found UPS tracking number: ${trackingNumber}`);
                break;
              }
            }
            if (trackingNumber) break;
          }
        } else {
          const match = bodyContent.match(pattern);
          if (match && match[1]) {
            const candidate = match[1].replace(/[<>]/g, '').trim();
            console.log(`🎯 Found contextual tracking candidate: ${candidate}`);
            
            // Validate it's not from a URL by checking surrounding context
            const matchIndex = bodyContent.indexOf(match[0]);
            const beforeMatch = bodyContent.substring(Math.max(0, matchIndex - 100), matchIndex);
            const afterMatch = bodyContent.substring(matchIndex + match[0].length, matchIndex + match[0].length + 100);
            
            // Skip if it appears to be in a URL context
            const isInUrl = beforeMatch.includes('http') || beforeMatch.includes('href') || 
                           afterMatch.includes('%2B') || afterMatch.includes('%2F') ||
                           beforeMatch.includes('link.tmail') || afterMatch.includes('.com');
            
            if (!isInUrl && candidate.length >= 10 && !candidate.includes('-') && 
                !/^(150|14|173|00|20\d{2})$/.test(candidate)) {
              trackingNumber = candidate;
              console.log(`✅ Found contextual tracking number: ${trackingNumber}`);
              break;
            } else {
              console.log(`⏭️ Skipped URL-context candidate: ${candidate}`);
            }
          }
        }
      }
    }
    
    // STEP 4: Fallback patterns with enhanced filtering
    if (!trackingNumber) {
      console.log(`🎯 Trying fallback patterns with strict filtering...`);
      console.log(`🔢 All long numbers found: ${allNumbers.slice(0, 20).join(', ')}${allNumbers.length > 20 ? '...' : ''}`);
      
      for (const candidate of allNumbers) {
        // Enhanced filtering
        const isOrderNumber = candidate.includes('-');
        const isPriceRelated = /^(1\d{2}|2\d{2}|3\d{2}|4\d{2}|5\d{2}|150|8|14|173|00)$/.test(candidate) || candidate.length < 10;
        const isYear = /^20\d{2}$/.test(candidate);
        const isZip = /^\d{5}$/.test(candidate);
        const isPhoneNumber = /^\d{10}$/.test(candidate);
        const isRepeatingDigits = /^(\d)\1{7,}$/.test(candidate); // 11111111...
        const isTimestamp = candidate.length > 15; // Very long numbers are likely timestamps
        
        // StockX tracking pattern (12 digits starting with 8/9)
        const isLikelyStockXTracking = /^[89]\d{11}$/.test(candidate);
        
        if (!isOrderNumber && !isPriceRelated && !isYear && !isZip && !isPhoneNumber && 
            !isRepeatingDigits && !isTimestamp) {
          if (isLikelyStockXTracking) {
            trackingNumber = candidate;
            console.log(`✅ Found StockX-style tracking: ${trackingNumber}`);
            break;
          } else if (candidate.length >= 12 && candidate.length <= 18) {
            trackingNumber = candidate;
            console.log(`✅ Selected fallback tracking: ${trackingNumber}`);
            break;
          }
        } else {
          console.log(`⏭️ Skipped filtered number: ${candidate} (order:${isOrderNumber}, price:${isPriceRelated}, year:${isYear}, zip:${isZip}, phone:${isPhoneNumber}, repeat:${isRepeatingDigits}, timestamp:${isTimestamp})`);
        }
      }
    }
    
    if (!trackingNumber) {
      console.log(`❌ No tracking number found for: ${subject}`);
    } else {
      console.log(`🎉 Final tracking number selected: ${trackingNumber}`);
    }

    // Get timestamp from email
    const timestamp = email.internalDate ? new Date(parseInt(email.internalDate)) : new Date();

    const result = {
      id: email.id,
      subject: subject,
      productName: productName,
      orderNumber: orderNumber || `UNKNOWN-${email.id.substring(0, 8)}`,
      size: size,
      status: status,
      purchasePrice: purchasePrice,
      totalPayment: totalPayment,
      trackingNumber: trackingNumber,
      timestamp: timestamp,
      rawSubject: subject
    };

    console.log('📧 Extracted purchase details:', {
      subject: result.subject,
      orderNumber: result.orderNumber,
      productName: result.productName,
      size: result.size,
      purchasePrice: result.purchasePrice,
      totalPayment: result.totalPayment,
      trackingNumber: result.trackingNumber,
      status: result.status
    });
    
    // Special debugging for problematic orders
    if (result.orderNumber === '01-47MDU2T9C5' || result.orderNumber === '01-B56RWN58RD') {
      console.log(`🚨 DEBUGGING ORDER ${result.orderNumber}:`);
      console.log('📄 Full body content length:', bodyContent.length);
      console.log('📋 Body content sample:', bodyContent.substring(0, 2000));
      console.log('🔢 All numbers found:', allNumbers || []); // Safe reference
      console.log('🎯 Final tracking selected:', result.trackingNumber);
      console.log('📝 Subject line:', result.subject);
      
      // For 01-B56RWN58RD, specifically check for UPS tracking
      if (result.orderNumber === '01-B56RWN58RD') {
        const directUpsCheck = bodyContent.match(/(1Z[0-9A-Z]{16})/gi) || [];
        console.log('🚚 Direct UPS check in raw content:', directUpsCheck);
        console.log('🚚 Looking for 1Z24WA430227721340 specifically:', bodyContent.includes('1Z24WA430227721340'));
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Error extracting purchase details:', error);
    return {
      id: email.id,
      subject: email.payload?.headers?.find(h => h.name === 'Subject')?.value || 'Unknown',
      productName: 'Unknown Product',
      orderNumber: `ERROR-${email.id.substring(0, 8)}`,
      status: status,
      timestamp: new Date(),
      error: error.message
    };
  }
} 