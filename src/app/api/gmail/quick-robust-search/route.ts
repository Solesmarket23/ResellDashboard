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

    console.log(`🚀 QUICK ROBUST: Searching ${orderNumbers.length} orders with optimized strategy`);

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

    // Quick strategies - most likely to find missing emails
    const quickStrategies = [
      // Target the specific problem order first
      'from:noreply@stockx.com "01-3KF7CE560J"',
      
      // Then try broader patterns
      'from:noreply@stockx.com "🎉" newer_than:30d',
      'from:noreply@stockx.com "Xpress Ship Order Delivered" newer_than:30d',
      'from:noreply@stockx.com delivered newer_than:30d',
      
      // Fallback for any order numbers
      ...orderNumbers.map(order => `"${order}"`),
    ];

    console.log(`🔍 Using ${quickStrategies.length} quick strategies`);

    const allEmails = new Set<string>(); // Track unique email IDs
    const foundOrders: any = {};

    // Execute searches quickly with reduced rate limiting
    for (let i = 0; i < quickStrategies.length; i++) {
      const query = quickStrategies[i];
      console.log(`🔎 Strategy ${i + 1}: ${query}`);
      
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 100 // Reduced from 500 for speed
        });

        const messages = response.data.messages || [];
        console.log(`📧 Found ${messages.length} emails`);

        // Check messages for our target orders (sample only for speed)
        const samplesToCheck = Math.min(messages.length, 20); // Limit for speed
        
        for (let j = 0; j < samplesToCheck; j++) {
          const message = messages[j];
          
          if (!allEmails.has(message.id!)) {
            allEmails.add(message.id!);
            
            try {
              const fullMessage = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
              });

              const headers = fullMessage.data.payload?.headers || [];
              const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
              const content = getEmailContent(fullMessage.data);

              // Check for each target order
              for (const targetOrder of orderNumbers) {
                if (content.includes(targetOrder) || subject.includes(targetOrder)) {
                  const isDelivery = subject.includes('Delivered') || subject.includes('🎉') || content.includes('delivered');
                  
                  if (!foundOrders[targetOrder] || isDelivery) {
                    foundOrders[targetOrder] = {
                      orderNumber: targetOrder,
                      status: isDelivery ? 'Delivered' : 'Found',
                      statusColor: isDelivery ? 'green' : 'blue',
                      priority: isDelivery ? 5 : 3,
                      subject: subject,
                      date: headers.find((h: any) => h.name === 'Date')?.value || '',
                      emailId: message.id,
                      strategy: `quick_${i + 1}`,
                      isDelivery
                    };
                    console.log(`✅ QUICK FIND: ${targetOrder} → ${isDelivery ? 'Delivered' : 'Found'} (${subject.substring(0, 50)}...)`);
                  }
                }
              }
            } catch (emailError) {
              console.error(`❌ Error checking email:`, emailError);
            }
          }
        }
        
        // Minimal delay for rate limiting
        await delay(200);
        
      } catch (queryError) {
        console.error(`❌ Query failed:`, queryError);
      }
    }

    // Filter to only delivery status updates
    const statusUpdates = Object.values(foundOrders).filter((order: any) => order.isDelivery);
    
    console.log(`📊 QUICK RESULTS: Found ${Object.keys(foundOrders).length} orders, ${statusUpdates.length} with delivery status`);

    return NextResponse.json({
      success: true,
      updatedOrders: statusUpdates,
      summary: {
        requested: orderNumbers.length,
        found: Object.keys(foundOrders).length,
        updated: statusUpdates.length,
        searchType: 'quick_robust'
      },
      allResults: foundOrders
    });

  } catch (error: any) {
    console.error('❌ Quick robust search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to perform quick robust search',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

function getEmailContent(message: any) {
  let content = '';
  
  if (message.payload) {
    if (message.payload.body && message.payload.body.data) {
      content += decodeBase64(message.payload.body.data);
    }
    
    if (message.payload.parts) {
      message.payload.parts.forEach((part: any) => {
        if (part.body && part.body.data) {
          content += decodeBase64(part.body.data);
        }
      });
    }
  }
  
  return content;
}

function decodeBase64(data: string) {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method with order numbers for quick robust search',
    example: {
      method: 'POST',
      body: {
        orderNumbers: ['01-3KF7CE560J', '01-B56RWN58RD']
      }
    }
  });
}