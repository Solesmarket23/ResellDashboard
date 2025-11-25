import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to manually save StockX tokens to Firebase
 * This is useful when a user is already connected and we need to save their tokens
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, accessToken, refreshToken } = await request.json();

    if (!userId || !accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, accessToken, refreshToken' },
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

    // Calculate expiration time (default to 1 hour)
    const expiresAt = Date.now() + (3600 * 1000);

    // Save tokens to Firebase
    await adminDb.collection('users').doc(userId).set({
      stockxTokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }
    }, { merge: true });

    console.log('✅ StockX tokens manually saved to Firebase for user:', userId);

    return NextResponse.json({
      success: true,
      message: 'Tokens saved successfully',
      userId
    });

  } catch (error) {
    console.error('❌ Failed to save tokens:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save tokens',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

