import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const bearerToken = process.env.ALIAS_BEARER_TOKEN;

    if (!bearerToken) {
      return NextResponse.json(
        { error: 'Alias API token not configured' },
        { status: 500 }
      );
    }

    // Test the token by making a simple API call
    const response = await fetch('https://api.alias.org/api/v1/test', {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid API token',
          details: error 
        },
        { status: 401 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Alias API connection successful',
      data
    });

  } catch (error) {
    console.error('Alias auth error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to verify Alias API connection',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}