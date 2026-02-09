'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  CheckCircle,
  Clipboard,
  ExternalLink,
  Loader2,
  Package,
  QrCode,
  Search,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import NativeBarcodeScanner from './NativeBarcodeScanner';

type AuthStatus = 'unknown' | 'pass' | 'fail';
type ScannerMode = 'tracking' | 'authQr' | 'stockxQr';

function cleanTrackingLikeInput(raw: string): string {
  return String(raw || '').trim().replace(/[\s\-_]+/g, '');
}

function isProbablyUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatUsdFromNumber(n: unknown): string | null {
  const num = typeof n === 'number' ? n : Number.NaN;
  if (!Number.isFinite(num)) return null;
  return `$${num.toFixed(2)}`;
}

export default function ReceivingDashboard() {
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  const userId = useMemo(() => {
    if (user?.uid) return user.uid;
    if (typeof window === 'undefined') return '';
    return (localStorage.getItem('siteUserId') || localStorage.getItem('userId') || '').trim();
  }, [user?.uid]);

  const [trackingInput, setTrackingInput] = useState('');
  const [trackingEntryMethod, setTrackingEntryMethod] = useState<'scan' | 'manual'>('manual');
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error'>('idle');
  const [lookupError, setLookupError] = useState<string>('');
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  const selected = useMemo(() => matches.find((m) => m?.id === selectedId) || matches[0] || null, [matches, selectedId]);

  const [receivedNotes, setReceivedNotes] = useState('');
  const [markState, setMarkState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [alsoMarkDelivered, setAlsoMarkDelivered] = useState(true);

  const [authSelfStatus, setAuthSelfStatus] = useState<AuthStatus>('unknown');
  const [authSelfNotes, setAuthSelfNotes] = useState('');

  const [externalProvider, setExternalProvider] = useState<'SertaLogo' | 'DenimTears' | 'Other'>('Other');
  const [externalUrl, setExternalUrl] = useState('');
  const [externalStatus, setExternalStatus] = useState<AuthStatus>('unknown');

  const [stockxQrRaw, setStockxQrRaw] = useState('');

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string>('');

  const [scannerMode, setScannerMode] = useState<ScannerMode>('tracking');
  const [showNativeScanner, setShowNativeScanner] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus for Bluetooth scanners (keyboard-wedge)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // When selection changes, hydrate form fields from the selected purchase (best-effort)
  useEffect(() => {
    if (!selected) return;

    const nextAuthSelf: any = selected?.authSelf || selected?.auth?.self || null;
    const nextAuthExternal: any = selected?.authExternal || selected?.auth?.external || null;
    const nextStockx: any = selected?.stockx || null;

    setAuthSelfStatus((nextAuthSelf?.status as AuthStatus) || 'unknown');
    setAuthSelfNotes(String(nextAuthSelf?.notes || ''));

    setExternalProvider((nextAuthExternal?.provider as any) || 'Other');
    setExternalUrl(String(nextAuthExternal?.url || ''));
    setExternalStatus((nextAuthExternal?.status as AuthStatus) || 'unknown');

    setStockxQrRaw(String(nextStockx?.unitQrRaw || selected?.stockxUnitQrRaw || ''));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const doLookup = async (rawTracking?: string) => {
    const trackingNumber = cleanTrackingLikeInput(rawTracking ?? trackingInput);
    if (!trackingNumber) return;

    // Normalize what we display in the input.
    setTrackingInput(trackingNumber);

    if (!userId) {
      setLookupState('error');
      setLookupError('Missing user session. Please sign in first.');
      return;
    }

    setLookupState('loading');
    setLookupError('');
    setMatches([]);
    setSelectedId('');
    setSaveState('idle');
    setSaveError('');

    try {
      const res = await fetch(`/api/purchases/by-tracking?trackingNumber=${encodeURIComponent(trackingNumber)}`, {
        headers: {
          'x-user-id': userId,
        },
        cache: 'no-store',
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        if (res.status === 404) {
          setLookupState('not_found');
          setLookupError(data?.error || 'No purchase found for this tracking number.');
          return;
        }
        throw new Error(data?.error || `Lookup failed (${res.status})`);
      }

      const nextMatches = Array.isArray(data?.matches) ? data.matches : data?.match ? [data.match] : [];
      setMatches(nextMatches);
      setSelectedId(nextMatches[0]?.id || '');
      setLookupState('found');
    } catch (e: any) {
      setLookupState('error');
      setLookupError(e?.message || 'Lookup failed.');
    }
  };

  const markReceived = async (mode: 'scan' | 'manual') => {
    const trackingNumber = cleanTrackingLikeInput(trackingInput || selected?.trackingNumber || '');
    if (!trackingNumber || !userId) return;

    setMarkState('saving');
    try {
      const res = await fetch('/api/purchases/mark-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          trackingNumber,
          receivedMethod: mode,
          receivedNotes: receivedNotes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed (${res.status})`);
      }

      if (alsoMarkDelivered && selected?.id) {
        await fetch('/api/purchases/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            purchaseId: selected.id,
            updates: {
              status: 'delivered',
              deliveryStatus: 'delivered',
              deliveredAt: new Date().toISOString(),
              actualDelivery: new Date().toISOString(),
            },
          }),
        });
      }

      setMarkState('idle');
      await doLookup(trackingNumber);
    } catch (e: any) {
      setMarkState('error');
      setTimeout(() => setMarkState('idle'), 2000);
      alert(`Failed to mark received: ${e?.message || 'Unknown error'}`);
    }
  };

  const unmarkReceived = async () => {
    const trackingNumber = cleanTrackingLikeInput(trackingInput || selected?.trackingNumber || '');
    if (!trackingNumber || !userId) return;

    setMarkState('saving');
    try {
      const res = await fetch('/api/purchases/unmark-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ trackingNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (${res.status})`);

      setMarkState('idle');
      await doLookup(trackingNumber);
    } catch (e: any) {
      setMarkState('error');
      setTimeout(() => setMarkState('idle'), 2000);
      alert(`Failed to undo received: ${e?.message || 'Unknown error'}`);
    }
  };

  const saveVerificationAndStockx = async () => {
    if (!selected?.id || !userId) return;
    setSaveState('saving');
    setSaveError('');

    const nowIso = new Date().toISOString();

    const updates: any = {};
    updates.authSelf = {
      status: authSelfStatus,
      notes: authSelfNotes.trim() || '',
      authenticatedAt: nowIso,
      authenticatedBy: userId,
    };

    if (externalUrl.trim()) {
      updates.authExternal = {
        provider: externalProvider,
        url: externalUrl.trim(),
        status: externalStatus,
        verifiedAt: nowIso,
        verifiedBy: userId,
      };
    } else {
      // Keep it simple: if no URL, don't write authExternal at all.
    }

    if (stockxQrRaw.trim()) {
      updates.stockx = {
        ...(selected?.stockx || {}),
        unitQrRaw: stockxQrRaw.trim(),
        unitQrScannedAt: nowIso,
        unitQrScannedBy: userId,
      };
    }

    try {
      const res = await fetch('/api/purchases/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          purchaseId: selected.id,
          updates,
          // We are not updating tracking here; skip duplicate/invalid checks implicitly.
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.details || data?.error || `Save failed (${res.status})`);

      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
      await doLookup(selected?.trackingNumber || trackingInput);
    } catch (e: any) {
      setSaveState('error');
      setSaveError(e?.message || 'Failed to save.');
    }
  };

  const handleNativeBarcodeScanned = (value: string) => {
    const scanned = String(value || '').trim();
    setShowNativeScanner(false);

    if (!scanned) return;

    if (scannerMode === 'tracking') {
      // Some QR codes might scan as URLs; for tracking we prefer a non-URL payload.
      if (isProbablyUrl(scanned)) {
        alert('That looks like a QR URL. Switch scanner mode to Auth QR or StockX QR.');
        return;
      }
      setTrackingEntryMethod('scan');
      setTrackingInput(cleanTrackingLikeInput(scanned));
      doLookup(scanned);
      return;
    }

    if (scannerMode === 'authQr') {
      setExternalUrl(scanned);
      if (isProbablyUrl(scanned)) {
        try {
          window.open(scanned, '_blank', 'noopener,noreferrer');
        } catch {
          // ignore
        }
      }
      return;
    }

    if (scannerMode === 'stockxQr') {
      setStockxQrRaw(scanned);
      return;
    }
  };

  const canUseNativeScanner = Capacitor.isNativePlatform();

  const headerHelp =
    'Tip: with a Bluetooth scanner, tap the tracking field once, then just scan. It should type the 12-digit FedEx number and hit Enter automatically.';

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} p-4 sm:p-6`}>
      <div className="max-w-3xl mx-auto">
        <div className={`${currentTheme.colors.cardBackground} border ${currentTheme.colors.border} rounded-2xl p-5 sm:p-6`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
                    : 'bg-gradient-to-br from-blue-600 to-purple-600'
                }`}>
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className={`text-xl sm:text-2xl font-semibold ${currentTheme.colors.textPrimary}`}>Receiving</h1>
                  <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{headerHelp}</p>
                </div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className={`text-xs px-3 py-1.5 rounded-full border ${currentTheme.colors.border} ${currentTheme.colors.textSecondary}`}>
                {canUseNativeScanner ? 'Native scanner available' : 'Web mode'}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>Tracking number</label>
                <input
                  ref={inputRef}
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  onInput={() => setTrackingEntryMethod('manual')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') doLookup();
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="FedEx usually 12 digits"
                  className={`w-full px-4 py-3 rounded-xl border ${currentTheme.colors.border} ${
                    currentTheme.name === 'Neon'
                      ? 'bg-black/20 text-white placeholder:text-gray-400'
                      : 'bg-white text-gray-900 placeholder:text-gray-500'
                  } font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30`}
                />
              </div>
              <button
                onClick={() => doLookup()}
                disabled={!trackingInput.trim() || lookupState === 'loading'}
                className={`px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                  lookupState === 'loading'
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : `${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white`
                }`}
              >
                {lookupState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Lookup
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className={`text-xs ${currentTheme.colors.textSecondary} mr-2 flex items-center gap-2`}>
                <Smartphone className="w-4 h-4" />
                Scan mode:
              </div>
              {([
                { key: 'tracking', label: 'Tracking', icon: <Package className="w-4 h-4" /> },
                { key: 'authQr', label: 'Auth QR', icon: <ShieldCheck className="w-4 h-4" /> },
                { key: 'stockxQr', label: 'StockX QR', icon: <QrCode className="w-4 h-4" /> },
              ] as const).map((m) => (
                <button
                  key={m.key}
                  onClick={() => setScannerMode(m.key)}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors ${
                    scannerMode === m.key
                      ? currentTheme.name === 'Neon'
                        ? 'bg-white/10 border-cyan-500/40 text-white'
                        : 'bg-gray-900 text-white border-gray-900'
                      : `${currentTheme.colors.border} ${currentTheme.colors.textSecondary} hover:bg-white/5`
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}

              <div className="flex-1" />

              <button
                onClick={() => {
                  if (!canUseNativeScanner) {
                    alert('Camera scanning is best inside the iOS app build. In web mode, use your Bluetooth scanner or manual entry.');
                    return;
                  }
                  setShowNativeScanner(true);
                }}
                className={`px-3 py-2 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                  canUseNativeScanner
                    ? currentTheme.name === 'Neon'
                      ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                      : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
                    : 'bg-gray-200 border-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!canUseNativeScanner}
              >
                <QrCode className="w-4 h-4" />
                Scan with camera
              </button>
            </div>

            {(lookupState === 'not_found' || lookupState === 'error') && (
              <div className={`mt-2 rounded-xl border p-4 ${
                lookupState === 'not_found'
                  ? currentTheme.name === 'Neon'
                    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
                    : 'border-yellow-200 bg-yellow-50 text-yellow-900'
                  : currentTheme.name === 'Neon'
                    ? 'border-red-500/30 bg-red-500/10 text-red-200'
                    : 'border-red-200 bg-red-50 text-red-900'
              }`}>
                <div className="text-sm font-medium">Lookup issue</div>
                <div className="text-sm opacity-90 mt-1">{lookupError || 'No details.'}</div>
              </div>
            )}
          </div>
        </div>

        {lookupState === 'found' && selected && (
          <div className={`mt-4 ${currentTheme.colors.cardBackground} border ${currentTheme.colors.border} rounded-2xl p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} truncate`}>
                    {selected?.product?.name || 'Unknown item'}
                  </div>
                  {selected?.received ? (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      currentTheme.name === 'Neon' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-green-100 text-green-800'
                    }`}>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Received
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      currentTheme.name === 'Neon' ? 'bg-white/10 text-gray-200' : 'bg-gray-100 text-gray-700'
                    }`}>
                      <Package className="w-3.5 h-3.5" />
                      Not received
                    </span>
                  )}
                </div>

                <div className={`mt-1 text-sm ${currentTheme.colors.textSecondary} flex flex-wrap gap-x-3 gap-y-1`}>
                  <span className="font-mono">{selected?.trackingNumber || trackingInput}</span>
                  {selected?.carrier ? <span>{selected.carrier}</span> : null}
                  {selected?.product?.brand ? <span>{selected.product.brand}</span> : null}
                  {selected?.product?.size ? <span>Size {selected.product.size}</span> : null}
                  {selected?.pricing?.display ? <span>Paid {selected.pricing.display}</span> : null}
                </div>

                <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary}`}>
                  <span className="mr-3">Status: <span className="font-medium">{selected?.shippingStatus || 'unknown'}</span></span>
                  {selected?.deliveredAt ? (
                    <span>Delivered: <span className="font-medium">{new Date(selected.deliveredAt).toLocaleString()}</span></span>
                  ) : null}
                  {selected?.receivedAt ? (
                    <span className="ml-3">Received: <span className="font-medium">{new Date(selected.receivedAt).toLocaleString()}</span></span>
                  ) : null}
                </div>
              </div>

              {matches.length > 1 && (
                <div className="w-44">
                  <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>Multiple matches</label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                      currentTheme.name === 'Neon' ? 'bg-black/20 text-white' : 'bg-white text-gray-900'
                    } text-sm`}
                  >
                    {matches.map((m, idx) => (
                      <option key={m.id} value={m.id}>
                        {idx + 1}. {m?.product?.name ? String(m.product.name).slice(0, 24) : 'Purchase'}…
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>Receiving notes (optional)</label>
                <input
                  value={receivedNotes}
                  onChange={(e) => setReceivedNotes(e.target.value)}
                  placeholder="e.g. box damage, missing tag, etc."
                  className={`w-full px-4 py-3 rounded-xl border ${currentTheme.colors.border} ${
                    currentTheme.name === 'Neon' ? 'bg-black/20 text-white placeholder:text-gray-400' : 'bg-white text-gray-900'
                  } text-sm`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className={`flex items-center gap-2 text-sm ${currentTheme.colors.textSecondary}`}>
                  <input
                    type="checkbox"
                    checked={alsoMarkDelivered}
                    onChange={(e) => setAlsoMarkDelivered(e.target.checked)}
                    className="rounded"
                  />
                  Also mark shipping status as delivered
                </label>

                <div className="flex-1" />

                {!selected?.received ? (
                  <button
                    onClick={() => markReceived(trackingEntryMethod)}
                    disabled={markState === 'saving'}
                    className={`px-4 py-3 rounded-xl font-semibold text-white flex items-center gap-2 ${
                      markState === 'saving'
                        ? 'bg-gray-400 cursor-not-allowed'
                        : currentTheme.name === 'Neon'
                          ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600'
                          : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {markState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Mark received
                  </button>
                ) : (
                  <button
                    onClick={unmarkReceived}
                    disabled={markState === 'saving'}
                    className={`px-4 py-3 rounded-xl font-semibold flex items-center gap-2 border ${currentTheme.colors.border} ${
                      currentTheme.name === 'Neon' ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {markState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                    Undo received
                  </button>
                )}

                <button
                  onClick={async () => {
                    const text = cleanTrackingLikeInput(selected?.trackingNumber || trackingInput);
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {
                      // ignore
                    }
                  }}
                  className={`px-4 py-3 rounded-xl font-semibold flex items-center gap-2 border ${currentTheme.colors.border} ${
                    currentTheme.name === 'Neon' ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Clipboard className="w-4 h-4" />
                  Copy tracking
                </button>
              </div>
            </div>

            <div className={`mt-6 pt-6 border-t ${currentTheme.colors.border}`}>
              <h2 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Authentication + StockX unit</h2>
              <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                Record your own authentication, plus scan/store the unique StockX unit QR (and optionally the brand authenticity QR URL).
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className={`rounded-2xl border ${currentTheme.colors.border} p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div className={`font-semibold ${currentTheme.colors.textPrimary}`}>Your authentication</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>Status</label>
                      <select
                        value={authSelfStatus}
                        onChange={(e) => setAuthSelfStatus(e.target.value as AuthStatus)}
                        className={`w-full px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                          currentTheme.name === 'Neon' ? 'bg-black/20 text-white' : 'bg-white text-gray-900'
                        } text-sm`}
                      >
                        <option value="unknown">Unknown</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>Notes</label>
                      <input
                        value={authSelfNotes}
                        onChange={(e) => setAuthSelfNotes(e.target.value)}
                        placeholder="e.g. stitching, tags, wash label, etc."
                        className={`w-full px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                          currentTheme.name === 'Neon' ? 'bg-black/20 text-white placeholder:text-gray-400' : 'bg-white text-gray-900'
                        } text-sm`}
                      />
                    </div>
                  </div>
                </div>

                <div className={`rounded-2xl border ${currentTheme.colors.border} p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <ExternalLink className="w-5 h-5 text-cyan-400" />
                    <div className={`font-semibold ${currentTheme.colors.textPrimary}`}>Brand QR verification (optional)</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>Provider</label>
                      <select
                        value={externalProvider}
                        onChange={(e) => setExternalProvider(e.target.value as any)}
                        className={`w-full px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                          currentTheme.name === 'Neon' ? 'bg-black/20 text-white' : 'bg-white text-gray-900'
                        } text-sm`}
                      >
                        <option value="Other">Other</option>
                        <option value="SertaLogo">SertaLogo (Fear of God)</option>
                        <option value="DenimTears">Denim Tears</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>URL / QR payload</label>
                      <input
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        placeholder="Scan QR or paste URL"
                        className={`w-full px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                          currentTheme.name === 'Neon' ? 'bg-black/20 text-white placeholder:text-gray-400' : 'bg-white text-gray-900'
                        } text-sm font-mono`}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>Result</label>
                      <select
                        value={externalStatus}
                        onChange={(e) => setExternalStatus(e.target.value as AuthStatus)}
                        className={`w-full px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                          currentTheme.name === 'Neon' ? 'bg-black/20 text-white' : 'bg-white text-gray-900'
                        } text-sm`}
                      >
                        <option value="unknown">Unknown</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        if (!externalUrl.trim()) return;
                        if (!isProbablyUrl(externalUrl.trim())) {
                          alert('This does not look like a URL. If it is a QR payload, keep it for notes, or paste the URL instead.');
                          return;
                        }
                        window.open(externalUrl.trim(), '_blank', 'noopener,noreferrer');
                      }}
                      className={`px-3 py-2 rounded-xl font-semibold flex items-center gap-2 border ${currentTheme.colors.border} ${
                        currentTheme.name === 'Neon' ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </button>
                  </div>
                </div>

                <div className={`rounded-2xl border ${currentTheme.colors.border} p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <QrCode className="w-5 h-5 text-purple-400" />
                    <div className={`font-semibold ${currentTheme.colors.textPrimary}`}>StockX unit QR</div>
                  </div>

                  <label className={`block text-xs font-medium ${currentTheme.colors.textSecondary} mb-1`}>QR payload</label>
                  <div className="flex gap-2">
                    <input
                      value={stockxQrRaw}
                      onChange={(e) => setStockxQrRaw(e.target.value)}
                      placeholder="Scan StockX QR code and store the raw payload"
                      className={`flex-1 min-w-0 px-3 py-2 rounded-xl border ${currentTheme.colors.border} ${
                        currentTheme.name === 'Neon' ? 'bg-black/20 text-white placeholder:text-gray-400' : 'bg-white text-gray-900'
                      } text-sm font-mono`}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!stockxQrRaw.trim()) return;
                        try {
                          await navigator.clipboard.writeText(stockxQrRaw.trim());
                          // optional: toast or brief "Copied" state
                        } catch {
                          // ignore
                        }
                      }}
                      disabled={!stockxQrRaw.trim()}
                      className={`shrink-0 px-3 py-2 rounded-xl border ${currentTheme.colors.border} flex items-center gap-1.5 font-medium text-sm ${
                        currentTheme.name === 'Neon'
                          ? 'bg-white/10 text-cyan-300 hover:bg-white/20 disabled:opacity-50'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                      }`}
                      title="Copy to clipboard"
                    >
                      <Clipboard className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveVerificationAndStockx}
                    disabled={saveState === 'saving'}
                    className={`px-4 py-3 rounded-xl font-semibold text-white flex items-center gap-2 ${
                      saveState === 'saving'
                        ? 'bg-gray-400 cursor-not-allowed'
                        : currentTheme.name === 'Neon'
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                          : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                  >
                    {saveState === 'saving' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : saveState === 'error' ? (
                      <ShieldX className="w-4 h-4" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Save verification info
                  </button>

                  {saveState === 'saved' && (
                    <div className={`text-sm ${currentTheme.colors.textSecondary}`}>Saved.</div>
                  )}
                  {saveState === 'error' && (
                    <div className={`text-sm ${currentTheme.colors.textSecondary}`}>Error: {saveError || 'Failed to save.'}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`mt-5 text-xs ${currentTheme.colors.textSecondary} opacity-90`}>
          Price display: {selected?.pricing?.display || 'N/A'} {selected?.pricing?.gross != null ? `(gross ${formatUsdFromNumber(selected.pricing.gross)})` : ''}
        </div>
      </div>

      {showNativeScanner && (
        <NativeBarcodeScanner
          onClose={() => setShowNativeScanner(false)}
          onBarcodeScanned={handleNativeBarcodeScanned}
        />
      )}
    </div>
  );
}

