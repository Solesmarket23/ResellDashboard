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
  
  // Try to extract order number from subject and HTML
  const orderPatterns = [
    // For refund emails with compound order numbers - extract the second part (the purchase order) FIRST
    /Order number:\s*\d+-(\d+)/i,
    /Order Number:\s*\d+-(\d+)/i,
    /order number:\s*\d+-(\d+)/i,
    // Specific pattern for the format we see: "75573966-75473725"
    /(\d{8})-(\d{8})/i,  // This will capture both parts, we want the second
    // Standard single order numbers (these come after compound patterns)
    /Order number:\s*([A-Z0-9-]+)/i,
    /Order Number:\s*([A-Z0-9-]+)/i,
    /Order:\s*([A-Z0-9-]+)/i,
    /#([A-Z0-9-]+)/i,
    // Additional patterns for HTML content
    /Order number:\s*([0-9]{8})/i,  // 8-digit order numbers
    /order:\s*([0-9]{8})/i,
    // Standalone 8-digit numbers (could be order numbers)
    /\b(\d{8})\b/i
  ];
  
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

    // Query for status update emails only  
    const statusQuery = 'from:noreply@stockx.com (subject:"Order Delivered" OR subject:"Xpress Ship Order Delivered" OR subject:"Order Shipped" OR subject:"Refund Issued:") -subject:"You Sold" -subject:"Sale" -subject:"Payout"';
    
    console.log(`📧 STATUS QUERY: ${statusQuery}`);

    // Get status emails
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: statusQuery,
      maxResults: 100 // Get recent status emails
    });

    const statusMessages = response.data.messages || [];
    console.log(`📧 Found ${statusMessages.length} status emails`);

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
        
        // Only process if it's one of the requested order numbers
        if (!orderNumbers.includes(orderNumber)) {
          console.log(`⏭️ Order ${orderNumber} not in requested list:`, orderNumbers);
          continue;
        }
        
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
    
    console.log(`📊 STATUS SUMMARY: Updated ${updatedOrders.length} out of ${orderNumbers.length} requested orders`);

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