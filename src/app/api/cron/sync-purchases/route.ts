import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { adminDb } from '@/lib/firebase/firebaseAdmin';

// Verify this is a legitimate cron request from Vercel
function verifyCronRequest(request: NextRequest) {
  const authHeader = headers().get('authorization');
  const host = headers().get('host');
  return authHeader === `Bearer ${process.env.CRON_SECRET}` || 
         host?.includes('localhost') ||
         host?.includes('vercel.app');
}

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Cron job started: sync-purchases');
    
    // Get all users with Gmail tokens
    const usersSnapshot = await adminDb.collection('users').get();
    let totalUsersProcessed = 0;
    let totalEmailsProcessed = 0;
    let totalPurchasesFound = 0;
    const errors: string[] = [];

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const gmailTokens = userData.gmailTokens;
        const emailLastSync = userData.emailLastSync || 0;
        
        // Skip if no Gmail tokens
        if (!gmailTokens?.access_token) {
          continue;
        }

        // Check if it's been at least 30 minutes since last sync
        const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
        if (emailLastSync > thirtyMinutesAgo) {
          console.log(`⏭️ Skipping user ${userDoc.id} - synced recently`);
          continue;
        }

        totalUsersProcessed++;
        console.log(`📧 Syncing purchases for user ${userDoc.id}`);

        // Call the existing Gmail purchases endpoint
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://reselldashboard.vercel.app';
        const response = await fetch(`${baseUrl}/api/gmail/purchases`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `userId=${userDoc.id}` // Pass user ID
          },
          body: JSON.stringify({
            accessToken: gmailTokens.access_token,
            maxResults: 20, // Check last 20 emails
            userId: userDoc.id
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            totalEmailsProcessed += result.totalEmails || 0;
            totalPurchasesFound += result.newPurchases || 0;
            
            // Update last sync time
            await adminDb.collection('users').doc(userDoc.id).update({
              emailLastSync: Date.now()
            });
            
            console.log(`✅ Synced ${result.newPurchases || 0} new purchases for user ${userDoc.id}`);
          }
        } else {
          console.error(`❌ Failed to sync for user ${userDoc.id}: ${response.status}`);
          errors.push(`User ${userDoc.id}: API error ${response.status}`);
        }

      } catch (error) {
        console.error(`Error processing user ${userDoc.id}:`, error);
        errors.push(`User ${userDoc.id}: ${error.message}`);
      }
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      usersProcessed: totalUsersProcessed,
      emailsProcessed: totalEmailsProcessed,
      purchasesFound: totalPurchasesFound,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('✅ Cron job completed:', summary);

    return NextResponse.json(summary);

  } catch (error) {
    console.error('❌ Cron job error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}