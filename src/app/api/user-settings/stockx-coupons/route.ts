import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveUserId(request: NextRequest): string {
  const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
  const headerUserId = request.headers.get('x-user-id')?.trim() || '';
  const cookieStore = cookies();
  const cookieUserId =
    (cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      '')
      .trim();

  return (qpUserId || headerUserId || cookieUserId).trim();
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const doc = await db.collection('userSettings').doc(userId).get();
    const data = doc.exists ? (doc.data() as any) : {};
    const hideSubject = !!data?.preferences?.stockxCouponsHideSubject;

    return NextResponse.json({ success: true, hideSubject });
  } catch (error: any) {
    console.error('❌ /api/user-settings/stockx-coupons GET error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const hideSubject = body?.hideSubject;
    if (typeof hideSubject !== 'boolean') {
      return NextResponse.json({ success: false, error: 'hideSubject (boolean) is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    await db.collection('userSettings').doc(userId).set(
      {
        preferences: {
          stockxCouponsHideSubject: hideSubject,
        },
        lastUpdated: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, hideSubject, updatedAt: nowIso });
  } catch (error: any) {
    console.error('❌ /api/user-settings/stockx-coupons POST error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

