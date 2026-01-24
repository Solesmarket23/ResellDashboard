'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, ExternalLink, RefreshCw, Tag, CheckCircle2, AlertTriangle, Clock, Trash2, Eye, EyeOff, Plus, ChevronDown } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import GmailConnector from './GmailConnector';
import NeonNotification, { type NotificationType } from './NeonNotification';

type CouponStatus = 'available' | 'used_on_bid' | 'expired';
type CouponSource = 'gmail' | 'manual';
type SortMode = 'expiring_available' | 'sent_newest';
type CouponBenefit = 'amount_off' | 'free_shipping' | 'half_off_shipping';

type Coupon = {
  code: string;
  emailId: string;
  threadId?: string;
  subject: string;
  from: string;
  sentAt: string;
  expiresAt: string;
  daysLeft: number;
  status: CouponStatus;
  statusSource: 'computed' | 'user';
  hidden?: boolean;
  source: CouponSource;
  amount?: number | null;
  benefit?: CouponBenefit | null;
};

type CouponDebug = {
  query?: string;
  queryAttempts?: Array<{ q: string; count: number }>;
  debug?: any;
};

function formatCouponDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Example: "Jan 26, 3:01 PM" (no year; coupons are short-lived)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function statusPill(status: CouponStatus) {
  switch (status) {
    case 'available':
      return { label: 'Available', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
    case 'used_on_bid':
      return { label: 'Used', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
    case 'expired':
      return { label: 'Expired', cls: 'bg-red-500/15 text-red-300 border-red-500/30' };
  }
}

export default function StockXCoupons() {
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  const getSiteUserIdFromCookie = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    try {
      const parts = document.cookie.split(';').map((c) => c.trim());
      // Match common cookie keys used elsewhere in the app
      const hit =
        parts.find((c) => c.startsWith('site-user-id=')) ||
        parts.find((c) => c.startsWith('siteUserId=')) ||
        parts.find((c) => c.startsWith('userId=')) ||
        null;
      if (!hit) return '';
      const v = decodeURIComponent(hit.split('=')[1] || '').trim();
      return v;
    } catch {
      return '';
    }
  }, []);

  const [gmailConnected, setGmailConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ isVisible: boolean; message: string; type: NotificationType }>({
    isVisible: false,
    message: '',
    type: 'success'
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window === 'undefined') return 'expiring_available';
    try {
      const v = localStorage.getItem('stockxCoupons_sortMode');
      return (v === 'sent_newest' || v === 'expiring_available') ? (v as SortMode) : 'expiring_available';
    } catch {
      return 'expiring_available';
    }
  });
  const [copied, setCopied] = useState<{ code: string; nonce: number } | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef(false);
  const timeoutCooldownUntilRef = useRef(0);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualExpiresDate, setManualExpiresDate] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualBenefit, setManualBenefit] = useState<CouponBenefit>('amount_off');
  const [debug, setDebug] = useState<CouponDebug>({});
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('stockxCoupons_showHidden') === 'true';
    } catch {
      return false;
    }
  });
  const seenCodesRef = useRef<Set<string>>(new Set());
  const [enteringCodes, setEnteringCodes] = useState<Record<string, true>>({});
  const enteringClearTimerRef = useRef<number | null>(null);

  const isNeon = currentTheme?.name === 'Neon';

  const userId = useMemo(() => {
    if (user?.uid) return user.uid;
    if (typeof window === 'undefined') return '';
    // Prefer cookie (available immediately on first paint), then fall back to localStorage.
    const cookieId = getSiteUserIdFromCookie();
    if (cookieId) return cookieId;
    return (localStorage.getItem('siteUserId') || '').trim();
  }, [getSiteUserIdFromCookie, user?.uid]);

  const cacheKey = useMemo(() => {
    if (!userId) return '';
    // Cache the full set (including hidden). Visibility is controlled client-side by showHidden.
    return `stockxCoupons_cache_${userId}_all`;
  }, [userId]);

  const persistCache = useCallback(
    (nextCoupons: Coupon[], nextDebug?: CouponDebug) => {
      if (typeof window === 'undefined') return;
      if (!cacheKey) return;
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            coupons: nextCoupons,
            debug: nextDebug ?? debug
          })
        );
      } catch {
        // ignore
      }
    },
    [cacheKey, debug]
  );

  // Load cached coupons immediately on mount/user change so the page isn't empty on refresh.
  useEffect(() => {
    if (!cacheKey) return;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt: string; coupons: Coupon[]; debug?: CouponDebug };
      if (Array.isArray(parsed?.coupons) && parsed.coupons.length) {
        setCoupons(parsed.coupons);
        seenCodesRef.current = new Set(parsed.coupons.map((c) => c.code));
        if (parsed.debug) setDebug(parsed.debug);
      }
    } catch {
      // ignore
    }
  }, [cacheKey]);

  const fetchCoupons = useCallback(async (reason: 'auto' | 'manual' = 'manual') => {
    if (!userId) return;
    if (fetchInFlightRef.current) return;
    if (reason === 'auto' && Date.now() < timeoutCooldownUntilRef.current) return;
    fetchInFlightRef.current = true;
    setLoading(true);
    setError(null);
    let timeoutId: number | null = null;
    try {
      // Prevent the UI from getting stuck in "Refreshing..." if the request hangs.
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 20000); // 20s
      const res = await fetch(
        // Always fetch hidden too; we filter client-side.
        `/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}&limit=75&debug=1&includeHidden=1`,
        {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        if (res.status === 401 || data?.needsReauth) {
          setError('Gmail is not connected. Please connect Gmail to find coupon emails.');
          // Keep showing cached/previous results instead of wiping the UI.
          return;
        }
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const nextCoupons = (data.coupons || []) as Coupon[];
      const nextDebug = { query: data.query, queryAttempts: data.queryAttempts, debug: data.debug } as CouponDebug;

      // Animate in any newly discovered coupon codes.
      const prevSeen = new Set(seenCodesRef.current);
      const newCodes = nextCoupons.map((c) => c.code).filter((code) => !prevSeen.has(code));
      if (newCodes.length > 0) {
        setEnteringCodes((prev) => {
          const next = { ...prev };
          for (const code of newCodes) next[code] = true;
          return next;
        });
        if (enteringClearTimerRef.current) window.clearTimeout(enteringClearTimerRef.current);
        enteringClearTimerRef.current = window.setTimeout(() => setEnteringCodes({}), 450);
      }
      seenCodesRef.current = new Set(nextCoupons.map((c) => c.code));

      setCoupons(nextCoupons);
      setDebug(nextDebug);

      // Persist successful results for instant load after a hard refresh.
      persistCache(nextCoupons, nextDebug);

      // Toast on manual refresh so user gets immediate feedback.
      if (reason === 'manual') {
        const count = typeof data?.count === 'number' ? data.count : nextCoupons.length;
        setNotification({
          isVisible: true,
          message: `Found ${count} coupon${count === 1 ? '' : 's'}`,
          type: 'success'
        });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError('Refresh timed out. Gmail can be slow—try again.');
        // Prevent auto re-fetch loops right after a timeout.
        timeoutCooldownUntilRef.current = Date.now() + 15000; // 15s
      } else {
        setError(e?.message || 'Failed to load coupons');
      }
      // Keep current list; just show error.
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  }, [persistCache, userId]);

  const restoreHiddenAvailable = useCallback(async () => {
    if (!userId) return;
    const codes = coupons.filter((c) => c.hidden && c.status === 'available').map((c) => c.code);
    if (codes.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_hidden_bulk', codes, hidden: false })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Restore failed (${res.status})`);
      setCoupons((prev) => {
        const next = prev.map((c) => (codes.includes(c.code) ? { ...c, hidden: false } : c));
        persistCache(next);
        return next;
      });
      setNotification({ isVisible: true, message: `Restored ${codes.length} coupon${codes.length === 1 ? '' : 's'}`, type: 'success' });
    } catch (e: any) {
      setError(e?.message || 'Failed to restore coupons');
    } finally {
      setLoading(false);
    }
  }, [coupons, persistCache, userId]);

  useEffect(() => {
    if (!gmailConnected) return;
    // Auto-fetch on load so the page isn't empty.
    void fetchCoupons('auto');
  }, [gmailConnected, fetchCoupons]);

  // Persist preference so it survives refreshes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('stockxCoupons_showHidden', showHidden ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [showHidden]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('stockxCoupons_sortMode', sortMode);
    } catch {
      // ignore
    }
  }, [sortMode]);

  const setStatus = async (code: string, status: CouponStatus) => {
    if (!userId) return;
    setSavingCode(code);
    try {
      const res = await fetch(`/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, status })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Save failed (${res.status})`);

      setCoupons((prev) =>
        {
          const next = prev.map((c) => (c.code === code ? { ...c, status, statusSource: 'user' } : c));
          persistCache(next);
          return next;
        }
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to update status');
    } finally {
      setSavingCode(null);
    }
  };

  const removeCoupon = async (code: string) => {
    if (!userId) return;
    setSavingCode(code);
    try {
      const res = await fetch(`/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, hidden: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Remove failed (${res.status})`);
      setCoupons((prev) => {
        const next = prev.map((c) => (c.code === code ? { ...c, hidden: true } : c));
        persistCache(next);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to remove coupon');
    } finally {
      setSavingCode(null);
    }
  };

  const restoreCoupon = async (code: string) => {
    if (!userId) return;
    setSavingCode(code);
    try {
      const res = await fetch(`/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, hidden: false })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Restore failed (${res.status})`);
      setCoupons((prev) => {
        const next = prev.map((c) => (c.code === code ? { ...c, hidden: false } : c));
        persistCache(next);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to restore coupon');
    } finally {
      setSavingCode(null);
    }
  };

  const clearAllCoupons = async () => {
    if (!userId) return;
    if (coupons.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide_all', codes: coupons.map((c) => c.code) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Clear failed (${res.status})`);
      // Mark as hidden (don't drop from state) so "Show hidden" can reveal instantly.
      const next = coupons.map((c) => ({ ...c, hidden: true }));
      setCoupons(next);
      persistCache(next);
      setNotification({ isVisible: true, message: 'Cleared coupons', type: 'success' });
    } catch (e: any) {
      setError(e?.message || 'Failed to clear coupons');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied({ code, nonce: Date.now() });
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(null);
        copiedTimerRef.current = null;
      }, 1000);
      setNotification({ isVisible: true, message: `Copied: ${code}`, type: 'success' });
    } catch {
      setNotification({ isVisible: true, message: 'Copy failed', type: 'error' });
    }
  };

  const addManualCoupon = async () => {
    if (!userId) return;
    const code = manualCode.trim().toUpperCase();
    const expiresDateRaw = manualExpiresDate.trim();
    const amountRaw = manualAmount.trim();
    if (!code) {
      setNotification({ isVisible: true, message: 'Coupon code is required', type: 'error' });
      return;
    }
    if (!expiresDateRaw) {
      setNotification({ isVisible: true, message: 'Expiration date is required', type: 'error' });
      return;
    }
    // Treat date-only expiration as end-of-day in local time.
    const expiresAt = new Date(`${expiresDateRaw}T23:59:59.999`);
    if (Number.isNaN(expiresAt.getTime())) {
      setNotification({ isVisible: true, message: 'Expiration date is invalid', type: 'error' });
      return;
    }
    const amount =
      manualBenefit === 'amount_off'
        ? (amountRaw === '' ? null : Number(amountRaw))
        : null;
    if (manualBenefit === 'amount_off' && amount != null && (!Number.isFinite(amount) || amount < 0.01)) {
      setNotification({ isVisible: true, message: 'Amount must be at least $0.01', type: 'error' });
      return;
    }

    // Close immediately (requested UX). If the request fails, we keep input values so user can reopen and retry.
    setAddManualOpen(false);

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_manual',
          code,
          expiresAt: expiresAt.toISOString(),
          amount,
          benefit: manualBenefit
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Add failed (${res.status})`);

      const added: Coupon | undefined = data?.coupon;
      if (added?.code) {
        setCoupons((prev) => {
          const without = prev.filter((c) => c.code !== added.code);
          const next = [added, ...without].sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1));
          persistCache(next);
          return next;
        });
      }

      setManualCode('');
      setManualExpiresDate('');
      setManualAmount('');
      setManualBenefit('amount_off');
      setNotification({ isVisible: true, message: 'Added manual coupon', type: 'success' });
    } catch (e: any) {
      setError(e?.message || 'Failed to add manual coupon');
      setNotification({ isVisible: true, message: e?.message || 'Failed to add manual coupon', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Prefill expiration date for convenience.
  useEffect(() => {
    if (!addManualOpen) return;
    if (manualExpiresDate) return;
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    if (!manualExpiresDate) setManualExpiresDate(date);
  }, [addManualOpen, manualExpiresDate]);

  // Escape key should close open modals
  useEffect(() => {
    if (!addManualOpen && !confirmClearOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addManualOpen) setAddManualOpen(false);
      if (confirmClearOpen) setConfirmClearOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addManualOpen, confirmClearOpen]);

  const openInGmail = (emailId: string) => {
    // Gmail deep link works for most users (requires being logged in).
    window.open(`https://mail.google.com/mail/u/0/#all/${emailId}`, '_blank', 'noopener,noreferrer');
  };

  const displayCoupons = useMemo(() => {
    const list = showHidden ? [...coupons] : coupons.filter((c) => !c.hidden);
    const statusRank = (s: CouponStatus) => (s === 'available' ? 0 : s === 'used_on_bid' ? 1 : 2);
    const toMs = (iso: string) => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : 0;
    };

    if (sortMode === 'sent_newest') {
      return list.sort((a, b) => {
        const sa = toMs(a.sentAt);
        const sb = toMs(b.sentAt);
        if (sb !== sa) return sb - sa;
        return a.code.localeCompare(b.code);
      });
    }

    // Default: available first, expiring soonest -> latest
    return list.sort((a, b) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;

      const ea = toMs(a.expiresAt);
      const eb = toMs(b.expiresAt);
      if (ea !== eb) return ea - eb;

      // Tie-breaker: newest email/manual entry first
      const sa = toMs(a.sentAt);
      const sb = toMs(b.sentAt);
      if (sb !== sa) return sb - sa;
      return a.code.localeCompare(b.code);
    });
  }, [coupons, sortMode, showHidden]);

  const hiddenAvailableCount = useMemo(
    () => coupons.filter((c) => c.hidden && c.status === 'available').length,
    [coupons]
  );

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-4 sm:p-8`}>
      {/* Add manual coupon modal */}
      {addManualOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setAddManualOpen(false)}
          />
          <div
            className={`relative w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isNeon
                ? 'bg-gray-950/80 border-white/15'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-coupon-title"
          >
            <h3 id="add-coupon-title" className={`px-3 text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
              Add coupon manually
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between px-3">
                  <label className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                    Code <span className="text-red-400">*</span>
                  </label>
                  <span className="text-xs text-red-300">Required</span>
                </div>
                <div className="mt-1">
                  <input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="Example: B10-ABC123"
                    className={`w-full rounded-xl px-3 py-2 text-sm border outline-none ${
                      isNeon
                        ? 'bg-black/40 border-white/10 text-gray-100 placeholder:text-gray-500 focus:border-cyan-500'
                        : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500'
                    }`}
                    aria-required="true"
                    required
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between px-3">
                  <label className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                    Expiration <span className="text-red-400">*</span>
                  </label>
                  <span className="text-xs text-red-300">Required</span>
                </div>
                <div className="mt-1">
                  <input
                    type="date"
                    value={manualExpiresDate}
                    onChange={(e) => setManualExpiresDate(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-sm border outline-none ${
                      isNeon
                        ? 'bg-black/40 border-white/10 text-gray-100 focus:border-cyan-500'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                    }`}
                    aria-required="true"
                    required
                  />
                </div>
              </div>
              <div>
                <label className={`text-sm font-medium ${currentTheme.colors.textSecondary} pl-3`}>Amount</label>
                <div className="mt-1 space-y-2">
                  {/* Amount ($ off) is the default */}
                  <div className="relative w-full">
                    <span
                      className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10 text-sm font-semibold ${
                        isNeon ? 'text-gray-300/80' : 'text-gray-600'
                      }`}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="0.01"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      disabled={manualBenefit !== 'amount_off'}
                      className={`w-full rounded-xl pl-8 pr-3 py-2 text-sm border outline-none ${
                        isNeon
                          ? 'bg-black/40 border-white/10 text-gray-100 focus:border-cyan-500 disabled:bg-black/20 disabled:border-white/5 disabled:text-white/40'
                          : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 disabled:bg-gray-50 disabled:border-gray-200 disabled:text-gray-400'
                      } disabled:opacity-80`}
                    />
                  </div>

                  <label
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm cursor-pointer select-none ${
                      manualBenefit === 'free_shipping'
                        ? (isNeon ? 'bg-cyan-500/10 border-cyan-400/40 text-white/90 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]' : 'bg-blue-50 border-blue-300 text-gray-900')
                        : (isNeon ? 'bg-white/5 border-white/10 text-white/80' : 'bg-gray-50 border-gray-200 text-gray-800')
                    }`}
                  >
                    <span className="font-medium">Free shipping</span>
                    <input
                      type="checkbox"
                      checked={manualBenefit === 'free_shipping'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setManualBenefit(checked ? 'free_shipping' : 'amount_off');
                        if (checked) setManualAmount('');
                      }}
                    />
                  </label>

                  <label
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm cursor-pointer select-none ${
                      manualBenefit === 'half_off_shipping'
                        ? (isNeon ? 'bg-cyan-500/10 border-cyan-400/40 text-white/90 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]' : 'bg-blue-50 border-blue-300 text-gray-900')
                        : (isNeon ? 'bg-white/5 border-white/10 text-white/80' : 'bg-gray-50 border-gray-200 text-gray-800')
                    }`}
                  >
                    <span className="font-medium">Half off shipping</span>
                    <input
                      type="checkbox"
                      checked={manualBenefit === 'half_off_shipping'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setManualBenefit(checked ? 'half_off_shipping' : 'amount_off');
                        if (checked) setManualAmount('');
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => void addManualCoupon()}
                disabled={loading}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
                  isNeon ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                Add coupon
              </button>
              <button
                onClick={() => setAddManualOpen(false)}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  isNeon ? 'bg-white/10 hover:bg-white/20 border border-white/15' : 'bg-gray-100 hover:bg-gray-200'
                } ${currentTheme.colors.textPrimary}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app confirm modal for Clear All */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmClearOpen(false)}
          />
          <div
            className={`relative w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isNeon
                ? 'bg-gray-950/80 border-white/15'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-coupons-title"
          >
            <h3 id="clear-coupons-title" className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
              Clear all coupons?
            </h3>
            <p className={`mt-2 text-sm ${currentTheme.colors.textSecondary}`}>
              This will hide all coupons from this list. It <span className="font-semibold">does not</span> delete your Gmail emails.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isNeon ? 'bg-white/10 hover:bg-white/20 border border-white/15' : 'bg-gray-100 hover:bg-gray-200'
                } ${currentTheme.colors.textPrimary}`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmClearOpen(false);
                  void clearAllCoupons();
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  isNeon ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200' : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                Yes, clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification((p) => ({ ...p, isVisible: false }))}
        />
      )}

      <div className="mb-6 space-y-4">
        <GmailConnector
          onConnectionChange={setGmailConnected}
          connectDescription="Connect Gmail to find StockX coupon emails."
          connectedDescription="Gmail connected — coupon emails can now be fetched."
        />
      </div>

      <div
        className={`rounded-2xl p-5 sm:p-6 ${
          isNeon ? 'dark-neon-card neon-glow' : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>StockX Coupons</h1>
            <p className={`mt-1 text-sm ${currentTheme.colors.textSecondary}`}>
              Finds StockX coupon emails in Gmail and tracks code status. Coupons are assumed valid for <span className="font-semibold">14 days</span> from email sent time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!showHidden && (
              <div className="relative">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className={`appearance-none px-3 sm:px-4 pr-9 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors ${
                    isNeon
                      ? 'bg-white/10 hover:bg-white/15 border-white/20 text-white/90'
                      : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-900'
                  }`}
                  title="Sort coupons"
                >
                  <option value="expiring_available">Available expiring soon</option>
                  <option value="sent_newest">Newest first</option>
                </select>
                <ChevronDown
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                    isNeon ? 'text-white/70' : 'text-gray-500'
                  }`}
                />
              </div>
            )}
            <button
              onClick={() => setAddManualOpen(true)}
              disabled={loading}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isNeon
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              title="Add a coupon manually"
            >
              <Plus className="w-4 h-4" />
              Add coupon
            </button>
            <button
              onClick={() => setConfirmClearOpen(true)}
              disabled={!gmailConnected || loading || coupons.length === 0}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isNeon
                  ? 'bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
              title="Hide all coupons"
            >
              <Trash2 className="w-4 h-4" />
              Clear all
            </button>
            <button
              onClick={() => setShowHidden((v) => !v)}
              disabled={!gmailConnected || loading}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isNeon ? 'bg-white/10 hover:bg-white/20 border border-white/20' : 'bg-white hover:bg-gray-50 border border-gray-300'
              } ${currentTheme.colors.textPrimary}`}
              title={showHidden ? 'Hide hidden coupons' : 'Show hidden coupons'}
            >
              {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showHidden ? 'Hide hidden' : 'Show hidden'}
            </button>
            <button
              onClick={() => fetchCoupons('manual')}
              disabled={!gmailConnected || loading}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isNeon
                  ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                  : 'bg-white hover:bg-gray-50 border border-gray-300'
              } ${currentTheme.colors.textPrimary}`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {showHidden && (
          <>
            <div className={`mt-4 rounded-lg border p-3 text-sm ${
              isNeon ? 'border-white/15 bg-white/5 text-white/80' : 'border-gray-200 bg-gray-50 text-gray-700'
            }`}>
              You’re viewing <span className="font-semibold">hidden</span> coupons. Click <span className="font-semibold">Restore</span> to make a coupon show up in the normal list.
            </div>

            {/* Move sort control here for hidden view (left-aligned above first coupon) */}
            <div className="mt-3 flex items-center justify-start">
              <div className="relative">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className={`appearance-none px-3 sm:px-4 pr-9 py-2 rounded-lg text-sm font-medium border whitespace-nowrap transition-colors ${
                    isNeon
                      ? 'bg-white/10 hover:bg-white/15 border-white/20 text-white/90'
                      : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-900'
                  }`}
                  title="Sort coupons"
                >
                  <option value="expiring_available">Available expiring soon</option>
                  <option value="sent_newest">Newest first</option>
                </select>
                <ChevronDown
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                    isNeon ? 'text-white/70' : 'text-gray-500'
                  }`}
                />
              </div>
            </div>
          </>
        )}

        {!showHidden && hiddenAvailableCount > 0 && (
          <div className={`mt-4 rounded-lg border p-3 text-sm flex items-center justify-between gap-3 ${
            isNeon ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}>
            <div className="min-w-0">
              You have <span className="font-semibold">{hiddenAvailableCount}</span> available coupon{hiddenAvailableCount === 1 ? '' : 's'} hidden.
            </div>
            <button
              onClick={restoreHiddenAvailable}
              disabled={loading || !gmailConnected}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${
                isNeon ? 'bg-white/10 hover:bg-white/20 border border-white/20' : 'bg-white hover:bg-amber-100 border border-amber-300'
              }`}
              title="Restore all available coupons"
            >
              Restore available
            </button>
          </div>
        )}

        {!gmailConnected && coupons.length === 0 ? (
          <div className={`mt-6 text-sm ${currentTheme.colors.textSecondary}`}>
            Connect Gmail to start scanning for coupon emails.
          </div>
        ) : coupons.length === 0 && loading ? (
          <div className={`mt-6 text-sm ${currentTheme.colors.textSecondary}`}>Loading coupons…</div>
        ) : coupons.length === 0 ? (
          <div className={`mt-6 text-sm ${currentTheme.colors.textSecondary}`}>
            No StockX coupon emails found.
            <div className="mt-2 space-y-1">
              <div>- Make sure Gmail is connected, then click <span className="font-semibold">Refresh</span>.</div>
              <div>- We currently look for subjects containing <span className="font-semibold">“StockX Has Your Back”</span>.</div>
              <div>- Check Gmail spam/promotions tabs if you expect coupons.</div>
            </div>

            {/* Debug (helps diagnose Gmail search quirks without devtools) */}
            {debug?.queryAttempts?.length ? (
              <details className="mt-4">
                <summary className="cursor-pointer select-none text-xs opacity-80">Debug</summary>
                <div className="mt-2 text-xs opacity-80 space-y-2">
                  <div><span className="font-semibold">Query used:</span> {debug.query}</div>
                  <div className="space-y-1">
                    {debug.queryAttempts.map((a) => (
                      <div key={a.q} className="flex items-start justify-between gap-3">
                        <div className="flex-1 break-words">{a.q}</div>
                        <div className="shrink-0 font-mono">{a.count}</div>
                      </div>
                    ))}
                  </div>
                  {debug.debug ? (
                    <div className="mt-3 space-y-1">
                      <div className="font-semibold">Extractor</div>
                      <div className="font-mono break-words">
                        {JSON.stringify(debug.debug)}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="mt-6">
            {loading ? (
              <div className={`mb-3 text-xs ${currentTheme.colors.textSecondary}`}>
                Refreshing in background…
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
            {displayCoupons.map((c) => {
              const daysLeftColor =
                c.daysLeft <= 0 ? 'text-red-300' : c.daysLeft <= 2 ? 'text-amber-300' : 'text-emerald-300';
              const Icon = c.status === 'available' ? Tag : c.status === 'used_on_bid' ? CheckCircle2 : AlertTriangle;
              const isSaving = savingCode === c.code;
              const isCopied = copied?.code === c.code;
              const isManual = c.source === 'manual';

              return (
                <div
                  key={c.code}
                  className={`rounded-xl border p-4 ${
                    isNeon ? 'bg-white/5 border-white/15' : `${currentTheme.colors.border} border`
                  } ${enteringCodes[c.code] ? 'will-change-transform [animation:coupon-enter_260ms_ease-out]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-white/70" />
                        <div className={`font-mono text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                          {c.code}
                        </div>
                        <button
                          onClick={() => copyCode(c.code)}
                          className={`h-7 w-7 p-0 inline-flex items-center justify-center rounded-md transition-colors ${
                            isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                          } ${isCopied ? (isNeon ? 'ring-1 ring-emerald-400/50 bg-emerald-500/15' : 'ring-1 ring-emerald-500/40 bg-emerald-50') : ''}`}
                          title={isCopied ? 'Copied' : 'Copy code'}
                        >
                          <span
                            key={isCopied ? copied?.nonce : 'idle'}
                            className={`inline-flex ${isCopied ? 'animate-copy-pop' : ''}`}
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                        {isManual ? (
                          <div className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-cyan-500/10 text-cyan-200 border-cyan-500/25">
                            Manual
                          </div>
                        ) : null}
                        {showHidden && c.hidden ? (
                          <div className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-gray-500/15 text-gray-200 border-gray-500/30">
                            Hidden
                          </div>
                        ) : null}
                      </div>

                      <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary} truncate`}>
                        {isManual ? 'Manual coupon' : c.subject}
                      </div>

                      <div className={`mt-2 flex flex-wrap items-center gap-3 text-xs ${currentTheme.colors.textSecondary}`}>
                        {c.benefit === 'free_shipping' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-cyan-200">Free shipping</span>
                        ) : c.benefit === 'half_off_shipping' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-cyan-200">Half off shipping</span>
                        ) : typeof c.amount === 'number' && Number.isFinite(c.amount) ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-semibold">${c.amount}</span> off
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Sent: {formatCouponDateTime(c.sentAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Expires: {formatCouponDateTime(c.expiresAt)}
                        </span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${daysLeftColor}`}>
                          {c.daysLeft} day{c.daysLeft === 1 ? '' : 's'} left
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!isManual ? (
                        <button
                          onClick={() => openInGmail(c.emailId)}
                          className={`p-2 rounded-lg transition-colors ${
                            isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          title="Open email"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => removeCoupon(c.code)}
                        disabled={isSaving}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                          isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                        title="Remove from list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {showHidden && c.hidden ? (
                      <button
                        onClick={() => restoreCoupon(c.code)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 bg-white/5 border-white/15 text-white/80 hover:bg-white/10"
                      >
                        Restore
                      </button>
                    ) : null}
                    <button
                      onClick={() => setStatus(c.code, 'available')}
                      disabled={isSaving}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        c.status === 'available'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                          : 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Available
                    </button>
                    <button
                      onClick={() => setStatus(c.code, 'used_on_bid')}
                      disabled={isSaving}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        c.status === 'used_on_bid'
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                          : 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Used
                    </button>
                    <button
                      onClick={() => setStatus(c.code, 'expired')}
                      disabled={isSaving}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        c.status === 'expired'
                          ? 'bg-red-500/20 border-red-500/40 text-red-200'
                          : 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Expired
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

