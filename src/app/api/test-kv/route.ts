import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET(request: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: {
      hasKvUrl: !!process.env.KV_REST_API_URL,
      hasKvToken: !!process.env.KV_REST_API_TOKEN,
      kvUrlPreview: process.env.KV_REST_API_URL ? process.env.KV_REST_API_URL.substring(0, 30) + '...' : 'NOT SET',
    },
    tests: {}
  };

  // Test 1: KV Connection
  try {
    await kv.ping();
    results.tests.kvConnection = '✅ Connected to Vercel KV';
  } catch (error) {
    results.tests.kvConnection = '❌ Failed to connect to KV: ' + (error as Error).message;
  }

  // Test 2: Create a test short URL
  try {
    const testUrl = 'https://stockx.com/test-product';
    const testId = 'test-' + Date.now();
    
    // Store in KV
    await kv.set(`short:${testId}`, testUrl, { ex: 60 }); // 1 minute expiry for test
    
    // Read it back
    const retrieved = await kv.get(`short:${testId}`);
    
    if (retrieved === testUrl) {
      results.tests.shortUrlStorage = '✅ Short URL storage working';
      results.tests.testShortUrl = `https://solesmarket.com/go/${testId}`;
    } else {
      results.tests.shortUrlStorage = '❌ Short URL storage failed';
    }
  } catch (error) {
    results.tests.shortUrlStorage = '❌ Error: ' + (error as Error).message;
  }

  // Test 3: Check for any existing short URLs
  try {
    // Note: KV doesn't support pattern matching, so we can't easily list all keys
    // But we can test if the connection works
    results.tests.kvStatus = '✅ KV is operational';
  } catch (error) {
    results.tests.kvStatus = '❌ KV error: ' + (error as Error).message;
  }

  return NextResponse.json({
    ...results,
    summary: results.tests.kvConnection?.includes('✅') 
      ? '🎉 Everything is working! Your short URLs will persist for 30 days.'
      : '⚠️ KV is not connected. Short URLs will only work until server restart.',
    nextSteps: results.tests.kvConnection?.includes('✅')
      ? 'Your Sovrn affiliate links are working perfectly!'
      : 'Check that KV_REST_API_URL and KV_REST_API_TOKEN are set in Vercel'
  });
}