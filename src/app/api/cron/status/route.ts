import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Cron endpoints are configured',
    endpoints: [
      {
        name: 'Price Monitor',
        path: '/api/cron/monitor-prices',
        schedule: '*/15 * * * * (every 15 minutes)',
        description: 'Monitors price changes for all tracked products'
      },
      {
        name: 'Purchase Sync',
        path: '/api/cron/sync-purchases',
        schedule: '0 * * * * (every hour)',
        description: 'Auto-syncs Gmail purchases for all users'
      }
    ],
    note: 'These cron jobs will start running automatically after deployment to Vercel'
  });
}