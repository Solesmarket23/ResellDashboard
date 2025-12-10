import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

// API route to register Gmail push notifications for a user
// This tells Gmail to send webhook notifications when new emails arrive

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    
    // Try to get from request body first, fall back to cookies
    let userId, accessToken, refreshToken;
    
    try {
      const body = await request.json();
      userId = body.userId;
      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
    } catch (e) {
      // No body or invalid JSON, use cookies
    }
    
    // Fall back to cookies if not in body
    if (!accessToken) {
      accessToken = cookieStore.get('gmail_access_token')?.value;
    }
    if (!refreshToken) {
      refreshToken = cookieStore.get('gmail_refresh_token')?.value;
    }
    if (!userId) {
      userId = cookieStore.get('userId')?.value || cookieStore.get('siteUserId')?.value;
    }

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'Missing access token',
        message: 'Gmail not connected'
      }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing user ID',
        message: 'User not authenticated'
      }, { status: 400 });
    }

    console.log(`📬 Registering Gmail watch for user: ${userId}`);

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get the Pub/Sub topic (you'll need to create this in Google Cloud Console)
    const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC || 'projects/YOUR_PROJECT_ID/topics/gmail-notifications';

    // Register the watch request
    const watchResponse = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: pubsubTopic,
        labelIds: ['INBOX'], // Watch inbox for new emails
        // labelFilterAction: 'include' // Only notify for these labels
      }
    });

    const { historyId, expiration } = watchResponse.data;
    const expirationDate = expiration ? new Date(parseInt(expiration)) : null;

    console.log(`✅ Gmail watch registered for ${userId}`);
    console.log(`   History ID: ${historyId}`);
    console.log(`   Expires: ${expirationDate?.toISOString()}`);

    // Save watch info to Firebase
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    await adminDb.collection('users').doc(userId).update({
      gmailWatch: {
        historyId,
        expiration: expirationDate?.toISOString(),
        registeredAt: new Date().toISOString(),
        isActive: true
      }
    });

    return NextResponse.json({
      success: true,
      historyId,
      expiration: expirationDate?.toISOString(),
      message: 'Gmail push notifications registered successfully'
    });

  } catch (error: any) {
    console.error('❌ Gmail watch registration error:', error);
    
    return NextResponse.json({
      error: 'Failed to register Gmail watch',
      message: error.message,
      details: error.response?.data
    }, { status: 500 });
  }
}

// GET endpoint to check watch status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing userId parameter'
      }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    const userDoc = await adminDb.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({ 
        error: 'User not found'
      }, { status: 404 });
    }

    const userData = userDoc.data();
    const gmailWatch = userData?.gmailWatch;

    if (!gmailWatch) {
      return NextResponse.json({
        isActive: false,
        message: 'No Gmail watch registered'
      });
    }

    // Check if expired
    const expirationDate = gmailWatch.expiration ? new Date(gmailWatch.expiration) : null;
    const isExpired = expirationDate ? expirationDate < new Date() : true;

    return NextResponse.json({
      isActive: gmailWatch.isActive && !isExpired,
      historyId: gmailWatch.historyId,
      expiration: gmailWatch.expiration,
      registeredAt: gmailWatch.registeredAt,
      isExpired,
      daysUntilExpiration: expirationDate ? 
        Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0
    });

  } catch (error: any) {
    console.error('❌ Error checking watch status:', error);
    return NextResponse.json({
      error: 'Failed to check watch status',
      message: error.message
    }, { status: 500 });
  }
}

// DELETE endpoint to stop watching
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const accessToken = searchParams.get('accessToken');

    if (!userId || !accessToken) {
      return NextResponse.json({ 
        error: 'Missing required parameters'
      }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Stop watching
    await gmail.users.stop({ userId: 'me' });

    // Update Firebase
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    await adminDb.collection('users').doc(userId).update({
      'gmailWatch.isActive': false,
      'gmailWatch.stoppedAt': new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Gmail watch stopped successfully'
    });

  } catch (error: any) {
    console.error('❌ Error stopping watch:', error);
    return NextResponse.json({
      error: 'Failed to stop watch',
      message: error.message
    }, { status: 500 });
  }
}

