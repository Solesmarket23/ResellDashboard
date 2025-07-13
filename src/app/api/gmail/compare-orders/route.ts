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

    console.log(`🔍 COMPARISON: Testing both orders`);

    const workingOrder = '01-B56RWN58RD';
    const problemOrder = '01-3KF7CE560J';

    const results: any = {
      timestamp: new Date().toISOString(),
      workingOrder: { orderNumber: workingOrder, found: false, emails: [] },
      problemOrder: { orderNumber: problemOrder, found: false, emails: [] }
    };

    // Test queries that should find delivery emails
    const testQueries = [
      'from:noreply@stockx.com "Xpress Ship Order Delivered"',
      'from:noreply@stockx.com delivered',
      'from:noreply@stockx.com "🎉"'
    ];

    for (const query of testQueries) {
      console.log(`🔍 Testing query: "${query}"`);
      
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 100
        });

        const messages = response.data.messages || [];
        console.log(`📧 Found ${messages.length} emails for query`);

        // Check each email for our order numbers
        for (const message of messages) {
          try {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            const headers = emailData.data.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
            const date = headers.find((h: any) => h.name === 'Date')?.value || '';

            // Check HTML content for order numbers
            let htmlContent = '';
            if (emailData.data.payload) {
              const payload = emailData.data.payload;
              
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

            // Check for working order
            if (subject.includes(workingOrder) || htmlContent.includes(workingOrder)) {
              results.workingOrder.found = true;
              results.workingOrder.emails.push({
                query,
                subject,
                date,
                id: message.id,
                foundIn: subject.includes(workingOrder) ? 'subject' : 'html'
              });
              console.log(`🎯 WORKING ORDER FOUND: ${subject}`);
            }

            // Check for problem order
            if (subject.includes(problemOrder) || htmlContent.includes(problemOrder)) {
              results.problemOrder.found = true;
              results.problemOrder.emails.push({
                query,
                subject,
                date,
                id: message.id,
                foundIn: subject.includes(problemOrder) ? 'subject' : 'html'
              });
              console.log(`🎯 PROBLEM ORDER FOUND: ${subject}`);
            }

          } catch (emailError) {
            console.error(`❌ Error getting email details:`, emailError);
          }
        }

      } catch (queryError) {
        console.error(`❌ Error with query "${query}":`, queryError);
      }
    }

    console.log(`📊 COMPARISON RESULTS:`);
    console.log(`Working order ${workingOrder}: ${results.workingOrder.found ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`Problem order ${problemOrder}: ${results.problemOrder.found ? 'FOUND' : 'NOT FOUND'}`);

    return NextResponse.json(results);

  } catch (error) {
    console.error('❌ Comparison error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to compare orders',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to compare Gmail search results for both orders'
  });
}