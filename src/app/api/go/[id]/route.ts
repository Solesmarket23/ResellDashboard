import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { shortLinks } from '../../shorten/route';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    let fullUrl: string | null = null;
    
    // Try Vercel KV first for persistent storage
    try {
      fullUrl = await kv.get<string>(`short:${id}`);
      if (fullUrl) {
        console.log('✅ Found URL in Vercel KV');
      }
    } catch (e) {
      console.log('⚠️ KV not available, checking in-memory storage');
      // Fallback to in-memory storage
      fullUrl = shortLinks.get(id) || null;
    }
    
    if (!fullUrl) {
      // Return a 404 page
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
    
    // Redirect to the full affiliate URL
    return NextResponse.redirect(fullUrl, 302);
  } catch (error) {
    console.error('Error processing redirect:', error);
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>Error</h1>
          <p>An error occurred processing your request.</p>
        </body>
      </html>`,
      { 
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}