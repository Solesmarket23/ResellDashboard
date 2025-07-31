import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import crypto from 'crypto';

// Fallback in-memory storage for development/testing
const shortLinks = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { url, userId } = await request.json();
    
    console.log('Shortening URL:', url, 'for user:', userId);
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Try to use Vercel KV for persistent storage
    let useKV = false;
    try {
      await kv.ping();
      useKV = true;
      console.log('✅ Using Vercel KV for persistent URL storage');
    } catch (e) {
      console.log('⚠️ Vercel KV not available, using in-memory storage (URLs will expire on restart)');
    }

    // Generate a hash of the URL for deduplication
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    
    if (useKV) {
      // Check if this URL already exists in KV
      const existingShortId = await kv.get(`url:${urlHash}`);
      if (existingShortId) {
        const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
        return NextResponse.json({ 
          shortUrl: `https://${domain}/go/${existingShortId}` 
        });
      }
      
      // Generate a short ID
      const shortId = crypto.randomBytes(4).toString('hex');
      
      // Store both mappings in KV with 30-day expiry
      await kv.set(`url:${urlHash}`, shortId, { ex: 60 * 60 * 24 * 30 });
      await kv.set(`short:${shortId}`, url, { ex: 60 * 60 * 24 * 30 });
      
      const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
      return NextResponse.json({ 
        shortUrl: `https://${domain}/go/${shortId}` 
      });
    } else {
      // Fallback to in-memory storage
      const existingShortId = Array.from(shortLinks.entries()).find(([_, fullUrl]) => fullUrl === url)?.[0];
      if (existingShortId) {
        const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
        return NextResponse.json({ 
          shortUrl: `https://${domain}/go/${existingShortId}` 
        });
      }
      
      const shortId = crypto.randomBytes(4).toString('hex');
      shortLinks.set(shortId, url);
      
      const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
      return NextResponse.json({ 
        shortUrl: `https://${domain}/go/${shortId}` 
      });
    }
  } catch (error: any) {
    console.error('Error creating short URL:', error);
    return NextResponse.json({ 
      error: 'Failed to create short URL',
      details: error.message || 'Unknown error',
      code: error.code
    }, { status: 500 });
  }
}

// Export the shortLinks map for the redirect handler fallback
export { shortLinks };