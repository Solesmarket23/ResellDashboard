import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function generateSkuCode(length = 7): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I,L,O,0,1
  const n = Math.max(4, length);
  let out = '';
  for (let i = 0; i < n; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

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

export async function POST(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const purchaseId: string = (body?.purchaseId || '').toString().trim();
    if (!purchaseId) {
      return NextResponse.json({ success: false, error: 'purchaseId is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const purchaseRef = adminDb.collection('purchases').doc(purchaseId);

    const nowIso = new Date().toISOString();
    const sku = await adminDb.runTransaction(async (tx) => {
      const purchaseSnap = await tx.get(purchaseRef);
      if (!purchaseSnap.exists) {
        throw Object.assign(new Error('Purchase not found'), { status: 404 });
      }

      const purchase = purchaseSnap.data() as any;
      const owner = String(purchase?.userId || purchase?.uid || '').trim();
      if (owner && owner !== userId) {
        throw Object.assign(new Error('Unauthorized'), { status: 403 });
      }

      const existingSku = String(purchase?.sku || '').trim();
      if (existingSku) {
        return existingSku;
      }

      // Best-effort uniqueness: retry a few times if collision is detected.
      // Collisions are extremely unlikely but we guard anyway.
      let code = '';
      for (let i = 0; i < 6; i++) {
        code = generateSkuCode(7);
        const q = adminDb.collection('purchases').where('userId', '==', userId).where('sku', '==', code).limit(1);
        const qSnap = await tx.get(q);
        if (qSnap.empty) break;
        code = '';
      }
      if (!code) {
        throw Object.assign(new Error('Failed to generate unique SKU'), { status: 500 });
      }

      tx.update(purchaseRef, {
        sku: code,
        skuAssignedAt: nowIso,
        skuAssignedBy: userId,
        updatedAt: nowIso,
      });

      return code;
    });

    return NextResponse.json({ success: true, sku });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error?.message || 'Server error';
    console.error('❌ API /api/purchases/assign-sku error:', error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

