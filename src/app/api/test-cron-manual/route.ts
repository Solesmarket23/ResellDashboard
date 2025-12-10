import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Test endpoint that manually triggers sync for the current logged-in user
export async function GET(request: NextRequest) {
  try {
    // Get user ID from cookie/session
    const userId = cookies().get('userId')?.value || cookies().get('siteUserId')?.value;
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Not authenticated',
        message: 'Please log in first'
      }, { status: 401 });
    }

    console.log('🧪 Manual cron test for user:', userId);

    // Import Firebase Admin
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({
        error: 'User not found',
        message: `No user document found for ID: ${userId}`
      }, { status: 404 });
    }

    const userData = userDoc.data();
    const gmailTokens = userData?.gmailTokens;

    if (!gmailTokens?.access_token) {
      return NextResponse.json({
        error: 'Gmail not connected',
        message: 'Connect Gmail first, then try again',
        userId
      }, { status: 400 });
    }

    console.log('✅ Found Gmail tokens for user:', userId);

    // Call the Gmail purchases API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/gmail/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `userId=${userId}`
      },
      body: JSON.stringify({
        accessToken: gmailTokens.access_token,
        maxResults: 20,
        userId: userId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({
        error: 'Gmail API call failed',
        status: response.status,
        details: error
      }, { status: 500 });
    }

    const result = await response.json();

    // Update last sync time
    await adminDb.collection('users').doc(userId).update({
      emailLastSync: Date.now()
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      userId,
      result,
      message: `✅ Synced ${result.newPurchases || 0} new purchases`
    });

  } catch (error) {
    console.error('❌ Test cron error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

