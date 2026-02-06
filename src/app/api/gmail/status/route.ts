import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;
    const gmailConnected = cookieStore.get('gmail_connected')?.value;
    const connectedAt = cookieStore.get('gmail_connected_at')?.value;
    const userId =
      cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        connected: false, 
        reason: 'No access token',
        needsReconnect: true 
      }, { status: 401 });
    }

    const url = new URL(request.url);
    const verify = url.searchParams.get('verify') === '1' || url.searchParams.get('verify') === 'true';

    // Check if connection is older than 7 days
    if (connectedAt) {
      const connectionTime = parseInt(connectedAt);
      const now = Date.now();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      const timeSinceConnection = now - connectionTime;

      if (timeSinceConnection > sevenDaysInMs) {
        // Connection is older than 7 days, request reconnection
        return NextResponse.json({
          connected: false,
          reason: 'Connection expired after 7 days',
          needsReconnect: true,
          daysSinceConnection: Math.floor(timeSinceConnection / (24 * 60 * 60 * 1000))
        }, { status: 401 });
      }
    }

    // Calculate days remaining
    let daysRemaining = 7;
    let daysSinceConnection = 0;
    
    if (connectedAt) {
      const connectionTime = parseInt(connectedAt);
      const now = Date.now();
      const timeSinceConnection = now - connectionTime;
      daysSinceConnection = Math.floor(timeSinceConnection / (24 * 60 * 60 * 1000));
      daysRemaining = 7 - daysSinceConnection;
    }

    // IMPORTANT:
    // This endpoint is intentionally lightweight by default.
    // It should NOT call Google APIs or write to Firestore on a timer/poll.
    //
    // If a caller truly needs an online verification of the token, pass `?verify=1`.
    if (!verify) {
      return NextResponse.json({
        connected: true,
        email: null,
        messagesTotal: null,
        daysSinceConnection,
        daysRemaining,
        needsReconnect: false,
      });
    }

    // Verified mode: perform a cheap Gmail API call to confirm the token still works.
    // (Still does NOT fetch emails.)
    let baseUrl = `${url.protocol}//${url.host}`;
    if (baseUrl.includes('0.0.0.0')) baseUrl = baseUrl.replace('0.0.0.0', 'localhost');

    let redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) redirectUri = `${baseUrl}/api/gmail/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    // Best-effort: save Gmail email/tokens to Firebase for webhook lookups (only on verify mode).
    if (userId && profile.data.emailAddress) {
      try {
        const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
        const adminDb = getAdminDb();

        await adminDb
          .collection('users')
          .doc(userId)
          .set(
            {
              userId,
              userType: 'site-password',
              gmailEmail: profile.data.emailAddress,
              gmailTokens: {
                access_token: accessToken,
                ...(refreshToken ? { refresh_token: refreshToken } : {}),
              },
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
      } catch (error) {
        console.error('Failed to save Gmail email to Firebase (verify mode):', error);
      }
    }

    return NextResponse.json({
      connected: true,
      email: profile.data.emailAddress || null,
      messagesTotal: profile.data.messagesTotal || null,
      daysSinceConnection,
      daysRemaining,
      needsReconnect: false,
      verified: true,
    });

  } catch (error) {
    console.error('Gmail status check failed:', error);
    return NextResponse.json({ connected: false, reason: 'Authentication failed' }, { status: 401 });
  }
} 