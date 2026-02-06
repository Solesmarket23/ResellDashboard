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
    
    // Import consolidation + priority utility
    const { consolidatePurchasesByOrderNumber, getStatusPriority } = await import('@/lib/utils/statusPriority');
    
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
          
          const incomingOrders = consolidated.map((p: any) => String(p?.orderNumber || '').trim()).filter(Boolean);
          if (incomingOrders.length === 0) {
            console.log('⏭️ Webhook: no orderNumbers found in consolidated payload');
            return;
          }

          // Look up existing docs for just these orders (so we can update status/tracking automatically).
          const existingByOrderNumber = new Map<
            string,
            { docId: string; status?: string; shipping_status?: string; tracking?: string; carrier?: string; statusColor?: string }
          >();

          const chunk = <T,>(arr: T[], size: number): T[][] => {
            const out: T[][] = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
          };

          try {
            // Firestore `in` queries have limits; chunk defensively.
            // incomingOrders is small (limit=5), but keep this safe.
            const chunks = chunk(incomingOrders, 10);
            for (const c of chunks) {
              const snap = await adminDb
                .collection('purchases')
                .where('userId', '==', userId)
                .where('type', '==', 'gmail')
                .where('orderNumber', 'in', c)
                .select('orderNumber', 'status', 'shipping_status', 'tracking', 'carrier', 'statusColor')
                .get();

              snap.docs.forEach((d) => {
                const data = d.data() as any;
                const orderNumber = String(data?.orderNumber || '').trim();
                if (!orderNumber) return;
                existingByOrderNumber.set(orderNumber, { docId: d.id, ...data });
              });
            }
          } catch (e) {
            // Fall back to a broader scan (avoids index issues at the expense of reads).
            console.warn('⚠️ Webhook: failed targeted lookup (falling back to full scan):', e);
            const snap = await adminDb
              .collection('purchases')
              .where('userId', '==', userId)
              .where('type', '==', 'gmail')
              .select('orderNumber', 'status', 'shipping_status', 'tracking', 'carrier', 'statusColor')
              .get();
            snap.docs.forEach((d) => {
              const data = d.data() as any;
              const orderNumber = String(data?.orderNumber || '').trim();
              if (!orderNumber) return;
              existingByOrderNumber.set(orderNumber, { docId: d.id, ...data });
            });
          }

          let createdCount = 0;
          let updatedCount = 0;
          let skippedCount = 0;

          for (const incoming of consolidated) {
            const orderNumber = String((incoming as any)?.orderNumber || '').trim();
            if (!orderNumber) continue;

            const existing = existingByOrderNumber.get(orderNumber) || null;

            const incomingStatusRaw = String((incoming as any)?.status || (incoming as any)?.shipping_status || 'Ordered');
            const existingStatusRaw = existing
              ? String(existing.status || (existing as any).shipping_status || 'Ordered')
              : 'Ordered';

            const incomingPriority = getStatusPriority(incomingStatusRaw);
            const existingPriority = getStatusPriority(existingStatusRaw);

            const incomingTracking = String((incoming as any)?.tracking || (incoming as any)?.tracking_number || '').trim();
            const existingTracking = existing ? String(existing.tracking || '').trim() : '';

            const incomingCarrier = String((incoming as any)?.carrier || '').trim();
            const existingCarrier = existing ? String(existing.carrier || '').trim() : '';

            // Never downgrade status. Update if:
            // - incoming status is higher priority than existing, OR
            // - incoming has tracking and existing doesn't (or differs), OR
            // - carrier filled in.
            const shouldUpdateStatus = incomingPriority > existingPriority;
            const shouldUpdateTracking = !!incomingTracking && incomingTracking !== existingTracking;
            const shouldUpdateCarrier = !!incomingCarrier && incomingCarrier !== existingCarrier;

            if (existing) {
              if (!shouldUpdateStatus && !shouldUpdateTracking && !shouldUpdateCarrier) {
                skippedCount++;
                continue;
              }

              const patch: any = {
                syncedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              if (shouldUpdateStatus) {
                patch.status = (incoming as any)?.status || incomingStatusRaw;
                patch.shipping_status = (incoming as any)?.shipping_status || patch.status;
                if ((incoming as any)?.statusColor) patch.statusColor = (incoming as any)?.statusColor;
              }
              if (shouldUpdateTracking) patch.tracking = incomingTracking;
              if (shouldUpdateCarrier) patch.carrier = incomingCarrier;

              try {
                await adminDb.collection('purchases').doc(existing.docId).update(patch);
                updatedCount++;
                console.log(`✅ Updated purchase ${orderNumber} (status=${patch.status || existingStatusRaw}${shouldUpdateTracking ? ', tracking updated' : ''})`);
              } catch (error) {
                console.error(`❌ Failed to update purchase ${orderNumber}:`, error);
              }
            } else {
              try {
                const purchaseData = { ...(incoming as any) };
                delete (purchaseData as any).id;

                await adminDb.collection('purchases').add({
                  ...purchaseData,
                  userId,
                  type: 'gmail',
                  createdAt: new Date().toISOString(),
                  syncedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                createdCount++;
                console.log(`✅ Created purchase ${orderNumber} - 🔴 REAL-TIME INSERT`);
              } catch (error) {
                console.error(`❌ Failed to create purchase ${orderNumber}:`, error);
              }
            }
          }

          console.log(
            `✅ Webhook upsert complete for user ${userId}: created=${createdCount}, updated=${updatedCount}, skipped=${skippedCount}`
          );
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

