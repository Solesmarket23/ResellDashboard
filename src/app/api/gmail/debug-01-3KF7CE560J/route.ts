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

    const { queries, orderNumber } = await request.json();

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

    console.log(`🔍 DEBUG: Starting targeted search for order ${orderNumber}`);

    const results: any = {
      orderNumber,
      timestamp: new Date().toISOString(),
      queries: [],
      summary: {
        totalQueries: queries.length,
        totalEmails: 0,
        matchingEmails: 0
      }
    };

    // Test each query
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`🔍 Testing query ${i + 1}/${queries.length}: "${query}"`);
      
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 100
        });

        const messages = response.data.messages || [];
        console.log(`📧 Query "${query}" found ${messages.length} emails`);

        const queryResult: any = {
          query,
          emailsFound: messages.length,
          emails: []
        };

        // Get details for each email
        for (const message of messages.slice(0, 10)) { // Limit to 10 per query
          try {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            const headers = emailData.data.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
            const date = headers.find((h: any) => h.name === 'Date')?.value || '';
            const from = headers.find((h: any) => h.name === 'From')?.value || '';

            // Check if this email contains our target order number
            let containsOrderNumber = false;
            let foundOrderNumber = '';

            // Check subject
            if (subject.includes(orderNumber) || subject.includes('3KF7CE560J')) {
              containsOrderNumber = true;
              foundOrderNumber = 'subject';
            }

            // Check HTML content
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

            if (htmlContent && (htmlContent.includes(orderNumber) || htmlContent.includes('3KF7CE560J'))) {
              containsOrderNumber = true;
              foundOrderNumber = foundOrderNumber ? `${foundOrderNumber}, html` : 'html';
            }

            const emailInfo = {
              id: message.id,
              subject,
              date,
              from,
              containsOrderNumber,
              foundIn: foundOrderNumber,
              htmlSnippet: htmlContent ? htmlContent.substring(0, 200) + '...' : 'No HTML content'
            };

            queryResult.emails.push(emailInfo);

            if (containsOrderNumber) {
              console.log(`🎯 FOUND MATCH in ${foundOrderNumber}: ${subject}`);
              results.summary.matchingEmails++;
            }

          } catch (emailError) {
            console.error(`❌ Error getting email details:`, emailError);
            queryResult.emails.push({
              id: message.id,
              error: 'Failed to get email details'
            });
          }
        }

        results.queries.push(queryResult);
        results.summary.totalEmails += messages.length;

      } catch (queryError) {
        console.error(`❌ Error with query "${query}":`, queryError);
        results.queries.push({
          query,
          error: queryError instanceof Error ? queryError.message : 'Unknown error',
          emailsFound: 0,
          emails: []
        });
      }
    }

    console.log(`📊 DEBUG SUMMARY: ${results.summary.matchingEmails} matching emails found out of ${results.summary.totalEmails} total emails`);

    return NextResponse.json(results);

  } catch (error) {
    console.error('❌ Debug search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to debug search',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to debug Gmail search for specific order',
    example: {
      method: 'POST',
      body: {
        queries: ['from:noreply@stockx.com "01-3KF7CE560J"'],
        orderNumber: '01-3KF7CE560J'
      }
    }
  });
}