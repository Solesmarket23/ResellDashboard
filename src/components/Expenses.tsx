'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import NeonNotification from './NeonNotification';
import {
  Wallet,
  Plus,
  RefreshCw,
  Trash2,
  CalendarDays,
  Tag,
  Repeat,
  TrendingUp,
  Receipt,
} from 'lucide-react';

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
  amount: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  merchant?: string;
  notes?: string;
  recurrence: ExpenseRecurrence;
  receiptUrl?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  shipping: 'Shipping',
  supplies: 'Supplies',
  subscriptions: 'Subscriptions',
  mileage: 'Mileage',
  platform_fees: 'Platform fees',
  returns: 'Returns',
  storage: 'Storage',
  labor: 'Labor',
  taxes: 'Taxes',
  other: 'Other',
};

const CATEGORY_COLORS = (isNeon: boolean): Record<ExpenseCategory, string> => ({
  shipping: isNeon ? 'text-violet-300 border-violet-500/30 bg-violet-500/10' : 'text-violet-700 border-violet-200 bg-violet-50',
  supplies: isNeon ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-amber-700 border-amber-200 bg-amber-50',
  subscriptions: isNeon ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-blue-700 border-blue-200 bg-blue-50',
  mileage: isNeon ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-700 border-emerald-200 bg-emerald-50',
  platform_fees: isNeon ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-red-700 border-red-200 bg-red-50',
  returns: isNeon ? 'text-orange-300 border-orange-500/30 bg-orange-500/10' : 'text-orange-700 border-orange-200 bg-orange-50',
  storage: isNeon ? 'text-gray-300 border-white/15 bg-white/5' : 'text-gray-700 border-gray-200 bg-gray-50',
  labor: isNeon ? 'text-pink-300 border-pink-500/30 bg-pink-500/10' : 'text-pink-700 border-pink-200 bg-pink-50',
  taxes: isNeon ? 'text-slate-300 border-white/15 bg-white/5' : 'text-gray-700 border-gray-200 bg-gray-50',
  other: isNeon ? 'text-gray-300 border-white/15 bg-white/5' : 'text-gray-700 border-gray-200 bg-gray-50',
});

const TEMPLATES: Array<{ label: string; category: ExpenseCategory; amount?: number; merchant?: string; recurrence?: ExpenseRecurrence; notes?: string }> = [
  { label: 'Boxes / packing supplies', category: 'supplies', amount: 25, merchant: 'Uline / Amazon', notes: 'Boxes, tape, labels' },
  { label: 'Printer ink / labels', category: 'supplies', amount: 40, merchant: 'Amazon', notes: 'Thermal labels or ink' },
  { label: 'StockX seller fees', category: 'platform_fees', notes: 'Record fees if not captured elsewhere' },
  { label: 'Storage unit', category: 'storage', amount: 120, merchant: 'Storage', recurrence: 'monthly' },
  { label: 'Mileage (estimate)', category: 'mileage', amount: 10, merchant: 'Driving', notes: 'Trips: post office, pickups' },
  { label: 'Subscriptions', category: 'subscriptions', amount: 20, merchant: 'Tools', recurrence: 'monthly' },
];

