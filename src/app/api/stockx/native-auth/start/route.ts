import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getBearerToken(request: NextRequest): string | null {
  const raw = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const token = (m?.[1] || '').trim();
  return token ? token : null;
}

function safeCallbackScheme(raw: unknown): string {
  const s = String(raw || '').trim();
  // Keep it simple and safe: allow [A-Za-z0-9+.-], must start with a letter.
  if (!/^[A-Za-z][A-Za-z0-9+.\-]*$/.test(s)) return 'flipflow';
  return s;
}

export async function POST(request: NextRequest) {
  try {
    const clientId = process.env.STOCKX_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'Missing STOCKX_CLIENT_ID' }, { status: 500 });
    }

    const bearer = getBearerToken(request);
    if (!bearer) {
      return NextResponse.json({ success: false, error: 'Missing Authorization: Bearer <Firebase ID token>' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    const decoded = await adminAuth.verifyIdToken(bearer);
    const uid = String(decoded?.uid || '').trim();
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Invalid Firebase token (missing uid)' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const callbackScheme = safeCallbackScheme(body?.callbackScheme);
    const returnTo = typeof body?.returnTo === 'string' ? body.returnTo : '';

    // IMPORTANT: StockX redirect_uri must be allowlisted. We always use production.
    const redirectUri = 'https://www.solesmarket.com/api/stockx/native-auth/callback';

    // State: store server-side (NOT cookie) so the native app doesn't depend on browser cookies.
    const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const nowMs = Date.now();

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    await adminDb.collection('stockxOAuthStates').doc(state).set(
      {
        uid,
        callbackScheme,
        returnTo: returnTo || null,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + 10 * 60 * 1000,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const authUrl =
      `https://accounts.stockx.com/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent('openid offline_access')}` +
      `&audience=${encodeURIComponent('gateway.stockx.com')}`;

    return NextResponse.json({
      success: true,
      uid,
      authUrl,
      redirectUri,
      callbackScheme,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}

