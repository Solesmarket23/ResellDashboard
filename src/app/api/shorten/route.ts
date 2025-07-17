import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Check if KV is configured
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.log('Vercel KV not configured, using Bitly fallback');
      
      // Fallback to Bitly if available
      if (process.env.BITLY_ACCESS_TOKEN) {
        const response = await fetch('https://api-ssl.bitly.com/v4/shorten', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.BITLY_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            long_url: url,
            domain: 'bit.ly',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({ shortUrl: data.link });
        }
      }
      
      // If no KV or Bitly, return original URL
      return NextResponse.json({ shortUrl: url });
    }

    // Generate a hash of the URL for deduplication
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    
    // Check if this URL already exists
    const existingShortId = await kv.get(`url:${urlHash}`);
    if (existingShortId) {
      const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
      return NextResponse.json({ 
        shortUrl: `https://${domain}/go/${existingShortId}` 
      });
    }
    
    // Generate a short ID
    const shortId = crypto.randomBytes(4).toString('hex');
    
    // Store both mappings in KV
    await kv.set(`url:${urlHash}`, shortId, { ex: 60 * 60 * 24 * 30 }); // 30 days expiry
    await kv.set(`short:${shortId}`, url, { ex: 60 * 60 * 24 * 30 }); // 30 days expiry
    
    // Use custom domain
    const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
    
    return NextResponse.json({ 
      shortUrl: `https://${domain}/go/${shortId}` 
    });

  } catch (error: any) {
    console.error('Error creating short URL:', error);
    // Fallback to original URL on any error
    return NextResponse.json({ shortUrl: url });
  }
}