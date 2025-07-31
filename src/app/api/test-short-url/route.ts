import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET(request: NextRequest) {
  const testCode = request.nextUrl.searchParams.get('code') || '68b2a025';
  
  let redisStatus = 'Not configured';
  let fullUrl = null;
  let error = null;
  
  try {
    const redis = Redis.fromEnv();
    redisStatus = 'Connected';
    
    // Try to get the URL for this code
    fullUrl = await redis.get<string>(`short:${testCode}`);
    
    // Also check if any short URLs exist
    const keys = await redis.keys('short:*');
    
    return NextResponse.json({
      status: 'success',
      testCode,
      redisStatus,
      fullUrl: fullUrl || 'Not found',
      totalShortUrls: keys.length,
      recommendation: fullUrl 
        ? 'Short URL is working correctly' 
        : 'Short URL not found in Redis. The link may have expired or Redis was cleared.',
      explanation: [
        '1. When you share to Twitter, it creates a short URL that maps to your affiliate link',
        '2. The short URL is stored in Redis (Upstash)',
        '3. When someone clicks the short URL, it redirects to your Sovrn affiliate link',
        '4. If Redis is not configured or the mapping expires, the short URL will stop working'
      ],
      solution: 'To ensure affiliate links work, you need to either:',
      options: [
        'Option 1: Configure Upstash Redis in Vercel (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)',
        'Option 2: Use the full affiliate URL directly in tweets instead of short URLs',
        'Option 3: Use a different URL shortener service like Bitly'
      ]
    });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    
    return NextResponse.json({
      status: 'error',
      testCode,
      redisStatus,
      error,
      recommendation: 'Redis is not configured. Short URLs will not work.',
      solution: 'Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables'
    });
  }
}