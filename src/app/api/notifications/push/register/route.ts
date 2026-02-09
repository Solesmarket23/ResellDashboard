import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PushTokenEntry = { token: string; platform: string; updatedAt: string };

/**
 * Register a device push token for the current user (iOS/Android).
 * Call with Bearer token (Firebase ID or site session).
 * Body: { token: string, platform: 'ios' | 'android' }
 * Stores token in users/{uid} so we can send buybox-alert pushes.
 */
export async function POST(request: NextRequest) {
  try {
    const uid = await resolveNativeAuthUserId(request);
    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid Authorization: Bearer token' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const platform = body?.platform === 'android' ? 'android' : 'ios';

    if (!token) {
      return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }

    const now = new Date().toISOString();
    const userSnap = await adminDb.collection('users').doc(uid).get();
    const data = userSnap.data() || {};
    const existing: PushTokenEntry[] = Array.isArray(data.pushTokens) ? data.pushTokens : [];
    const updated = existing.filter((t: PushTokenEntry) => t.token !== token);
    updated.push({ token, platform, updatedAt: now });

    await adminDb.collection('users').doc(uid).set(
      { pushTokens: updated, buyboxPushEnabled: true, updatedAt: now },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[push/register]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
