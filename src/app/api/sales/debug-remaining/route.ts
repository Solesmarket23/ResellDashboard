import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const db = getAdminDb();

    console.log('🔍 DEBUG: Checking remaining sales for user:', userId);
    console.log('🔍 DEBUG: User ID type:', typeof userId);
    console.log('🔍 DEBUG: User ID length:', userId.length);

    // Get all sales for this user
    const snapshot = await db
      .collection('user_sales')
      .where('userId', '==', userId)
      .get();
    
    const sales = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('🔍 DEBUG: Total sales found:', sales.length);
    
    if (sales.length > 0) {
      console.log('🔍 DEBUG: Sample sales data:');
      sales.slice(0, 3).forEach((sale, index) => {
        console.log(`🔍 DEBUG: Sale ${index + 1}:`, {
          id: sale.id,
          product: sale.product,
          orderNumber: sale.orderNumber,
          userId: sale.userId,
          userIdType: typeof sale.userId,
          userIdLength: sale.userId?.length,
          userIdMatch: sale.userId === userId,
          userIdStrictMatch: sale.userId === userId,
          userIdTrimmedMatch: sale.userId?.trim() === userId.trim()
        });
      });
    }

    return NextResponse.json({ 
      success: true, 
      totalSales: sales.length,
      sales: sales.map(sale => ({
        id: sale.id,
        product: sale.product,
        orderNumber: sale.orderNumber,
        userId: sale.userId,
        userIdType: typeof sale.userId,
        userIdLength: sale.userId?.length,
        userIdMatch: sale.userId === userId,
        userIdStrictMatch: sale.userId === userId,
        userIdTrimmedMatch: sale.userId?.trim() === userId.trim()
      }))
    });

  } catch (error) {
    console.error('❌ DEBUG: Error checking remaining sales:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message || 'Failed to check remaining sales',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
