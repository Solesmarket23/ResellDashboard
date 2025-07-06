import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get the current host from the request
  const host = request.headers.get('host') || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  
  console.log('🧹 Clearing all StockX tokens');

  // Create response that redirects to arbitrage finder
  const response = NextResponse.redirect(`${baseUrl}/dashboard?view=stockx-arbitrage&tokens_cleared=true`);

  // Clear all StockX-related cookies
  response.cookies.delete('stockx_access_token');
  response.cookies.delete('stockx_refresh_token');
  response.cookies.delete('stockx_state');
  response.cookies.delete('stockx_return_to');

  console.log('✅ All StockX tokens cleared, redirecting to arbitrage finder');
  return response;
} 