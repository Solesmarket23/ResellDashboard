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
    const userId = cookieStore.get('userId')?.value || cookieStore.get('siteUserId')?.value || cookieStore.get('site-user-id')?.value;

    if (!accessToken) {
      return NextResponse.json({ 
        connected: false, 
        reason: 'No access token',
        needsReconnect: true 
      }, { status: 401 });
    }

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

    // Get the current URL to determine the correct redirect URI
    const url = new URL(request.url);
    let baseUrl = `${url.protocol}//${url.host}`;
    
    // Fix for 0.0.0.0 - convert to localhost for OAuth
    if (baseUrl.includes('0.0.0.0')) {
      baseUrl = baseUrl.replace('0.0.0.0', 'localhost');
    }
    
    // Check if we're running locally (localhost, 127.0.0.1)
    const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
    
    // Use environment variable if set, otherwise auto-detect
    let redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    if (!redirectUri) {
      // Always use the current base URL to auto-detect the port
      redirectUri = `${baseUrl}/api/gmail/callback`;
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    // Simple test to verify authentication
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Just get the user profile, don't fetch emails
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
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

    // Save Gmail email and tokens to Firebase for webhook lookups
    if (userId && profile.data.emailAddress) {
      try {
        const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
        const adminDb = getAdminDb();
        
        // First, ensure user document exists (especially for site password users)
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
          // Create user document if it doesn't exist (for site password users)
          console.log(`📝 Creating user document for user ${userId}`);
          await adminDb.collection('users').doc(userId).set({
            userId: userId,
            userType: 'site-password',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        
        // Now save/update Gmail email and tokens
        await adminDb.collection('users').doc(userId).set({
          gmailEmail: profile.data.emailAddress,
          gmailTokens: {
            access_token: accessToken,
            refresh_token: refreshToken
          },
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log(`✅ Saved Gmail email ${profile.data.emailAddress} for user ${userId}`);
      } catch (error) {
        console.error('Failed to save Gmail email to Firebase:', error);
        // Don't fail the request if Firebase save fails
      }
    }

    return NextResponse.json({ 
      connected: true, 
      email: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal || 0,
      daysSinceConnection,
      daysRemaining,
      needsReconnect: false
    });

  } catch (error) {
    console.error('Gmail status check failed:', error);
    return NextResponse.json({ connected: false, reason: 'Authentication failed' }, { status: 401 });
  }
} 