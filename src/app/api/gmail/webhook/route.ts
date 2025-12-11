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

    console.log(`🔍 Looking up user for Gmail: ${emailAddress}`);

    // Find the user with this email address
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    const usersSnapshot = await adminDb
      .collection('users')
      .where('gmailEmail', '==', emailAddress)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      console.log(`⚠️ No Firebase user found for email: ${emailAddress}`);
      console.log(`💡 This likely means:`);
      console.log(`   1. User hasn't connected Gmail yet (no gmailEmail saved)`);
      console.log(`   2. User is a site password user without Firebase user document`);
      console.log(`   3. Gmail status endpoint hasn't been called yet to save gmailEmail`);
      return NextResponse.json({ 
        received: true,
        note: 'No user found - gmailEmail must be saved in Firebase for webhooks to work'
      });
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`✅ Found user ${userId} for ${emailAddress}`);
    console.log(`📊 User data: userType=${userData.userType || 'firebase'}, hasTokens=${!!userData.gmailTokens}`);
    
    // Get Gmail tokens
    const gmailTokens = userData.gmailTokens;
    if (!gmailTokens?.access_token) {
      console.log(`⚠️ No Gmail tokens for user ${userId}`);
      console.log(`💡 User document exists but tokens are missing - this should not happen`);
      return NextResponse.json({ 
        received: true,
        note: 'User found but missing Gmail tokens'
      });
    }

    console.log(`🔑 Using access token: ${gmailTokens.access_token.substring(0, 30)}...`);

    // Trigger purchase sync and save to Firebase using Admin SDK
    console.log(`🔄 Triggering sync for user ${userId} with historyId ${historyId}`);
    
    // Import consolidation utility
    const { consolidatePurchasesByOrderNumber } = await import('@/lib/utils/statusPriority');
    
    // Fire and forget - fetch purchases and save to Firebase
    // Use limit=100 to ensure we find order confirmation emails even if they're a few days old
    fetch(`https://www.solesmarket.com/api/gmail/purchases-batched?limit=100&reset=false`, {
      method: 'GET',
      headers: {
        'Cookie': `gmail_access_token=${gmailTokens.access_token}; gmail_refresh_token=${gmailTokens.refresh_token || ''}`
      }
    }).then(async (response) => {
      if (response.ok) {
        const result = await response.json();
        const purchases = result.purchases || [];
        console.log(`📧 Webhook found ${purchases.length} purchases`);
        
        if (purchases.length > 0) {
          // Consolidate purchases by order number
          const consolidated = consolidatePurchasesByOrderNumber(purchases);
          console.log(`🔄 Consolidated ${purchases.length} → ${consolidated.length} unique purchases`);
          
          // For webhooks, just save new purchases
          // The frontend already handles deduplication, so we don't need to check for existing purchases
          let savedCount = 0;
          
          for (const purchase of consolidated) {
            try {
              // Remove the 'id' field if it exists (it might be set to orderNumber by frontend)
              // Firebase will auto-generate a new document ID
              const purchaseData = { ...purchase };
              delete purchaseData.id; // Remove id field to let Firebase auto-generate it
              
              await adminDb.collection('purchases').add({
                ...purchaseData,
                userId: userId,
                type: 'gmail',
                createdAt: new Date().toISOString(),
                syncedAt: new Date().toISOString()
              });
              savedCount++;
              console.log(`✅ Saved purchase ${purchase.orderNumber}`);
            } catch (error) {
              console.error(`❌ Failed to save purchase ${purchase.orderNumber}:`, error);
            }
          }
          
          console.log(`✅ Webhook saved ${savedCount}/${consolidated.length} new purchases`);
        }
        
        // Update last webhook sync time
        await adminDb.collection('users').doc(userId).update({
          lastWebhookSync: Date.now(),
          lastHistoryId: historyId
        });
      } else {
        const errorText = await response.text();
        console.error(`❌ Webhook sync failed for ${userId}: ${response.status} - ${errorText}`);
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

