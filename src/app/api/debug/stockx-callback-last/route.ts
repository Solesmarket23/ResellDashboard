import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * Returns the last StockX callback result (written by the callback route to Firestore).
 * Visit https://www.solesmarket.com/api/debug/stockx-callback-last after reproducing
 * the Connect flow to see what the callback received and did.
 */
export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    const snap = await db.collection('debug').doc('stockxCallbackLast').get();
    const data = snap.exists ? snap.data() : null;
    return NextResponse.json({ ok: true, last: data ?? null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
