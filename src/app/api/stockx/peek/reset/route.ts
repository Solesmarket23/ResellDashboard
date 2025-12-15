import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

function getSiteUserIdFromCookie(request: NextRequest): string | null {
  const raw = request.cookies.get('site-user-id')?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getEffectiveUserId(request: NextRequest, bodyUserId?: unknown): string | null {
  const fromHeader = request.headers.get('x-user-id')?.trim();
  const fromBody = typeof bodyUserId === 'string' ? bodyUserId.trim() : '';
  return fromBody || fromHeader || getSiteUserIdFromCookie(request);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Clears Market Peek timing for one listing so the next cron run treats it as "due" immediately.
 *
 * POST body:
 * - userId: string (optional if cookie/header present)
 * - listingId: string (required)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const listingId = body?.listingId ? String(body.listingId).trim() : '';
    const userId = getEffectiveUserId(request, body?.userId);

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }
    if (!listingId) {
      return NextResponse.json({ success: false, error: 'Missing listingId' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const existing = await adminDb
      .collection('stockxPricingSettings')
      .where('userId', '==', userId)
      .where('listingId', '==', listingId)
      .limit(1)
      .get();

    if (existing.empty) {
      return NextResponse.json(
        { success: false, error: 'No settings found for listing (opt-in required)', userId, listingId },
        { status: 404 }
      );
    }

    const docId = existing.docs[0].id;
    const nowIso = new Date().toISOString();

    await adminDb.collection('stockxPricingSettings').doc(docId).set(
      {
        // Clear peek timer so next run is due immediately
        pricingStrategy: {
          peekSettings: {
            lastPeekTime: FieldValue.delete(),
          },
        },
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, userId, listingId, id: docId, reset: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


