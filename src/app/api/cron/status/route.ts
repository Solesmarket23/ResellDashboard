import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Check if admin can be initialized
  let hasAdminCredentials = false;
  let adminInitError: string | null = null;
  try {
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const db = getAdminDb();
    hasAdminCredentials = !!db;
  } catch (error) {
    console.error('Failed to import Firebase Admin:', error);
    adminInitError = error instanceof Error ? error.message : String(error);
  }

  const paused = process.env.CRON_PAUSED === '1' || process.env.CRON_PAUSED === 'true';
  
  return NextResponse.json({
    status: hasAdminCredentials ? 'ready' : 'missing-credentials',
    message: hasAdminCredentials 
      ? 'Cron endpoints are configured and ready' 
      : 'Cron endpoints are configured but Firebase Admin credentials are missing',
    paused,
    adminInitError: adminInitError || undefined,
    endpoints: [
      {
        name: 'Price Monitor',
        path: '/api/cron/monitor-prices',
        schedule: '*/15 * * * * (every 15 minutes)',
        description: 'Monitors price changes for all tracked products',
        enabled: hasAdminCredentials && !paused
      },
      {
        name: 'Purchase Sync',
        path: '/api/cron/sync-purchases',
        schedule: '0 * * * * (every hour)',
        description: 'Auto-syncs Gmail purchases for all users',
        enabled: hasAdminCredentials && !paused
      }
    ],
    environment: {
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasCronSecret: !!process.env.CRON_SECRET
    },
    note: hasAdminCredentials 
      ? paused
        ? 'Cron jobs are PAUSED via CRON_PAUSED'
        : 'Cron jobs are active and running on Vercel'
      : 'Add Firebase Admin credentials to Vercel environment variables to activate cron jobs'
  });
}