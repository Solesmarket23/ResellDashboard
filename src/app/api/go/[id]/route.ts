import { NextRequest, NextResponse } from 'next/server';
import { shortLinks } from '../../shorten/route';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Get the full URL from our in-memory storage
    const fullUrl = shortLinks.get(id);
    
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