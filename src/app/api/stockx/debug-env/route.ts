import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Only allow in development or with a special query param
  const isDebugMode = request.nextUrl.searchParams.get('debug') === 'true';
  
  if (!isDebugMode && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;
  const apiKey = process.env.STOCKX_API_KEY;
  
  return NextResponse.json({
    environment: process.env.NODE_ENV,
    stockx_config: {
      client_id: clientId ? `${clientId.substring(0, 8)}...${clientId.substring(clientId.length - 4)}` : 'NOT_SET',
      client_secret: clientSecret ? 'SET' : 'NOT_SET',
      api_key: apiKey ? 'SET' : 'NOT_SET',
    },
    vercel_env: {
      // Vercel-specific env vars
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
    },
    timestamp: new Date().toISOString(),
  });
}