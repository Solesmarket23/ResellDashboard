import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminMessaging } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PushTokenEntry = { token: string; platform: string };

/**
 * Send a test buybox push to the current user's device(s).
 * POST with Bearer token. Body: { listingId?: string, productName?: string }.
 * Uses same payload shape as cron buybox-alerts so tap opens Repricing to that listing.
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
    const listingId =
      (typeof body?.listingId === 'string' ? body.listingId.trim() : '') || 'test-buybox';
    const productName =
      (typeof body?.productName === 'string' ? body.productName.trim() : '') || 'Test listing';

    const adminDb = getAdminDb();
    const messaging = getAdminMessaging();
    if (!adminDb || !messaging) {
      return NextResponse.json(
        { success: false, error: 'Server error (Firebase not initialized)' },
        { status: 500 }
      );
    }

    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = userSnap.data() || {};
    const pushTokens: PushTokenEntry[] = Array.isArray(userData.pushTokens) ? userData.pushTokens : [];

    const tokens = pushTokens
      .map((t: PushTokenEntry) => t?.token?.trim())
      .filter(Boolean) as string[];

    if (tokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No push token registered. Open the app, allow notifications, and try again.',
        },
        { status: 400 }
      );
    }

    const title = "You're not winning the buybox";
    const bodyText = `${productName} — tap to open.`;
    let sent = 0;

    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title, body: bodyText },
          data: {
            type: 'buybox_lost',
            listingId: listingId.slice(0, 200),
            productName: productName.slice(0, 100),
          },
          apns: {
            payload: {
              aps: { 'mutable-content': 1, sound: 'default' },
            },
            fcmOptions: {},
          },
        });
        sent++;
      } catch (e) {
        console.warn('[push/test-buybox] send failed for one token:', e);
      }
    }

    if (sent === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to send to any device' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sent,
      message: sent === 1 ? 'Test push sent.' : `Test push sent to ${sent} device(s).`,
    });
  } catch (e) {
    console.error('[push/test-buybox]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
