import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/utils/userApiKeyHelper';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    // Get the current host from the request
    const host = request.headers.get('host') || '';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Get the returnTo URL from query params or body
    const returnTo = request.nextUrl.searchParams.get('returnTo');

    const userId = getUserIdFromRequest(request);
    console.log('Disconnecting StockX tokens', { userId: userId ? `${String(userId).slice(0, 10)}…` : 'missing' });

    // Create response with redirect
    const response = NextResponse.redirect(
      returnTo || `${baseUrl}/dashboard?section=stockx-arbitrage&disconnected=true`
    );

    // Clear Firebase-stored tokens as well (so server-side imports / cron can't keep using stale refresh tokens)
    if (userId) {
      try {
        const adminDb = getAdminDb();
        await adminDb.collection('users').doc(String(userId)).set(
          {
            stockxTokens: FieldValue.delete()
          },
          { merge: true }
        );
      } catch (e: any) {
        console.warn('⚠️ Failed to clear Firebase stockxTokens (non-fatal):', e?.message || String(e));
      }
    }

    // Clear all StockX-related cookies.
    // IMPORTANT: StockX cookies are HttpOnly. The only reliable way to clear them is to
    // overwrite them with an expired Set-Cookie. We do this for BOTH host-only and
    // domain cookies (covers www/non-www deployments).
    const cookieNames = [
      'stockx_access_token',
      'stockx_refresh_token',
      'stockx_token_expires_at',
      'stockx_state',
      'stockx_return_to'
    ];
    const isProd = !host.includes('localhost') && !host.includes('127.0.0.1');
    const baseDeleteOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
      expires: new Date(0),
      maxAge: 0
    };

    for (const name of cookieNames) {
      // Host-only cookie
      response.cookies.set({ name, value: '', ...baseDeleteOptions });
      // Domain cookie (covers solesmarket.com + www.solesmarket.com)
      response.cookies.set({ name, value: '', ...baseDeleteOptions, domain: '.solesmarket.com' });
    }

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