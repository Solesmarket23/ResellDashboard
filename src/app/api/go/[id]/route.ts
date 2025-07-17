import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Initialize Redis
    let redis: Redis | null = null;
    try {
      redis = Redis.fromEnv();
    } catch (e) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Service Unavailable</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #333; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <h1>Service Temporarily Unavailable</h1>
            <p>URL shortening service is not configured.</p>
          </body>
        </html>`,
        { 
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
    
    if (!redis) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Service Unavailable</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #333; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <h1>Service Temporarily Unavailable</h1>
            <p>URL shortening service is not configured.</p>
          </body>
        </html>`,
        { 
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
    
    // Get the full URL from Redis storage
    const fullUrl = await redis.get<string>(`short:${id}`);
    
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