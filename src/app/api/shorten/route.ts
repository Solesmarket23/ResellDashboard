import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Simple in-memory storage for short URLs (will reset on server restart)
// In production, you'd want to use a proper database
const shortLinks = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { url, userId } = await request.json();
    
    console.log('Shortening URL:', url, 'for user:', userId);
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    
    // Generate a hash of the URL for deduplication
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    
    // Check if this URL already has a short link in our memory storage
    const existingShortId = Array.from(shortLinks.entries()).find(([_, fullUrl]) => fullUrl === url)?.[0];
    if (existingShortId) {
      const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
      return NextResponse.json({ 
        shortUrl: `https://${domain}/go/${existingShortId}` 
      });
    }
    
    // Generate a short ID
    const shortId = crypto.randomBytes(4).toString('hex');
    
    // Store in memory
    shortLinks.set(shortId, url);
    
    // Use custom domain
    const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
    
    return NextResponse.json({ 
      shortUrl: `https://${domain}/go/${shortId}` 
    });
  } catch (error: any) {
    console.error('Error creating short URL:', error);
    return NextResponse.json({ 
      error: 'Failed to create short URL',
      details: error.message || 'Unknown error',
      code: error.code
    }, { status: 500 });
  }
}

// Export the shortLinks map so the redirect handler can access it
export { shortLinks };