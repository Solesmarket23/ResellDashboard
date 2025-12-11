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
    
    // Check recent webhook activity to prevent duplicate processing
    const recentWebhookTime = userData.lastWebhookSync || 0;
    const timeSinceLastWebhook = Date.now() - recentWebhookTime;
    
    if (timeSinceLastWebhook < 5000) { // 5 seconds
      console.log(`⏭️ Skipping webhook - last processed ${timeSinceLastWebhook}ms ago (too recent, likely duplicate notification)`);
      return NextResponse.json({ 
        received: true,
        skipped: true,
        reason: 'Recent webhook already processed'
      });
    }
    
    // Check for duplicates before saving to avoid quota waste
    // Get existing purchase order numbers for this user
    const existingPurchasesSnapshot = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .where('type', '==', 'gmail')
      .select('orderNumber') // Only fetch orderNumber field for efficiency
      .get();
    
    const existingOrderNumbers = new Set(
      existingPurchasesSnapshot.docs
        .map(doc => doc.data().orderNumber)
        .filter(Boolean)
    );
    
    console.log(`📊 Found ${existingOrderNumbers.size} existing purchase order numbers for user ${userId}`);
    
    // Fire and forget - fetch purchases and save to Firebase
    // Use limit=5 for webhooks (only very recent emails) to avoid reprocessing
    fetch(`https://www.solesmarket.com/api/gmail/purchases-batched?limit=5&reset=false`, {
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
          
          // Filter out purchases that already exist
          const newPurchases = consolidated.filter(p => !existingOrderNumbers.has(p.orderNumber));
          console.log(`🆕 ${newPurchases.length} new purchases (${consolidated.length - newPurchases.length} already exist)`);
          
          if (newPurchases.length === 0) {
            console.log('⏭️ No new purchases to save');
            return;
          }
          
          let savedCount = 0;
          
          for (const purchase of newPurchases) {
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
              console.log(`✅ Saved purchase ${purchase.orderNumber} - 🔴 REAL-TIME UPDATE`);
            } catch (error) {
              console.error(`❌ Failed to save purchase ${purchase.orderNumber}:`, error);
            }
          }
          
          console.log(`✅ Webhook saved ${savedCount}/${consolidated.length} new purchases - 🔴 REAL-TIME UPDATES TRIGGERED`);
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

