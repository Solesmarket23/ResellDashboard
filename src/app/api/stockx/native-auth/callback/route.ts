import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function buildAppRedirect(scheme: string, params: Record<string, string>): string {
  const qp = new URLSearchParams(params);
  return `${scheme}://stockx-auth?${qp.toString()}`;
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code') || '';
    const state = request.nextUrl.searchParams.get('state') || '';
    const error = request.nextUrl.searchParams.get('error') || '';

    if (error) {
      // Without state we can't look up the intended scheme; use default.
      return NextResponse.redirect(buildAppRedirect('flipflow', { success: '0', error: String(error) }));
    }

    if (!code || !state) {
      return NextResponse.redirect(buildAppRedirect('flipflow', { success: '0', error: 'missing_code_or_state' }));
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.redirect(buildAppRedirect('flipflow', { success: '0', error: 'firebase_admin_not_initialized' }));
    }

    const stateRef = adminDb.collection('stockxOAuthStates').doc(state);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      return NextResponse.redirect(buildAppRedirect('flipflow', { success: '0', error: 'invalid_state' }));
    }

    const stateData = stateSnap.data() as any;
    const uid = String(stateData?.uid || '').trim();
    const callbackScheme = String(stateData?.callbackScheme || 'flipflow').trim() || 'flipflow';
    const expiresAtMs = typeof stateData?.expiresAtMs === 'number' ? stateData.expiresAtMs : 0;
    if (!uid) {
      return NextResponse.redirect(buildAppRedirect(callbackScheme, { success: '0', error: 'missing_uid_for_state' }));
    }
    if (expiresAtMs && Date.now() > expiresAtMs) {
      // Cleanup best-effort
      try { await stateRef.delete(); } catch {}
      return NextResponse.redirect(buildAppRedirect(callbackScheme, { success: '0', error: 'state_expired' }));
    }

    const clientId = process.env.STOCKX_CLIENT_ID;
    const clientSecret = process.env.STOCKX_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(buildAppRedirect(callbackScheme, { success: '0', error: 'missing_stockx_oauth_credentials' }));
    }

    const redirectUri = 'https://www.solesmarket.com/api/stockx/native-auth/callback';

    // Exchange code -> tokens
    const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        audience: 'gateway.stockx.com',
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text().catch(() => '');
      return NextResponse.redirect(
        buildAppRedirect(callbackScheme, { success: '0', error: 'token_exchange_failed', status: String(tokenResponse.status), detail: text.slice(0, 120) })
      );
    }

    const tokens = (await tokenResponse.json().catch(() => null)) as any;
    const accessToken = String(tokens?.access_token || '').trim();
    const refreshToken = String(tokens?.refresh_token || '').trim();
    const expiresIn = Number(tokens?.expires_in || 3600);
    const expiresAt = Date.now() + (Math.max(60, expiresIn - 300) * 1000); // 5 min buffer

    if (!accessToken || !refreshToken) {
      return NextResponse.redirect(buildAppRedirect(callbackScheme, { success: '0', error: 'missing_tokens' }));
    }

    // Persist to Firestore for cron + native app.
    await adminDb.collection('users').doc(uid).set(
      {
        stockxTokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
          source: 'native_oauth',
        },
      },
      { merge: true }
    );

    // Cleanup state (best effort)
    try { await stateRef.delete(); } catch {}

    // Optional: validate token quickly via refresh path if StockX issues a short-lived token (best-effort)
    // We don't block success on this.
    void (async () => {
      try {
        await refreshStockXTokens(refreshToken);
      } catch {}
    })();

    return NextResponse.redirect(buildAppRedirect(callbackScheme, { success: '1' }));
  } catch (e: any) {
    return NextResponse.redirect(buildAppRedirect('flipflow', { success: '0', error: e?.message || 'server_error' }));
  }
}

