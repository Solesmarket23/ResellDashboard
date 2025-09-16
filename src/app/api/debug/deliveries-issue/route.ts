import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = getFirestore();
    
    // Get user ID from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '20115098dd871b0a7863cd1017fa';
    
    console.log(`🔍 DEBUG: Checking deliveries issue for user: ${userId}`);
    
    // Check all purchases in database
    const allPurchasesSnapshot = await db.collection('purchases').get();
    const allPurchases = allPurchasesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      userId: doc.data().userId || 'NO_USER_ID'
    }));
    
    console.log(`📊 Total purchases in database: ${allPurchases.length}`);
    
    // Check purchases for this specific user
    const userPurchases = allPurchases.filter(p => p.userId === userId);
    console.log(`👤 Purchases for user ${userId}: ${userPurchases.length}`);
    
    // Check purchases with tracking numbers
    const withTracking = userPurchases.filter(p => {
      const tracking = p.tracking || p.trackingNumber || p.tracking_number || 
                      p.shipment?.tracking || p.shipment?.trackingNumber;
      return tracking && tracking.trim() !== '';
    });
    
    console.log(`📦 User purchases with tracking: ${withTracking.length}`);
    
    // Sample some purchases to see the structure
    const samplePurchases = allPurchases.slice(0, 3).map(p => ({
      id: p.id,
      userId: p.userId,
      hasTracking: !!(p.tracking || p.trackingNumber || p.tracking_number || 
                     p.shipment?.tracking || p.shipment?.trackingNumber),
      tracking: p.tracking || p.trackingNumber || p.tracking_number || 
                p.shipment?.tracking || p.shipment?.trackingNumber,
      source: p.source || 'unknown',
      createdAt: p.createdAt || p.timestamp || 'no_date'
    }));
    
    // Check if there are any purchases with different user IDs
    const userIds = [...new Set(allPurchases.map(p => p.userId))];
    
    return NextResponse.json({
      success: true,
      debug: {
        totalPurchases: allPurchases.length,
        userPurchases: userPurchases.length,
        withTracking: withTracking.length,
        userIds: userIds,
        samplePurchases: samplePurchases,
        userPurchasesWithTracking: withTracking.map(p => ({
          id: p.id,
          tracking: p.tracking || p.trackingNumber || p.tracking_number || 
                   p.shipment?.tracking || p.shipment?.trackingNumber,
          source: p.source || 'unknown'
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
