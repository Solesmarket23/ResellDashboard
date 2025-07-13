import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

// Status update configuration - only status-related emails
function getStatusUpdateConfig() {
  return {
    statusEmails: {
      orderDelivered: {
        status: "Delivered",
        statusColor: "green",
        priority: 5,
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
      orderShipped: {
        status: "Shipped",
        statusColor: "blue", 
        priority: 4,
        subjectPatterns: [
          "Order Verified & Shipped:",
          "Order Shipped:",
          "Xpress Order Shipped:",
          "Your order has shipped"
        ]
      },
      orderCanceled: {
        status: "Canceled",
        statusColor: "red",
        priority: 6,
        subjectPatterns: [
          "Refund Issued:",
          "Order canceled",
          "Order Canceled",
          "Refund processed"
        ]
      }
    }
  };
}

// Extract order number from email content
function extractOrderNumber(emailData: any): string | null {
  const headers = emailData.payload?.headers || [];
  const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
  
  // Clean subject by removing emoji prefixes
  const cleanSubject = subjectHeader.replace(/^[🎉🚚📦💰❌]+\s*/, '');
  console.log(`🧹 Cleaned subject: "${subjectHeader}" → "${cleanSubject}"`);
  
  // Try to extract order number from cleaned subject first
  const orderPatterns = [
    // For refund emails with compound order numbers - extract the second part (the purchase order) FIRST
    /Order number:\s*\d+-(\d+)/i,
    /Order Number:\s*\d+-(\d+)/i,
    /order number:\s*\d+-(\d+)/i,
    // Specific pattern for the format we see: "75573966-75473725"
    /(\d{8})-(\d{8})/i,  // This will capture both parts, we want the second
    // StockX format with alphanumeric prefix (e.g., "01-3KF7CE560J")
    /Order number:\s*([0-9]{2}-[A-Z0-9]+)/i,
    /Order Number:\s*([0-9]{2}-[A-Z0-9]+)/i,
    /order:\s*([0-9]{2}-[A-Z0-9]+)/i,
    /#([0-9]{2}-[A-Z0-9]+)/i,
    // Standard single order numbers (these come after compound patterns)
    /Order number:\s*([A-Z0-9-]+)/i,
    /Order Number:\s*([A-Z0-9-]+)/i,
    /Order:\s*([A-Z0-9-]+)/i,
    /#([A-Z0-9-]+)/i,
    // Additional patterns for HTML content
    /Order number:\s*([0-9]{8})/i,  // 8-digit order numbers
    /order:\s*([0-9]{8})/i,
    // Standalone 8-digit numbers (could be order numbers)
    /\b(\d{8})\b/i,
    // StockX alphanumeric patterns without "Order" prefix
    /\b([0-9]{2}-[A-Z0-9]{10})\b/i
  ];
  
  // Try cleaned subject first
  for (const pattern of orderPatterns) {
    const match = cleanSubject.match(pattern);
    if (match) {
      console.log(`🎯 Cleaned subject match: pattern=${pattern.toString()}, result="${match[1]}"`);
      // For compound order pattern like "75573966-75473725", we want the second part
      if (pattern.toString().includes('(\\d{8})-(\\d{8})') && match[2]) {
        return match[2].trim(); // Return the second order number (purchase order)
      } else {
        return match[1].trim();
      }
    }
  }
  
  // If no match in cleaned subject, try original subject
  for (const pattern of orderPatterns) {
    const match = subjectHeader.match(pattern);
    if (match) {
      // For compound order pattern like "75573966-75473725", we want the second part
      if (pattern.toString().includes('(\\d{8})-(\\d{8})') && match[2]) {
        console.log(`🎯 Subject compound match: pattern=${pattern.toString()}, first="${match[1]}", second="${match[2]}"`);
        return match[2].trim(); // Return the second order number (purchase order)
      } else {
        console.log(`🎯 Subject match found: pattern=${pattern.toString()}, result="${match[1].trim()}"`);
        return match[1].trim();
      }
    }
  }
  
  // If not in subject, try to get HTML content and extract from there
  let htmlContent = "";
  if (emailData.payload) {
    const payload = emailData.payload;
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          const bodyData = part.body?.data || '';
          if (bodyData) {
            htmlContent = Buffer.from(bodyData, 'base64').toString('utf8');
            break;
          }
        }
      }
    } else if (payload.mimeType === 'text/html') {
      const bodyData = payload.body?.data || '';
      if (bodyData) {
        htmlContent = Buffer.from(bodyData, 'base64').toString('utf8');
      }
    }
  }
  
  if (htmlContent) {
    console.log(`🔍 Searching HTML content for order number...`);
    for (const pattern of orderPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        // For compound order pattern like "75573966-75473725", we want the second part
        if (pattern.toString().includes('(\\d{8})-(\\d{8})') && match[2]) {
          console.log(`🎯 HTML compound match: pattern=${pattern.toString()}, first="${match[1]}", second="${match[2]}"`);
          return match[2].trim(); // Return the second order number (purchase order)
        } else {
          console.log(`🎯 HTML match found: pattern=${pattern.toString()}, result="${match[1].trim()}"`);
          return match[1].trim();
        }
      }
    }
    console.log(`❌ No order number patterns matched in HTML`);
  }
  
  return null;
}

