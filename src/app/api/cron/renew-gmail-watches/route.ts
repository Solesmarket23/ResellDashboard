import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Cron job to renew Gmail push notification watches
// Gmail watches expire after 7 days, so we need to renew them periodically

function verifyCronRequest(request: NextRequest) {
  const authHeader = headers().get('authorization');
  const userAgent = headers().get('user-agent');
  const host = headers().get('host');
  
  return authHeader === `Bearer ${process.env.CRON_SECRET}` || 
         userAgent?.includes('GitHub-Actions') ||
         host?.includes('localhost') ||
         host?.includes('solesmarket.com');
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_PAUSED === '1' || process.env.CRON_PAUSED === 'true') {
      return NextResponse.json({
        success: true,
        paused: true,
        message: 'Cron paused via CRON_PAUSED',
        timestamp: new Date().toISOString()
      });
    }

    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Cron job started: renew-gmail-watches');

    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();

    // Find all users with active Gmail watches
    const usersSnapshot = await adminDb.collection('users').get();
    
    let totalRenewed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const gmailWatch = userData.gmailWatch;
        const gmailTokens = userData.gmailTokens;

        // Skip if no watch registered
        if (!gmailWatch || !gmailWatch.isActive) {
          continue;
        }

        // Skip if no Gmail tokens
        if (!gmailTokens?.access_token) {
          console.log(`⏭️ Skipping ${userId} - no Gmail tokens`);
          totalSkipped++;
          continue;
        }

        // Check if watch is expiring soon (within 2 days)
        const expirationDate = gmailWatch.expiration ? new Date(gmailWatch.expiration) : null;
        const twoDaysFromNow = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000));

        if (expirationDate && expirationDate > twoDaysFromNow) {
          console.log(`⏭️ Skipping ${userId} - watch still valid until ${expirationDate.toISOString()}`);
          totalSkipped++;
          continue;
        }

        console.log(`🔄 Renewing watch for ${userId}`);

        // Call the watch API to renew
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://resell-dashboard-zeta.vercel.app';
        const response = await fetch(`${baseUrl}/api/gmail/watch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            accessToken: gmailTokens.access_token,
            refreshToken: gmailTokens.refresh_token
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Renewed watch for ${userId} - expires ${result.expiration}`);
          totalRenewed++;
        } else {
          const errorText = await response.text();
          console.error(`❌ Failed to renew watch for ${userId}: ${response.status} - ${errorText}`);
          errors.push(`User ${userId}: ${response.status}`);
          totalFailed++;
        }

      } catch (error: any) {
        console.error(`❌ Error processing ${userDoc.id}:`, error);
        errors.push(`User ${userDoc.id}: ${error.message}`);
        totalFailed++;
      }
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      watchesRenewed: totalRenewed,
      watchesSkipped: totalSkipped,
      watchesFailed: totalFailed,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('✅ Cron job completed:', summary);

    return NextResponse.json(summary);

  } catch (error: any) {
    console.error('❌ Cron job error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}

