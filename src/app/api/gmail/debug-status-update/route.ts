import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    const { orderNumbers } = await request.json();
    
    if (!orderNumbers || !Array.isArray(orderNumbers)) {
      return NextResponse.json({ error: 'Order numbers array required' }, { status: 400 });
    }

    console.log(`🐛 DEBUG STATUS UPDATE: Testing ${orderNumbers.length} orders`);

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

    const debugResults: any[] = [];

    // Test multiple search queries to find the emails
    const searchQueries = [
      // Most specific queries first
      'from:noreply@stockx.com subject:"🎉 Xpress Ship Order Delivered:"',
      'from:noreply@stockx.com subject:"Xpress Ship Order Delivered:"',
      'from:noreply@stockx.com subject:"Order Delivered:"',
      'from:noreply@stockx.com subject:"Xpress Order Delivered:"',
      // Broader queries
      'from:noreply@stockx.com subject:Delivered',
      'from:noreply@stockx.com subject:"Order" subject:"Delivered"',
      // Without quotes to catch partial matches
      'from:noreply@stockx.com Xpress Ship Order Delivered',
      'from:noreply@stockx.com Order Delivered',
      // Very broad
      'from:stockx.com delivered',
      'from:noreply@stockx.com after:2024/1/1'
    ];

    for (const query of searchQueries) {
      console.log(`🔍 Testing query: "${query}"`);
      
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 10
        });

        const messages = response.data.messages || [];
        console.log(`📧 Found ${messages.length} emails for query: "${query}"`);

        if (messages.length > 0) {
          // Get details of first few emails
          for (let i = 0; i < Math.min(3, messages.length); i++) {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: messages[i].id,
              format: 'full'
            });

            const headers = emailData.data.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
            const from = headers.find((h: any) => h.name === 'From')?.value || '';
            const date = headers.find((h: any) => h.name === 'Date')?.value || '';

            // Extract order number
            const orderNumber = extractOrderNumberDebug(emailData.data);

            debugResults.push({
              query,
              emailId: messages[i].id,
              subject,
              from,
              date,
              orderNumber,
              matchesRequestedOrders: orderNumbers.includes(orderNumber || ''),
              orderNumberExtraction: {
                foundInSubject: subject.includes(orderNumber || 'NO_ORDER'),
                foundInBody: false // Will be set by extraction function
              }
            });

            console.log(`📧 Email ${i+1}: "${subject}"`);
            console.log(`   Order: ${orderNumber || 'NOT FOUND'}`);
            console.log(`   Matches requested: ${orderNumbers.includes(orderNumber || '')}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error with query "${query}":`, error);
        debugResults.push({
          query,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Test specific order number searches
    console.log(`🔍 Testing order-specific searches...`);
    for (const orderNumber of orderNumbers) {
      const orderQuery = `from:stockx.com "${orderNumber}"`;
      console.log(`🔍 Searching for order: ${orderNumber}`);
      
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: orderQuery,
          maxResults: 10
        });

        const messages = response.data.messages || [];
        console.log(`📧 Found ${messages.length} emails containing order ${orderNumber}`);

        if (messages.length > 0) {
          const emailDetails = [];
          for (const message of messages) {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            const headers = emailData.data.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
            
            emailDetails.push({
              subject,
              isDeliveryEmail: subject.toLowerCase().includes('delivered'),
              hasEmoji: subject.includes('🎉')
            });
          }

          debugResults.push({
            orderNumberSearch: orderNumber,
            emailsFound: messages.length,
            emails: emailDetails
          });
        }
      } catch (error) {
        console.error(`❌ Error searching for order ${orderNumber}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      requestedOrders: orderNumbers,
      debugResults,
      summary: {
        totalQueriesTested: searchQueries.length,
        resultsFound: debugResults.length
      },
      recommendations: [
        'Check if the emojis in email subjects are causing search issues',
        'Verify order numbers match exactly (including any prefixes like "01-")',
        'The StockX emails might have been filtered or categorized differently',
        'Try searching Gmail directly for these order numbers to verify they exist'
      ]
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    return NextResponse.json(
      { 
        error: 'Debug failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Enhanced order number extraction for debugging
function extractOrderNumberDebug(emailData: any): string | null {
  const headers = emailData.payload?.headers || [];
  const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
  
  console.log(`🔍 Extracting order from subject: "${subjectHeader}"`);
  
  // Remove emoji prefix if present
  const cleanSubject = subjectHeader.replace(/^[🎉🚚📦]+\s*/, '');
  console.log(`🧹 Cleaned subject: "${cleanSubject}"`);
  
  // Try various patterns
  const patterns = [
    // StockX format with prefix
    /order number:\s*([0-9]{2}-[A-Z0-9]+)/i,
    /order:\s*([0-9]{2}-[A-Z0-9]+)/i,
    /#([0-9]{2}-[A-Z0-9]+)/i,
    // Without prefix
    /order number:\s*([A-Z0-9]+)/i,
    /order:\s*([A-Z0-9]+)/i,
    /#([A-Z0-9]+)/i,
    // Just the alphanumeric part
    /\b([0-9]{2}-[A-Z0-9]{10})\b/i,
    /\b([A-Z0-9]{10})\b/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanSubject.match(pattern);
    if (match) {
      console.log(`✅ Pattern matched: ${pattern.toString()} → "${match[1]}"`);
      return match[1].trim();
    }
  }
  
  // Try HTML body
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
    }
  }
  
  if (htmlContent) {
    console.log(`🔍 Searching HTML for order number...`);
    // Look for order numbers in HTML
    const htmlMatch = htmlContent.match(/order[:\s#]+([0-9]{2}-[A-Z0-9]+)/i);
    if (htmlMatch) {
      console.log(`✅ Found in HTML: "${htmlMatch[1]}"`);
      return htmlMatch[1].trim();
    }
  }
  
  console.log(`❌ No order number found`);
  return null;
}