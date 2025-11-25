import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/utils/userApiKeyHelper';

/**
 * API endpoint to sync StockX tokens from cookies to Firebase
 * This reads the httpOnly cookies and saves them to Firebase
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID from request
    const userId = getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found in cookies' },
        { status: 400 }
      );
    }

    // Get tokens from cookies
    const accessToken = request.cookies.get('stockx_access_token')?.value;
    const refreshToken = request.cookies.get('stockx_refresh_token')?.value;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'StockX tokens not found in cookies' },
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

    // Save tokens to Firebase and ensure auto-repricing is enabled
    await adminDb.collection('users').doc(userId).set({
      stockxTokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      },
      stockxAutoRepricingEnabled: true,
      stockxAutoRepricingConfig: {
        intervalMinutes: 5,
        strategy: 'individual'
      }
    }, { merge: true });

    console.log('✅ StockX tokens synced from cookies to Firebase for user:', userId);
    console.log('✅ Auto-repricing enabled for user:', userId);

    return NextResponse.json({
      success: true,
      message: 'Tokens synced and auto-repricing enabled',
      userId
    });

  } catch (error) {
    console.error('❌ Failed to sync tokens:', error);
    return NextResponse.json(
      { 
        error: 'Failed to sync tokens',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