// Categorize email and get status info
function categorizeStatusEmail(subject: string, config: any) {
  for (const [categoryKey, category] of Object.entries(config.statusEmails)) {
    for (const pattern of (category as any).subjectPatterns) {
      if (subject.toLowerCase().includes(pattern.toLowerCase())) {
        return {
          status: (category as any).status,
          statusColor: (category as any).statusColor,
          priority: (category as any).priority
        };
      }
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    // Get request body with order numbers to update
    const { orderNumbers } = await request.json();
    
    if (!orderNumbers || !Array.isArray(orderNumbers)) {
      return NextResponse.json({ error: 'Order numbers array required' }, { status: 400 });
    }

    console.log(`🔄 STATUS UPDATE: Checking status for ${orderNumbers.length} orders`);

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
    const config = getStatusUpdateConfig();

    // Query for status update emails only - include emoji prefixes and partial matches
    // Use multiple queries to ensure we catch all variations
    const statusQueries = [
      // Delivery emails - use partial matches to catch emoji prefixes and product suffixes
      'from:noreply@stockx.com "Xpress Ship Order Delivered"',
      'from:noreply@stockx.com "Order Delivered"',
      'from:noreply@stockx.com "Xpress Order Delivered"',
      // Shipping emails
      'from:noreply@stockx.com "Order Verified & Shipped"',
      'from:noreply@stockx.com "Order Shipped"',
      'from:noreply@stockx.com "Xpress Order Shipped"',
      // Refund emails
      'from:noreply@stockx.com "Refund Issued"',
      // Broader catch-all searches
      'from:noreply@stockx.com delivered',
      'from:noreply@stockx.com shipped'
    ];
    
    console.log(`📧 STATUS QUERIES: ${statusQueries.length} queries to check`);

    // Get status emails using multiple queries
    const allStatusMessages: any[] = [];
    const messageIds = new Set<string>(); // To avoid duplicates
    
    for (const query of statusQueries) {
      try {
        console.log(`🔍 Checking: "${query}"`);
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 50 // Limit per query to avoid timeout
        });
        
        const messages = response.data.messages || [];
        console.log(`📧 Found ${messages.length} emails for: "${query}"`);
        
        // Add unique messages
        for (const message of messages) {
          if (!messageIds.has(message.id!)) {
            messageIds.add(message.id!);
            allStatusMessages.push(message);
          }
        }
      } catch (error) {
        console.error(`❌ Error with query "${query}":`, error);
      }
    }
    
    const statusMessages = allStatusMessages;
    console.log(`📧 Total unique status emails found: ${statusMessages.length}`);

    const statusUpdates: Record<string, any> = {};

    // Process each status email
    for (const message of statusMessages) {
      try {
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        
        const headers = emailData.data.payload?.headers || [];
        const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || '';
        
        // Extract order number
        const orderNumber = extractOrderNumber(emailData.data);
        console.log(`📧 Processing: ${subjectHeader}`);
        console.log(`🔍 Extracted order number: "${orderNumber}" from email`);
        
        if (!orderNumber) {
          console.log(`❌ No order number found in: ${subjectHeader}`);
          continue;
        }
        
        // Check if order number matches any of the requested orders
        // Need to check both exact match and potential variations
        const matchesRequested = orderNumbers.some(reqOrder => {
          // Exact match
          if (reqOrder === orderNumber) return true;
          // Check if one contains the other (for partial matches)
          if (reqOrder.includes(orderNumber) || orderNumber.includes(reqOrder)) return true;
          // Check if they're the same without prefix (e.g., "01-ABC" vs "ABC")
          const reqParts = reqOrder.split('-');
          const orderParts = orderNumber.split('-');
          if (reqParts.length > 1 && orderParts.length > 1) {
            return reqParts[1] === orderParts[1];
          }
          return false;
        });
        
        if (!matchesRequested) {
          console.log(`⏭️ Order ${orderNumber} not in requested list:`, orderNumbers);
          continue;
        }
        
        console.log(`✅ Order ${orderNumber} matches requested list`);
        
        console.log(`✅ Processing status update for order: ${orderNumber}`);
        
        // Categorize the email
        const statusInfo = categorizeStatusEmail(subjectHeader, config);
        if (!statusInfo) continue;
        
        // Keep the highest priority status for each order
        if (!statusUpdates[orderNumber] || statusInfo.priority > statusUpdates[orderNumber].priority) {
          statusUpdates[orderNumber] = {
            orderNumber,
            status: statusInfo.status,
            statusColor: statusInfo.statusColor,
            priority: statusInfo.priority,
            subject: subjectHeader,
            date: dateHeader,
            emailId: message.id
          };
          console.log(`✅ STATUS UPDATE: ${orderNumber} → ${statusInfo.status} (from: ${subjectHeader})`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing status email:`, error);
        continue;
      }
    }

    const updatedOrders = Object.values(statusUpdates);
    
    console.log(`📊 STATUS SUMMARY: Found ${updatedOrders.length} status updates out of ${orderNumbers.length} requested orders`);
    console.log(`📊 STATUS DETAILS:`, updatedOrders.map(order => `${order.orderNumber}: ${order.status}`));

    return NextResponse.json({
      success: true,
      updatedOrders,
      summary: {
        requested: orderNumbers.length,
        updated: updatedOrders.length,
        statusEmails: statusMessages.length
      }
    });

  } catch (error) {
    console.error('❌ Status update error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Use POST method with order numbers array to update status',
    example: {
      method: 'POST',
      body: {
        orderNumbers: ['75922624', '75931594']
      }
    }
  });
}