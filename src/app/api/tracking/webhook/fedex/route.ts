import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/firebase/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

// FedEx Advanced Integrated Visibility Webhook Handler
export async function POST(request: NextRequest) {
  try {
    const webhookData = await request.json();
    
    console.log('📦 FedEx Webhook received:', JSON.stringify(webhookData, null, 2));
    
    // Verify webhook signature (in production, verify with FedEx)
    const signature = request.headers.get('x-fedex-signature');
    if (!verifyWebhookSignature(signature, webhookData)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    // Process the webhook data
    const trackingUpdates = await processFedExWebhook(webhookData);
    
    return NextResponse.json({
      success: true,
      processed: trackingUpdates.length,
      message: 'Webhook processed successfully'
    });
    
  } catch (error) {
    console.error('❌ FedEx webhook error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Verify webhook signature (implement based on FedEx documentation)
function verifyWebhookSignature(signature: string | null, payload: any): boolean {
  // TODO: Implement proper signature verification
  // This should verify the webhook came from FedEx
  return true; // Placeholder for now
}

// Process FedEx webhook data and update Firebase
async function processFedExWebhook(webhookData: any) {
  const trackingUpdates = [];
  
  try {
    // Extract tracking information from webhook
    const trackingNumber = webhookData.trackingNumber || webhookData.trackNumber;
    const status = webhookData.status || webhookData.eventType;
    const location = webhookData.location || webhookData.city;
    const description = webhookData.description || webhookData.eventDescription;
    const timestamp = webhookData.timestamp || webhookData.eventTime;
    
    if (!trackingNumber) {
      console.log('⚠️ No tracking number in webhook data');
      return trackingUpdates;
    }
    
    console.log(`🔄 Processing FedEx webhook for tracking: ${trackingNumber}`);
    
    // Find the purchase with this tracking number
    const purchasesRef = collection(db, 'purchases');
    const q = query(purchasesRef, where('tracking', '==', trackingNumber));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log(`⚠️ No purchase found for tracking number: ${trackingNumber}`);
      return trackingUpdates;
    }
    
    // Update each matching purchase
    for (const docSnapshot of querySnapshot.docs) {
      const purchaseRef = doc(db, 'purchases', docSnapshot.id);
      const purchaseData = docSnapshot.data();
      
      // Map FedEx status to our delivery status
      const deliveryStatus = mapFedExStatusToDeliveryStatus(status);
      
      // Create tracking update
      const trackingUpdate = {
        timestamp: timestamp || new Date().toISOString(),
        location: location || 'Unknown',
        status: deliveryStatus,
        description: description || 'Status update',
        source: 'fedex_webhook',
        rawData: webhookData
      };
      
      // Update the purchase with new tracking information
      await updateDoc(purchaseRef, {
        status: deliveryStatus,
        lastTrackingUpdate: trackingUpdate.timestamp,
        trackingUpdates: [...(purchaseData.trackingUpdates || []), trackingUpdate],
        updatedAt: new Date().toISOString()
      });
      
      trackingUpdates.push({
        purchaseId: docSnapshot.id,
        trackingNumber,
        status: deliveryStatus,
        timestamp: trackingUpdate.timestamp
      });
      
      console.log(`✅ Updated purchase ${docSnapshot.id} with FedEx webhook data`);
    }
    
  } catch (error) {
    console.error('❌ Error processing FedEx webhook:', error);
  }
  
  return trackingUpdates;
}

// Map FedEx status to our delivery status
function mapFedExStatusToDeliveryStatus(fedexStatus: string): string {
  const statusMap: { [key: string]: string } = {
    'PICKED_UP': 'shipped',
    'IN_TRANSIT': 'in_transit',
    'OUT_FOR_DELIVERY': 'out_for_delivery',
    'DELIVERED': 'delivered',
    'EXCEPTION': 'exception',
    'DELAYED': 'exception',
    'RETURNED': 'exception'
  };
  
  return statusMap[fedexStatus] || 'unknown';
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  
  if (challenge) {
    // Return the challenge for webhook verification
    return NextResponse.json({ challenge });
  }
  
  return NextResponse.json({ message: 'FedEx webhook endpoint active' });
}
