import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const testUrl = 'https://stockx.com/air-jordan-1-retro-high-og-chicago-2015';
  
  // Test 1: Check environment variable
  const apiKey = process.env.NEXT_PUBLIC_SOVRN_API_KEY;
  const hasApiKey = !!apiKey;
  
  // Test 2: Generate affiliate link
  const params = new URLSearchParams({
    key: apiKey || 'missing',
    u: testUrl,
    utm_source: 'reselldashboard',
    utm_medium: 'test',
    utm_campaign: 'sovrn_test'
  });
  
  const affiliateUrl = `https://redirect.viglink.com?${params.toString()}`;
  
  // Test 3: Verify redirect (optional - uncomment to test actual redirect)
  let redirectWorks = false;
  let redirectError = null;
  
  try {
    // Make a HEAD request to check if the affiliate link is valid
    const response = await fetch(affiliateUrl, {
      method: 'HEAD',
      redirect: 'manual' // Don't follow redirects
    });
    
    // A 301/302 redirect is expected for a valid affiliate link
    redirectWorks = response.status === 301 || response.status === 302;
    
    if (!redirectWorks) {
      redirectError = `Unexpected status: ${response.status}`;
    }
  } catch (error) {
    redirectError = error instanceof Error ? error.message : 'Unknown error';
  }
  
  return NextResponse.json({
    tests: {
      environment: {
        hasApiKey,
        apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT FOUND',
        nodeEnv: process.env.NODE_ENV,
      },
      affiliateLink: {
        original: testUrl,
        converted: affiliateUrl,
        expectedFormat: 'https://redirect.viglink.com?key=YOUR_KEY&u=ENCODED_URL...',
      },
      redirectTest: {
        tested: true,
        works: redirectWorks,
        error: redirectError,
        note: redirectWorks 
          ? '✅ Affiliate link is working - it redirects properly' 
          : '❌ Affiliate link may not be working - check your API key'
      },
      recommendations: {
        1: hasApiKey 
          ? 'API key is present locally' 
          : 'Add NEXT_PUBLIC_SOVRN_API_KEY to your environment variables',
        2: 'Make sure the API key is also set in Vercel environment variables',
        3: 'Check Sovrn dashboard to verify your API key is active',
        4: 'Test an actual product link in production to verify commissions'
      }
    }
  });
}