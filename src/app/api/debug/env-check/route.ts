import { NextResponse } from 'next/server';

export async function GET() {
  // Check environment variables on the server side
  const envVars = {
    NEXT_PUBLIC_SOVRN_API_KEY: process.env.NEXT_PUBLIC_SOVRN_API_KEY,
    NEXT_PUBLIC_SOVRN_ENABLE_OPTIMIZATION: process.env.NEXT_PUBLIC_SOVRN_ENABLE_OPTIMIZATION,
    // Check if they exist without NEXT_PUBLIC prefix (common mistake)
    SOVRN_API_KEY: process.env.SOVRN_API_KEY,
    SOVRN_ENABLE_OPTIMIZATION: process.env.SOVRN_ENABLE_OPTIMIZATION,
    // Check a known working env var for comparison
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'EXISTS' : 'NOT_FOUND',
    // Node environment
    NODE_ENV: process.env.NODE_ENV,
  };

  // Mask sensitive data
  const maskedEnvVars = Object.entries(envVars).reduce((acc, [key, value]) => {
    if (value && key.includes('API_KEY')) {
      acc[key] = value.substring(0, 8) + '...' + (value.length > 8 ? ' (length: ' + value.length + ')' : '');
    } else {
      acc[key] = value || 'NOT_FOUND';
    }
    return acc;
  }, {} as Record<string, string>);

  return NextResponse.json({
    serverSide: maskedEnvVars,
    timestamp: new Date().toISOString(),
  });
}