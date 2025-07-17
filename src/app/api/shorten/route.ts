import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    
    // Generate a hash of the URL for deduplication
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    
    // Check if this URL already has a short link
    const existingDoc = await getDoc(doc(db, 'shortLinks', urlHash));
    if (existingDoc.exists()) {
      const data = existingDoc.data();
      return NextResponse.json({ 
        shortUrl: `https://resell-dashboard-zeta.vercel.app/go/${data.shortId}` 
      });
    }
    
    // Generate a short ID
    const shortId = crypto.randomBytes(4).toString('hex');
    
    // Store in Firestore
    await setDoc(doc(db, 'shortLinks', urlHash), {
      shortId,
      fullUrl: url,
      created: new Date().toISOString(),
      clicks: 0
    });
    
    // Also store by shortId for quick lookup
    await setDoc(doc(db, 'shortLinksByCode', shortId), {
      fullUrl: url,
      created: new Date().toISOString(),
      clicks: 0
    });
    
    return NextResponse.json({ 
      shortUrl: `https://resell-dashboard-zeta.vercel.app/go/${shortId}` 
    });
  } catch (error) {
    console.error('Error creating short URL:', error);
    return NextResponse.json({ error: 'Failed to create short URL' }, { status: 500 });
  }
}