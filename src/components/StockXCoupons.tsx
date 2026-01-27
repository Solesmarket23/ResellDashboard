'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, ExternalLink, RefreshCw, Tag, CheckCircle2, AlertTriangle, Clock, Trash2, Eye, EyeOff, Plus, LayoutList, Table2 } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import GmailConnector from './GmailConnector';
import NeonDropdown, { type NeonDropdownOption } from './NeonDropdown';
import NeonNotification, { type NotificationType } from './NeonNotification';

type CouponStatus = 'available' | 'used_on_bid' | 'expired';
type CouponSource = 'gmail' | 'manual';
type SortMode = 'expiring_available' | 'sent_newest' | 'expired_only';
type CouponBenefit = 'amount_off' | 'free_shipping' | 'half_off_shipping';
type ViewMode = 'list' | 'table';
type GmailBannerMode = 'full' | 'compact';

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
  isDemo?: boolean; // client-only demo entry (not persisted)
};

type CouponDebug = {
  query?: string;
  queryAttempts?: Array<{ q: string; count: number }>;
  debug?: any;
};

function ordinalDay(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function formatCouponDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(d);
  const day = ordinalDay(d.getDate());
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  // Example: "January 24th, 3:01 PM" (no year; coupons are short-lived)
  return `${month} ${day}, ${time}`;
}

