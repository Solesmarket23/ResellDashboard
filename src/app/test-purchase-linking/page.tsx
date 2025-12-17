'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import NeonNotification, { type NotificationType } from '@/components/NeonNotification';
import StockXSalesImport from '@/components/StockXSalesImport';
import { Box, DollarSign, HandCoins, Hash, Link2, Ruler, Settings2, X } from 'lucide-react';

type SaleRow = {
  id: string;
  orderNumber?: string | null;
  product?: string | null;
  brand?: string | null;
  size?: string | null;
  styleId?: string | null;
  imageUrl?: string | null;
  salePrice?: number | null;
  fees?: number | null;
  payout?: number | null;
  purchasePrice?: number | null;
  profit?: number | null;
  linkedPurchaseId?: string | null;
  linkedPurchaseOrderNumber?: string | null;
  date?: string | null;
};

type PurchaseRow = {
  id: string;
  orderNumber?: string | null;
  purchaseDate?: string | null;
  purchase_date?: string | null;
  emailDate?: string | null;
  email_date?: string | null;
  createdAt?: string | null;
  totalAmount?: number | string | null;
  purchasePrice?: number | string | null;
  price?: string | null;
  unitNumber?: number | null;
  linkedSaleOrderNumber?: string | null;
  linkedSaleId?: string | null;
  styleId?: string | null;
  style_id?: string | null;
  size?: string | null;
  extracted_size?: string | null;
  product?: any;
  productImageUrl?: string | null;
  actualDelivery?: string | null;
};

function sanitizeUserId(raw: unknown): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  const lowered = v.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return '';
  return v;
}

function ymdToUtcMs(ymd: string): number | null {
  // Interpret YYYY-MM-DD as UTC midnight for stable bucketing.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const ms = Date.parse(`${ymd}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function clampYmdRange(startYmd: string, endYmd: string): { startMs: number; endMs: number } | null {
  const startMs = ymdToUtcMs(startYmd);
  const endMs = ymdToUtcMs(endYmd);
  if (startMs === null || endMs === null) return null;
  const a = Math.min(startMs, endMs);
  const b = Math.max(startMs, endMs);
  if (a === b) return { startMs: a, endMs: b };
  return { startMs: a, endMs: b };
}

