import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    // Simple test - just return a fake short URL
    const shortId = Math.random().toString(36).substring(2, 8);
    const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
    
    return NextResponse.json({ 
      shortUrl: `https://${domain}/go/${shortId}`,
      message: 'Test endpoint working!',
      receivedUrl: url
    });
  } catch (error) {
    return NextResponse.json({ error: 'Test endpoint error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Shorten test endpoint is working!',
    method: 'Use POST to create short URLs'
  });
}