import { NextRequest, NextResponse } from 'next/server';

function getSiteUserIdFromCookie(request: NextRequest): string | null {
  const raw = request.cookies.get('site-user-id')?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getEffectiveUserId(request: NextRequest): string | null {
  return request.headers.get('x-user-id')?.trim() || getSiteUserIdFromCookie(request);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId')?.trim() || getEffectiveUserId(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const userDoc = await adminDb.collection('users').doc(userId).get();
    const data = userDoc.exists ? userDoc.data() : null;

    return NextResponse.json({
      success: true,
      userId,
      enabled: data?.stockxAutoRepricingEnabled === true,
      intervalMinutes: data?.stockxAutoRepricingConfig?.intervalMinutes ?? 30,
      config: data?.stockxAutoRepricingConfig ?? null
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = body?.userId ? String(body.userId).trim() : getEffectiveUserId(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const intervalMinutes = Number(body?.intervalMinutes);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid intervalMinutes' }, { status: 400 });
    }
    const enabled = body?.enabled === true;

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const nowIso = new Date().toISOString();
    await adminDb.collection('users').doc(userId).set(
      {
        stockxAutoRepricingEnabled: enabled,
        stockxAutoRepricingConfig: {
          intervalMinutes,
          strategy: 'individual'
        },
        // keep legacy field for backwards compatibility if anything reads it
        autoRepricingEnabled: enabled,
        updatedAt: nowIso,
        createdAt: nowIso
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, userId, enabled, intervalMinutes });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


