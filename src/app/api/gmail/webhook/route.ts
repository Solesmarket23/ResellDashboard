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
      console.log(`⚠️ No Firebase user found for email: ${emailAddress}`);
      console.log(`💡 For site password users, webhooks require storing Gmail email in Firebase`);
      console.log(`💡 Webhook will work automatically for Firebase authenticated users`);
      return NextResponse.json({ 
        received: true,
        note: 'Site password users: webhooks require Firebase user record with gmailEmail field'
      });
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

    // Trigger purchase sync and save to Firebase using Admin SDK
    console.log(`🔄 Triggering sync for user ${userId} with historyId ${historyId}`);
    
    // Import consolidation utility
    const { consolidatePurchasesByOrderNumber } = await import('@/lib/utils/statusPriority');
    
    // Fire and forget - fetch purchases and save to Firebase
    fetch(`https://www.solesmarket.com/api/gmail/purchases-batched?limit=20&reset=false`, {
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
          
          // Check for existing purchases to avoid duplicates
          const existingPurchasesSnapshot = await adminDb
            .collection('purchases')
            .where('userId', '==', userId)
            .where('type', '==', 'gmail')
            .get();
          
          const existingPurchasesMap = new Map();
          existingPurchasesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.orderNumber) {
              existingPurchasesMap.set(data.orderNumber, { id: doc.id, ...data });
            }
          });
          
          console.log(`📦 Found ${existingPurchasesMap.size} existing purchases in Firebase`);
          
          // Save or update purchases using Admin SDK
          let savedCount = 0;
          let updatedCount = 0;
          let skippedCount = 0;
          
          for (const purchase of consolidated) {
            try {
              const existing = existingPurchasesMap.get(purchase.orderNumber);
              
              if (existing) {
                // Update existing purchase
                console.log(`🔄 Updating purchase ${purchase.orderNumber} with doc ID: ${existing.id}`);
                await adminDb.collection('purchases').doc(existing.id).update({
                  status: purchase.status,
                  purchaseDate: purchase.purchaseDate,
                  email_subject: purchase.email_subject,
                  email_date: purchase.email_date,
                  updatedAt: new Date().toISOString(),
                  syncedAt: new Date().toISOString()
                });
                updatedCount++;
              } else {
                // Create new purchase
                console.log(`➕ Creating new purchase ${purchase.orderNumber}`);
                await adminDb.collection('purchases').add({
                  ...purchase,
                  userId: userId,
                  type: 'gmail',
                  createdAt: new Date().toISOString(),
                  syncedAt: new Date().toISOString()
                });
                savedCount++;
              }
            } catch (error) {
              console.error(`❌ Failed to save/update purchase ${purchase.orderNumber}:`, error);
              skippedCount++;
            }
          }
          
          console.log(`✅ Webhook processed ${consolidated.length} purchases: ${savedCount} new, ${updatedCount} updated, ${skippedCount} skipped`);
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

