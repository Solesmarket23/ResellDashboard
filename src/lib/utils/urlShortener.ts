import { db } from '@/lib/firebase/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export async function createShortUrl(longUrl: string, userId: string): Promise<string | null> {
  try {
    // Generate a simple hash for the URL
    const encoder = new TextEncoder();
    const data = encoder.encode(longUrl);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const shortId = hashHex.substring(0, 8);
    
    // Try to store in user's own collection to avoid permission issues
    const userShortLinksRef = doc(db, `users/${userId}/shortLinks`, shortId);
    
    // Check if it already exists
    const existingDoc = await getDoc(userShortLinksRef);
    if (existingDoc.exists()) {
      const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
      return `https://${domain}/go/${shortId}`;
    }
    
    // Create new short link in user's collection
    await setDoc(userShortLinksRef, {
      fullUrl: longUrl,
      created: new Date().toISOString(),
      clicks: 0
    });
    
    // Also store in the public collection for redirect lookup
    // This might fail due to permissions, but we'll try anyway
    try {
      await setDoc(doc(db, 'shortLinksByCode', shortId), {
        fullUrl: longUrl,
        created: new Date().toISOString(),
        clicks: 0,
        userId
      });
    } catch (e) {
      console.log('Could not store in public collection, continuing anyway');
    }
    
    const domain = process.env.NEXT_PUBLIC_DOMAIN || 'solesmarket.com';
    return `https://${domain}/go/${shortId}`;
  } catch (error) {
    console.error('Error creating short URL:', error);
    return null;
  }
}