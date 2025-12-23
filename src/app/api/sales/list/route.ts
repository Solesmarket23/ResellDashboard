import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { cookies } from 'next/headers';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Resolve userId consistently with /api/purchases/list
    // Precedence: query param (explicit) -> x-user-id header -> cookies
    const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
    const headerUserId = request.headers.get('x-user-id')?.trim() || '';
    const cookieStore = cookies();
    const cookieUserId =
      (cookieStore.get('userId')?.value ||
        cookieStore.get('siteUserId')?.value ||
        cookieStore.get('site-user-id')?.value ||
        '')
        .trim();

    const userId = (qpUserId || headerUserId || cookieUserId).trim();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    // Query only this user's sales with pagination to reduce reads per request
    const db = getAdminDb();
    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '400', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 400;
    const cursorId = request.nextUrl.searchParams.get('cursorId');

    let queryRef: FirebaseFirestore.Query = db
      .collection('user_sales')
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(limit);

    if (cursorId) {
      const cursorDoc = await db.collection('user_sales').doc(cursorId).get();
      if (cursorDoc.exists) {
        queryRef = queryRef.startAfter(cursorDoc);
      }
    }

    const snapshot = await queryRef.get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const nextCursorId = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;

    // Back-compat fallback:
    // Some historical imports wrote StockX sales into `stockxSales` (COLLECTIONS.STOCKX_SALES) as `{ saleData: ... }`.
    // If `user_sales` is empty, return a mapped view so Sales 2.0 / purchase-linking can still function.
    if (docs.length === 0 && !cursorId) {
      try {
        let legacyQuery: FirebaseFirestore.Query = db
          .collection(COLLECTIONS.STOCKX_SALES)
          .where('userId', '==', userId)
          .orderBy(FieldPath.documentId())
          .limit(limit);

        const legacySnap = await legacyQuery.get();
        const legacyDocs = legacySnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        const mapped = legacyDocs.map((x: any) => {
          const sale = x?.saleData || x?.sale || x;
          return {
            id: x.id,
            orderNumber: sale?.orderNumber || x?.stockxOrderId || x?.orderNumber || null,
            product: sale?.productName || sale?.product?.productName || sale?.product?.title || sale?.product?.name || null,
            brand: sale?.product?.brand || sale?.brand || null,
            size: sale?.variant?.variantValue || sale?.size || null,
            styleId: sale?.product?.styleId || sale?.styleId || null,
            imageUrl: sale?.product?.imageUrl || sale?.product?.image || null,
            salePrice: sale?.amount ? Number(sale.amount) || 0 : Number(sale?.salePrice) || 0,
            fees: Number(sale?.fees) || null,
            payout: sale?.payout ? Number(sale.payout) || null : (sale?.totalPayout ? Number(sale.totalPayout) || null : null),
            purchasePrice: Number(sale?.purchasePrice) || null,
            profit: Number(sale?.profit) || null,
            linkedPurchaseId: sale?.linkedPurchaseId ?? null,
            linkedPurchaseOrderNumber: sale?.linkedPurchaseOrderNumber ?? null,
            date: sale?.date || sale?.createdAt || sale?.updatedAt || null,
            // preserve listingId when present (useful for matching)
            listingId: sale?.listingId || sale?.askId || null,
            _source: 'stockxSales'
          };
        });

        const legacyNextCursorId =
          legacySnap.docs.length === limit ? legacySnap.docs[legacySnap.docs.length - 1].id : null;

        return NextResponse.json({
          success: true,
          sales: mapped,
          nextCursorId: legacyNextCursorId,
          userId,
          warning: 'Loaded sales from legacy stockxSales collection (user_sales was empty).'
        });
      } catch (e: any) {
        // If legacy query fails (e.g., missing composite index), fall through to normal response.
        console.warn('⚠️ /api/sales/list legacy fallback failed:', e?.message || String(e));
      }
    }

    return NextResponse.json({ success: true, sales: docs, nextCursorId, userId });
  } catch (error: any) {
    console.error('❌ API /api/sales/list error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


