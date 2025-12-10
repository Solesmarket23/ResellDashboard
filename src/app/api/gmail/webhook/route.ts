import { NextRequest, NextResponse } from 'next/server';

// Gmail Push Notification Webhook Endpoint
// This receives notifications when new emails arrive in users' inboxes

export async function POST(request: NextRequest) {
  try {
    console.log('📬 Gmail webhook received');

    // Parse the Pub/Sub message
    const body = await request.json();
    
    // Pub/Sub sends messages in this format:
    // { message: { data: "base64-encoded-json", messageId: "...", publishTime: "..." } }
    const message = body.message;
    
    if (!message || !message.data) {
      console.log('⚠️ No message data in webhook');
      return NextResponse.json({ received: true });
    }

    // Decode the base64 message data
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const notification = JSON.parse(decodedData);
    
    console.log('📧 Gmail notification:', notification);
    
    // Gmail notification format:
    // {
    //   emailAddress: "user@gmail.com",
    //   historyId: "12345"
    // }
    
    const { emailAddress, historyId } = notification;
    
    if (!emailAddress || !historyId) {
      console.log('⚠️ Invalid notification format');
      return NextResponse.json({ received: true });
    }

    // Find the user with this email address
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    const usersSnapshot = await adminDb
      .collection('users')
      .where('gmailEmail', '==', emailAddress)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      console.log(`⚠️ No user found for email: ${emailAddress}`);
      return NextResponse.json({ received: true });
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`✅ Found user ${userId} for ${emailAddress}`);
    
    // Get Gmail tokens
    const gmailTokens = userData.gmailTokens;
    if (!gmailTokens?.access_token) {
      console.log(`⚠️ No Gmail tokens for user ${userId}`);
      return NextResponse.json({ received: true });
    }

    // Trigger purchase sync in the background (don't wait for it)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://resell-dashboard-zeta.vercel.app';
    
    // Fire and forget - don't await
    fetch(`${baseUrl}/api/gmail/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessToken: gmailTokens.access_token,
        maxResults: 10, // Only check recent emails
        userId: userId,
        historyId: historyId // Use historyId for incremental sync
      })
    }).then(async (response) => {
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Webhook triggered sync for ${userId}: ${result.newPurchases || 0} new purchases`);
        
        // Update last webhook sync time
        await adminDb.collection('users').doc(userId).update({
          lastWebhookSync: Date.now(),
          lastHistoryId: historyId
        });
      } else {
        console.error(`❌ Webhook sync failed for ${userId}: ${response.status}`);
      }
    }).catch(error => {
      console.error(`❌ Webhook sync error for ${userId}:`, error);
    });

    // Respond immediately to Pub/Sub (must respond within 10 seconds)
    return NextResponse.json({ 
      received: true,
      userId,
      emailAddress,
      historyId
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    // Still return 200 so Pub/Sub doesn't retry
    return NextResponse.json({ 
      received: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Handle GET requests (for health checks)
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    endpoint: 'gmail-webhook',
    message: 'Gmail push notifications webhook is running'
  });
}

