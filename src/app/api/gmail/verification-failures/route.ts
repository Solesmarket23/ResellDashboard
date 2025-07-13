import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

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

    // Get limit from query params - default to 50 instead of 10
    const limit = parseInt(url.searchParams.get('limit') || '50');

    console.log(`🔍 Scanning for verification failures with limit: ${limit}`);

    // Search specifically for StockX verification failure emails
    // Add date filter to start from January 1, 2024
    const dateFilter = `after:2024/1/1`;
    
    // Only search for "An Update Regarding Your Sale" emails
    const queries = [
      `from:noreply@stockx.com subject:"An Update Regarding Your Sale" ${dateFilter}`,
      `from:stockx.com subject:"An Update Regarding Your Sale" ${dateFilter}`
    ];

    const allFailures = [];

    for (const query of queries) {
      try {
        console.log(`🔍 Executing query: "${query}"`);
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: limit,
          // Order by internal date descending to get most recent first
          orderBy: 'internalDate desc'
        });

        if (response.data.messages) {
          console.log(`📧 Found ${response.data.messages.length} messages for query: ${query}`);
          
          for (const message of response.data.messages) {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            const parsedFailure = parseVerificationFailure(emailData.data);
            if (parsedFailure) {
              allFailures.push(parsedFailure);
            }
          }
        }
      } catch (error) {
        console.error(`Error with query "${query}":`, error);
      }
    }

    // Remove duplicates based on order number
    const uniqueFailures = Array.from(
      new Map(allFailures.map(item => [item.orderNumber, item])).values()
    );

    // Sort by date (most recent first)
    uniqueFailures.sort((a, b) => {
      const dateA = new Date(a.emailDate || 0);
      const dateB = new Date(b.emailDate || 0);
      return dateB.getTime() - dateA.getTime();
    });

    console.log(`✅ Found ${uniqueFailures.length} unique verification failures`);

    return NextResponse.json({ 
      failures: uniqueFailures,
      totalFound: uniqueFailures.length
    });

  } catch (error) {
    console.error('Error fetching verification failures:', error);
    return NextResponse.json({ error: 'Failed to fetch verification failures' }, { status: 500 });
  }
}

function parseVerificationFailure(email: any) {
  try {
    const fromHeader = email.payload.headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = email.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
    const dateHeader = email.payload.headers.find((h: any) => h.name === 'Date')?.value || '';

    // Extract order number from subject or body
    let orderNumber = extractOrderNumber(email);
    
    if (!orderNumber) {
      return null;
    }

    // Parse date
    const date = new Date(dateHeader);
    const formattedDate = date.toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric', 
      year: '2-digit' 
    });

    // Also get the email internal date for sorting
    const emailDate = email.internalDate ? new Date(parseInt(email.internalDate)) : date;

    return {
      id: email.id,
      orderNumber,
      productName: 'StockX Item',
      failureReason: 'Did not pass verification',
      date: formattedDate,
      emailDate: emailDate.toISOString(),
      status: 'Needs Review',
      subject: subjectHeader,
      fromEmail: fromHeader
    };

  } catch (error) {
    console.error('Error parsing verification failure:', error);
    return null;
  }
}

function extractOrderNumber(email: any): string | null {
  try {
    // First check subject line
    const subjectHeader = email.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
    
    // Common order number patterns in StockX emails
    const patterns = [
      /Order[:\s#]*([0-9]{8}-[0-9]{8})/i,
      /\b([0-9]{8}-[0-9]{8})\b/,
      /Order Number[:\s]*([0-9\-]+)/i,
      /Order ID[:\s]*([0-9\-]+)/i,
    ];

    // Check subject first
    for (const pattern of patterns) {
      const match = subjectHeader.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // If not in subject, check body
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

    // Search body for order number
    for (const pattern of patterns) {
      const match = bodyContent.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // If still no match, generate a placeholder
    return `UNKNOWN-${email.id.substring(0, 8)}`;

  } catch (error) {
    console.error('Error extracting order number:', error);
    return null;
  }
}