import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUserIdFallback(request: NextRequest): string | null {
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookie =
    request.cookies.get('site-user-id')?.value ||
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('userId')?.value ||
    null;
  return cookie ? String(cookie).trim() : null;
}

async function requireUserId(request: NextRequest): Promise<string | null> {
  const uid = await resolveNativeAuthUserId(request);
  if (uid) return uid;
  return getUserIdFallback(request);
}

/**
 * GET /api/inventory/locations
 * Returns SKU/styleId → location map for the current user.
 * Auth: Bearer (native) or userId cookie/header.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Server error' },
        { status: 500 }
      );
    }

    const docRef = db.collection(COLLECTIONS.INVENTORY_LOCATIONS).doc(userId);
    const snap = await docRef.get();
    const data = (snap.exists ? snap.data() : null) as { locations?: Record<string, string> } | null;
    const locations = data?.locations ?? {};

    return NextResponse.json({
      success: true,
      locations,
    });
  } catch (e) {
    console.error('[inventory/locations] GET', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inventory/locations
 * Body: { "sku": "192HO246250F", "location": "A1" }  (sku = SKU or style ID)
 * Sets one SKU → location. Merges with existing.
 * Auth: Bearer (native) or userId cookie/header.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const sku = typeof body?.sku === 'string' ? body.sku.trim() : '';
    const location = typeof body?.location === 'string' ? body.location.trim() : '';
    if (!sku) {
      return NextResponse.json(
        { success: false, error: 'Missing sku in body' },
        { status: 400 }
      );
    }
    if (!location) {
      return NextResponse.json(
        { success: false, error: 'Missing location in body' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Server error' },
        { status: 500 }
      );
    }

    const docRef = db.collection(COLLECTIONS.INVENTORY_LOCATIONS).doc(userId);
    const snap = await docRef.get();
    const existing = (snap.exists ? snap.data() : null) as { locations?: Record<string, string> } | null;
    const locations = { ...(existing?.locations ?? {}) };
    locations[sku] = location;

    await docRef.set(
      { locations, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sku,
      location,
      locations,
    });
  } catch (e) {
    console.error('[inventory/locations] POST', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/inventory/locations?sku=192HO246250F
 * Removes one SKU from the map.
 * Auth: Bearer (native) or userId cookie/header.
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const sku = request.nextUrl.searchParams.get('sku')?.trim();
    if (!sku) {
      return NextResponse.json(
        { success: false, error: 'Missing sku query parameter' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Server error' },
        { status: 500 }
      );
    }

    const docRef = db.collection(COLLECTIONS.INVENTORY_LOCATIONS).doc(userId);
    const snap = await docRef.get();
    const existing = (snap.exists ? snap.data() : null) as { locations?: Record<string, string> } | null;
    const locations = { ...(existing?.locations ?? {}) };
    delete locations[sku];

    await docRef.set(
      { locations, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sku,
      locations,
    });
  } catch (e) {
    console.error('[inventory/locations] DELETE', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
