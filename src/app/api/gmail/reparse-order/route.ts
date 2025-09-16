import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { parseGmailApiMessage } from '@/lib/email/orderConfirmationParser';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    const { orderNumber } = await request.json();
    
    if (!orderNumber) {
      return NextResponse.json({ error: 'Order number required' }, { status: 400 });
    }

    console.log(`🔄 RE-PARSING ORDER: ${orderNumber}`);

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

    // Search for the specific order email
    const searchQuery = `from:noreply@stockx.com "${orderNumber}"`;
    console.log(`🔍 Searching for: ${searchQuery}`);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: 5
    });

    if (!response.data.messages || response.data.messages.length === 0) {
      return NextResponse.json({ 
        error: 'No emails found for this order number',
        orderNumber,
        searchQuery
      }, { status: 404 });
    }

    console.log(`📧 Found ${response.data.messages.length} emails for order ${orderNumber}`);

    // Get the first matching email
    const emailData = await gmail.users.messages.get({
      userId: 'me',
      id: response.data.messages[0].id,
      format: 'full'
    });

    // Parse with the updated logic
    const orderInfo = parseGmailApiMessage(emailData.data);
    
    console.log(`📊 RE-PARSED ORDER INFO:`, {
      order_number: orderInfo.order_number,
      product_name: orderInfo.product_name,
      size: orderInfo.size,
      total_amount: orderInfo.total_amount,
      subject: orderInfo.email_subject
    });

    return NextResponse.json({
      success: true,
      orderNumber,
      parsedData: orderInfo,
      emailId: response.data.messages[0].id,
      message: `Successfully re-parsed order ${orderNumber} with updated logic`
    });

  } catch (error) {
    console.error('Error re-parsing order:', error);
    return NextResponse.json(
      { 
        error: 'Failed to re-parse order',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to re-parse a specific order',
    usage: 'POST with { "orderNumber": "your-order-number" }'
  });
}

