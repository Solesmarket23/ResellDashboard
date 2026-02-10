import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BINS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const SLOTS_PER_BIN = 5;   // max 5 items per bin at a time
const MAX_SLOT_NUMBER = 999; // slot format A1–A999 per bin; each slot is unique and never reused

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
 * GET /api/inventory/next-available-slot
 * Returns the next available bin slot. Each slot (e.g. A3, B28) is unique and never reused.
 * Format: A1–A999, B1–B999, … H1–H999. Max 5 items per bin at a time.
 * Counts pickLocation on all purchases (ever assigned); finds first bin with < 5 in use,
 * then the smallest slot number 1–999 in that bin that has never been used.
 * Auth: Bearer (native) or userId cookie/header.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }

    const snap = await adminDb
      .collection(COLLECTIONS.PURCHASES)
      .where('userId', '==', userId)
      .get();

    const usedSlots = new Set<string>();
    snap.docs.forEach((doc) => {
      const data = doc.data() as any;
      const loc = (data?.pickLocation ?? data?.pick_location ?? '').toString().trim();
      if (loc) usedSlots.add(loc.toUpperCase());
    });

    for (const bin of BINS) {
      const usedInBin = Array.from(usedSlots).filter((s) => s.startsWith(bin));
      if (usedInBin.length >= SLOTS_PER_BIN) continue;
      for (let num = 1; num <= MAX_SLOT_NUMBER; num++) {
        const slot = `${bin}${num}`;
        if (!usedSlots.has(slot)) {
          return NextResponse.json({
            success: true,
            location: slot,
            bin,
            slotNumber: num,
            usedInBin: usedInBin.length,
            message: usedInBin.length === 0 ? `Bin ${bin} is empty` : `Bin ${bin} has ${usedInBin.length}/5`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      location: null,
      message: 'All bins full (8 bins × 5 items = 40). No unused slot in any bin.',
    });
  } catch (e) {
    console.error('[inventory/next-available-slot]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