function computeDaysLeft(expiresAtIso: string): number {
  const ms = Date.parse(expiresAtIso);
  if (!Number.isFinite(ms)) return 0;
  const diffMs = ms - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
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
      return (v === 'sent_newest' || v === 'expiring_available' || v === 'expired_only') ? (v as SortMode) : 'expiring_available';
    } catch {
      return 'expiring_available';
    }
  });
  const [copied, setCopied] = useState<{ code: string; nonce: number } | null>(null);
  // Persist the blue "active" highlight (similar to Purchases page) until another code is copied.
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Default to Table view for new users; localStorage overrides once chosen.
    if (typeof window === 'undefined') return 'table';
    try {
      const v = localStorage.getItem('stockxCoupons_viewMode');
      if (v === 'list' || v === 'table') return v;
      return 'table';
    } catch {
      return 'table';
    }
  });
  const [gmailBannerMode, setGmailBannerMode] = useState<GmailBannerMode>(() => {
    if (typeof window === 'undefined') return 'full';
    try {
      const v = localStorage.getItem('stockxCoupons_gmailBannerMode');
      return v === 'compact' || v === 'full' ? (v as GmailBannerMode) : 'full';
    } catch {
      return 'full';
    }
  });
  const [hideSubject, setHideSubject] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('stockxCoupons_hideSubject') === 'true';
    } catch {
      return false;
    }
  });
  const copiedTimerRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchSeqRef = useRef(0);
  const timeoutCooldownUntilRef = useRef(0);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTargetCode, setDeleteTargetCode] = useState<string>('');
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualExpiresDate, setManualExpiresDate] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualBenefit, setManualBenefit] = useState<CouponBenefit>('amount_off');
  const [debug, setDebug] = useState<CouponDebug>({});
  // Archived coupons: hidden=true on the server. Default to NOT showing archived to avoid confusion.
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const seenCodesRef = useRef<Set<string>>(new Set());
  const [enteringCodes, setEnteringCodes] = useState<Record<string, true>>({});
  const enteringClearTimerRef = useRef<number | null>(null);

  const isNeon = currentTheme?.name === 'Neon';

  const sortOptions = useMemo<NeonDropdownOption[]>(
    () => [
      { value: 'expiring_available', label: 'Available expiring soon' },
      { value: 'sent_newest', label: 'Newest first' },
      { value: 'expired_only', label: 'Expired' },
    ],
    []
  );

  const statusOptions = useMemo<NeonDropdownOption[]>(
    () => [
      { value: 'available', label: 'Available' },
      { value: 'used_on_bid', label: 'Used' },
      { value: 'expired', label: 'Expired' },
    ],
    []
  );

  const SortDropdown = (
    <NeonDropdown
      value={sortMode}
      onChange={(v) => setSortMode(v as SortMode)}
      options={sortOptions}
      isNeon={isNeon}
      className="w-[220px] max-w-full"
    />
  );

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
        const persistable = (nextCoupons || []).filter((c) => !c?.isDemo);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            coupons: persistable,
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
    // If an auto fetch is in-flight and user clicks Refresh, cancel and restart so UI doesn't feel stuck.
    if (fetchInFlightRef.current) {
      if (reason !== 'manual') return;
      try {
        fetchAbortRef.current?.abort();
      } catch {
        // ignore
      }
      fetchInFlightRef.current = false;
    }
    if (reason === 'auto' && Date.now() < timeoutCooldownUntilRef.current) return;
    const seq = ++fetchSeqRef.current;
    fetchInFlightRef.current = true;
    setLoading(true);
    setError(null);
    let timeoutId: number | null = null;
    try {
      // Prevent the UI from getting stuck in "Refreshing..." if the request hangs.
      const controller = new AbortController();
      fetchAbortRef.current = controller;
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
        const count = newCodes.length;
        setNotification({
          isVisible: true,
          message: count === 0 ? 'No new coupons found' : `Found ${count} new coupon${count === 1 ? '' : 's'}`,
          type: count === 0 ? 'success' : 'success'
        });
      }
    } catch (e: any) {
      // If this request was superseded by a newer one, ignore errors to avoid flicker.
      if (fetchSeqRef.current !== seq) return;
      if (e?.name === 'AbortError') {
        setError('Refresh timed out. Gmail can be slow—try again.');
        setNotification({ isVisible: true, message: 'Refresh timed out — try again', type: 'error' });
        // Prevent auto re-fetch loops right after a timeout.
        timeoutCooldownUntilRef.current = Date.now() + 15000; // 15s
      } else {
        setError(e?.message || 'Failed to load coupons');
        setNotification({ isVisible: true, message: e?.message || 'Failed to load coupons', type: 'error' });
      }
      // Keep current list; just show error.
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (fetchSeqRef.current === seq) {
      setLoading(false);
      fetchInFlightRef.current = false;
        fetchAbortRef.current = null;
      }
    }
  }, [persistCache, userId]);

  const addDemoCoupon = useCallback(() => {
    const now = Date.now();
    const code = `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const sentAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
    const benefitRoll = Math.random();
    const benefit: CouponBenefit = benefitRoll < 0.34 ? 'free_shipping' : benefitRoll < 0.67 ? 'half_off_shipping' : 'amount_off';
    const amount = benefit === 'amount_off' ? 10 : null;

    const demo: Coupon = {
      code,
      emailId: `demo:${code}`,
      threadId: undefined,
      subject: 'Demo coupon (for animation preview)',
      from: 'Demo',
      sentAt,
      expiresAt,
      daysLeft: 14,
      status: 'available',
      statusSource: 'computed',
      hidden: false,
      source: 'manual',
      amount,
      benefit,
      isDemo: true,
    };

    setCoupons((prev) => [demo, ...prev.filter((c) => c.code !== demo.code)]);
    setEnteringCodes((prev) => ({ ...prev, [demo.code]: true }));
    if (enteringClearTimerRef.current) window.clearTimeout(enteringClearTimerRef.current);
    enteringClearTimerRef.current = window.setTimeout(() => setEnteringCodes({}), 450);
  }, []);

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
    // Do not auto-fetch on load. User explicitly clicks Refresh to fetch from Gmail.
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
      localStorage.setItem('stockxCoupons_viewMode', viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('stockxCoupons_gmailBannerMode', gmailBannerMode);
    } catch {
      // ignore
    }
  }, [gmailBannerMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('stockxCoupons_hideSubject', hideSubject ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [hideSubject]);

  const hiddenCount = useMemo(() => coupons.filter((c) => c.hidden).length, [coupons]);

  // Load preference from Firebase (so it persists across devices)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/user-settings/stockx-coupons?userId=${encodeURIComponent(userId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) return;
        if (cancelled) return;
        if (typeof data.hideSubject === 'boolean') setHideSubject(data.hideSubject);
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggleHideSubject = useCallback(async () => {
    if (!userId) return;
    const next = !hideSubject;
    setHideSubject(next);
    try {
      const res = await fetch(`/api/user-settings/stockx-coupons?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideSubject: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
    } catch (e: any) {
      // Revert on error (keep UI honest)
      setHideSubject((prev) => !prev);
      setNotification({ isVisible: true, message: e?.message || 'Failed to save preference', type: 'error' });
    }
  }, [hideSubject, userId]);

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

      setCoupons((prev) => {
        const next = prev.map((c) => {
          if (c.code !== code) return c;
          const nextDaysLeft = status === 'expired' ? 0 : computeDaysLeft(c.expiresAt);
          return { ...c, status, statusSource: 'user', daysLeft: nextDaysLeft };
        });
          persistCache(next);
          return next;
      });
      const label = status === 'available' ? 'Available' : status === 'used_on_bid' ? 'Used' : 'Expired';
      setNotification({ isVisible: true, message: `${code} marked ${label}`, type: 'success' });
    } catch (e: any) {
      setError(e?.message || 'Failed to update status');
      setNotification({ isVisible: true, message: e?.message || 'Failed to update status', type: 'error' });
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
      setNotification({ isVisible: true, message: `Deleted ${code}`, type: 'success' });
    } catch (e: any) {
      setError(e?.message || 'Failed to remove coupon');
      setNotification({ isVisible: true, message: e?.message || 'Failed to delete coupon', type: 'error' });
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
      setHighlightedCode(code);
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
    if (!addManualOpen && !confirmClearOpen && !confirmDeleteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addManualOpen) setAddManualOpen(false);
      if (confirmClearOpen) setConfirmClearOpen(false);
      if (confirmDeleteOpen) setConfirmDeleteOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addManualOpen, confirmClearOpen, confirmDeleteOpen]);

  const requestDeleteCoupon = useCallback((code: string) => {
    setDeleteTargetCode(code);
    setConfirmDeleteOpen(true);
  }, []);

  const openInGmail = (emailId: string) => {
    // Gmail deep link works for most users (requires being logged in).
    window.open(`https://mail.google.com/mail/u/0/#all/${emailId}`, '_blank', 'noopener,noreferrer');
  };

  const displayCoupons = useMemo(() => {
    let list = showHidden ? [...coupons] : coupons.filter((c) => !c.hidden);
    const statusRank = (s: CouponStatus) => (s === 'available' ? 0 : s === 'used_on_bid' ? 1 : 2);
    const toMs = (iso: string) => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : 0;
    };

    if (sortMode === 'expired_only') {
      list = list.filter((c) => c.status === 'expired');
    }

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

  const pageCounts = useMemo(() => {
    // Counters should reflect the underlying data set (visible vs archived), not the current sort filter.
    // Otherwise "Expired only" would make Total/Active look wrong.
    const base = showHidden ? [...coupons] : coupons.filter((c) => !c.hidden);
    const total = base.length;
    const expired = base.filter((c) => c.status === 'expired').length;
    const available = base.filter((c) => c.status === 'available').length;
    return { total, available, expired };
  }, [coupons, showHidden]);

  const ViewToggle = (
    <div className={`inline-flex items-center rounded-lg border overflow-hidden ${
      isNeon ? 'border-white/15 bg-white/5' : 'border-gray-200 bg-white'
    }`}>
      <button
        type="button"
        onClick={() => setViewMode('table')}
        className={`px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
          viewMode === 'table'
            ? (isNeon ? 'bg-cyan-500/15 text-cyan-200' : 'bg-blue-50 text-blue-900')
            : (isNeon ? 'text-white/80 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50')
        }`}
        title="Table view"
      >
        <Table2 className="w-4 h-4" />
        Table
      </button>
      <button
        type="button"
        onClick={() => setViewMode('list')}
        className={`px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
          viewMode === 'list'
            ? (isNeon ? 'bg-cyan-500/15 text-cyan-200' : 'bg-blue-50 text-blue-900')
            : (isNeon ? 'text-white/80 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50')
        }`}
        title="List view"
      >
        <LayoutList className="w-4 h-4" />
        List
      </button>
    </div>
  );

  const hiddenAvailableCount = useMemo(
    () => coupons.filter((c) => c.hidden && c.status === 'available').length,
    [coupons]
  );

  // Convert "You have X available coupon(s) archived" banner into a one-time toast.
  const hiddenAvailToastLastCountRef = useRef<number>(0);
  useEffect(() => {
    if (showHidden) {
      hiddenAvailToastLastCountRef.current = hiddenAvailableCount;
      return;
    }
    const prev = hiddenAvailToastLastCountRef.current;
    hiddenAvailToastLastCountRef.current = hiddenAvailableCount;
    if (hiddenAvailableCount > 0 && prev === 0) {
      setNotification({
        isVisible: true,
        type: 'warning',
        message: `You have ${hiddenAvailableCount} available archived coupon${hiddenAvailableCount === 1 ? '' : 's'}.`,
      });
    }
  }, [hiddenAvailableCount, showHidden]);

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

      {/* In-app confirm modal for Delete */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDeleteOpen(false)}
          />
          <div
            className={`relative w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isNeon
                ? 'bg-gray-950/80 border-white/15'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-coupon-title"
          >
            <h3 id="delete-coupon-title" className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
              Delete coupon?
            </h3>
            <p className={`mt-2 text-sm ${currentTheme.colors.textSecondary}`}>
              Are you sure you want to delete <span className="font-semibold">{deleteTargetCode || 'this coupon'}</span>? This will archive it (you can restore it later).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isNeon ? 'bg-white/10 hover:bg-white/20 border border-white/15' : 'bg-gray-100 hover:bg-gray-200'
                } ${currentTheme.colors.textPrimary}`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const code = deleteTargetCode;
                  setConfirmDeleteOpen(false);
                  setDeleteTargetCode('');
                  if (code) void removeCoupon(code);
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  isNeon ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200' : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                Yes, delete
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
        <div className="flex items-center justify-end">
          <div
            className={`inline-flex rounded-lg border overflow-hidden ${
              isNeon ? 'border-white/15 bg-white/5' : 'border-gray-200 bg-white'
            }`}
            role="group"
            aria-label="Gmail banner view"
          >
            <button
              type="button"
              onClick={() => setGmailBannerMode('full')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                gmailBannerMode === 'full'
                  ? isNeon
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'bg-blue-600 text-white'
                  : isNeon
                    ? 'text-gray-300 hover:bg-white/10'
                    : 'text-gray-700 hover:bg-gray-50'
              }`}
              title="Show the full Gmail banner"
            >
              Detailed
            </button>
            <button
              type="button"
              onClick={() => setGmailBannerMode('compact')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                gmailBannerMode === 'compact'
                  ? isNeon
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'bg-blue-600 text-white'
                  : isNeon
                    ? 'text-gray-300 hover:bg-white/10'
                    : 'text-gray-700 hover:bg-gray-50'
              }`}
              title="Show a compact Gmail banner"
            >
              Compact
            </button>
          </div>
        </div>
        <div className={gmailBannerMode === 'compact' ? 'flex justify-start' : ''}>
        <GmailConnector
          onConnectionChange={setGmailConnected}
          connectDescription="Connect Gmail to find StockX coupon emails."
          connectedDescription="Gmail connected — coupon emails can now be fetched."
            variant={gmailBannerMode}
            className={gmailBannerMode === 'compact' ? 'w-full max-w-2xl' : 'w-full'}
        />
        </div>
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
              Finds StockX coupon emails in Gmail and tracks code status.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              onClick={() => {
                if (!showHidden && hiddenCount === 0) {
                  setNotification({ isVisible: true, message: 'No archived coupons', type: 'success' });
                  return;
                }
                setShowHidden((v) => !v);
              }}
              disabled={!gmailConnected || loading}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isNeon ? 'bg-white/10 hover:bg-white/20 border border-white/20' : 'bg-white hover:bg-gray-50 border border-gray-300'
              } ${currentTheme.colors.textPrimary}`}
              title={showHidden ? 'Hide archived coupons' : 'Show archived coupons'}
            >
              {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showHidden ? 'Hide archived' : 'Show archived'}
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
            {!showHidden && hiddenAvailableCount > 0 ? (
              <button
                onClick={restoreHiddenAvailable}
                disabled={loading || !gmailConnected}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isNeon
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200'
                    : 'bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900'
                }`}
                title="Restore all available archived coupons"
              >
                Restore available ({hiddenAvailableCount})
              </button>
            ) : null}
            <button
              onClick={() => void toggleHideSubject()}
              disabled={!userId}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isNeon
                  ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                  : 'bg-white hover:bg-gray-50 border border-gray-300'
              } ${currentTheme.colors.textPrimary}`}
              title={hideSubject ? 'Show email subject' : 'Hide email subject'}
            >
              {hideSubject ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {hideSubject ? 'Show subject' : 'Hide subject'}
            </button>
            <button
              onClick={addDemoCoupon}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 ${
                isNeon
                  ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                  : 'bg-white hover:bg-gray-50 border border-gray-300'
              } ${currentTheme.colors.textPrimary}`}
              title="Insert a demo coupon to preview the new-entry animation"
            >
              Test animation
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {showHidden && hiddenCount > 0 && (
          <>
          <div className={`mt-4 rounded-lg border p-3 text-sm ${
            isNeon ? 'border-white/15 bg-white/5 text-white/80' : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}>
              Showing <span className="font-semibold">archived</span> coupons. Click <span className="font-semibold">Restore</span> to show a coupon in the normal list.
          </div>
          </>
        )}

        {/* (was banner) now shown as a toast + a top-row action button */}

        {!gmailConnected && coupons.length === 0 ? (
          <div className={`mt-6 text-sm ${currentTheme.colors.textSecondary}`}>
            Connect Gmail to start scanning for coupon emails.
          </div>
        ) : coupons.length === 0 && loading ? (
          <div className={`mt-6 text-sm ${currentTheme.colors.textSecondary}`}>Loading coupons…</div>
        ) : !showHidden && coupons.length > 0 && displayCoupons.length === 0 ? (
          <div className={`mt-6 text-sm ${currentTheme.colors.textSecondary}`}>
            No coupons in the main list.
            {hiddenCount > 0 ? (
              <div className="mt-2">
                You have <span className="font-semibold">{hiddenCount}</span> archived coupon{hiddenCount === 1 ? '' : 's'}. Click <span className="font-semibold">Show archived</span> to view them.
              </div>
            ) : null}
          </div>
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${currentTheme.colors.textSecondary}`}>Sort by</span>
                {SortDropdown}
                <div className="ml-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    isNeon ? 'bg-white/5 border-white/15 text-white/80' : 'bg-gray-50 border-gray-200 text-gray-700'
                  }`}>
                    Total: {pageCounts.total}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    isNeon ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    Available: {pageCounts.available}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    isNeon ? 'bg-red-500/10 border-red-500/25 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    Expired: {pageCounts.expired}
                  </span>
              </div>
              </div>
              <div className="flex items-center gap-3">
                {ViewToggle}
              </div>
            </div>

            {/* Keep layout stable to avoid "flicker" when loading toggles */}
            <div
              className={`mb-3 text-xs ${currentTheme.colors.textSecondary} transition-opacity ${
                loading ? 'opacity-100' : 'opacity-0'
              }`}
              aria-live="polite"
            >
              Refreshing…
            </div>

            {viewMode === 'table' ? (
              <div className={`rounded-xl border overflow-hidden ${
                isNeon ? 'border-white/15 bg-white/5' : 'border-gray-200 bg-white'
              }`}>
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className={`${isNeon ? 'bg-white/5' : 'bg-gray-50'} text-xs uppercase tracking-wide`}>
                      <tr className={`${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
                        <th className="px-4 py-3 text-left w-[420px]">Code</th>
                        <th className="px-4 py-3 text-left w-[190px]">Status</th>
                        <th className="px-4 py-3 text-left w-[170px]">Discount</th>
                        <th className="px-4 py-3 text-left w-[90px]">Days left</th>
                        <th className="px-4 py-3 text-left w-[200px]">Sent</th>
                        <th className="px-4 py-3 text-left w-[200px]">Expires</th>
                        <th className="px-4 py-3 text-left w-[160px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`${isNeon ? 'divide-y divide-white/10' : 'divide-y divide-gray-100'}`}>
                      {displayCoupons.map((c) => {
                        const effectiveDaysLeft = c.status === 'expired' ? 0 : computeDaysLeft(c.expiresAt);
                        const daysLeftColor =
                          effectiveDaysLeft <= 0 ? 'text-red-300' : effectiveDaysLeft <= 2 ? 'text-amber-300' : 'text-emerald-300';
                        const daysLeftGlow =
                          effectiveDaysLeft <= 0
                            ? 'animate-pulse-glow-red-soft'
                            : effectiveDaysLeft <= 2
                              ? 'animate-pulse-glow-yellow-soft'
                              : 'animate-pulse-glow-green-soft';
                        const benefitGlow =
                          !isNeon
                            ? ''
                            : c.benefit === 'amount_off'
                              ? 'animate-pulse-glow-violet-xsoft'
                              : (c.benefit === 'free_shipping' || c.benefit === 'half_off_shipping')
                                ? 'animate-pulse-glow-cyan-xsoft'
                                : '';
                        const isSaving = savingCode === c.code;
                        const isCopied = copied?.code === c.code;
                        const isHighlighted = highlightedCode === c.code;
                        const isManual = c.source === 'manual';
                        const isUsed = c.status === 'used_on_bid';
                        return (
                          <tr
                            key={c.code}
                            style={isHighlighted ? {
                              boxShadow: isNeon
                                ? 'inset 0 0 0 3px #22d3ee, 0 20px 50px rgba(34, 211, 238, 0.3)'
                                : 'inset 0 0 0 3px #3b82f6, 0 20px 50px rgba(59, 130, 246, 0.3)'
                            } : undefined}
                            className={`${isNeon ? 'text-white/85' : 'text-gray-900'} transition-all duration-300 ${
                              enteringCodes[c.code] ? 'will-change-transform [animation:coupon-enter_260ms_ease-out]' : ''
                            } ${
                              isHighlighted
                                ? (isNeon ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-cyan-500/20' : 'bg-gradient-to-r from-blue-200 via-blue-100 to-blue-200')
                                : ''
                            } ${
                              isUsed && !isHighlighted ? (isNeon ? 'bg-white/5' : 'bg-gray-50') : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono font-semibold ${
                                    isUsed
                                      ? (isNeon ? 'text-white/60 line-through decoration-white/30' : 'text-gray-500 line-through decoration-gray-400')
                                      : ''
                                  }`}
                                >
                                  {c.code}
                                </span>
                                <button
                                  onClick={() => copyCode(c.code)}
                                  className={`h-8 w-8 p-0 inline-flex items-center justify-center rounded-md transition-colors ${
                                    isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                                  } ${isCopied ? (isNeon ? 'ring-1 ring-cyan-400/50 bg-cyan-500/15' : 'ring-1 ring-blue-500/40 bg-blue-50') : ''}`}
                                  title={isCopied ? 'Copied' : 'Copy code'}
                                >
                                  {isCopied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                                </button>
                                {isManual ? (
                                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-cyan-500/10 text-cyan-200 border-cyan-500/25">
                                    Manual
                                  </span>
                                ) : null}
                                {showHidden && c.hidden ? (
                                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-gray-500/15 text-gray-200 border-gray-500/30">
                                    Archived
                                  </span>
                                ) : null}
                              </div>
                              {!hideSubject ? (
                                <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary} truncate max-w-[420px]`}>
                                  {isManual ? 'Manual coupon' : c.subject}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <div className={isSaving ? 'pointer-events-none opacity-60' : ''}>
                                <NeonDropdown
                                  value={c.status}
                                  onChange={(v) => {
                                    if (v === c.status) return;
                                    void setStatus(c.code, v as CouponStatus);
                                  }}
                                  options={statusOptions}
                                  isNeon={isNeon}
                                  className="w-[170px] max-w-full"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {c.benefit === 'free_shipping' ? (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap ${
                                  isNeon ? `bg-cyan-500/10 border-cyan-500/30 text-cyan-200 ${benefitGlow}` : 'bg-cyan-50 border-cyan-200 text-cyan-800'
                                }`}>
                                  Free shipping
                                </span>
                              ) : c.benefit === 'half_off_shipping' ? (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap ${
                                  isNeon ? `bg-cyan-500/10 border-cyan-500/30 text-cyan-200 ${benefitGlow}` : 'bg-cyan-50 border-cyan-200 text-cyan-800'
                                }`}>
                                  Half off shipping
                                </span>
                              ) : typeof c.amount === 'number' && Number.isFinite(c.amount) ? (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap ${
                                  isNeon ? `bg-violet-500/10 border-violet-500/30 text-violet-200 ${benefitGlow}` : 'bg-violet-50 border-violet-200 text-violet-800'
                                }`}>
                                  <span className="font-semibold">${c.amount}</span> off
                                </span>
                              ) : (
                                <span className={`${currentTheme.colors.textSecondary}`}>—</span>
                              )}
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap font-semibold ${daysLeftColor} ${isNeon ? daysLeftGlow : ''}`}>
                              {effectiveDaysLeft}d
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{formatCouponDateTime(c.sentAt)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{formatCouponDateTime(c.expiresAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {!isManual ? (
                                  <button
                                    onClick={() => openInGmail(c.emailId)}
                                    className={`h-8 w-8 p-0 inline-flex items-center justify-center rounded-md transition-colors ${
                                      isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                                    }`}
                                    title="Open email"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </button>
                                ) : null}
                                {showHidden && c.hidden ? (
                                  <button
                                    onClick={() => restoreCoupon(c.code)}
                                    disabled={isSaving}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                                      isNeon ? 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                                    }`}
                                    title="Restore"
                                  >
                                    Restore
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => requestDeleteCoupon(c.code)}
                                    disabled={isSaving}
                                    className={`h-8 w-8 p-0 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                                      isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                                    }`}
                                    title="Archive"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-3">
            {displayCoupons.map((c) => {
              const effectiveDaysLeft = c.status === 'expired' ? 0 : computeDaysLeft(c.expiresAt);
              const daysLeftColor =
                effectiveDaysLeft <= 0 ? 'text-red-300' : effectiveDaysLeft <= 2 ? 'text-amber-300' : 'text-emerald-300';
              const daysLeftGlow =
                effectiveDaysLeft <= 0
                  ? 'animate-pulse-glow-red-soft'
                  : effectiveDaysLeft <= 2
                    ? 'animate-pulse-glow-yellow-soft'
                    : 'animate-pulse-glow-green-soft';
              const benefitGlow =
                !isNeon
                  ? ''
                  : c.benefit === 'amount_off'
                    ? 'animate-pulse-glow-violet-xsoft'
                    : (c.benefit === 'free_shipping' || c.benefit === 'half_off_shipping')
                      ? 'animate-pulse-glow-cyan-xsoft'
                      : '';
              const Icon = c.status === 'available' ? Tag : c.status === 'used_on_bid' ? CheckCircle2 : AlertTriangle;
              const isSaving = savingCode === c.code;
              const isCopied = copied?.code === c.code;
              const isHighlighted = highlightedCode === c.code;
              const isManual = c.source === 'manual';
              const isUsed = c.status === 'used_on_bid';

              return (
                <div
                  key={c.code}
                  style={isHighlighted ? {
                    boxShadow: isNeon
                      ? 'inset 0 0 0 3px #22d3ee, 0 20px 50px rgba(34, 211, 238, 0.3)'
                      : 'inset 0 0 0 3px #3b82f6, 0 20px 50px rgba(59, 130, 246, 0.3)'
                  } : undefined}
                  className={`rounded-xl border p-4 transition-all duration-300 ${
                    isNeon ? 'bg-white/5 border-white/15' : `${currentTheme.colors.border} border`
                  } ${enteringCodes[c.code] ? 'will-change-transform [animation:coupon-enter_260ms_ease-out]' : ''} ${
                    isHighlighted
                      ? (isNeon ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-cyan-500/20' : 'bg-gradient-to-r from-blue-200 via-blue-100 to-blue-200')
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-white/70" />
                        <div
                          className={`font-mono text-lg font-semibold ${
                            isUsed ? (isNeon ? 'text-white/60 line-through decoration-white/30' : 'text-gray-500 line-through decoration-gray-400') : currentTheme.colors.textPrimary
                          }`}
                        >
                          {c.code}
                        </div>
                        <button
                          onClick={() => copyCode(c.code)}
                          className={`h-7 w-7 p-0 inline-flex items-center justify-center rounded-md transition-colors ${
                            isNeon ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                          } ${isCopied ? (isNeon ? 'ring-1 ring-cyan-400/50 bg-cyan-500/15' : 'ring-1 ring-blue-500/40 bg-blue-50') : ''}`}
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

                      {!hideSubject ? (
                      <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary} truncate`}>
                        {isManual ? 'Manual coupon' : c.subject}
                      </div>
                      ) : null}

                      <div className={`mt-2 flex flex-wrap items-center gap-3 text-xs ${currentTheme.colors.textSecondary}`}>
                        {c.benefit === 'free_shipping' ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
                              isNeon
                                ? `bg-cyan-500/10 border-cyan-500/30 text-cyan-200 ${benefitGlow}`
                                : 'bg-cyan-50 border-cyan-200 text-cyan-800'
                            }`}
                          >
                            Free shipping
                          </span>
                          ) : c.benefit === 'half_off_shipping' ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
                              isNeon
                                ? `bg-cyan-500/10 border-cyan-500/30 text-cyan-200 ${benefitGlow}`
                                : 'bg-cyan-50 border-cyan-200 text-cyan-800'
                            }`}
                          >
                            Half off shipping
                          </span>
                          ) : typeof c.amount === 'number' && Number.isFinite(c.amount) ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
                              isNeon
                                ? `bg-violet-500/10 border-violet-500/30 text-violet-200 ${benefitGlow}`
                                : 'bg-violet-50 border-violet-200 text-violet-800'
                            }`}
                          >
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
                        <span className={`inline-flex items-center gap-1 font-semibold ${daysLeftColor} ${isNeon ? daysLeftGlow : ''}`}>
                          {effectiveDaysLeft} day{effectiveDaysLeft === 1 ? '' : 's'} left
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
                        onClick={() => requestDeleteCoupon(c.code)}
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}

