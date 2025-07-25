import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  
  // Test different redirect URI formats
  const redirectUris = {
    standard: `${baseUrl}/api/stockx/callback`,
    withoutProtocol: `${host}/api/stockx/callback`,
    hardcodedHttps: `https://${host}/api/stockx/callback`,
    fromHeaders: {
      host: request.headers.get('host'),
      xForwardedHost: request.headers.get('x-forwarded-host'),
      xForwardedProto: request.headers.get('x-forwarded-proto'),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
    }
  };
  
  return NextResponse.json({
    baseUrl,
    host,
    protocol,
    redirectUris,
    url: request.url,
    nextUrl: request.nextUrl.toString(),
  });
}