import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/utils/userApiKeyHelper';

/**
 * API endpoint to sync StockX tokens from cookies to Firebase
 * This reads the httpOnly cookies and saves them to Firebase
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID from request (from site-user-id cookie)
    const cookieUserId = getUserIdFromRequest(request);
    
    // Also try to get Firebase auth user ID from a custom header or body
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const firebaseUserId = body.firebaseUserId;
    
    if (!cookieUserId && !firebaseUserId) {
      return NextResponse.json(
        { error: 'User ID not found in cookies or request body' },
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

    const tokenData = {
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
    };

    // Save to both user IDs if they're different
    const userIds = [cookieUserId, firebaseUserId].filter(Boolean);
    const uniqueUserIds = [...new Set(userIds)];
    
    for (const userId of uniqueUserIds) {
      await adminDb.collection('users').doc(userId!).set(tokenData, { merge: true });
      console.log('✅ StockX tokens synced from cookies to Firebase for user:', userId);
    }

    console.log('✅ Auto-repricing enabled for all users');

    return NextResponse.json({
      success: true,
      message: 'Tokens synced and auto-repricing enabled',
      userIds: uniqueUserIds
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

