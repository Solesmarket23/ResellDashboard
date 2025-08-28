import { NextRequest, NextResponse } from 'next/server';
import { getStockXApiCredentials } from '@/lib/utils/userApiKeyHelper';

export async function GET(request: NextRequest) {
  try {
    const credentials = await getStockXApiCredentials(request);
    
    if (!credentials.accessToken || !credentials.apiKey) {
      return NextResponse.json(
        { error: 'Missing StockX authentication' },
        { status: 401 }
      );
    }

    // Test batch endpoint availability
    const testBatch = {
      listings: [{
        id: 'test-listing-id',
        ask: {
          amount: '100',
          currencyCode: 'USD'
        }
      }]
    };

    // Try different possible batch endpoints
    const endpoints = [
      'https://api.stockx.com/v2/selling/batch/listings',
      'https://api.stockx.com/v2/selling/batch/update-asks',
      'https://api.stockx.com/v2/batch/selling/listings'
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        console.log(`Testing endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'x-api-key': credentials.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(testBatch)
        });

        const responseText = await response.text();
        let responseData;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }

        results.push({
          endpoint,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData
        });

      } catch (error) {
        results.push({
          endpoint,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      message: 'Batch endpoint test results',
      results,
      credentials: {
        hasAccessToken: !!credentials.accessToken,
        hasApiKey: !!credentials.apiKey
      }
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error.message },
      { status: 500 }
    );
  }
}