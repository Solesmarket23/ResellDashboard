import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, updateDoc, increment, collection, query, where, getDocs } from 'firebase/firestore';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // First try to get from public collection
    let shortLinkDoc = await getDoc(doc(db, 'shortLinksByCode', id));
    
    // If not found, search in user collections
    if (!shortLinkDoc.exists()) {
      // Query all users' shortLinks subcollections
      const usersSnapshot = await getDocs(collection(db, 'users'));
      for (const userDoc of usersSnapshot.docs) {
        const userShortLinkDoc = await getDoc(doc(db, `users/${userDoc.id}/shortLinks`, id));
        if (userShortLinkDoc.exists()) {
          shortLinkDoc = userShortLinkDoc;
          break;
        }
      }
    }
    
    if (!shortLinkDoc.exists()) {
      // Return a 404 page instead of JSON for better UX
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Link Not Found</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #333; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <h1>Link Not Found</h1>
            <p>This link may have expired or been removed.</p>
          </body>
        </html>`,
        { 
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
    
    const data = shortLinkDoc.data();
    
    // Increment click counter (don't await to avoid slowing down redirect)
    updateDoc(doc(db, 'shortLinksByCode', id), {
      clicks: increment(1),
      lastClicked: new Date().toISOString()
    }).catch(console.error);
    
    // Redirect to the full affiliate URL
    return NextResponse.redirect(data.fullUrl, 302);
  } catch (error) {
    console.error('Error processing redirect:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}