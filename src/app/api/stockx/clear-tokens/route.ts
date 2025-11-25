import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to clear StockX tokens from Firebase
 * This forces a fresh reconnection
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Import Firebase Admin
    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Clear tokens from Firebase
    await adminDb.collection('users').doc(userId).update({
      stockxTokens: null
    });
    
    console.log('✅ StockX tokens cleared from Firebase for user:', userId);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Tokens cleared successfully',
      userId
    });
    
  } catch (error) {
    console.error('❌ Failed to clear tokens:', error);
    return NextResponse.json(
      { 
        error: 'Failed to clear tokens',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 
