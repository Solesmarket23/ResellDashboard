import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ExpenseCategory =
  | 'shipping'
  | 'supplies'
  | 'subscriptions'
  | 'mileage'
  | 'platform_fees'
  | 'returns'
  | 'storage'
  | 'labor'
  | 'taxes'
  | 'other';

type ExpenseRecurrence = 'once' | 'monthly' | 'yearly';

type Expense = {
  id: string;
  amount: number; // positive USD amount
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  merchant?: string;
  notes?: string;
  recurrence: ExpenseRecurrence;
  receiptUrl?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

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

function col(userId: string) {
  const db = getAdminDb();
  return db.collection('userExpenses').doc(userId).collection('expenses');
}

function yyyyMmDd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDate(raw: any): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeCategory(raw: any): ExpenseCategory {
  const v = typeof raw === 'string' ? raw.trim() : '';
  const allowed: ExpenseCategory[] = [
    'shipping',
    'supplies',
    'subscriptions',
    'mileage',
    'platform_fees',
    'returns',
    'storage',
    'labor',
    'taxes',
    'other',
  ];
  return (allowed.includes(v as any) ? (v as ExpenseCategory) : 'other') as ExpenseCategory;
}

function normalizeRecurrence(raw: any): ExpenseRecurrence {
  return raw === 'monthly' || raw === 'yearly' ? raw : 'once';
}

function normalizeAmount(raw: any): number | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const amt = Math.round(n * 100) / 100;
  if (amt <= 0) return null;
  return amt;
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

    const month = request.nextUrl.searchParams.get('month')?.trim() || '';
    // month format: YYYY-MM
    const monthOk = /^\d{4}-\d{2}$/.test(month);
    const start = monthOk ? `${month}-01` : null;
    const endExclusive = (() => {
      if (!monthOk) return null;
      const [y, m] = month.split('-').map((x) => parseInt(x, 10));
      const dt = new Date(y, (m || 1) - 1, 1);
      dt.setMonth(dt.getMonth() + 1);
      return yyyyMmDd(dt);
    })();

    let q = col(userId).orderBy('date', 'desc').orderBy('createdAtMs', 'desc').limit(500);
    if (start && endExclusive) {
      q = col(userId)
        .where('date', '>=', start)
        .where('date', '<', endExclusive)
        .orderBy('date', 'desc')
        .orderBy('createdAtMs', 'desc')
        .limit(500);
    }

    const snap = await q.get();
    const expenses: Expense[] = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          amount: typeof data.amount === 'number' ? data.amount : 0,
          date: typeof data.date === 'string' ? data.date : '',
          category: normalizeCategory(data.category),
          merchant: typeof data.merchant === 'string' ? data.merchant : undefined,
          notes: typeof data.notes === 'string' ? data.notes : undefined,
          recurrence: normalizeRecurrence(data.recurrence),
          receiptUrl: typeof data.receiptUrl === 'string' ? data.receiptUrl : undefined,
          createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : 0,
          updatedAtMs: typeof data.updatedAtMs === 'number' ? data.updatedAtMs : 0,
        };
      })
      .filter((e) => e.amount > 0 && !!e.date);

    return NextResponse.json({ success: true, expenses });
  } catch (error: any) {
    console.error('❌ /api/expenses GET error:', error);
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
    const action = String(body?.action || '').trim();

    if (action === 'create') {
      const amount = normalizeAmount(body?.amount);
      if (!amount) return NextResponse.json({ success: false, error: 'amount (positive number) is required' }, { status: 400 });

      const date = normalizeDate(body?.date) || yyyyMmDd(new Date());
      const category = normalizeCategory(body?.category);
      const recurrence = normalizeRecurrence(body?.recurrence);
      const merchant = typeof body?.merchant === 'string' ? body.merchant.trim() : '';
      const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
      const receiptUrl = typeof body?.receiptUrl === 'string' ? body.receiptUrl.trim() : '';

      const now = Date.now();
      const id = (globalThis.crypto as any)?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;

      await col(userId).doc(id).set(
        {
          amount,
          date,
          category,
          recurrence,
          merchant: merchant || null,
          notes: notes || null,
          receiptUrl: receiptUrl || null,
          createdAtMs: now,
          updatedAtMs: now,
          _serverUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({ success: true, id });
    }

    if (action === 'delete') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      await col(userId).doc(id).delete();
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

      const patch: any = {};
      const amount = typeof body?.amount !== 'undefined' ? normalizeAmount(body.amount) : null;
      if (typeof body?.amount !== 'undefined') {
        if (!amount) return NextResponse.json({ success: false, error: 'amount must be a positive number' }, { status: 400 });
        patch.amount = amount;
      }
      if (typeof body?.date !== 'undefined') {
        const date = normalizeDate(body.date);
        if (!date) return NextResponse.json({ success: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
        patch.date = date;
      }
      if (typeof body?.category !== 'undefined') patch.category = normalizeCategory(body.category);
      if (typeof body?.recurrence !== 'undefined') patch.recurrence = normalizeRecurrence(body.recurrence);
      if (typeof body?.merchant === 'string') patch.merchant = body.merchant.trim() || null;
      if (typeof body?.notes === 'string') patch.notes = body.notes.trim() || null;
      if (typeof body?.receiptUrl === 'string') patch.receiptUrl = body.receiptUrl.trim() || null;

      const now = Date.now();
      patch.updatedAtMs = now;
      patch._serverUpdatedAt = FieldValue.serverTimestamp();

      await col(userId).doc(id).set(patch, { merge: true });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ /api/expenses POST error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

