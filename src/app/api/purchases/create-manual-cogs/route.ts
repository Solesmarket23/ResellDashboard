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

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as any;
}

type UnitInput = {
  productName?: string | null;
  productBrand?: string | null;
  productSize?: string | null;
  styleId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const orderNumber: string = (body?.orderNumber || '').toString().trim() || `manual-${Date.now()}`;
    const purchaseDateYmd: string = (body?.purchaseDateYmd || '').toString().trim(); // YYYY-MM-DD (local)
    const purchaseDateIso: string = (body?.purchaseDateIso || '').toString().trim(); // ISO (optional override)
    const currency: string = (body?.currency || 'USD').toString().trim() || 'USD';

    const totalPaidRaw = body?.totalPaid ?? body?.totalPayment ?? body?.pricePaid ?? null;
    const taxRaw = body?.tax ?? body?.taxAmount ?? null;
    const shippingRaw = body?.shipping ?? body?.shippingFee ?? null;
    const creditsRaw = body?.credits ?? body?.discounts ?? 0;

    const totalPaid = parseMoney(totalPaidRaw);
    const tax = parseMoney(taxRaw) ?? 0;
    const shipping = parseMoney(shippingRaw) ?? 0;
    const credits = parseMoney(creditsRaw) ?? 0;

    if (typeof totalPaid !== 'number' || !Number.isFinite(totalPaid) || totalPaid <= 0) {
      return NextResponse.json({ success: false, error: 'totalPaid is required (must be > 0)' }, { status: 400 });
    }

    const unitsIn: UnitInput[] = Array.isArray(body?.units) ? body.units : [];
    const units: UnitInput[] = unitsIn.length > 0 ? unitsIn : [{}];
    const unitCount = Math.max(1, Math.min(200, units.length));

    // Use provided ISO; else use local date at noon UTC to avoid timezone edge cases.
    const baseIso =
      purchaseDateIso ||
      (() => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(purchaseDateYmd)) return `${purchaseDateYmd}T12:00:00.000Z`;
        return new Date().toISOString();
      })();

    const grossTotal = totalPaid + Math.max(0, tax) + Math.max(0, shipping);
    const netTotal = Math.max(0, grossTotal - Math.max(0, credits));
    const perUnit = (n: number) => Math.round(n * 100) / 100;
    const perUnitTotalPayment = perUnit(grossTotal / unitCount);
    const perUnitNetPaid = perUnit(netTotal / unitCount);
    const perUnitTax = perUnit(Math.max(0, tax) / unitCount);
    const perUnitShipping = perUnit(Math.max(0, shipping) / unitCount);
    const perUnitCredits = perUnit(Math.max(0, credits) / unitCount);

    const db = getAdminDb();
    const batch = db.batch();
    const purchaseIds: string[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < unitCount; i++) {
      const unit = units[i] || {};
      const docRef = db.collection('purchases').doc();
      purchaseIds.push(docRef.id);
      const p = stripUndefined({
        userId,
        uid: userId,
        orderNumber,
        unitNumber: i + 1,
        // These fields are used by FIFO matching; keep both for compatibility.
        purchaseDate: baseIso,
        purchase_date: baseIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        currency,
        type: 'manual_cogs',
        manualCogs: true,
        // Cost fields (FIFO uses netPaid/totalPayment/totalAmount fallbacks)
        totalPayment: perUnitTotalPayment,
        netPaid: perUnitNetPaid,
        taxAmount: perUnitTax,
        shippingFee: perUnitShipping,
        credits: perUnitCredits,
        // Product identifiers (optional, but helps matching + debugging)
        productName: unit.productName ? String(unit.productName) : undefined,
        productBrand: unit.productBrand ? String(unit.productBrand) : undefined,
        productSize: unit.productSize ? String(unit.productSize) : undefined,
        styleId: unit.styleId ? String(unit.styleId) : undefined,
      });
      batch.set(docRef, p, { merge: true });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      userId,
      orderNumber,
      unitCount,
      purchaseIds,
      perUnit: {
        totalPayment: perUnitTotalPayment,
        netPaid: perUnitNetPaid,
        taxAmount: perUnitTax,
        shippingFee: perUnitShipping,
        credits: perUnitCredits,
      },
    });
  } catch (error: any) {
    console.error('❌ API /api/purchases/create-manual-cogs error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

