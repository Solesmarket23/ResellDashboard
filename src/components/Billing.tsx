'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Info,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';

type BillingInterval = 'monthly' | 'annually';
type PaymentStatus = 'paid' | 'failed' | 'refunded' | 'pending';

type Payment = {
  id: string;
  createdAt: string; // ISO date
  description: string;
  amount: number; // USD
  status: PaymentStatus;
  invoiceNumber: string;
  planName: string;
  interval: BillingInterval;
  last4: string;
  brand: 'Visa' | 'Mastercard' | 'Amex';
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusPill(status: PaymentStatus, isNeon: boolean) {
  const base = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border';

  switch (status) {
    case 'paid':
      return `${base} ${isNeon ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`;
    case 'failed':
      return `${base} ${isNeon ? 'bg-red-500/10 text-red-300 border-red-500/25' : 'bg-red-50 text-red-700 border-red-200'}`;
    case 'refunded':
      return `${base} ${isNeon ? 'bg-slate-500/10 text-slate-200 border-slate-500/25' : 'bg-gray-50 text-gray-700 border-gray-200'}`;
    case 'pending':
      return `${base} ${isNeon ? 'bg-amber-500/10 text-amber-200 border-amber-500/25' : 'bg-amber-50 text-amber-700 border-amber-200'}`;
    default:
      return `${base} ${isNeon ? 'bg-slate-500/10 text-slate-200 border-slate-500/25' : 'bg-gray-50 text-gray-700 border-gray-200'}`;
  }
}

function receiptFileName(payment: Payment) {
  const date = payment.createdAt.slice(0, 10);
  return `receipt-${payment.invoiceNumber}-${date}.txt`;
}

function buildReceiptText(opts: {
  payment: Payment;
  customerEmail?: string | null;
  customerId?: string | null;
  nextChargeDate: string;
}) {
  const { payment, customerEmail, customerId, nextChargeDate } = opts;
  const lines = [
    'Flip Flow — Receipt (Mock)',
    '========================================',
    '',
    `Invoice: ${payment.invoiceNumber}`,
    `Payment ID: ${payment.id}`,
    `Date: ${formatDate(payment.createdAt)}`,
    `Status: ${payment.status.toUpperCase()}`,
    '',
    `Customer: ${customerEmail ?? 'site-password-user'}`,
    `Customer ID: ${customerId ?? 'N/A'}`,
    '',
    `Plan: ${payment.planName} (${payment.interval})`,
    `Description: ${payment.description}`,
    `Amount: ${formatUsd(payment.amount)}`,
    '',
    `Paid with: ${payment.brand} •••• ${payment.last4}`,
    `Next charge date: ${formatDate(nextChargeDate)}`,
    '',
    'Notes:',
    '- This is mock data + a mock receipt file (for UI/UX only).',
    '- When you wire Stripe later, this becomes an invoice PDF download.',
    '',
    'Support: support@flipflow.example',
  ];
  return lines.join('\n');
}

export default function Billing() {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const isNeon = currentTheme.name === 'Neon';
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const subscription = useMemo(() => {
    const plan =
      interval === 'monthly'
        ? { name: 'Professional', price: 40, interval: 'monthly' as const }
        : { name: 'Professional', price: 400, interval: 'annually' as const };

    const now = new Date();
    const next = new Date(now);
    next.setDate(now.getDate() + (interval === 'monthly' ? 18 : 240));

    return {
      planName: plan.name,
      price: plan.price,
      interval: plan.interval,
      status: 'active' as const,
      nextChargeDate: next.toISOString(),
      trialEndsAt: null as string | null,
      paymentMethod: {
        brand: 'Visa' as const,
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
      },
      billingEmail: user?.email ?? 'billing@mock.flipflow',
    };
  }, [interval, user?.email]);

  const payments: Payment[] = useMemo(() => {
    // newest -> oldest
    const base: Omit<Payment, 'createdAt' | 'id' | 'invoiceNumber'> = {
      description: `${subscription.planName} (${subscription.interval})`,
      amount: subscription.interval === 'monthly' ? 40 : 400,
      status: 'paid',
      planName: subscription.planName,
      interval: subscription.interval,
      last4: subscription.paymentMethod.last4,
      brand: subscription.paymentMethod.brand,
    };

    const now = new Date();
    const mk = (daysAgo: number, idx: number, status: PaymentStatus): Payment => {
      const d = new Date(now);
      d.setDate(now.getDate() - daysAgo);
      return {
        ...base,
        id: `pay_mock_${String(idx).padStart(3, '0')}`,
        createdAt: d.toISOString(),
        status,
        invoiceNumber: `FF-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(idx).padStart(4, '0')}`,
      };
    };

    return [
      mk(12, 1, 'paid'),
      mk(43, 2, 'paid'),
      mk(74, 3, 'paid'),
      mk(105, 4, 'refunded'),
      mk(136, 5, 'failed'),
      mk(167, 6, 'paid'),
    ];
  }, [subscription.interval, subscription.paymentMethod.brand, subscription.paymentMethod.last4, subscription.planName]);

  const visiblePayments = useMemo(() => {
    // Keep “realistic” history: if annually, show annual-like descriptors (still mock)
    if (interval === 'annually') {
      return payments.map((p) => ({
        ...p,
        description: `${subscription.planName} (annual)`,
        amount: 400,
        interval: 'annually' as const,
      }));
    }
    return payments.map((p) => ({
      ...p,
      description: `${subscription.planName} (monthly)`,
      amount: 40,
      interval: 'monthly' as const,
    }));
  }, [interval, payments, subscription.planName]);

  const downloadReceipt = (payment: Payment) => {
    const text = buildReceiptText({
      payment,
      customerEmail: user?.email ?? subscription.billingEmail,
      customerId: user?.uid ?? null,
      nextChargeDate: subscription.nextChargeDate,
    });

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = receiptFileName(payment);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`relative overflow-hidden min-h-screen px-4 sm:px-8 py-8 ${currentTheme.colors.background}`}>
      {/* Subtle neon atmosphere */}
      {isNeon && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/10 via-slate-900/50 to-emerald-900/10" />
          <div className="absolute -top-24 -left-24 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </>
      )}

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            {isNeon && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-gradient-to-r from-cyan-600/15 to-emerald-600/15 backdrop-blur-xl mb-3">
                <Sparkles className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-semibold text-cyan-200">Billing & Receipts</span>
              </div>
            )}
            <h1 className={`text-2xl sm:text-3xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>Billing</h1>
            <p className={`mt-1 text-sm ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>
              Track your subscription, upcoming charges, and download receipts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className={`rounded-xl p-1.5 border ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-white border-gray-200'} backdrop-blur-sm`}>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setInterval('monthly')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    interval === 'monthly'
                      ? isNeon
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/20'
                        : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                      : isNeon
                        ? 'text-slate-300 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setInterval('annually')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    interval === 'annually'
                      ? isNeon
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/20'
                        : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                      : isNeon
                        ? 'text-slate-300 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Annually
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push('/dashboard?section=plans')}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isNeon
                  ? 'bg-white/5 border-cyan-500/20 text-white hover:bg-white/10'
                  : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
              }`}
            >
              View plans
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subscription summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className={`rounded-2xl border p-5 ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-white border-gray-200'} backdrop-blur-sm`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-xs font-semibold ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>Current plan</div>
                <div className={`mt-1 text-xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                  {subscription.planName}
                </div>
                <div className={`mt-1 text-sm ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>
                  {formatUsd(subscription.price)} / {subscription.interval === 'monthly' ? 'month' : 'year'}
                </div>
              </div>
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isNeon ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <CheckCircle2 className="w-4 h-4" />
                Active
              </div>
            </div>

            <div className={`mt-4 text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'} flex items-start gap-2`}>
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Mock subscription details — replace with Stripe customer/subscription data when ready.
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-white border-gray-200'} backdrop-blur-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-semibold ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>Next charge</div>
                <div className={`mt-1 text-xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                  {formatDate(subscription.nextChargeDate)}
                </div>
                <div className={`mt-1 text-sm ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>
                  {formatUsd(subscription.price)} scheduled
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-gray-50 border-gray-200'}`}>
                <Calendar className={`${isNeon ? 'text-cyan-300' : 'text-blue-600'} w-6 h-6`} />
              </div>
            </div>

            <div className={`mt-4 flex items-center justify-between text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>
              <span>Autopay</span>
              <span className={`inline-flex items-center gap-1.5 font-semibold ${isNeon ? 'text-emerald-200' : 'text-emerald-700'}`}>
                <ShieldCheck className="w-4 h-4" />
                On
              </span>
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-white border-gray-200'} backdrop-blur-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-semibold ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>Payment method</div>
                <div className={`mt-1 text-xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                  {subscription.paymentMethod.brand} •••• {subscription.paymentMethod.last4}
                </div>
                <div className={`mt-1 text-sm ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>
                  Expires {subscription.paymentMethod.expMonth}/{subscription.paymentMethod.expYear}
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-gray-50 border-gray-200'}`}>
                <CreditCard className={`${isNeon ? 'text-emerald-300' : 'text-purple-600'} w-6 h-6`} />
              </div>
            </div>

            <button
              onClick={() => alert('Mock action: Open “Update payment method” flow')}
              className={`mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isNeon
                  ? 'bg-gradient-to-r from-emerald-500/15 to-cyan-500/15 border-cyan-500/25 text-white hover:bg-white/10'
                  : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100'
              }`}
            >
              Update payment method
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Payments table */}
        <div className={`rounded-2xl border overflow-hidden ${isNeon ? 'bg-white/5 border-cyan-500/20' : 'bg-white border-gray-200'} backdrop-blur-sm`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <h2 className={`text-base font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>Payment history</h2>
              <p className={`mt-1 text-xs ${isNeon ? 'text-slate-300' : 'text-gray-600'}`}>
                Download receipts for your records.
              </p>
            </div>
            <div className={`text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'} flex items-center gap-2`}>
              <FileText className="w-4 h-4" />
              {visiblePayments.length} payments
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className={`${isNeon ? 'text-slate-300' : 'text-gray-600'} text-xs`}>
                  <th className="text-left font-semibold px-5 py-3">Date</th>
                  <th className="text-left font-semibold px-5 py-3">Description</th>
                  <th className="text-left font-semibold px-5 py-3">Amount</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="text-right font-semibold px-5 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody className={`${isNeon ? 'text-slate-200' : 'text-gray-900'} text-sm`}>
                {visiblePayments.map((p) => (
                  <tr key={p.id} className={`border-t ${isNeon ? 'border-white/10 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'} transition-colors`}>
                    <td className="px-5 py-4 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                    <td className="px-5 py-4 min-w-[280px]">
                      <div className="font-semibold">{p.description}</div>
                      <div className={`mt-0.5 text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>
                        Invoice {p.invoiceNumber} • {p.brand} •••• {p.last4}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap font-semibold">{formatUsd(p.amount)}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={statusPill(p.status, isNeon)}>
                        {p.status === 'paid' && <CheckCircle2 className="w-4 h-4" />}
                        {p.status === 'failed' && <XCircle className="w-4 h-4" />}
                        {p.status === 'pending' && <Info className="w-4 h-4" />}
                        {p.status === 'refunded' && <Info className="w-4 h-4" />}
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => downloadReceipt(p)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          isNeon
                            ? 'bg-white/5 border-cyan-500/20 text-white hover:bg-white/10'
                            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`px-5 py-4 border-t ${isNeon ? 'border-white/10' : 'border-gray-100'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
            <div className={`text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>
              Tip: receipts are generated client-side right now (mock). Swap this for a `/api/billing/receipt/:invoice` download when you add Stripe.
            </div>
            <button
              onClick={() => alert('Mock action: open “Manage subscription” portal')}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isNeon
                  ? 'bg-gradient-to-r from-cyan-500/15 to-emerald-500/15 border-cyan-500/25 text-white hover:bg-white/10'
                  : 'bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100'
              }`}
            >
              Manage subscription
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

