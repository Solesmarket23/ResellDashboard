import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.FEDEX_API_KEY;
    const secretKey = process.env.FEDEX_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
      return NextResponse.json({
        success: false,
        error: 'FedEx credentials not found in environment'
      });
    }
    
    // Test different authentication methods
    const tests = [];
    
    // Test 1: Form-encoded body with client_credentials (Production)
    try {
      const response1 = await fetch('https://apis.fedex.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
      });
      
      tests.push({
        name: 'Production - client_credentials',
        status: response1.status,
        success: response1.ok,
        response: await response1.text()
      });
    } catch (e) {
      tests.push({
        name: 'Production - client_credentials',
        error: e instanceof Error ? e.message : 'Unknown error'
      });
    }
    
    // Test 2: Form-encoded body with scope (Production)
    try {
      const response2 = await fetch('https://apis.fedex.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}&scope=tracking`
      });
      
      tests.push({
        name: 'Production - client_credentials with scope',
        status: response2.status,
        success: response2.ok,
        response: await response2.text()
      });
    } catch (e) {
      tests.push({
        name: 'Production - client_credentials with scope',
        error: e instanceof Error ? e.message : 'Unknown error'
      });
    }
    
    // Test 3: Sandbox with form-encoded body
    try {
      const response3 = await fetch('https://apis-sandbox.fedex.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
      });
      
      tests.push({
        name: 'Sandbox - client_credentials',
        status: response3.status,
        success: response3.ok,
        response: await response3.text()
      });
    } catch (e) {
      tests.push({
        name: 'Sandbox - client_credentials',
        error: e instanceof Error ? e.message : 'Unknown error'
      });
    }
    
    return NextResponse.json({
      success: true,
      credentials: {
        apiKeyLength: apiKey.length,
        secretKeyLength: secretKey.length,
        apiKeyPrefix: apiKey.substring(0, 8),
        secretKeyPrefix: secretKey.substring(0, 8)
      },
      tests
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
