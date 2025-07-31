import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const testUrl = 'https://stockx.com/air-jordan-1-retro-high-og-chicago-2015?size=10';
  
  // Test environment variables
  const hasAccountSid = !!process.env.IMPACT_ACCOUNT_SID;
  const hasAuthToken = !!process.env.IMPACT_AUTH_TOKEN;
  
  // Test creating an affiliate link
  let testResult = null;
  let error = null;
  
  try {
    const response = await fetch(new URL('/api/impact/create-link', request.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        stockxUrl: testUrl,
        customParams: {
          productId: 'test',
          size: '10',
          source: 'test'
        }
      })
    });
    
    if (response.ok) {
      testResult = await response.json();
    } else {
      error = await response.text();
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }
  
  return NextResponse.json({
    environment: {
      hasAccountSid,
      hasAuthToken,
      accountSidPreview: hasAccountSid ? 'Set in Vercel' : 'NOT FOUND',
    },
    test: {
      originalUrl: testUrl,
      result: testResult,
      error: error
    },
    status: testResult?.trackingUrl 
      ? '✅ Impact.com is working! Affiliate links are being generated.' 
      : '❌ Impact.com is not working. Check your credentials.',
    nextSteps: testResult?.trackingUrl
      ? 'Your Impact.com affiliate links are ready to use!'
      : 'Add IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN to your environment variables'
  });
}