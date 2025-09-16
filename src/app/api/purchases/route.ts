import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API: Getting purchases for site user');
    
    // Get user ID from query params or headers
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    console.log('📦 API: Loading purchases for user:', userId);

    // Use server-side Firebase access - simplified query without orderBy to avoid index issues
    const [purchasesByUserId, purchasesByUid] = await Promise.all([
      getDocumentsServer('purchases', {
        where: [{ field: 'userId', operator: '==', value: userId }]
      }),
      getDocumentsServer('purchases', {
        where: [{ field: 'uid', operator: '==', value: userId }]
      })
    ]);

    // Combine and deduplicate results
    const allPurchases = [...purchasesByUserId, ...purchasesByUid];
    const uniquePurchases = allPurchases.filter((purchase, index, self) => 
      index === self.findIndex(p => p.id === purchase.id)
    );
    
    // Sort by purchaseDate on the client side
    const purchases = uniquePurchases.sort((a, b) => {
      const dateA = a.purchaseDate || a.timestamp || 0;
      const dateB = b.purchaseDate || b.timestamp || 0;
      return dateB - dateA; // Descending order
    });

    console.log(`✅ API: Found ${purchases.length} purchases for user ${userId}`);

    return NextResponse.json({ 
      success: true, 
      purchases,
      count: purchases.length 
    });

  } catch (error) {
    console.error('❌ API: Error loading purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to load purchases',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
