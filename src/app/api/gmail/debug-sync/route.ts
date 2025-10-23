import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Gmail Debug Sync - Starting...');
    
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'Gmail not connected',
        debug: {
          hasAccessToken: false,
          hasRefreshToken: !!refreshToken,
          cookies: {
            gmail_connected: !!cookieStore.get('gmail_connected')?.value,
            gmail_access_token: !!accessToken,
            gmail_refresh_token: !!refreshToken
          }
        }
      }, { status: 401 });
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

    // Test basic Gmail access
    console.log('🔍 Testing basic Gmail API access...');
    const basicTest = await gmail.users.messages.list({
      userId: 'me',
      q: '',
      maxResults: 5
    });
    console.log(`🔍 Basic test: Found ${basicTest.data.messages?.length || 0} total emails`);

    // Test StockX emails specifically
    console.log('🔍 Testing StockX emails...');
    const stockxTest = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:noreply@stockx.com',
      maxResults: 20
    });
    console.log(`🔍 StockX test: Found ${stockxTest.data.messages?.length || 0} emails from noreply@stockx.com`);

    // Test purchase-related queries
    const purchaseQueries = [
      'from:noreply@stockx.com -subject:"You Sold" -subject:"Sale" -subject:"Payout"',
      'subject:"Order Confirmed"',
      'subject:"Order Shipped"',
      'subject:"Order Delivered"',
      'from:noreply@stockx.com subject:"Order"'
    ];

    const queryResults = [];
    for (const query of purchaseQueries) {
      try {
        console.log(`🔍 Testing query: "${query}"`);
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 10
        });
        
        const count = response.data.messages?.length || 0;
        console.log(`🔍 Query "${query}": Found ${count} emails`);
        
        queryResults.push({
          query,
          count,
          messages: response.data.messages?.slice(0, 3).map(m => ({
            id: m.id,
            threadId: m.threadId
          })) || []
        });
      } catch (error) {
        console.error(`🔍 Query "${query}" failed:`, error);
        queryResults.push({
          query,
          count: 0,
          error: error.message
        });
      }
    }

    // Get sample email details
    let sampleEmail = null;
    if (stockxTest.data.messages && stockxTest.data.messages.length > 0) {
      try {
        const emailId = stockxTest.data.messages[0].id;
        console.log(`🔍 Getting sample email details for ID: ${emailId}`);
        const emailDetails = await gmail.users.messages.get({
          userId: 'me',
          id: emailId,
          format: 'full'
        });
        
        const headers = emailDetails.data.payload?.headers || [];
        const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
        const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || '';
        
        sampleEmail = {
          id: emailId,
          from: fromHeader,
          subject: subjectHeader,
          date: dateHeader
        };
        
        console.log(`🔍 Sample email: From="${fromHeader}", Subject="${subjectHeader}"`);
      } catch (error) {
        console.error('🔍 Error getting sample email:', error);
      }
    }

    return NextResponse.json({
      success: true,
      debug: {
        basicTest: {
          totalEmails: basicTest.data.messages?.length || 0
        },
        stockxTest: {
          totalEmails: stockxTest.data.messages?.length || 0
        },
        queryResults,
        sampleEmail,
        config: {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          accessTokenLength: accessToken?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('🔍 Debug sync error:', error);
    return NextResponse.json({ 
      error: 'Debug sync failed',
      details: error.message 
    }, { status: 500 });
  }
}
