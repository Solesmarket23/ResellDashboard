import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

// Helper function to create the email content
function createEmailContent(orderNumber: string, productName: string, userName: string = 'User') {
  const subject = `Return Label Request - Order ${orderNumber}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
      <p>Hello,</p>
      <p>I would like to request a return label for the following item that failed verification:</p>
      <p style="margin-left: 20px;">
        Order Number: ${orderNumber}<br>
        Item: ${productName}
      </p>
      <p>Please provide a return shipping label at your earliest convenience.</p>
      <p>Thank you,<br>
      ${userName}</p>
    </div>
  `;
  
  const plainBody = `Return Label Request

Hello,

I would like to request a return label for the following item that failed verification:

Order Number: ${orderNumber}
Item: ${productName}

Please provide a return shipping label at your earliest convenience.

Thank you,
${userName}`;

  return { subject, htmlBody, plainBody };
}

// Helper function to create the raw email
function createRawEmail(to: string, from: string, subject: string, htmlBody: string, plainBody: string) {
  const boundary = '----=_Part_0_123456789.123456789';
  
  const email = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    plainBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`
  ].join('\r\n');
  
  // Convert to base64url format required by Gmail API
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
    
  return encodedEmail;
}

export async function POST(request: NextRequest) {
  try {
    const { orderNumber, productName, recipientEmail } = await request.json();
    
    // Validate input
    if (!orderNumber || !productName || !recipientEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: orderNumber, productName, recipientEmail' },
        { status: 400 }
      );
    }
    
    // Get OAuth tokens from cookies
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Gmail not connected. Please reconnect your Gmail account.' },
        { status: 401 }
      );
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
    
    // Get user info for the "from" email and name
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const userEmail = userInfo.data.email || 'noreply@resellerdashboard.com';
    const userName = userInfo.data.name || 'ResellDashboard User';
    
    // Create email content
    const { subject, htmlBody, plainBody } = createEmailContent(orderNumber, productName, userName);
    
    // Create the raw email
    const rawEmail = createRawEmail(recipientEmail, userEmail, subject, htmlBody, plainBody);
    
    // Send the email
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawEmail
      }
    });
    
    console.log(`📧 Email sent successfully: ${result.data.id}`);
    
    return NextResponse.json({
      success: true,
      messageId: result.data.id,
      message: `Return request email sent to ${recipientEmail}`
    });
    
  } catch (error) {
    console.error('Error sending email:', error);
    
    // Check if it's an auth error
    if (error.code === 401 || error.message?.includes('Invalid Credentials')) {
      return NextResponse.json(
        { error: 'Gmail authentication expired. Please reconnect your Gmail account.' },
        { status: 401 }
      );
    }
    
    // Check if it's a scope error
    if (error.message?.includes('Insufficient Permission') || error.message?.includes('gmail.send')) {
      return NextResponse.json(
        { error: 'Gmail send permission not granted. Please reconnect your Gmail account to grant email sending permission.' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to send email', details: error.message },
      { status: 500 }
    );
  }
}