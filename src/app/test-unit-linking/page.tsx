'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import NeonNotification, { type NotificationType } from '@/components/NeonNotification';

type ListingRow = {
  listingId: string;
  productName: string;
  styleId?: string;
  size: string;
  productId?: string;
  variantId?: string;
};

type AvailableUnit = {
  purchaseId: string;
  unitNumber: number;
  orderNumber: string | null;
  purchaseDate: string | null;
  totalAmount: number | null;
  productName: string | null;
};

function normalizeSize(size: unknown): string {
  return String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export default function TestUnitLinkingPage() {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const isNeon = currentTheme.name === 'Neon';

  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const [loadingListings, setLoadingListings] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);

  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const selectedListing = useMemo(
    () => listings.find((l) => l.listingId === selectedListingId) || null,
    [listings, selectedListingId]
  );

  const [loadingUnits, setLoadingUnits] = useState(false);
  const [units, setUnits] = useState<AvailableUnit[]>([]);
  const [selectedUnitNumber, setSelectedUnitNumber] = useState<string>('');

  const [assigning, setAssigning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<
    | null
    | {
        ok: boolean;
        message: string;
        details?: any;
      }
  >(null);

  const resolveUserId = useCallback((): string | null => {
    const siteUserId = typeof window !== 'undefined' ? localStorage.getItem('siteUserId') : null;
    return user?.uid || siteUserId || null;
  }, [user?.uid]);

  const showNotice = useCallback((message: string, type: NotificationType | 'info') => {
    // NeonNotification currently supports success/error/warning.
    // Treat 'info' as 'success' (neutral-positive) for now.
    const normalizedType: NotificationType =
      type === 'info' ? 'success' : type;
    setNotification({ isVisible: true, message, type: normalizedType });
  }, []);

  const loadListings = useCallback(async () => {
    setLoadingListings(true);
    setListingsError(null);
    try {
      const resp = await fetch('/api/stockx/listings?force=1', { cache: 'no-store' });
      const contentType = resp.headers.get('content-type') || '';
      const text = await resp.text();

      if (!contentType.includes('application/json')) {
        throw new Error(`Non-JSON response (content-type=${contentType}). Are you authenticated with StockX?`);
      }

      const json = JSON.parse(text);
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.error || `Failed to load listings (${resp.status})`);
      }

      const rows: ListingRow[] = Array.isArray(json?.listings)
        ? json.listings.map((l: any) => ({
            listingId: String(l.listingId),
            productName: String(l.productName || 'Unknown'),
            styleId: l.styleId ? String(l.styleId) : undefined,
            size: String(l.size || ''),
            productId: l.productId ? String(l.productId) : undefined,
            variantId: l.variantId ? String(l.variantId) : undefined
          }))
        : [];

      setListings(rows);
      if (!selectedListingId && rows.length > 0) {
        setSelectedListingId(rows[0].listingId);
      }
    } catch (e: any) {
      setListingsError(e?.message || 'Failed to load listings');
      showNotice(`❌ Listings load failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingListings(false);
    }
  }, [selectedListingId, showNotice]);

  const loadAvailableUnits = useCallback(async () => {
    const u = resolveUserId();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    if (!selectedListing?.styleId || !selectedListing?.size) {
      showNotice('⚠️ Selected listing is missing styleId or size.', 'warning');
      return;
    }

    setLoadingUnits(true);
    setUnits([]);
    setSelectedUnitNumber('');
    try {
      const qs = new URLSearchParams({
        userId: u,
        styleId: selectedListing.styleId,
        size: selectedListing.size,
        debug: '1'
      });
      const resp = await fetch(`/api/purchases/available-units?${qs.toString()}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.error || `Failed (${resp.status})`);
      }
      const found: AvailableUnit[] = Array.isArray(json?.units)
        ? json.units.map((x: any) => ({
            purchaseId: String(x.purchaseId),
            unitNumber: Number(x.unitNumber),
            orderNumber: x.orderNumber ? String(x.orderNumber) : null,
            purchaseDate: x.purchaseDate ? String(x.purchaseDate) : null,
            totalAmount: typeof x.totalAmount === 'number' ? x.totalAmount : null,
            productName: x.productName ? String(x.productName) : null
          }))
        : [];

      setUnits(found);
      if (found.length === 0) {
        const dbg = json?.debug;
        showNotice(
          dbg
            ? `ℹ️ No units found. Debug: total=${dbg.total} withUnit=${dbg.withUnitNumber} unsold=${dbg.unsold} unassigned=${dbg.unassigned} styleMatched=${dbg.styleMatched} sizeMatched=${dbg.sizeMatched}`
            : 'ℹ️ No available units found. Add Unit # on purchases first.',
          'info'
        );
      } else {
        showNotice(`✅ Found ${found.length} available unit(s).`, 'success');
      }
    } catch (e: any) {
      showNotice(`❌ Failed to load units: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingUnits(false);
    }
  }, [resolveUserId, selectedListing?.size, selectedListing?.styleId, showNotice]);

  const assign = useCallback(async () => {
    const u = resolveUserId();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    if (!selectedListing) {
      showNotice('⚠️ Select a listing first.', 'warning');
      return;
    }

    const unitNum = Number(selectedUnitNumber);
    if (!Number.isFinite(unitNum) || Math.floor(unitNum) !== unitNum || unitNum < 1 || unitNum > 999) {
      showNotice('⚠️ Pick a valid Unit # (1–999).', 'warning');
      return;
    }

    setAssigning(true);
    setVerifyResult(null);
    try {
      const resp = await fetch('/api/stockx/listings/assign-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: u,
          listingId: selectedListing.listingId,
          unitNumber: unitNum
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.details || json?.error || `Assign failed (${resp.status})`);
      }
      showNotice(`✅ Assigned Unit #${unitNum} to listing`, 'success');
    } catch (e: any) {
      showNotice(`❌ Assign failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setAssigning(false);
    }
  }, [resolveUserId, selectedListing, selectedUnitNumber, showNotice]);

  const clearAssignment = useCallback(async () => {
    const u = resolveUserId();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    if (!selectedListing) {
      showNotice('⚠️ Select a listing first.', 'warning');
      return;
    }
    setAssigning(true);
    setVerifyResult(null);
    try {
      const resp = await fetch('/api/stockx/listings/assign-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: u,
          listingId: selectedListing.listingId,
          unitNumber: null
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.details || json?.error || `Clear failed (${resp.status})`);
      }
      showNotice('✅ Cleared assignment for listing', 'success');
    } catch (e: any) {
      showNotice(`❌ Clear failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setAssigning(false);
    }
  }, [resolveUserId, selectedListing, showNotice]);

  const verify = useCallback(async () => {
    const u = resolveUserId();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    if (!selectedListing) {
      showNotice('⚠️ Select a listing first.', 'warning');
      return;
    }
    const unitNum = Number(selectedUnitNumber);
    if (!Number.isFinite(unitNum) || unitNum < 1 || unitNum > 999) {
      showNotice('⚠️ Pick a Unit # first.', 'warning');
      return;
    }

    setVerifying(true);
    setVerifyResult(null);
    try {
      const resp = await fetch(`/api/purchases/list?userId=${encodeURIComponent(u)}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || `Failed to list purchases (${resp.status})`);

      const purchases: any[] = Array.isArray(json?.purchases) ? json.purchases : [];
      const match = purchases.find((p: any) => Number(p?.unitNumber) === unitNum);

      if (!match) {
        setVerifyResult({
          ok: false,
          message: `No purchase found with Unit #${unitNum}`,
          details: { unitNumber: unitNum }
        });
        return;
      }

      const linkedListingId = String(match?.stockxListingId || '');
      const ok = linkedListingId === selectedListing.listingId;
      setVerifyResult({
        ok,
        message: ok
          ? `PASS: Unit #${unitNum} is linked to listingId ${selectedListing.listingId}`
          : `FAIL: Unit #${unitNum} is linked to listingId ${linkedListingId || '(none)'}, expected ${selectedListing.listingId}`,
        details: {
          purchaseId: match?.id,
          unitNumber: match?.unitNumber,
          orderNumber: match?.orderNumber,
          stockxListingId: match?.stockxListingId || null
        }
      });
    } catch (e: any) {
      setVerifyResult({
        ok: false,
        message: `Verify error: ${e?.message || 'Unknown error'}`
      });
    } finally {
      setVerifying(false);
    }
  }, [resolveUserId, selectedListing, selectedUnitNumber, showNotice]);

  useEffect(() => {
    loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reset unit picker when changing listing
    setUnits([]);
    setSelectedUnitNumber('');
    setVerifyResult(null);
  }, [selectedListingId]);

  return (
    <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <NeonNotification
        isVisible={notification.isVisible}
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification((p) => ({ ...p, isVisible: false }))}
      />

      <div className={`max-w-5xl mx-auto rounded-2xl border p-6 ${isNeon ? 'bg-gray-900/60 border-white/10' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Test: Unit ↔ Listing Linking</h1>
            <p className={`text-sm mt-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              This page tests the “5 identical items” workflow: find available Unit #s for a listing (styleId+size), assign one, and verify.
            </p>
          </div>
          <button
            onClick={loadListings}
            disabled={loadingListings}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              isNeon
                ? 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-200'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-800'
            } disabled:opacity-60`}
          >
            {loadingListings ? 'Loading…' : 'Reload listings'}
          </button>
        </div>

        {listingsError ? (
          <div className={`mt-4 rounded-lg border p-3 text-sm ${isNeon ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {listingsError}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`rounded-xl border p-4 ${isNeon ? 'border-white/10 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>
            <div className="text-sm font-semibold">A) Select listing</div>
            <div className={`text-xs mt-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Loaded: {listings.length} listings
            </div>

            <select
              value={selectedListingId}
              onChange={(e) => setSelectedListingId(e.target.value)}
              className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm ${
                isNeon
                  ? 'bg-gray-800 border-white/10 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              {listings.map((l) => (
                <option key={l.listingId} value={l.listingId}>
                  {l.productName} • {l.size} • {l.styleId || 'no-styleId'}
                </option>
              ))}
            </select>

            {selectedListing ? (
              <div className={`mt-3 text-xs ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                <div><span className="font-semibold">listingId</span>: {selectedListing.listingId}</div>
                <div><span className="font-semibold">styleId</span>: {selectedListing.styleId || '—'}</div>
                <div><span className="font-semibold">size</span>: {selectedListing.size}</div>
                <div><span className="font-semibold">normalized size</span>: {normalizeSize(selectedListing.size)}</div>
              </div>
            ) : null}
          </div>

          <div className={`rounded-xl border p-4 ${isNeon ? 'border-white/10 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>
            <div className="text-sm font-semibold">B) Find available Unit #s</div>
            <div className={`text-xs mt-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Only shows purchases that match styleId+size, have Unit #, are unsold, and are unassigned.
            </div>

            <button
              onClick={loadAvailableUnits}
              disabled={loadingUnits || !selectedListing}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isNeon
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-60`}
            >
              {loadingUnits ? 'Finding…' : 'Find available units'}
            </button>

            <div className="mt-3">
              <label className={`block text-xs font-semibold mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                Pick Unit #
              </label>
              <select
                value={selectedUnitNumber}
                onChange={(e) => setSelectedUnitNumber(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${
                  isNeon
                    ? 'bg-gray-800 border-white/10 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="">Pick…</option>
                {units.map((u) => (
                  <option key={u.unitNumber} value={String(u.unitNumber)}>
                    #{u.unitNumber}{u.orderNumber ? ` • ${u.orderNumber}` : ''}{u.totalAmount ? ` • $${u.totalAmount}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {units.length > 0 ? (
              <div className={`mt-3 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Found {units.length} unit(s).
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`rounded-xl border p-4 ${isNeon ? 'border-white/10 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>
            <div className="text-sm font-semibold">C) Assign / Clear</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={assign}
                disabled={assigning || !selectedListing || !selectedUnitNumber}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isNeon
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                } disabled:opacity-60`}
              >
                {assigning ? 'Assigning…' : 'Assign'}
              </button>
              <button
                onClick={clearAssignment}
                disabled={assigning || !selectedListing}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  isNeon
                    ? 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10'
                    : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                } disabled:opacity-60`}
              >
                {assigning ? 'Working…' : 'Clear assignment'}
              </button>
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${isNeon ? 'border-white/10 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>
            <div className="text-sm font-semibold">D) Verify</div>
            <div className={`text-xs mt-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Checks purchases for the selected Unit # and verifies it has `stockxListingId = listingId`.
            </div>

            <button
              onClick={verify}
              disabled={verifying || !selectedListing || !selectedUnitNumber}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isNeon
                  ? 'bg-blue-500/20 border border-blue-500/40 text-blue-200 hover:bg-blue-500/30'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-60`}
            >
              {verifying ? 'Verifying…' : 'Verify mapping'}
            </button>

            {verifyResult ? (
              <div
                className={`mt-3 rounded-lg border p-3 text-sm ${
                  verifyResult.ok
                    ? isNeon
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : isNeon
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <div className="font-semibold">{verifyResult.ok ? 'PASS' : 'FAIL'}</div>
                <div className="mt-1">{verifyResult.message}</div>
                {verifyResult.details ? (
                  <pre className={`mt-2 text-xs overflow-auto p-2 rounded ${isNeon ? 'bg-black/30' : 'bg-white/70'}`}>
{JSON.stringify(verifyResult.details, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={`mt-6 text-xs ${isNeon ? 'text-gray-500' : 'text-gray-500'}`}>
          Tip: For “5 identical items”, repeat per listing: Find → Pick Unit # → Assign → Verify.
        </div>
      </div>
    </div>
  );
}