function yyyyMm(dd: Date): string {
  const yyyy = dd.getFullYear();
  const mm = String(dd.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function yyyyMmDd(dd: Date): string {
  const yyyy = dd.getFullYear();
  const mm = String(dd.getMonth() + 1).padStart(2, '0');
  const d = String(dd.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${d}`;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export default function Expenses() {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const isNeon = currentTheme.name === 'Neon';

  const [month, setMonth] = useState(() => yyyyMm(new Date()));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(() => yyyyMmDd(new Date()));
  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [merchant, setMerchant] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>('once');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  };

  const resolveUserId = () => {
    const siteUserId = (typeof window !== 'undefined' ? window.localStorage.getItem('siteUserId') : '') || '';
    return (user?.uid || siteUserId || '').trim();
  };

  const cls = useMemo(() => {
    const card = `rounded-2xl border ${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`;
    const input = `w-full rounded-xl text-sm font-semibold outline-none transition-all ${
      isNeon
        ? 'bg-black/30 border border-white/10 text-white placeholder:text-gray-500 focus:border-cyan-500/40'
        : 'bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-300'
    }`;
    const ghostBtn = `inline-flex items-center gap-2 rounded-xl font-semibold transition-all border ${
      isNeon ? 'bg-white/5 border-white/10 text-white/90 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
    }`;
    const primaryBtn = `inline-flex items-center gap-2 rounded-xl font-extrabold transition-all ${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white shadow-lg ${
      isNeon ? 'hover:shadow-emerald-500/25' : 'hover:shadow-blue-500/25'
    }`;
    return { card, input, ghostBtn, primaryBtn };
  }, [currentTheme, isNeon]);

  const fetchExpenses = async () => {
    const userId = resolveUserId();
    if (!userId) {
      setExpenses([]);
      return;
    }
    setLoading(true);
    try {
      const qp = new URLSearchParams();
      qp.set('month', month);
      const res = await fetch(`/api/expenses?${qp.toString()}`, { headers: { 'x-user-id': userId } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load expenses');
      setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
    } catch (e: any) {
      console.error('Expenses fetch error:', e);
      showToast(e?.message || 'Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, month]);

  const monthTotal = useMemo(() => expenses.reduce((sum, e) => sum + (e.amount || 0), 0), [expenses]);

  const byCategory = useMemo(() => {
    const m = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      m.set(e.category, (m.get(e.category) || 0) + (e.amount || 0));
    }
    const rows = Array.from(m.entries()).map(([k, v]) => ({ category: k, amount: v }));
    rows.sort((a, b) => b.amount - a.amount);
    return rows;
  }, [expenses]);

  const topCategory = useMemo(() => (byCategory[0] ? byCategory[0] : null), [byCategory]);
  const maxCat = useMemo(() => Math.max(1, ...byCategory.map((r) => r.amount)), [byCategory]);

  const addExpense = async (payload?: Partial<Expense>) => {
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    const amt = payload?.amount ?? parseFloat(amount || '');
    if (!Number.isFinite(amt) || amt <= 0) return showToast('Enter a valid amount', 'info');
    const chosenDate = payload?.date ?? date;

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          action: 'create',
          amount: Math.round(amt * 100) / 100,
          date: chosenDate,
          category: payload?.category ?? category,
          merchant: payload?.merchant ?? merchant,
          notes: payload?.notes ?? notes,
          recurrence: payload?.recurrence ?? recurrence,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to add expense');
      showToast('Saved', 'success');
      setAmount('');
      setMerchant('');
      setNotes('');
      setRecurrence('once');
      await fetchExpenses();
    } catch (e: any) {
      console.error('Add expense error:', e);
      showToast(e?.message || 'Failed to add expense', 'error');
    }
  };

  const deleteExpense = async (id: string) => {
    const ok = window.confirm('Delete this expense?');
    if (!ok) return;
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to delete');
      showToast('Deleted', 'success');
    } catch (e: any) {
      console.error('Delete expense error:', e);
      showToast(e?.message || 'Failed to delete', 'error');
      await fetchExpenses();
    }
  };

  return (
    <div className={`flex-1 overflow-y-auto ${currentTheme.colors.background}`}>
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <NeonNotification message={toast.message} type={toast.type} isVisible={true} />
        </div>
      )}

      <div className="p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`}>
              <Wallet className={currentTheme.colors.accent} />
            </div>
            <div>
              <div className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary}`}>Expenses</div>
              <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Track the “hidden leak” side of reselling: supplies, shipping, mileage, subscriptions, fees.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchExpenses()}
              className={`${cls.ghostBtn} px-3 py-2 text-sm`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Month selector + KPIs */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Month</div>
            <div className="mt-3 flex items-center gap-2">
              <CalendarDays className={isNeon ? 'text-cyan-300' : 'text-blue-600'} />
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={`${cls.input} px-3 py-2`}
              />
            </div>
            <div className={`mt-3 text-xs ${currentTheme.colors.textSecondary}`}>
              Use this to keep your taxes clean and your margins honest.
            </div>
          </div>

          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>This month total</div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-3xl font-extrabold ${currentTheme.colors.textPrimary}`}>{formatUsd(monthTotal)}</div>
              <TrendingUp className={isNeon ? 'text-emerald-300' : 'text-emerald-600'} />
            </div>
            <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary}`}>
              {topCategory ? `Top category: ${CATEGORY_LABELS[topCategory.category]} (${formatUsd(topCategory.amount)})` : 'Add your first expense to see insights.'}
            </div>
          </div>

          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Tax-ready checklist</div>
            <div className="mt-3 space-y-2 text-sm">
              {[
                { label: 'Log supplies + postage receipts', icon: Receipt },
                { label: 'Track mileage for trips', icon: Tag },
                { label: 'Record subscriptions + tools', icon: Repeat },
              ].map((x) => (
                <div key={x.label} className={`flex items-center gap-2 ${currentTheme.colors.textSecondary}`}>
                  <x.icon className="w-4 h-4" />
                  <span>{x.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick templates */}
        <div className={`${cls.card} p-5 mt-6`}>
          <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Quick add</div>
          <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>Tap to prefill common expenses.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  const amt = typeof t.amount === 'number' ? t.amount : parseFloat(amount || '') || 10;
                  void addExpense({
                    amount: amt,
                    date,
                    category: t.category,
                    merchant: t.merchant,
                    notes: t.notes,
                    recurrence: t.recurrence || 'once',
                  });
                }}
                className={`${cls.ghostBtn} px-3 py-2 text-xs`}
                title={t.notes || t.label}
              >
                <Plus className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add form + breakdown */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${cls.card} p-5 lg:col-span-2`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Add expense</div>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-3">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  inputMode="decimal"
                  className={`${cls.input} px-3 py-3`}
                />
              </div>
              <div className="lg:col-span-3">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${cls.input} px-3 py-3`} />
              </div>
              <div className="lg:col-span-3">
                <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={`${cls.input} px-3 py-3`}>
                  {Object.keys(CATEGORY_LABELS).map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABELS[k as ExpenseCategory]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-3">
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as ExpenseRecurrence)} className={`${cls.input} px-3 py-3`}>
                  <option value="once">One-time</option>
                  <option value="monthly">Recurring: monthly</option>
                  <option value="yearly">Recurring: yearly</option>
                </select>
              </div>
              <div className="lg:col-span-4">
                <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant (optional)" className={`${cls.input} px-3 py-3`} />
              </div>
              <div className="lg:col-span-6">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className={`${cls.input} px-3 py-3`} />
              </div>
              <div className="lg:col-span-2">
                <button onClick={() => void addExpense()} className={`${cls.primaryBtn} w-full justify-center px-4 py-3 text-sm`}>
                  <Plus className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          </div>

          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Category breakdown</div>
            <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>Where the money leaks.</div>

            <div className="mt-4 space-y-3">
              {byCategory.length === 0 ? (
                <div className={`text-sm ${currentTheme.colors.textSecondary}`}>No data yet for this month.</div>
              ) : (
                byCategory.slice(0, 8).map((r) => (
                  <div key={r.category}>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${CATEGORY_COLORS(isNeon)[r.category]}`}>
                        <Tag className="w-3 h-3" />
                        {CATEGORY_LABELS[r.category]}
                      </span>
                      <span className={`text-xs font-bold ${currentTheme.colors.textPrimary}`}>{formatUsd(r.amount)}</span>
                    </div>
                    <div className={`mt-2 h-2 rounded-full ${isNeon ? 'bg-white/10' : 'bg-gray-100'}`}>
                      <div
                        className={`h-2 rounded-full ${isNeon ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                        style={{ width: `${Math.max(4, Math.round((r.amount / maxCat) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className={`${cls.card} overflow-hidden mt-6`}>
          <div className={`px-5 py-4 border-b ${isNeon ? 'border-white/10' : 'border-gray-200'} flex items-center justify-between`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Expenses list</div>
            <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{loading ? 'Loading…' : `${expenses.length} entries`}</div>
          </div>

          {expenses.length === 0 ? (
            <div className="p-8 text-center">
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>No expenses yet</div>
              <div className={`mt-1 text-sm ${currentTheme.colors.textSecondary}`}>Add a few entries and this page will start showing where your margin is leaking.</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200/10">
              {expenses.map((e) => (
                <div key={e.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`text-sm font-bold ${currentTheme.colors.textPrimary}`}>{formatUsd(e.amount)}</div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${CATEGORY_COLORS(isNeon)[e.category]}`}>
                        <Tag className="w-3 h-3" />
                        {CATEGORY_LABELS[e.category]}
                      </span>
                      {e.recurrence !== 'once' && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${isNeon ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-blue-700 border-blue-200 bg-blue-50'}`}>
                          <Repeat className="w-3 h-3" />
                          {e.recurrence === 'monthly' ? 'Monthly' : 'Yearly'}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${isNeon ? 'text-gray-300 border-white/15 bg-white/5' : 'text-gray-700 border-gray-200 bg-gray-50'}`}>
                        <CalendarDays className="w-3 h-3" />
                        {e.date}
                      </span>
                    </div>
                    {(e.merchant || e.notes) && (
                      <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                        {e.merchant ? <span className="font-semibold">{e.merchant}</span> : null}
                        {e.merchant && e.notes ? <span> • </span> : null}
                        {e.notes || null}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteExpense(e.id)}
                    className={`p-2 rounded-xl transition-all ${
                      isNeon ? 'hover:bg-red-500/15 text-gray-300 hover:text-red-300 border border-white/10' : 'hover:bg-red-50 text-gray-600 hover:text-red-700 border border-gray-200'
                    }`}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

