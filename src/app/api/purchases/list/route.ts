import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Get user ID from cookies or query params
    const cookieStore = cookies();
    let userId = cookieStore.get('userId')?.value || 
                 cookieStore.get('siteUserId')?.value || 
                 cookieStore.get('site-user-id')?.value;
    
    // Also check query params for API calls
    if (!userId) {
      const url = new URL(request.url);
      userId = url.searchParams.get('userId') || undefined;
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    console.log(`📊 Loading purchases for user: ${userId}`);

    // Use Firebase Admin SDK to bypass security rules
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    // Get all purchases for this user
    const purchasesSnapshot = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .get();
    
    const purchases = purchasesSnapshot.docs.map(doc => {
      const data = doc.data();
      // CRITICAL: Put id AFTER spread to ensure Firebase document ID is used
      // (data might have an 'id' field set to orderNumber which we need to overwrite)
      return {
        ...data,
        id: doc.id  // Overwrite any 'id' in data with the actual Firebase document ID
      };
    });
    
    console.log(`✅ Found ${purchases.length} purchases for user ${userId}`);
    
    // Debug: Verify first purchase has correct ID
    if (purchases.length > 0) {
      const firstId = purchases[0].id;
      const isOrderNumber = firstId?.startsWith('03-');
      console.log(`🔍 First purchase ID: "${firstId}" ${isOrderNumber ? '❌ STILL ORDER NUMBER!' : '✅ Correct Firebase ID'}`);
    }
    
    return NextResponse.json({ 
      purchases,
      count: purchases.length,
      userId 
    });
    
  } catch (error: any) {
    console.error('Error loading purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to load purchases',
      message: error.message 
    }, { status: 500 });
  }
}