function hashToUint32(s: string): number {
  // Simple deterministic hash
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeSize(size: unknown): string {
  return String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function getPurchaseCost(p: PurchaseRow | null): number {
  if (!p) return 0;
  const totalAmount =
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ?? null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

  const purchasePrice =
    (typeof p.purchasePrice === 'number' ? p.purchasePrice : parseMoney(p.purchasePrice)) ?? null;
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;

  const priceFromString = parseMoney(p.price);
  if (typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0) return priceFromString;

  return 0;
}

function currency(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

function getNetPayout(s: SaleRow | null): number {
  if (!s) return 0;
  const payout = typeof s.payout === 'number' && Number.isFinite(s.payout) ? s.payout : null;
  if (typeof payout === 'number') return payout;
  const sale = typeof s.salePrice === 'number' && Number.isFinite(s.salePrice) ? s.salePrice : 0;
  const fees = typeof s.fees === 'number' && Number.isFinite(s.fees) ? s.fees : 0;
  return sale - fees;
}

function getTotalPaid(s: SaleRow | null): number {
  if (!s) return 0;
  const paid = typeof s.purchasePrice === 'number' && Number.isFinite(s.purchasePrice) ? s.purchasePrice : 0;
  return paid;
}

function getProfitNetPayoutMinusPaid(s: SaleRow | null): number {
  if (!s) return 0;
  return getNetPayout(s) - getTotalPaid(s);
}

export default function TestPurchaseLinkingPage() {
  const { user } = useAuth();
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'Neon';
  const headerIconClass = isNeon ? 'text-cyan-400' : 'text-blue-600';
  const headerTextClass = isNeon ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700';

  // Test-only: simulate actualDelivery for purchases that don't have it (for FIFO experiments)
  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [simulateMissingDeliveries, setSimulateMissingDeliveries] = useState(false);
  const [simFromYmd, setSimFromYmd] = useState('2025-10-01');
  const [simToYmd, setSimToYmd] = useState(todayYmd);

  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const showNotice = useCallback((message: string, type: NotificationType | 'info') => {
    const normalizedType: NotificationType = type === 'info' ? 'success' : type;
    setNotification({ isVisible: true, message, type: normalizedType });
  }, []);

  const resolveUserId = useCallback((): string => {
    const siteUserId =
      typeof window !== 'undefined'
        ? sanitizeUserId(localStorage.getItem('siteUserId') || localStorage.getItem('site-user-id') || '')
        : '';
    return sanitizeUserId(user?.uid || siteUserId || '');
  }, [user?.uid]);

  const [userId, setUserId] = useState('');

  const detectUserIdFromServer = useCallback(async () => {
    try {
      // 1) Try the dedicated endpoint (cookie-based)
      {
        const resp = await fetch('/api/whoami', { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        const detected = sanitizeUserId(json?.userId);
        if (detected) {
          setUserId(detected);
          showNotice(`✅ Detected userId from cookies: ${detected.slice(0, 10)}…`, 'success');
          return;
        }
      }

      // 2) Fallback: purchases endpoint can infer cookie userId and returns it in the payload
      {
        const resp = await fetch('/api/purchases/list', { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        const detected = sanitizeUserId(json?.userId);
        if (resp.ok && detected) {
          setUserId(detected);
          showNotice(`✅ Detected userId via purchases cookies: ${detected.slice(0, 10)}…`, 'success');
          return;
        }
      }

      // 3) Fallback: sales endpoint can infer cookie userId (after our fix) and returns it in the payload
      {
        const resp = await fetch('/api/sales/list?limit=1', { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        const detected = sanitizeUserId(json?.userId);
        if (resp.ok && detected) {
          setUserId(detected);
          showNotice(`✅ Detected userId via sales cookies: ${detected.slice(0, 10)}…`, 'success');
          return;
        }
      }

      showNotice(
        '⚠️ Could not detect userId from cookies on this domain. Paste your siteUserId (hex string) into the box.',
        'warning'
      );
    } catch {
      showNotice('❌ Detect ID failed (network/server error). Try refreshing and clicking again.', 'error');
    }
  }, [showNotice]);

  useEffect(() => {
    const resolved = resolveUserId();
    if (resolved) {
      setUserId(resolved);
      return;
    }
    // On trycloudflare domains, localStorage usually won't have siteUserId.
    // Fall back to cookie-based detection.
    detectUserIdFromServer();
  }, [detectUserIdFromServer, resolveUserId]);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const [saleSearch, setSaleSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');

  const filteredSales = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => {
      const fields = [s.orderNumber, s.product, s.brand, s.size, s.styleId].map((x) => String(x || '').toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [saleSearch, sales]);

  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) => {
      const fields = [
        p.orderNumber,
        p.id,
        p.styleId,
        p.style_id,
        p.size,
        p.extracted_size,
        p.unitNumber ? `unit ${p.unitNumber}` : null
      ].map((x) => String(x || '').toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [purchaseSearch, purchases]);

  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const selectedSale = useMemo(() => sales.find((s) => s.id === selectedSaleId) || null, [sales, selectedSaleId]);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('');
  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === selectedPurchaseId) || null,
    [purchases, selectedPurchaseId]
  );

  const loadSales = useCallback(async () => {
    const u = userId.trim();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    setLoadingSales(true);
    try {
      const qs = new URLSearchParams({ userId: u, limit: '400' });
      const resp = await fetch(`/api/sales/list?${qs.toString()}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.error || `Failed to load sales (${resp.status})`);
      }
      const rows: SaleRow[] = Array.isArray(json?.sales)
        ? json.sales.map((x: any) => ({
            id: String(x.id),
            orderNumber: x.orderNumber ? String(x.orderNumber) : null,
            product: x.product ? String(x.product) : null,
            brand: x.brand ? String(x.brand) : null,
            size: x.size ? String(x.size) : null,
            styleId: x.styleId ? String(x.styleId) : null,
            imageUrl: x.imageUrl ? String(x.imageUrl) : null,
            salePrice: typeof x.salePrice === 'number' ? x.salePrice : Number(x.salePrice) || null,
            fees: typeof x.fees === 'number' ? x.fees : Number(x.fees) || null,
            payout: typeof x.payout === 'number' ? x.payout : Number(x.payout) || null,
            purchasePrice: typeof x.purchasePrice === 'number' ? x.purchasePrice : Number(x.purchasePrice) || null,
            profit: typeof x.profit === 'number' ? x.profit : Number(x.profit) || null,
            linkedPurchaseId: x.linkedPurchaseId ? String(x.linkedPurchaseId) : null,
            linkedPurchaseOrderNumber: x.linkedPurchaseOrderNumber ? String(x.linkedPurchaseOrderNumber) : null,
            date: x.date ? String(x.date) : null
          }))
        : [];
      setSales(rows);
      showNotice(`✅ Loaded ${rows.length} sale(s).`, 'success');
    } catch (e: any) {
      showNotice(`❌ Failed to load sales: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingSales(false);
    }
  }, [selectedSaleId, showNotice, userId]);

  const loadPurchases = useCallback(async () => {
    const u = userId.trim();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    setLoadingPurchases(true);
    try {
      const qs = new URLSearchParams({ userId: u });
      const resp = await fetch(`/api/purchases/list?${qs.toString()}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || json?.message || `Failed to load purchases (${resp.status})`);
      }
      const rows: PurchaseRow[] = Array.isArray(json?.purchases)
        ? json.purchases.map((x: any) => ({
            ...x,
            id: String(x.id),
            orderNumber: x.orderNumber ? String(x.orderNumber) : null
          }))
        : [];
      setPurchases(rows);
      showNotice(`✅ Loaded ${rows.length} purchase(s).`, 'success');
    } catch (e: any) {
      showNotice(`❌ Failed to load purchases: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingPurchases(false);
    }
  }, [selectedPurchaseId, showNotice, userId]);

  useEffect(() => {
    // Convenience: load both once if userId exists
    if (userId) {
      loadSales();
      loadPurchases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // FIFO dry-run using existing debug endpoint (localhost only unless INTERNAL_DEBUG_SECRET configured)
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoSummary, setFifoSummary] = useState<any | null>(null);
  const [fifoRows, setFifoRows] = useState<any[]>([]);
  const runFifoDryRun = useCallback(async () => {
    const u = userId.trim();
    if (!u) return;
    setFifoLoading(true);
    setFifoSummary(null);
    setFifoRows([]);
    try {
      const qs = new URLSearchParams({
        userId: u,
        unlinkedOnly: 'true',
        limitSales: '200'
      });
      const resp = await fetch(`/api/purchase-linking/fifo-dry-run?${qs.toString()}`, {
        cache: 'no-store',
        headers: { 'x-user-id': u }
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Dry run failed (${resp.status})`);
      setFifoSummary(json.summary || null);
      setFifoRows(Array.isArray(json.results) ? json.results : []);
      showNotice('✅ FIFO dry-run complete.', 'success');
    } catch (e: any) {
      showNotice(`❌ FIFO dry-run failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setFifoLoading(false);
    }
  }, [showNotice, userId]);

  const [linking, setLinking] = useState(false);
  const [allowWrites, setAllowWrites] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [simulatedDeliveryByPurchaseId, setSimulatedDeliveryByPurchaseId] = useState<Record<string, string>>({});

  const getSimulatedDeliveryYmd = useCallback(
    (purchaseId: string): string | null => {
      if (!simulateMissingDeliveries) return null;
      const range = clampYmdRange(simFromYmd, simToYmd);
      if (!range) return null;
      const spanDays = Math.max(1, Math.floor((range.endMs - range.startMs) / 86400000) + 1);
      const idx = hashToUint32(purchaseId) % spanDays;
      const ms = range.startMs + idx * 86400000;
      const d = new Date(ms);
      // Return yyyy-mm-dd
      return d.toISOString().slice(0, 10);
    },
    [simFromYmd, simToYmd, simulateMissingDeliveries]
  );

  const effectiveActualDelivery = useCallback(
    (p: PurchaseRow | null): string | null => {
      if (!p) return null;
      const sim = simulatedDeliveryByPurchaseId[p.id];
      const simulatedFallback = !p.actualDelivery ? getSimulatedDeliveryYmd(p.id) : null;
      const v = (sim || p.actualDelivery || simulatedFallback || '').toString().trim();
      return v ? v : null;
    },
    [getSimulatedDeliveryYmd, simulatedDeliveryByPurchaseId]
  );

  const previewLinkSelected = useCallback(async () => {
    if (!userId.trim()) return;
    if (!selectedSale) {
      showNotice('⚠️ Select a sale first.', 'warning');
      return;
    }
    if (!selectedPurchase) {
      showNotice('⚠️ Select a purchase first.', 'warning');
      return;
    }
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          purchaseId: selectedPurchase.id,
          action: 'link',
          dryRun: true
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Link failed (${resp.status})`);
      setPreview(json);
      showNotice('✅ Preview ready (no writes).', 'success');
    } catch (e: any) {
      showNotice(`❌ Link failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [selectedPurchase, selectedSale, showNotice, userId]);

  const commitLinkSelected = useCallback(async () => {
    if (!allowWrites) {
      showNotice('⚠️ Enable “Allow writes” to commit links.', 'warning');
      return;
    }
    if (!userId.trim() || !selectedSale || !selectedPurchase) return;
    const ok = window.confirm('This will WRITE a link to Firestore. Continue?');
    if (!ok) return;
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          purchaseId: selectedPurchase.id,
          action: 'link',
          dryRun: false
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Commit failed (${resp.status})`);
      showNotice(`✅ Committed link for sale ${selectedSale.orderNumber || selectedSale.id}.`, 'success');
      await loadSales();
      await loadPurchases();
    } catch (e: any) {
      showNotice(`❌ Commit failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [allowWrites, loadPurchases, loadSales, selectedPurchase, selectedSale, showNotice, userId]);

  const previewUnlinkSelectedSale = useCallback(async () => {
    if (!userId.trim()) return;
    if (!selectedSale) {
      showNotice('⚠️ Select a sale first.', 'warning');
      return;
    }
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          action: 'unlink',
          dryRun: true
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Unlink failed (${resp.status})`);
      setPreview(json);
      showNotice('✅ Preview ready (no writes).', 'success');
    } catch (e: any) {
      showNotice(`❌ Unlink failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [selectedSale, showNotice, userId]);

  const commitUnlinkSelectedSale = useCallback(async () => {
    if (!allowWrites) {
      showNotice('⚠️ Enable “Allow writes” to commit unlink.', 'warning');
      return;
    }
    if (!userId.trim() || !selectedSale) return;
    const ok = window.confirm('This will WRITE an unlink to Firestore. Continue?');
    if (!ok) return;
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          action: 'unlink',
          dryRun: false
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Unlink failed (${resp.status})`);
      showNotice(`✅ Committed unlink for sale ${selectedSale.orderNumber || selectedSale.id}.`, 'success');
      await loadSales();
      await loadPurchases();
    } catch (e: any) {
      showNotice(`❌ Commit unlink failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [allowWrites, loadPurchases, loadSales, selectedSale, showNotice, userId]);


  const suggestPurchaseForSelectedSale = useCallback(() => {
    if (!selectedSale) {
      showNotice('⚠️ Select a sale first.', 'warning');
      return;
    }
    const styleId = String(selectedSale.styleId || '').trim();
    const size = normalizeSize(selectedSale.size);
    if (!styleId || !size) {
      showNotice('⚠️ Sale is missing styleId or size.', 'warning');
      return;
    }
    // Strict: only consider delivered purchases (actualDelivery), unlinked, matching styleId+size.
    const candidates = purchases.filter((p) => {
      const pStyle = String(p.styleId || p.style_id || p.product?.styleId || '').trim();
      const pSize = normalizeSize(p.size ?? p.extracted_size ?? p.product?.size);
      const delivered = Boolean(effectiveActualDelivery(p));
      const unlinked = !p.linkedSaleOrderNumber && !p.linkedSaleId;
      return delivered && unlinked && pStyle === styleId && pSize === size;
    });
    if (candidates.length === 0) {
      showNotice('ℹ️ No delivered/unlinked matching purchase found for this sale.', 'info');
      return;
    }
    candidates.sort((a, b) => {
      const aMs = Date.parse(String(effectiveActualDelivery(a) || '')) || Number.POSITIVE_INFINITY;
      const bMs = Date.parse(String(effectiveActualDelivery(b) || '')) || Number.POSITIVE_INFINITY;
      return aMs - bMs;
    });
    setSelectedPurchaseId(candidates[0].id);
    showNotice('✅ Suggested purchase selected (oldest delivered).', 'success');
  }, [effectiveActualDelivery, purchases, selectedSale, showNotice]);

  const saleDisplayProfit = useMemo(() => {
    if (!selectedSale) return null;
    // Profit definition: net payout - total paid
    return getProfitNetPayoutMinusPaid(selectedSale);
  }, [selectedSale]);

  const selectedPurchaseCost = useMemo(() => getPurchaseCost(selectedPurchase), [selectedPurchase]);

  const purchaseImage = useMemo(() => {
    if (!selectedPurchase) return '';
    return (
      String(selectedPurchase.productImageUrl || '') ||
      String(selectedPurchase.product?.image || '') ||
      ''
    );
  }, [selectedPurchase]);

  const purchaseName = useMemo(() => {
    if (!selectedPurchase) return '';
    return (
      String(selectedPurchase.product?.name || selectedPurchase.product?.productName || selectedPurchase.product?.title || '') ||
      'Purchase'
    );
  }, [selectedPurchase]);

  return (
    <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <NeonNotification
        isVisible={notification.isVisible}
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification((p) => ({ ...p, isVisible: false }))}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        <div className={`rounded-xl border p-6 ${isNeon ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h1 className="text-2xl font-bold">Purchase Linking (Test)</h1>
          <p className={`mt-2 ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
            Use this page to validate FIFO auto-linking and manually link a specific purchase to a specific sale.
          </p>
          <div className={`mt-4 rounded-lg p-4 ${isNeon ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className={`text-sm font-semibold ${isNeon ? 'text-yellow-200' : 'text-yellow-800'}`}>
              Test mode: previews are safe. Writes require explicit opt-in.
            </div>
            <label className={`mt-2 flex items-center gap-2 text-sm ${isNeon ? 'text-yellow-100' : 'text-yellow-800'}`}>
              <input
                type="checkbox"
                checked={allowWrites}
                onChange={(e) => setAllowWrites(e.target.checked)}
              />
              Allow writes (commit link/unlink to Firestore)
            </label>

            <div className={`mt-4 rounded-lg p-3 ${isNeon ? 'bg-white/5 border border-white/10' : 'bg-white border border-yellow-200'}`}>
              <div className={`text-sm font-semibold ${isNeon ? 'text-gray-100' : 'text-gray-800'}`}>
                FIFO testing helper
              </div>
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                If a purchase is missing <span className="font-semibold">actualDelivery</span>, simulate one (no DB writes) so FIFO can be tested end-to-end.
              </div>
              <label className={`mt-2 flex items-center gap-2 text-sm ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>
                <input
                  type="checkbox"
                  checked={simulateMissingDeliveries}
                  onChange={(e) => setSimulateMissingDeliveries(e.target.checked)}
                />
                Simulate missing deliveries with a deterministic “random” date in range
              </label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>From</div>
                  <input
                    type="date"
                    value={simFromYmd}
                    max={todayYmd}
                    onChange={(e) => setSimFromYmd(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${
                      isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>To</div>
                  <input
                    type="date"
                    value={simToYmd}
                    max={todayYmd}
                    onChange={(e) => setSimToYmd(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${
                      isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Default range: 2025-10-01 → today.
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col md:flex-row gap-3 items-start md:items-end">
            <div className="flex-1">
              <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>User ID</label>
              <input
                value={userId}
                onChange={(e) => setUserId(sanitizeUserId(e.target.value))}
                className={`w-full px-3 py-2 rounded-md border ${
                  isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
                placeholder="siteUserId or Firebase uid"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={detectUserIdFromServer}
                disabled={loadingSales || loadingPurchases}
                className={`px-4 py-2 rounded-md font-semibold ${
                  isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                } disabled:opacity-60`}
                title="Detect userId from cookies (useful on trycloudflare domains)"
              >
                Detect ID
              </button>
              <button
                onClick={loadSales}
                disabled={loadingSales}
                className={`px-4 py-2 rounded-md font-semibold ${
                  isNeon ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                } disabled:opacity-60`}
              >
                {loadingSales ? 'Loading sales…' : 'Reload sales'}
              </button>
              <button
                onClick={loadPurchases}
                disabled={loadingPurchases}
                className={`px-4 py-2 rounded-md font-semibold ${
                  isNeon ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                } disabled:opacity-60`}
              >
                {loadingPurchases ? 'Loading purchases…' : 'Reload purchases'}
              </button>
              <button
                onClick={runFifoDryRun}
                disabled={fifoLoading}
                className={`px-4 py-2 rounded-md font-semibold ${
                  isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-60`}
              >
                {fifoLoading ? 'Running…' : 'FIFO dry-run'}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <StockXSalesImport
              userId={userId.trim()}
              onImportComplete={async (success, salesCount) => {
                if (success) {
                  showNotice(`✅ Imported ${salesCount} StockX sales. Reloading…`, 'success');
                  await loadSales();
                } else {
                  showNotice('❌ StockX sales import failed. Check StockX auth/tokens and try again.', 'error');
                }
              }}
            />
          </div>

          {fifoSummary && (
            <div className={`mt-4 rounded-lg p-4 ${isNeon ? 'bg-gray-900/40 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="text-sm font-semibold">FIFO dry-run summary</div>
              <div className={`mt-1 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                scanned={fifoSummary.totalSalesScanned} • wouldLink={fifoSummary.wouldLink} • noMatch={fifoSummary.noMatch} • alreadyLinked={fifoSummary.alreadyLinked}
              </div>
            </div>
          )}
        </div>

        {/* Sales-led table */}
        <div className={`rounded-xl overflow-hidden ${
          isNeon
            ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border border-white/10 shadow-2xl'
            : 'bg-white border border-gray-200 shadow-lg'
        }`}>
          <div className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sales</h2>
            <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>{sales.length} loaded</div>
          </div>
          <div className="mt-3">
            <input
              value={saleSearch}
              onChange={(e) => setSaleSearch(e.target.value)}
              className={`w-full px-3 py-2 rounded-md border ${
                isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
              }`}
              placeholder="Search sales (order #, product, size, style)…"
            />
          </div>

          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead
                className={`${
                  isNeon
                    ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm'
                    : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
                } sticky top-0 z-10`}
              >
                <tr className="h-12">
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Hash className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Order #</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Box className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Product</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Ruler className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Size</span>
                    </div>
                  </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Sale</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <HandCoins className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Fees</span>
                    </div>
                  </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Total Paid</span>
                    </div>
                  </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Profit</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Link2 className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Linked</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Settings2 className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Actions</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className={isNeon ? 'text-gray-200' : 'text-gray-900'}>
                {filteredSales.slice(0, 50).map((s) => {
                  const netPayout = getNetPayout(s);
                  const totalPaid = getTotalPaid(s);
                  const profit = netPayout - totalPaid;
                  return (
                    <tr
                      key={s.id}
                      className={`${isNeon ? 'border-t border-gray-700' : 'border-t border-gray-200'}`}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">{(s.orderNumber || s.id).slice(0, 18)}</td>
                      <td className="py-2 pr-3 max-w-[280px] truncate">{s.product || '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{s.size || '—'}</td>
                      <td className="py-2 pr-3 text-right">{currency(s.salePrice)}</td>
                      <td className="py-2 pr-3 text-right">{currency(s.fees)}</td>
                      <td className="py-2 pr-3 text-right">{currency(totalPaid)}</td>
                      <td className="py-2 pr-3 text-right" title="Profit = net payout − total paid">
                        {currency(profit)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {s.linkedPurchaseOrderNumber || (s.linkedPurchaseId ? 'linked' : '—')}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => {
                            setSelectedSaleId(s.id);
                            setShowLinkModal(true);
                          }}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            isNeon
                              ? 'bg-gray-900 border border-white/20 text-cyan-400 hover:bg-gray-700 hover:border-cyan-500/50'
                              : 'bg-white border border-gray-300 text-blue-700 hover:bg-blue-50'
                          }`}
                        >
                          <Link2 className="w-4 h-4" />
                          Link purchase
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredSales.length > 50 && (
            <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-500'}`}>Showing first 50 matches</div>
          )}
        </div>

        {showLinkModal && selectedSale && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-5xl rounded-xl border overflow-hidden ${isNeon ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className={`p-4 border-b flex items-center justify-between ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                <div>
                  <div className="text-lg font-semibold">Link purchase to sale</div>
                  <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
                    Sale: {selectedSale.orderNumber || selectedSale.id} • {selectedSale.product || 'Unknown'} • Size {selectedSale.size || '—'}
                  </div>
                </div>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className={`p-2 rounded-lg ${isNeon ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">Select a purchase</div>
                  <button
                    onClick={suggestPurchaseForSelectedSale}
                    disabled={linking}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                      isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-60`}
                  >
                    Suggest FIFO purchase
                  </button>
                </div>

                <div className="overflow-x-auto max-h-[50vh] mb-4">
                  <table className="min-w-full text-sm">
                    <thead
                      className={`${
                        isNeon
                          ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm'
                          : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
                      } sticky top-0 z-10`}
                    >
                      <tr>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Hash className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Order #</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Box className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Product</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Ruler className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Size</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Unit</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Delivered</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Cost</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Link2 className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Linked</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className={isNeon ? 'text-gray-200' : 'text-gray-900'}>
                      {purchases.slice(0, 100).map((p) => {
                        const isSel = p.id === selectedPurchaseId;
                        const cost = getPurchaseCost(p);
                        const img = String(p.productImageUrl || '') || String(p.product?.image || '') || '';
                        const name = String(p.product?.name || p.product?.productName || p.product?.title || '') || 'Unknown Product';
                        const size = String(p.product?.size || p.size || p.extracted_size || '—');
                        return (
                          <tr
                            key={p.id}
                            className={`${isNeon ? 'border-t border-gray-700' : 'border-t border-gray-200'} ${
                              isSel ? (isNeon ? 'bg-cyan-500/10' : 'bg-blue-50') : ''
                            } cursor-pointer`}
                            onClick={() => setSelectedPurchaseId(p.id)}
                          >
                            <td className="py-2 pr-3 whitespace-nowrap">{(p.orderNumber || p.id).slice(0, 18)}</td>
                            <td className="py-2 pr-3 max-w-[280px] truncate">{name}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{size}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{p.unitNumber ? `#${p.unitNumber}` : '—'}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{(effectiveActualDelivery(p) || '').slice(0, 10) || '—'}</td>
                            <td className="py-2 pr-3 text-right">{currency(cost)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{p.linkedSaleOrderNumber || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedPurchase && (
                  <div className={`rounded-lg p-4 mb-4 ${isNeon ? 'bg-gray-800/60 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="text-sm font-semibold mb-2">Selected purchase</div>
                    <div className={`text-sm ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>
                      Order: {selectedPurchase.orderNumber || selectedPurchase.id} • Unit: {selectedPurchase.unitNumber || '—'}
                    </div>
                    <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      Delivered: {effectiveActualDelivery(selectedPurchase) || '—'} • Cost: {currency(getPurchaseCost(selectedPurchase))}
                    </div>
                    <div className="mt-3">
                      <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
                        Simulate actualDelivery (test only)
                      </label>
                      <input
                        type="date"
                        value={(effectiveActualDelivery(selectedPurchase) || '').slice(0, 10)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSimulatedDeliveryByPurchaseId((prev) => ({ ...prev, [selectedPurchase.id]: v }));
                        }}
                        className={`w-full px-3 py-2 rounded-md border ${
                          isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      />
                      <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                        This only affects matching on this test page (no DB writes).
                      </div>
                    </div>

                    {!effectiveActualDelivery(selectedPurchase) && (
                      <div className={`mt-2 text-sm ${isNeon ? 'text-yellow-200' : 'text-yellow-700'}`}>
                        No <span className="font-semibold">actualDelivery</span> yet → strict mode cannot auto-suggest.
                      </div>
                    )}
                  </div>
                )}

                <div className={`rounded-lg p-4 ${isNeon ? 'bg-gray-800/60 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                  <div className="text-sm font-semibold mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={previewLinkSelected}
                      disabled={linking || !selectedPurchase}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                      } disabled:opacity-50`}
                    >
                      {linking ? 'Working…' : 'Preview link'}
                    </button>
                    <button
                      onClick={commitLinkSelected}
                      disabled={linking || !allowWrites || !selectedPurchase}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-cyan-600 text-black hover:bg-cyan-500' : 'bg-blue-700 text-white hover:bg-blue-800'
                      } disabled:opacity-50`}
                      title={!allowWrites ? 'Enable Allow writes above' : 'Writes to Firestore'}
                    >
                      Commit link
                    </button>
                    <button
                      onClick={previewUnlinkSelectedSale}
                      disabled={linking}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/25' : 'bg-red-600 text-white hover:bg-red-700'
                      } disabled:opacity-60`}
                    >
                      {linking ? 'Working…' : 'Preview unlink'}
                    </button>
                    <button
                      onClick={commitUnlinkSelectedSale}
                      disabled={linking || !allowWrites}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-700 text-white hover:bg-red-800'
                      } disabled:opacity-50`}
                      title={!allowWrites ? 'Enable Allow writes above' : 'Writes to Firestore'}
                    >
                      Commit unlink
                    </button>
                  </div>
                  {!selectedPurchase && (
                    <div className={`mt-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      No purchase selected yet. Pick one above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {preview && (
          <div className={`rounded-xl border p-6 ${isNeon ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-lg font-semibold">Preview</h2>
            <div className={`mt-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              This is a dry-run response. No writes were performed.
            </div>
            <pre className={`mt-4 text-xs overflow-x-auto p-4 rounded-lg ${isNeon ? 'bg-gray-900/60 border border-gray-700 text-gray-200' : 'bg-gray-50 border border-gray-200 text-gray-800'}`}>
{JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}

        {fifoRows.length > 0 && (
          <div className={`rounded-xl border p-6 ${isNeon ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-lg font-semibold">FIFO dry-run results (sample)</h2>
            <div className={`mt-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Strict mode: FIFO only considers purchases with <span className="font-semibold">actualDelivery</span>.
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={isNeon ? 'text-gray-300' : 'text-gray-700'}>
                    <th className="text-left py-2 pr-4">Sale Order</th>
                    <th className="text-left py-2 pr-4">Product</th>
                    <th className="text-left py-2 pr-4">Size</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">Method</th>
                    <th className="text-left py-2 pr-4">Purchase Order</th>
                    <th className="text-left py-2 pr-4">Delivered</th>
                  </tr>
                </thead>
                <tbody className={isNeon ? 'text-gray-200' : 'text-gray-900'}>
                  {fifoRows.slice(0, 50).map((r, idx) => (
                    <tr key={idx} className={isNeon ? 'border-t border-gray-700' : 'border-t border-gray-200'}>
                      <td className="py-2 pr-4">{r.saleOrderNumber || '—'}</td>
                      <td className="py-2 pr-4">{r.saleProduct || '—'}</td>
                      <td className="py-2 pr-4">{r.saleSize || '—'}</td>
                      <td className="py-2 pr-4">{r.status}</td>
                      <td className="py-2 pr-4">{r.method || '—'}</td>
                      <td className="py-2 pr-4">{r.linkedPurchaseOrderNumber || '—'}</td>
                      <td className="py-2 pr-4">{r.purchaseActualDelivery || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


