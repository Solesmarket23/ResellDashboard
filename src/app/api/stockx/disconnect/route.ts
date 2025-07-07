import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get the current host from the request
    const host = request.headers.get('host') || '';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Get the returnTo URL from query params or body
    const returnTo = request.nextUrl.searchParams.get('returnTo');

    console.log('Disconnecting StockX tokens');

    // Create response with redirect
    const response = NextResponse.redirect(
      returnTo || `${baseUrl}/dashboard?view=stockx-arbitrage&disconnected=true`
    );

    // Clear all StockX-related cookies
    response.cookies.delete('stockx_access_token');
    response.cookies.delete('stockx_refresh_token');
    response.cookies.delete('stockx_state');
    response.cookies.delete('stockx_return_to');

    console.log('StockX tokens cleared successfully');

    return response;

  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Support GET requests as well for easier testing
  return POST(request);
} 