import { NextRequest, NextResponse } from 'next/server';

function getSiteUserIdFromCookie(request: NextRequest): string | null {
  const raw =
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('site-user-id')?.value ||
    null;
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
    const userId = getEffectiveUserId(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const userDoc = await adminDb.collection('users').doc(userId).get();
    const data = userDoc.exists ? userDoc.data() : null;

    const slack = data?.stockxPriceMonitorSlack || null;
    return NextResponse.json({
      success: true,
      userId,
      slack: slack
        ? {
            enabled: slack.enabled === true,
            webhookUrl: String(slack.webhookUrl || ''),
            updatedAt: slack.updatedAt || null,
          }
        : { enabled: false, webhookUrl: '', updatedAt: null },
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

    const enabled = body?.enabled === true;
    const webhookUrl = String(body?.webhookUrl || '').trim();
    if (enabled && !webhookUrl) {
      return NextResponse.json({ success: false, error: 'Missing webhookUrl' }, { status: 400 });
    }
    if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
      return NextResponse.json({ success: false, error: 'webhookUrl must be https' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const nowIso = new Date().toISOString();
    await adminDb.collection('users').doc(userId).set(
      {
        stockxPriceMonitorSlack: {
          enabled,
          webhookUrl: enabled ? webhookUrl : '',
          updatedAt: nowIso,
        },
        updatedAt: nowIso,
        createdAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      userId,
      slack: { enabled, webhookUrl: enabled ? webhookUrl : '', updatedAt: nowIso },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


