import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.FEDEX_API_KEY;
    const secretKey = process.env.FEDEX_SECRET_KEY;
    const baseUrl = process.env.FEDEX_BASE_URL || 'https://apis.fedex.com';
    
    console.log(`🔍 Debugging FedEx Auth:`);
    console.log(`- Base URL: ${baseUrl}`);
    console.log(`- API Key: ${apiKey?.substring(0, 8)}...`);
    console.log(`- Secret Key: ${secretKey?.substring(0, 8)}...`);
    
    const authUrl = `${baseUrl}/oauth/token`;
    const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
    
    console.log(`- Auth URL: ${authUrl}`);
    console.log(`- Credentials (first 20 chars): ${credentials.substring(0, 20)}...`);
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials'
    });
    
    const responseText = await response.text();
    
    console.log(`- Response Status: ${response.status}`);
    console.log(`- Response Headers:`, Object.fromEntries(response.headers.entries()));
    console.log(`- Response Body:`, responseText);
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      baseUrl,
      authUrl,
      credentialsLength: credentials.length,
      response: responseText,
      headers: Object.fromEntries(response.headers.entries())
    });
    
  } catch (error) {
    console.error('❌ FedEx auth debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
