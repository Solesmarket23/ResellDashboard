import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { getDocuments, updateDocument } from '../../../../lib/firebase/firebaseUtils';

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

    // Get all existing purchases from Firebase
    const existingPurchases = await getDocuments('purchases');
    console.log(`🔍 Found ${existingPurchases.length} existing purchases in Firebase`);

    let updatedCount = 0;
    let processedCount = 0;

    // Search for all StockX delivery emails
    const deliveryQueries = [
      'from:noreply@stockx.com subject:"Xpress Ship Order Delivered:"',
      'from:noreply@stockx.com subject:"Order Delivered:"'
    ];

    const deliveryEmails = new Map(); // orderNumber -> delivery email info

    for (const query of deliveryQueries) {
      try {
        console.log(`🔍 Searching for delivery emails: ${query}`);
        
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 50 // Get up to 50 delivery emails
        });

        if (response.data.messages) {
          console.log(`📧 Found ${response.data.messages.length} delivery emails for query: ${query}`);
          
          for (const message of response.data.messages) {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });
            
            // Extract subject and order number
            const subject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
            const orderNumber = extractOrderNumberFromEmail(emailData.data);
            
            if (orderNumber) {
              deliveryEmails.set(orderNumber, {
                subject,
                messageId: message.id,
                isDeliveryEmail: true
              });
              console.log(`📦 Found delivery email for order ${orderNumber}: "${subject}"`);
            }
          }
        }
      } catch (error) {
        console.error(`Error searching delivery emails for query "${query}":`, error);
      }
    }

    console.log(`🚚 Found ${deliveryEmails.size} orders with delivery emails`);

    // Update existing purchases that have delivery emails
    for (const purchase of existingPurchases) {
      processedCount++;
      
      if (deliveryEmails.has(purchase.orderNumber)) {
        const deliveryInfo = deliveryEmails.get(purchase.orderNumber);
        
        // Only update if current status is not already "Delivered"
        if (purchase.status !== 'Delivered') {
          console.log(`🔄 Updating order ${purchase.orderNumber} from ${purchase.status} to Delivered`);
          console.log(`📧 Based on delivery email: "${deliveryInfo.subject}"`);
          
          try {
            await updateDocument('purchases', purchase.id, {
              status: 'Delivered',
              statusColor: 'green',
              priority: 4,
              updatedAt: new Date().toISOString(),
              fixedByDeliveryRule: true // Flag to track this was auto-fixed
            });
            
            updatedCount++;
            console.log(`✅ Updated order ${purchase.orderNumber} to Delivered status`);
          } catch (updateError) {
            console.error(`❌ Failed to update order ${purchase.orderNumber}:`, updateError);
          }
        } else {
          console.log(`ℹ️ Order ${purchase.orderNumber} already has Delivered status`);
        }
      }
    }

    console.log(`🎉 Retroactive fix complete: ${updatedCount} orders updated out of ${processedCount} processed`);

    return NextResponse.json({
      success: true,
      message: `Retroactive delivery status fix completed`,
      totalProcessed: processedCount,
      totalUpdated: updatedCount,
      deliveryEmailsFound: deliveryEmails.size
    });

  } catch (error) {
    console.error('Error in retroactive delivery status fix:', error);
    return NextResponse.json({ error: 'Failed to fix delivery status' }, { status: 500 });
  }
}

// Helper function to extract order number from Gmail email
function extractOrderNumberFromEmail(email: any): string | null {
  try {
    // Get email body content
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

    // Try to extract order number using multiple patterns
    const orderNumberPatterns = [
      /Order number:\s*([A-Z0-9-]+)/i,
      /Order Number:\s*([A-Z0-9-]+)/i,
      /Order:\s*([A-Z0-9-]+)/i,
      /([0-9]{2}-[A-Z0-9]+)/i, // Xpress format: 01-3KF7CE560J
      /([0-9]{8}-[0-9]{8})/i,  // Regular format: 12345678-87654321
      /([0-9]{8})/i            // Single number format
    ];

    for (const pattern of orderNumberPatterns) {
      const match = bodyContent.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting order number:', error);
    return null;
  }
} 