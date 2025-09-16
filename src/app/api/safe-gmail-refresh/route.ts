import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { getDocuments, addDocument, updateDocument } from '../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting SAFE Gmail refresh (no data deletion)...');

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

    // Get existing purchases to avoid duplicates
    const existingPurchases = await getDocuments('purchases');
    const existingOrderNumbers = new Set(
      existingPurchases.map((p: any) => p.orderNumber).filter(Boolean)
    );

    console.log(`📊 Found ${existingPurchases.length} existing purchases`);
    console.log(`📋 Existing order numbers: ${existingOrderNumbers.size} unique orders`);

    // Search for purchase emails
    const queries = [
      'from:noreply@stockx.com subject:"Order Confirmed"',
      'from:noreply@stockx.com subject:"Order Verified"',
      'from:noreply@stockx.com subject:"Order Shipped"',
      'from:noreply@stockx.com subject:"Order Delivered"',
      'from:noreply@stockx.com subject:"Xpress Order"'
    ];

    const allNewPurchases: any[] = [];
    let totalProcessed = 0;

    for (const query of queries) {
      try {
        console.log(`🔍 Searching with query: ${query}`);
        
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 50
        });

        if (response.data.messages && response.data.messages.length > 0) {
          console.log(`📧 Found ${response.data.messages.length} emails for query: ${query}`);
          
          for (const message of response.data.messages.slice(0, 20)) { // Limit per query
            try {
              const emailData = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
              });

              // Extract order number from subject
              const subject = emailData.data.payload?.headers?.find(
                (h: any) => h.name === 'Subject'
              )?.value || '';

              // Simple order number extraction
              const orderMatch = subject.match(/(\d{8,})/);
              if (orderMatch) {
                const orderNumber = orderMatch[1];
                
                // Only process if we don't already have this order
                if (!existingOrderNumbers.has(orderNumber)) {
                  console.log(`🆕 Found new order: ${orderNumber} - ${subject}`);
                  
                  // Get user ID from request
                  const { searchParams } = new URL(request.url);
                  const userId = searchParams.get('userId') || '20115098dd871b0a7863cd1017fa';
                  
                  // Create a basic purchase record
                  const newPurchase = {
                    userId: userId,
                    orderNumber: orderNumber,
                    productName: 'Product from Gmail',
                    status: 'Ordered',
                    tracking: 'No tracking',
                    market: 'StockX',
                    price: '$0.00',
                    purchaseDate: new Date().toISOString(),
                    type: 'gmail',
                    createdAt: new Date().toISOString(),
                    emailSubject: subject,
                    emailId: message.id,
                    isNew: true
                  };

                  allNewPurchases.push(newPurchase);
                  totalProcessed++;
                } else {
                  console.log(`⏭️ Skipping existing order: ${orderNumber}`);
                }
              }
            } catch (emailError) {
              console.warn(`⚠️ Error processing email ${message.id}:`, emailError);
            }
          }
        }
      } catch (queryError) {
        console.warn(`⚠️ Error with query "${query}":`, queryError);
      }
    }

    console.log(`🎉 SAFE REFRESH COMPLETE:`);
    console.log(`  📊 Total processed: ${totalProcessed}`);
    console.log(`  🆕 New purchases found: ${allNewPurchases.length}`);
    console.log(`  📋 Existing orders preserved: ${existingOrderNumbers.size}`);

    return NextResponse.json({
      success: true,
      message: 'Safe Gmail refresh completed - no data was deleted',
      results: {
        totalProcessed,
        newPurchases: allNewPurchases.length,
        existingOrdersPreserved: existingOrderNumbers.size,
        newPurchases: allNewPurchases
      }
    });

  } catch (error) {
    console.error('❌ Error in safe Gmail refresh:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Safe refresh failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

