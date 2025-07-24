import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/firebaseAdmin';

export async function GET(request: NextRequest) {
  const hasAdminCredentials = !!adminDb;
  
  return NextResponse.json({
    status: hasAdminCredentials ? 'ready' : 'missing-credentials',
    message: hasAdminCredentials 
      ? 'Cron endpoints are configured and ready' 
      : 'Cron endpoints are configured but Firebase Admin credentials are missing',
    endpoints: [
      {
        name: 'Price Monitor',
        path: '/api/cron/monitor-prices',
        schedule: '*/15 * * * * (every 15 minutes)',
        description: 'Monitors price changes for all tracked products',
        enabled: hasAdminCredentials
      },
      {
        name: 'Purchase Sync',
        path: '/api/cron/sync-purchases',
        schedule: '0 * * * * (every hour)',
        description: 'Auto-syncs Gmail purchases for all users',
        enabled: hasAdminCredentials
      }
    ],
    environment: {
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasCronSecret: !!process.env.CRON_SECRET
    },
    note: hasAdminCredentials 
      ? 'Cron jobs are active and running on Vercel'
      : 'Add Firebase Admin credentials to Vercel environment variables to activate cron jobs'
  });
}