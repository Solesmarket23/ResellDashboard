import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Get the short link data from Firestore
    const shortLinkDoc = await getDoc(doc(db, 'shortLinksByCode', id));
    
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