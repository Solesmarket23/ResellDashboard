'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal, RefreshCw, Wifi, WifiOff, X, ChevronDown, Trash2, Copy, Grid3X3, List, Settings, GripVertical, Bell, Shield, AlertTriangle, Mail, ExternalLink, Info } from 'lucide-react';
import NeonNotification, { type NotificationType } from './NeonNotification';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { useSiteAuth } from '../lib/hooks/useSiteAuth';
import { useRealTimeDeliveries } from '../lib/hooks/useRealTimeDeliveries';
import { TrackingInfo } from '../lib/tracking/trackingService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/firebase';
import { deliveryArrivalLogger } from '../lib/delivery/arrivalLogger';
import { formatDisplayDate, formatShortDate, parseLocalDate } from '../lib/utils/dateUtils';
import UPSOAuthButton from './UPSOAuthButton';
// UPS OAuth UI is handled by `UPSOAuthButton`
import ImagePreviewModal from './ImagePreviewModal';

interface DeliveryItem {
  id: string;
  trackingNumber: string;
  carrier: string;
  productName: string;
  productBrand: string;
  productSize: string;
  productImage?: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
  estimatedDelivery: string;
  actualDelivery?: string;
  emailUrl?: string | null;
  statusNote?: string;
  archivedAt?: string | null;
  origin: string;
  destination: string;
  lastUpdate: string;
  updates: {
    timestamp: string;
    location: string;
    status: string;
    description: string;
  }[];
  liveTracking?: TrackingInfo;
  isLiveTrackingEnabled?: boolean;
}

type DisplayStatus = 'label_created' | 'shipped' | 'delayed' | 'out_for_delivery' | 'delivered' | 'unknown';

const DeliveriesNew: React.FC = () => {
  const { currentTheme } = useTheme();
  const { user: firebaseUser } = useAuth();
  const { user: siteUser } = useSiteAuth();
  
  // Use either Firebase user or site user
  const user = firebaseUser || siteUser;

  type DropdownOption = { value: string; label: string };
  const statusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'today', label: 'Arriving Today' },
    { value: 'tomorrow', label: 'Arriving Tomorrow' },
    { value: 'this_week', label: 'Arriving This Week' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'in_transit', label: 'In Transit' },
    { value: 'delayed', label: 'Delayed' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
  ];
  const carrierOptions: DropdownOption[] = [
    { value: 'all', label: 'All Carriers' },
    { value: 'UPS', label: 'UPS' },
    { value: 'FedEx', label: 'FedEx' },
    { value: 'USPS', label: 'USPS' },
  ];
  const getOptionLabel = (options: DropdownOption[], value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  const [statusOpen, setStatusOpen] = useState(false);
  const [carrierOpen, setCarrierOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const carrierRef = useRef<HTMLDivElement | null>(null);
  const [modalCarrierOpen, setModalCarrierOpen] = useState(false);
  const modalCarrierRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (statusOpen && statusRef.current && t && !statusRef.current.contains(t)) setStatusOpen(false);
      if (carrierOpen && carrierRef.current && t && !carrierRef.current.contains(t)) setCarrierOpen(false);
      if (modalCarrierOpen && modalCarrierRef.current && t && !modalCarrierRef.current.contains(t)) setModalCarrierOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [carrierOpen, modalCarrierOpen, statusOpen]);

  // Helper function to find the best update to display (most recent with location, or most recent)
  const getBestUpdate = (updates: any[]) => {
    if (!updates || updates.length === 0) return null;
    
    // First try to find the most recent update with location
    const updateWithLocation = updates.find(update => 
      update.location && 
      update.location !== 'Unknown' && 
      update.location.trim() !== ''
    );
    
    // Return the update with location, or fall back to the most recent update
    return updateWithLocation || updates[0];
  };

  const getLastKnownLocation = (delivery: DeliveryItem): string => {
    const liveUpdates = delivery.liveTracking?.updates;
    const updatesToUse =
      liveUpdates && liveUpdates.length > 0 ? (liveUpdates as any[]) : (delivery.updates as any[]);

    const best = getBestUpdate(updatesToUse);
    const loc = (best?.location as string | undefined) ?? '';
    if (!loc || loc.trim() === '' || loc === 'Unknown') return '—';
    return loc;
  };
  
  // Real-time deliveries hook
  const {
    deliveries,
    loading,
    error,
    refresh: refreshDeliveries
  } = useRealTimeDeliveries({
    userId: user?.uid || '',
    autoRefresh: true,
    refreshInterval: 60000, // 1 minute
    enableWebSocket: false
  });

  // ---- Dashboard stats loading UX ----
  // On reload, avoid flashing "0" counts while deliveries are hydrating.
  // If we have last-known values, show them immediately; otherwise keep a shimmer during an initial grace window.
  const hasDeliveries = deliveries.length > 0;
  const statsCacheKey = user?.uid ? `deliveriesStatsCache_${user.uid}` : null;
  const [cachedStatValues, setCachedStatValues] = useState<Record<string, number> | null>(null);
  const [statsGraceOver, setStatsGraceOver] = useState(false);
  const statsSkeletonStartRef = React.useRef<number>(Date.now());
  const [showStatsSkeleton, setShowStatsSkeleton] = useState<boolean>(true);

  useEffect(() => {
    if (!statsCacheKey || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(statsCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const values = parsed?.values;
      if (values && typeof values === 'object') {
        setCachedStatValues(values as Record<string, number>);
      }
    } catch {
      // ignore cache parse errors
    }
  }, [statsCacheKey]);

  useEffect(() => {
    const graceMs = 5000;
    const t = window.setTimeout(() => setStatsGraceOver(true), graceMs);
    return () => window.clearTimeout(t);
  }, []);

  const shouldShowStatsSkeleton = useMemo(() => {
    if (hasDeliveries) return false;
    if (cachedStatValues) return false;
    if (loading) return true;
    return !statsGraceOver;
  }, [cachedStatValues, hasDeliveries, loading, statsGraceOver]);

  useEffect(() => {
    if (shouldShowStatsSkeleton) {
      statsSkeletonStartRef.current = Date.now();
      setShowStatsSkeleton(true);
      return;
    }
    // When we're done, keep the skeleton visible for at least 600ms total (prevents flicker).
    const elapsed = Date.now() - statsSkeletonStartRef.current;
    const minMs = 600;
    const wait = Math.max(0, minMs - elapsed);
    const t = window.setTimeout(() => setShowStatsSkeleton(false), wait);
    return () => window.clearTimeout(t);
  }, [shouldShowStatsSkeleton]);

  const [searchTerm, setSearchTerm] = useState('');
  const dropdownMenuMotion = (open: boolean) =>
    `origin-top transition-all duration-150 ease-out transform ${
      open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
    }`;
  const wasDeliveriesReload = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const nav = performance.getEntriesByType('navigation')?.[0] as any;
      if (nav?.type) return nav.type === 'reload';
      // Legacy fallback
      return (performance as any)?.navigation?.type === 1;
    } catch {
      return false;
    }
  };
  const [presetNeedsTracking, setPresetNeedsTracking] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (wasDeliveriesReload()) return false;
    // New format
    const saved = localStorage.getItem('deliveriesPresetNeedsTracking');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    // Back-compat with old single-select preset
    const legacy = localStorage.getItem('deliveriesPresetFilter');
    return legacy === 'needs_tracking';
  });
  const [presetInvalidTracking, setPresetInvalidTracking] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (wasDeliveriesReload()) return false;
    // New format
    const saved = localStorage.getItem('deliveriesPresetInvalidTracking');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    // Back-compat with old single-select preset
    const legacy = localStorage.getItem('deliveriesPresetFilter');
    return legacy === 'invalid_tracking';
  });
  const [presetArchived, setPresetArchived] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (wasDeliveriesReload()) return false;
    const saved = localStorage.getItem('deliveriesPresetArchived');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return false;
  });

  // Reset preset toggles on a true browser reload (refresh).
  useEffect(() => {
    if (!wasDeliveriesReload()) return;
    try {
      localStorage.removeItem('deliveriesPresetNeedsTracking');
      localStorage.removeItem('deliveriesPresetInvalidTracking');
      localStorage.removeItem('deliveriesPresetArchived');
      // Back-compat: old single-select preset key
      localStorage.removeItem('deliveriesPresetFilter');
    } catch {
      // ignore
    }
    setPresetNeedsTracking(false);
    setPresetInvalidTracking(false);
    setPresetArchived(false);
  }, []);
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('deliveriesStatusFilter');
      if (saved && typeof saved === 'string') return saved;
    }
    // Default for first-time users: focus on active shipments
    return 'shipped';
  });
  const [carrierFilter, setCarrierFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('deliveriesCarrierFilter');
      if (saved && typeof saved === 'string') return saved;
    }
    return 'all';
  });
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'table'>(() => {
    // Load saved view mode from localStorage
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('deliveriesViewMode');
      return (savedViewMode === 'split' || savedViewMode === 'table') ? savedViewMode : 'split';
    }
    return 'split';
  });

  // If the user switches away from table view, close the table details modal.
  useEffect(() => {
    if (viewMode !== 'table') setDetailsModalOpen(false);
  }, [viewMode]);
  const [showStatsSettings, setShowStatsSettings] = useState(false);
  const [selectedStats, setSelectedStats] = useState<string[]>([
    'total', 'in_transit', 'delivered', 'live_tracking'
  ]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'success'
  });
  const [showAddTrackingModal, setShowAddTrackingModal] = useState(false);
  const [addingTracking, setAddingTracking] = useState(false);
  const [newTracking, setNewTracking] = useState({
    purchaseId: '' as string,
    trackingNumber: '',
    carrier: 'AUTO',
    productName: '',
    productBrand: '',
    productSize: ''
  });
  const [sendingSlackNotification, setSendingSlackNotification] = useState(false);
  const [sendingSlackType, setSendingSlackType] = useState<'daily_summary' | 'out_for_delivery' | null>(null);
  const slackSendTimedOutRef = useRef(false);
  const [showSlackScheduleModal, setShowSlackScheduleModal] = useState(false);
  const [slackScheduleLoading, setSlackScheduleLoading] = useState(false);
  const [slackScheduleSaving, setSlackScheduleSaving] = useState(false);
  const [slackSchedule, setSlackSchedule] = useState<{
    enabled: boolean;
    webhookUrl: string;
    timeLocal: string; // HH:MM
    timezone: string; // IANA
    lastSentLocalDate?: string | null;
  }>({
    enabled: false,
    webhookUrl: '',
    timeLocal: '09:30',
    timezone: 'America/New_York',
    lastSentLocalDate: null,
  });
  const [cronStatus, setCronStatus] = useState<{ status?: string; paused?: boolean; message?: string } | null>(null);

  // Setup status UI removed (debug-only)
  // const [setupStatus, setSetupStatus] = useState<any | null>(null);
  // const [setupStatusLoading, setSetupStatusLoading] = useState(false);

  const isNeedsTracking = (delivery: DeliveryItem): boolean => {
    return !String(delivery.trackingNumber || '').trim();
  };

  const isInvalidTracking = (delivery: DeliveryItem): boolean => {
    const note = String((delivery as any)?.statusNote || '').toLowerCase();
    const liveErr = String((delivery as any)?.liveTracking?.error || '').toLowerCase();
    return (
      /tracking not found|invalid/.test(note) ||
      /check the number/.test(note) ||
      /tracking not found|invalid/.test(liveErr)
    );
  };

  function isArchivedDelivery(delivery: DeliveryItem): boolean {
    const at = (delivery as any)?.archivedAt;
    return !!(typeof at === 'string' ? at.trim() : at);
  }

  const presetCounts = useMemo(() => {
    let needs = 0;
    let invalid = 0;
    let archived = 0;
    for (const d of deliveries || []) {
      if (isNeedsTracking(d)) needs += 1;
      if (isInvalidTracking(d)) invalid += 1;
      if (isArchivedDelivery(d)) archived += 1;
    }
    return { needs, invalid, archived };
  }, [deliveries]);

  const getHighlightStyle = (isHighlighted: boolean): React.CSSProperties | undefined => {
    if (!isHighlighted) return undefined;
    return {
      boxShadow:
        currentTheme.name === 'Neon'
          ? 'inset 0 0 0 3px #22d3ee, 0 20px 50px rgba(34, 211, 238, 0.3)'
          : 'inset 0 0 0 3px #3b82f6, 0 20px 50px rgba(59, 130, 246, 0.3)',
    };
  };

  const getHighlightBgClass = (isHighlighted: boolean): string => {
    if (!isHighlighted) return '';
    return currentTheme.name === 'Neon'
      ? 'bg-gradient-to-r from-cyan-500/30 via-blue-500/20 to-cyan-500/30'
      : 'bg-gradient-to-r from-blue-200 via-blue-100 to-blue-200';
  };

  // Table sorting (Delivery column)
  const [deliverySort, setDeliverySort] = useState<'asc' | 'desc' | null>(null);
  const [trackingSort, setTrackingSort] = useState<'asc' | 'desc' | null>(null);

  const localSetup = useMemo(() => {
    if (typeof window === 'undefined') return { siteUserId: '', purchasesCount: 0 };
    const siteUserId = (localStorage.getItem('siteUserId') || '').trim();
    if (!siteUserId) return { siteUserId: '', purchasesCount: 0 };
    const raw = localStorage.getItem(`purchases_${siteUserId}`);
    if (!raw) return { siteUserId, purchasesCount: 0 };
    try {
      const parsed = JSON.parse(raw);
      return { siteUserId, purchasesCount: Array.isArray(parsed) ? parsed.length : 0 };
    } catch {
      return { siteUserId, purchasesCount: 0 };
    }
  }, []);

  // setupPills removed with setup status UI

  const [imagePreview, setImagePreview] = useState<{
    isOpen: boolean;
    imageUrl: string;
    productName: string;
    productBrand: string;
    productSize: string;
  }>({
    isOpen: false,
    imageUrl: '',
    productName: '',
    productBrand: '',
    productSize: ''
  });
  
  // Copy tracking number to clipboard
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [copiedShipmentId, setCopiedShipmentId] = useState<string | null>(null);
  // Persist the blue "active" highlight until another copy action.
  const [highlightedDeliveryId, setHighlightedDeliveryId] = useState<string | null>(null);
  // Sometimes we intentionally do NOT want to auto-scroll to the highlighted row (e.g. when clearing a stat filter).
  const suppressNextHighlightScrollRef = React.useRef(false);

  const [confirmClearTrackingOpen, setConfirmClearTrackingOpen] = useState(false);
  const [clearTrackingTarget, setClearTrackingTarget] = useState<DeliveryItem | null>(null);
  const [clearingTracking, setClearingTracking] = useState(false);

  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<DeliveryItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  // After opening an email, optionally open the "edit tracking" modal when the user returns focus.
  const [pendingTrackingAfterEmail, setPendingTrackingAfterEmail] = useState<{
    deliveryId: string;
    clearPrefill: boolean;
  } | null>(null);

  // Tracking modal UX: allow auto-focus + Enter-to-save.
  const trackingInputRef = useRef<HTMLInputElement | null>(null);
  const shouldFocusTrackingInputRef = useRef(false);
  
  const copyTrackingNumber = async (trackingNumber: string, deliveryId: string) => {
    try {
      if (!trackingNumber || !trackingNumber.trim()) {
        showNotification('No tracking number to copy', 'info');
        return;
      }
      await navigator.clipboard.writeText(trackingNumber);
      setCopiedTrackingId(deliveryId);
      setHighlightedDeliveryId(deliveryId);
      showNotification('Tracking number copied to clipboard!', 'success');
      setTimeout(() => setCopiedTrackingId(null), 2000);
    } catch (error) {
      console.error('Failed to copy tracking number:', error);
      showNotification('Failed to copy tracking number', 'error');
    }
  };

  const getFedExTrackingUrl = (rawTracking: string) => {
    // Sometimes the stored "tracking" is actually a full FedEx/UPS URL or includes extra query params
    // (e.g. "888169917500&trkqual=..."). Always extract the real tracking number first.
    const extracted = extractTrackingNumberFromText(String(rawTracking || '')).trackingNumber;
    const tn = extracted || String(rawTracking || '').trim();
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`;
  };

  const extractTrackingNumberFromText = (raw: string): { trackingNumber: string | null; carrierHint?: string } => {
    const text = String(raw || '').trim();
    if (!text) return { trackingNumber: null };

    // If the user pasted only a tracking-like token (no other text), accept it.
    const compactOnly = text.replace(/[\s\-_]/g, '').toUpperCase();
    if (/^1Z[0-9A-Z]{15,18}$/.test(compactOnly)) return { trackingNumber: compactOnly, carrierHint: 'UPS' };
    if (/^[0-9]{12,15}$/.test(compactOnly)) return { trackingNumber: compactOnly, carrierHint: 'FedEx' };
    if (/^9[0-9]{19,21}$/.test(compactOnly) || /^9[0-9]{12}$/.test(compactOnly)) return { trackingNumber: compactOnly, carrierHint: 'USPS' };
    if (/^[0-9]{10}$/.test(compactOnly)) return { trackingNumber: compactOnly, carrierHint: 'DHL' };

    // Try URL parsing first
    if (text.includes('http://') || text.includes('https://')) {
      try {
        const url = new URL(text);
        const qp = url.searchParams;
        const candidates = [
          qp.get('trknbr'),
          qp.get('trackingNumber'),
          qp.get('trackingnumber'),
          qp.get('tracking'),
          qp.get('tracknum'),
          qp.get('trk'),
        ]
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);

        for (const c of candidates) {
          const cleaned = c.replace(/[\s\-_]/g, '').toUpperCase();
          if (/^1Z[0-9A-Z]{15,18}$/.test(cleaned)) return { trackingNumber: cleaned, carrierHint: 'UPS' };
          if (/^[0-9]{12,15}$/.test(cleaned)) return { trackingNumber: cleaned, carrierHint: 'FedEx' };
          if (/^9[0-9]{19,21}$/.test(cleaned) || /^9[0-9]{12}$/.test(cleaned)) return { trackingNumber: cleaned, carrierHint: 'USPS' };
          if (/^[0-9]{10}$/.test(cleaned)) return { trackingNumber: cleaned, carrierHint: 'DHL' };
        }
      } catch {
        // ignore invalid URL
      }
    }

    // Fallback: extract the first tracking-looking token from the text
    const compact = text.replace(/\s+/g, ' ').trim();
    const mUps = compact.toUpperCase().match(/1Z[0-9A-Z]{15,18}/);
    if (mUps) return { trackingNumber: mUps[0], carrierHint: 'UPS' };

    // FedEx numbers are easily confused with order IDs. Only pick a 12–15 digit token from
    // longer text if there's a nearby tracking keyword and it's NOT clearly labeled as an order number.
    const lower = compact.toLowerCase();
    const keywordIdxs: number[] = [];
    for (const kw of ['tracking', 'track', 'trk', 'shipment', 'carrier']) {
      let i = lower.indexOf(kw);
      while (i !== -1) {
        keywordIdxs.push(i);
        i = lower.indexOf(kw, i + kw.length);
      }
    }
    const fedexCandidates = Array.from(compact.matchAll(/\b[0-9]{12,15}\b/g)).map((m) => ({
      value: m[0],
      index: m.index ?? -1,
    }));
    const isOrderContext = (idx: number) => {
      if (idx < 0) return false;
      const start = Math.max(0, idx - 14);
      const ctx = lower.slice(start, idx);
      return /\border\b|\border\s*#|\bconfirmation\b|\binvoice\b/.test(ctx);
    };
    if (fedexCandidates.length > 0 && keywordIdxs.length > 0) {
      const scored = fedexCandidates
        .filter((c) => !isOrderContext(c.index))
        .map((c) => {
          const d = Math.min(...keywordIdxs.map((k) => Math.abs(c.index - k)));
          return { ...c, score: d };
        })
        .sort((a, b) => a.score - b.score);
      // Require a keyword reasonably close (prevents picking random order numbers elsewhere in the text)
      if (scored[0] && scored[0].score <= 40) {
        return { trackingNumber: scored[0].value, carrierHint: 'FedEx' };
      }
    }

    const mUsps = compact.match(/\b9[0-9]{19,21}\b|\b9[0-9]{12}\b/);
    if (mUsps) return { trackingNumber: mUsps[0], carrierHint: 'USPS' };
    const mDhl = compact.match(/\b[0-9]{10}\b/);
    if (mDhl) return { trackingNumber: mDhl[0], carrierHint: 'DHL' };

    return { trackingNumber: null };
  };

  const isTrackingNotFound = (delivery: DeliveryItem) => {
    const note = String(delivery?.statusNote || '').toLowerCase();
    return note.includes('tracking not found') || note.includes('invalid tracking') || note.includes('check the number');
  };

  const requestClearTracking = (delivery: DeliveryItem) => {
    setClearTrackingTarget(delivery);
    setConfirmClearTrackingOpen(true);
  };

  const clearTracking = async () => {
    if (!clearTrackingTarget || !user) return;
    const target = clearTrackingTarget;
    setClearingTracking(true);
    try {
      const updates = {
        tracking: null,
        trackingNumber: null,
        tracking_number: null,
        'shipment.tracking': null,
        'shipment.trackingNumber': null,
      };

      // Prefer clearing in Firebase (works for both Firebase-auth and site-password users if their purchases are stored in Firestore).
      // Fall back to localStorage only when this user is using the local purchases dataset.
      const siteUserId = typeof window !== 'undefined' ? (localStorage.getItem('siteUserId') || '').trim() : '';
      const shouldUseLocalStoragePurchases = !!(siteUserId && siteUserId === user.uid);
      const localKey = shouldUseLocalStoragePurchases ? `purchases_${siteUserId}` : '';

      const tryFirebaseFirst = async () => {
        const res = await fetch('/api/purchases/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, purchaseId: target.id, updates }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) throw new Error(data?.error || data?.details || `HTTP ${res.status}`);
      };

      if (!shouldUseLocalStoragePurchases) {
        await tryFirebaseFirst();
      } else {
        const raw = localKey ? localStorage.getItem(localKey) : null;
        // Some users have a siteUserId cookie but still store purchases in Firebase. If local data isn't present, fall back to Firebase.
        if (!raw) {
          await tryFirebaseFirst();
        } else {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('Local purchases data is invalid');
        const next = parsed.map((p: any) => {
          const id = String(p?.id || '').trim();
          if (id && id === target.id) {
            const clone = { ...p };
            delete clone.tracking;
            delete clone.trackingNumber;
            delete clone.tracking_number;
            clone.updatedAt = new Date().toISOString();
            if (clone.shipment && typeof clone.shipment === 'object') {
              const s = { ...clone.shipment };
              delete s.tracking;
              delete s.trackingNumber;
              clone.shipment = s;
            }
            return clone;
          }
          // Fallback: if ids are missing, match by tracking number string
          const tn = String(
            p?.tracking ||
              p?.trackingNumber ||
              p?.tracking_number ||
              p?.shipment?.tracking ||
              p?.shipment?.trackingNumber ||
              ''
          ).trim();
          if (tn && tn === target.trackingNumber) {
            const clone = { ...p };
            delete clone.tracking;
            delete clone.trackingNumber;
            delete clone.tracking_number;
            clone.updatedAt = new Date().toISOString();
            if (clone.shipment && typeof clone.shipment === 'object') {
              const s = { ...clone.shipment };
              delete s.tracking;
              delete s.trackingNumber;
              clone.shipment = s;
            }
            return clone;
          }
          return p;
        });
        localStorage.setItem(localKey, JSON.stringify(next));
        }
      }

      setConfirmClearTrackingOpen(false);
      setClearTrackingTarget(null);
      showNotification('Tracking cleared', 'success');
      // Keep the user on the same row: highlight it and immediately prompt for the correct tracking number.
      openSetTrackingForDelivery({ ...target, trackingNumber: '' });
      await refreshDeliveries();
    } catch (e: any) {
      console.error(e);
      showNotification(e?.message || 'Failed to clear tracking', 'error');
    } finally {
      setClearingTracking(false);
    }
  };

  const requestArchive = (delivery: DeliveryItem) => {
    setArchiveTarget(delivery);
    setConfirmArchiveOpen(true);
  };

  const archiveOrRestore = async (mode: 'archive' | 'restore') => {
    if (!archiveTarget || !user) return;
    const target = archiveTarget;
    setArchiving(true);
    try {
      const isManualInMemory = String(target.id || '').startsWith('manual-') && String((target as any)?.platform || '').toLowerCase().includes('manual');

      // Manual in-memory "test" entries: delete via /api/deliveries/sync DELETE (no restore).
      if (isManualInMemory) {
        if (mode === 'restore') {
          showNotification('This test-only entry cannot be restored', 'info');
        } else {
          const tn = String(target.trackingNumber || '').trim();
          await fetch(`/api/deliveries/sync?userId=${encodeURIComponent(user.uid)}&trackingNumber=${encodeURIComponent(tn)}`, {
            method: 'DELETE'
          });
        }
      } else {
        const updates: any =
          mode === 'archive'
            ? { archivedAt: new Date().toISOString(), archivedReason: 'user_deleted', archivedBy: 'deliveries' }
            : { archivedAt: null, archivedReason: null, archivedBy: null };

        const siteUserId = typeof window !== 'undefined' ? (localStorage.getItem('siteUserId') || '').trim() : '';
        const shouldUseLocalStoragePurchases = !!(siteUserId && siteUserId === user.uid);
        const localKey = shouldUseLocalStoragePurchases ? `purchases_${siteUserId}` : '';

        const tryFirebaseFirst = async () => {
          const res = await fetch('/api/purchases/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.uid, purchaseId: target.id, updates }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) throw new Error(data?.error || data?.details || `HTTP ${res.status}`);
        };

        if (!shouldUseLocalStoragePurchases) {
          await tryFirebaseFirst();
        } else {
          const raw = localKey ? localStorage.getItem(localKey) : null;
          if (!raw) {
            await tryFirebaseFirst();
          } else {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error('Local purchases data is invalid');
            const next = parsed.map((p: any) => {
              const id = String(p?.id || '').trim();
              if (id && id === target.id) {
                const clone = { ...p, ...updates, updatedAt: new Date().toISOString() };
                // For restore, remove fields cleanly
                if (mode === 'restore') {
                  delete clone.archivedAt;
                  delete clone.archivedReason;
                  delete clone.archivedBy;
                }
                return clone;
              }
              return p;
            });
            localStorage.setItem(localKey, JSON.stringify(next));
          }
        }
      }

      setConfirmArchiveOpen(false);
      setArchiveTarget(null);
      showNotification(mode === 'archive' ? 'Entry archived' : 'Entry restored', 'success');
      await refreshDeliveries();
    } catch (e: any) {
      console.error(e);
      showNotification(e?.message || 'Failed to update entry', 'error');
    } finally {
      setArchiving(false);
    }
  };

  // Copy full shipment data to clipboard
  const copyShipmentData = async (delivery: DeliveryItem, deliveryId: string) => {
    try {
      const shipmentData = {
        trackingNumber: delivery.trackingNumber,
        carrier: delivery.carrier,
        productName: delivery.productName,
        productBrand: delivery.productBrand,
        productSize: delivery.productSize,
        status: delivery.status,
        estimatedDelivery: delivery.estimatedDelivery,
        actualDelivery: delivery.actualDelivery,
        origin: delivery.origin,
        destination: delivery.destination,
        lastUpdate: delivery.lastUpdate,
        updates: delivery.updates.map(update => ({
          timestamp: update.timestamp,
          location: update.location,
          status: update.status,
          description: update.description
        })),
        liveTracking: delivery.liveTracking,
        isLiveTrackingEnabled: delivery.isLiveTrackingEnabled
      };
      
      await navigator.clipboard.writeText(JSON.stringify(shipmentData, null, 2));
      setCopiedShipmentId(deliveryId);
      setHighlightedDeliveryId(deliveryId);
      showNotification('Shipment data copied to clipboard!', 'success');
      setTimeout(() => setCopiedShipmentId(null), 2000);
        } catch (error) {
      console.error('Failed to copy shipment data:', error);
      showNotification('Failed to copy shipment data', 'error');
    }
  };

  const openOrderEmail = (delivery: DeliveryItem) => {
    const url = typeof delivery?.emailUrl === 'string' ? delivery.emailUrl.trim() : '';
    if (!url) {
      showNotification('No order email link found for this entry', 'info');
      return;
    }
    // Treat "Open email" as an active action: persist the blue highlight.
    setHighlightedDeliveryId(delivery.id);
    setSelectedDelivery(delivery);

    // If this entry needs tracking attention, help the user by reopening the edit modal on return.
    const needsAttention = !delivery.trackingNumber || isTrackingNotFound(delivery);
    if (needsAttention) {
      setPendingTrackingAfterEmail({
        deliveryId: delivery.id,
        // If marked invalid, start the modal with an empty tracking field (but don't persist any clearing).
        clearPrefill: isTrackingNotFound(delivery),
      });
    } else {
      setPendingTrackingAfterEmail(null);
    }

    const win = window.open(url, '_blank', 'noopener,noreferrer');
    // In some embedded browsers (including Cursor's), window.open can return null even when the tab successfully opens.
    // Only show an error if it truly failed, and otherwise fall back to copying the link.
    if (!win) {
      // Best-effort: try copying the link so the user can paste it anywhere.
      void (async () => {
        try {
          await navigator.clipboard.writeText(url);
          showNotification('Opened email link (if blocked, link copied to clipboard)', 'info');
        } catch {
          showNotification('Could not open email link (popup may be blocked)', 'error');
        }
      })();
    }
  };

  useEffect(() => {
    if (!pendingTrackingAfterEmail) return;

    const onFocus = () => {
      const pending = pendingTrackingAfterEmail;
      if (!pending) return;

      const delivery =
        deliveries.find((d) => d.id === pending.deliveryId) ||
        (selectedDelivery && selectedDelivery.id === pending.deliveryId ? selectedDelivery : null);

      if (delivery) {
        openSetTrackingForDelivery(delivery, {
          prefillTrackingNumber: pending.clearPrefill ? '' : (delivery.trackingNumber || ''),
        });
      }

      setPendingTrackingAfterEmail(null);
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [deliveries, pendingTrackingAfterEmail, selectedDelivery]);

  // NOTE: Do not persist highlighted row across browser reloads.
  // (Users reported reloads should start with no highlighted entry.)

  const handleDeliveryImageClick = (delivery: DeliveryItem) => {
    if (!delivery.productImage) return;
    setImagePreview({
      isOpen: true,
      imageUrl: delivery.productImage,
      productName: delivery.productName,
      productBrand: delivery.productBrand,
      productSize: delivery.productSize,
    });
  };

  const closeImagePreview = () => {
    setImagePreview((prev) => ({ ...prev, isOpen: false }));
  };

  const SizePill = ({ size }: { size: string }) => (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
        currentTheme.name === 'Neon'
          ? 'bg-white/5 text-gray-300 border border-white/10'
          : 'bg-gray-100 text-gray-700 border border-gray-200'
      }`}
    >
      {size || 'Unknown'}
    </span>
  );

  // Status icon helper
  const getStatusIcon = (status: DisplayStatus) => {
    switch (status) {
      case 'label_created':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'out_for_delivery':
        // Brighter orange (still distinct from exception red).
        return <Truck className="w-4 h-4 text-orange-300" />;
      case 'shipped':
        return <Package className="w-4 h-4 text-blue-500" />;
      case 'delayed':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  // Status color helper
  const getStatusColor = (status: DisplayStatus) => {
    switch (status) {
      case 'label_created':
        return 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100';
      case 'delivered':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'out_for_delivery':
        // Brighter orange in dark mode so it doesn't read as muted.
        return 'bg-orange-100 text-orange-900 dark:bg-orange-400/25 dark:text-orange-100';
      case 'shipped':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'delayed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Format status helper
  const formatStatus = (status: DisplayStatus) => {
    if (status === 'label_created') return 'LABEL CREATED';
    if (status === 'out_for_delivery') return 'OUT FOR DELIVERY';
    if (status === 'delivered') return 'DELIVERED';
    if (status === 'shipped') return 'SHIPPED';
    if (status === 'delayed') return 'DELAYED';
    return 'UNKNOWN';
  };

  const getDisplayStatus = (delivery: DeliveryItem): DisplayStatus => {
    const note = String(delivery?.statusNote || '').toLowerCase();
    if (note.includes('label created')) return 'label_created';
    if (delivery.status === 'delivered') return 'delivered';
    if (delivery.status === 'out_for_delivery') return 'out_for_delivery';
    if (delivery.status === 'exception') return 'delayed';
    // Collapse in_transit into "shipped" for a simpler, more intuitive set
    if (delivery.status === 'in_transit' || delivery.status === 'shipped') return 'shipped';
    return 'unknown';
  };

  // Stats configuration
  const toLocalYmd = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const parseYmdAsLocalDate = (ymd: string): Date | null => {
    const s = String(ymd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [yy, mm, dd] = s.split('-').map((n) => Number(n));
    if (!yy || !mm || !dd) return null;
    return new Date(yy, mm - 1, dd);
  };

  const getDeliveryCell = (delivery: DeliveryItem) => {
    // Delivered: show delivered date (when available)
    if (delivery.status === 'delivered') {
      const d = delivery.actualDelivery ? parseLocalDate(delivery.actualDelivery) : null;
      const day = d ? d.toLocaleDateString('en-US', { weekday: 'short' }) : null;
      return (
        <div>
          <div className="font-semibold">
            {d ? `Delivered • ${day}` : 'Delivered'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {delivery.actualDelivery ? formatShortDate(delivery.actualDelivery) : 'Date not provided'}
          </div>
        </div>
      );
    }

    // No ETA: keep TBD and show note prominently
    if (!delivery.estimatedDelivery || delivery.estimatedDelivery === 'TBD') {
      return (
        <div>
          <div className="font-semibold">TBD</div>
          {delivery.statusNote ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-48">
              {delivery.statusNote}
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400">No ETA yet</div>
          )}
        </div>
      );
    }

    // ETA date: show a relative label + short date
    const etaDate = parseLocalDate(delivery.estimatedDelivery);
    const etaYmd = toLocalYmd(etaDate);
    const todayYmd = toLocalYmd(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowYmd = toLocalYmd(tomorrow);
    const label =
      etaYmd === todayYmd ? 'Today' : etaYmd === tomorrowYmd ? 'Tomorrow' : etaDate.toLocaleDateString('en-US', { weekday: 'short' });

    return (
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{formatShortDate(delivery.estimatedDelivery)}</div>
      </div>
    );
  };

  const availableStats = {
    total: {
      id: 'total',
      label: 'Total',
      icon: Package,
      color: 'text-blue-400',
      getValue: () => deliveries.length
    },
    in_transit: {
      id: 'in_transit',
      label: 'In Transit',
      icon: Truck,
      color: 'text-orange-400',
      getValue: () => deliveries.filter(d => d.status === 'in_transit').length
    },
    delivered: {
      id: 'delivered',
      label: 'Delivered',
      icon: CheckCircle,
      color: 'text-green-400',
      getValue: () => deliveries.filter(d => d.status === 'delivered').length
    },
    live_tracking: {
      id: 'live_tracking',
      label: 'Live Tracking',
      icon: Wifi,
      color: 'text-cyan-400',
      getValue: () => deliveries.filter(d => d.isLiveTrackingEnabled).length
    },
    arriving_today: {
      id: 'arriving_today',
      label: 'Arriving Today',
      icon: Calendar,
      color: 'text-red-400',
      getValue: () => {
        const today = toLocalYmd(new Date());
        return deliveries.filter(d => d.estimatedDelivery === today || d.status === 'out_for_delivery').length;
      }
    },
    arriving_tomorrow: {
      id: 'arriving_tomorrow',
      label: 'Arriving Tomorrow',
      icon: Calendar,
      color: 'text-yellow-400',
      getValue: () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = toLocalYmd(tomorrow);
        return deliveries.filter(d => d.estimatedDelivery === tomorrowStr).length;
      }
    },
    arriving_this_week: {
      id: 'arriving_this_week',
      label: 'Arriving This Week',
      icon: Calendar,
      color: 'text-purple-400',
      getValue: () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return deliveries.filter(d => {
          if (d.status === 'delivered') return false;
          const dd = parseYmdAsLocalDate(d.estimatedDelivery);
          if (!dd) return false;
          return dd >= start && dd <= end;
        }).length;
      }
    },
    exceptions: {
      id: 'exceptions',
      label: 'Delayed',
      icon: X,
      color: 'text-red-500',
      getValue: () => deliveries.filter(d => d.status === 'exception').length
    }
  };

  // Cache last-known stat values so reloads show stable numbers immediately (no "0 flash" while hydrating).
  useEffect(() => {
    if (!statsCacheKey || typeof window === 'undefined') return;
    if (!hasDeliveries) return; // don't overwrite good cache with a temporary empty list
    try {
      const values: Record<string, number> = {};
      Object.keys(availableStats).forEach((id) => {
        const stat = (availableStats as any)[id];
        if (stat?.getValue) values[id] = Number(stat.getValue()) || 0;
      });
      localStorage.setItem(statsCacheKey, JSON.stringify({ updatedAt: Date.now(), values }));
      setCachedStatValues(values);
    } catch {
      // ignore cache write errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsCacheKey, hasDeliveries, deliveries]);

  const statCardFilterMap: Record<string, { statusFilter: string; label: string }> = {
    arriving_today: { statusFilter: 'today', label: 'Arriving Today' },
    arriving_tomorrow: { statusFilter: 'tomorrow', label: 'Arriving Tomorrow' },
    arriving_this_week: { statusFilter: 'this_week', label: 'Arriving This Week' },
    in_transit: { statusFilter: 'in_transit', label: 'In Transit' },
    delivered: { statusFilter: 'delivered', label: 'Delivered' },
    exceptions: { statusFilter: 'delayed', label: 'Delayed' },
    // total/live_tracking intentionally not mapped for now
  };

  const activeStatusFilterLabel = useMemo((): string | null => {
    if (!statusFilter || statusFilter === 'all') return null;
    if (statusFilter === 'today') return 'Arriving Today';
    if (statusFilter === 'tomorrow') return 'Arriving Tomorrow';
    if (statusFilter === 'this_week') return 'Arriving This Week';
    if (statusFilter === 'in_transit') return 'In Transit';
    if (statusFilter === 'delivered') return 'Delivered';
    if (statusFilter === 'out_for_delivery') return 'Out for Delivery';
    if (statusFilter === 'shipped') return 'Shipped';
    if (statusFilter === 'delayed') return 'Delayed';
    return `Status: ${statusFilter}`;
  }, [statusFilter]);

  // Handle stat selection
  const handleStatToggle = (statId: string) => {
    if (selectedStats.includes(statId)) {
      // Remove if already selected
      setSelectedStats(prev => prev.filter(id => id !== statId));
    } else if (selectedStats.length < 4) {
      // Add if not at limit
      setSelectedStats(prev => [...prev, statId]);
    }
  };

  // Handle stat reordering
  const handleStatReorder = (fromIndex: number, toIndex: number) => {
    const newStats = [...selectedStats];
    const [removed] = newStats.splice(fromIndex, 1);
    newStats.splice(toIndex, 0, removed);
    setSelectedStats(newStats);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      handleStatReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Save customizable stats settings to localStorage AND Firebase
  const saveStatsSettings = async (stats: string[]) => {
    if (!user) return;
    
    try {
      // Save to localStorage first (works for all users)
      const storageKey = `deliveriesStats_${user.uid}`;
      localStorage.setItem(storageKey, JSON.stringify(stats));
      console.log(`✅ Saved stats settings to localStorage: ${stats.join(', ')}`);
      
      // Also try to save to Firebase if available
      if (firebaseUser) {
        const userSettingsRef = doc(db, 'userSettings', user.uid);
        await setDoc(userSettingsRef, {
          deliveriesCustomizableStats: stats,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
        console.log(`✅ Saved stats settings to Firebase`);
      }
    } catch (error) {
      console.error('Error saving stats settings:', error);
      showNotification('Failed to save settings', 'error');
    }
  };

  // Load customizable stats settings from localStorage OR Firebase
  const loadStatsSettings = async () => {
    if (!user) return;
    
    try {
      // Try localStorage first (faster and works for site password users)
      const storageKey = `deliveriesStats_${user.uid}`;
      const savedStats = localStorage.getItem(storageKey);
      
      if (savedStats) {
        const stats = JSON.parse(savedStats);
        if (Array.isArray(stats) && stats.length > 0) {
          setSelectedStats(stats);
          console.log(`✅ Loaded stats settings from localStorage: ${stats.join(', ')}`);
          return;
        }
      }
      
      // Fallback to Firebase for Firebase users
      if (firebaseUser) {
        const userSettingsRef = doc(db, 'userSettings', user.uid);
        const userSettingsDoc = await getDoc(userSettingsRef);
        
        if (userSettingsDoc.exists()) {
          const data = userSettingsDoc.data();
          if (data.deliveriesCustomizableStats && Array.isArray(data.deliveriesCustomizableStats)) {
            setSelectedStats(data.deliveriesCustomizableStats);
            // Also save to localStorage for faster future loads
            localStorage.setItem(storageKey, JSON.stringify(data.deliveriesCustomizableStats));
            console.log(`✅ Loaded stats settings from Firebase`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading stats settings:', error);
    }
  };

  // Show notification helper
  const closeToast = useCallback(() => {
    setNotification((p) => ({ ...p, show: false }));
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({
      show: true,
      message,
      type
    });
  };

  // Add manual tracking
  const handleAddManualTracking = async () => {
    if (!user) {
      showNotification('Please sign in to add tracking', 'error');
      return;
    }
    if (!newTracking.trackingNumber.trim()) {
      showNotification('Enter a tracking number', 'error');
      return;
    }
    try {
      setAddingTracking(true);
      let savedOk = false;
      let successMessage = 'Tracking saved';
      // If we're fixing a purchase that has missing/invalid tracking, persist to the purchase record.
      if (newTracking.purchaseId) {
        const updates: any = {
          tracking: newTracking.trackingNumber.trim(),
          trackingNumber: newTracking.trackingNumber.trim(),
          carrier: newTracking.carrier === 'AUTO' ? undefined : newTracking.carrier,
        };

        const siteUserId = typeof window !== 'undefined' ? (localStorage.getItem('siteUserId') || '').trim() : '';
        const shouldUseLocalStoragePurchases = !!(siteUserId && siteUserId === user.uid);
        const localKey = shouldUseLocalStoragePurchases ? `purchases_${siteUserId}` : '';

        const saveToFirebase = async () => {
          const res = await fetch('/api/purchases/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.uid,
              purchaseId: newTracking.purchaseId,
              updates,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) throw new Error(data?.error || data?.details || 'Failed to update tracking');
        };

        if (!shouldUseLocalStoragePurchases) {
          await saveToFirebase();
        } else {
          const raw = localKey ? localStorage.getItem(localKey) : null;
          // Some sessions have siteUserId present but purchases are still stored in Firebase.
          // If local purchases aren't available, fall back to Firebase update.
          if (!raw) {
            await saveToFirebase();
          } else {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error('Local purchases data is invalid');
            const next = parsed.map((p: any) => {
              const id = String(p?.id || '').trim();
              if (id && id === newTracking.purchaseId) {
                return {
                  ...p,
                  tracking: newTracking.trackingNumber.trim(),
                  trackingNumber: newTracking.trackingNumber.trim(),
                  carrier: newTracking.carrier === 'AUTO' ? (p?.carrier || undefined) : newTracking.carrier,
                  updatedAt: new Date().toISOString(),
                };
              }
              return p;
            });
            localStorage.setItem(localKey, JSON.stringify(next));
          }
        }

        setHighlightedDeliveryId(newTracking.purchaseId);
        savedOk = true;
        successMessage = 'Tracking saved';
      } else {
        // Otherwise, treat as adding a manual tracking entry (existing behavior)
        const res = await fetch('/api/deliveries/sync', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            trackingNumber: newTracking.trackingNumber.trim(),
            carrier: newTracking.carrier === 'AUTO' ? undefined : newTracking.carrier,
            productName: newTracking.productName || undefined,
            productBrand: newTracking.productBrand || undefined,
            productSize: newTracking.productSize || undefined
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add tracking');
        savedOk = true;
        successMessage = 'Tracking added';
      }
      setShowAddTrackingModal(false);
      setNewTracking({ purchaseId: '', trackingNumber: '', carrier: 'AUTO', productName: '', productBrand: '', productSize: '' });
      if (savedOk) showNotification(successMessage, 'success');

      // Refresh is best-effort; don't override a successful save with an error toast.
      try {
        await refreshDeliveries();
      } catch (err) {
        console.error('Refresh after saving tracking failed:', err);
        showNotification('Saved, but refresh failed — click Refresh', 'info');
      }
    } catch (e) {
      console.error(e);
      showNotification((e as any)?.message || 'Failed to save tracking', 'error');
    } finally {
      setAddingTracking(false);
    }
  };

  const openSetTrackingForDelivery = (
    delivery: DeliveryItem,
    opts?: { prefillTrackingNumber?: string }
  ) => {
    const prefill =
      typeof opts?.prefillTrackingNumber === 'string' ? opts.prefillTrackingNumber : (delivery.trackingNumber || '');
    setNewTracking({
      purchaseId: delivery.id,
      trackingNumber: prefill,
      carrier: 'AUTO',
      productName: delivery.productName || '',
      productBrand: delivery.productBrand || '',
      productSize: delivery.productSize || '',
    });
    setHighlightedDeliveryId(delivery.id);
    setSelectedDelivery(delivery);
    shouldFocusTrackingInputRef.current = true;
    setShowAddTrackingModal(true);
  };

  // When the tracking modal opens, focus the Tracking Number input so users can paste immediately.
  useEffect(() => {
    if (!showAddTrackingModal) return;
    const t = window.setTimeout(() => {
      const el = trackingInputRef.current;
      if (!el) return;
      // Always focus on open; this is especially important when returning from "Open email".
      el.focus();
      // Put cursor at end so paste overwrites less often if user is editing.
      try {
        const len = el.value?.length ?? 0;
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
      shouldFocusTrackingInputRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [showAddTrackingModal]);

  const openPurchasesForDelivery = (purchaseId: string) => {
    if (!purchaseId) return;
    window.open(`/dashboard?section=purchases&purchaseId=${encodeURIComponent(purchaseId)}`, '_blank', 'noopener,noreferrer');
  };

  const sendSlack = async (
    type: 'daily_summary' | 'out_for_delivery',
    opts?: { testForceOFDCount?: number }
  ) => {
    if (!user) {
      showNotification('Please sign in to send notifications', 'error');
      return;
    }

    let timeoutId: number | null = null;
    try {
      setSendingSlackNotification(true);
      setSendingSlackType(type);
      slackSendTimedOutRef.current = false;
      console.log('📨 Sending Slack notification...');

      // Get purchases from localStorage for site password users
      const siteUserId = localStorage.getItem('siteUserId');
      let purchases: any[] | undefined;

      if (siteUserId) {
        const storageKey = `purchases_${siteUserId}`;
        const purchasesJson = localStorage.getItem(storageKey);
        if (purchasesJson) {
          purchases = JSON.parse(purchasesJson);
        }
      }

      const controller = new AbortController();
      // Hard client-side timeout so the UI never gets stuck "Sending..." forever.
      // Daily summary does more work (tracking + market pricing), OFD is smaller/faster.
      const timeoutMs = type === 'daily_summary' ? 90_000 : 45_000;
      timeoutId = window.setTimeout(() => {
        slackSendTimedOutRef.current = true;
        try {
          controller.abort();
        } catch {
          // ignore
        }
        // Force-reset UI even if fetch doesn't reject properly in this environment.
        setSendingSlackNotification(false);
        setSendingSlackType(null);
        showNotification('Slack send timed out — try again', 'error');
      }, timeoutMs);

      const res = await fetch('/api/notifications/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userId: user.uid,
          type,
          purchases, // Send purchases for localStorage users
          ...(opts?.testForceOFDCount ? { testForceOFDCount: opts.testForceOFDCount } : {}),
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send notification');
      }

      if (data?.slackDateDebug) {
        console.log('🕒 Slack slackDateDebug:', data.slackDateDebug);
        try {
          (window as any).__lastSlackDateDebug = data.slackDateDebug;
        } catch {
          // ignore
        }
      }

      if (data?.marketPriceDebug) {
        console.log('📊 Slack marketPriceDebug:', data.marketPriceDebug);
        try {
          // Expose for easy debugging in the browser console.
          (window as any).__lastSlackMarketPriceDebug = data.marketPriceDebug;
        } catch {
          // ignore
        }
        const items = (data.marketPriceDebug as any)?.items;
        if (Array.isArray(items)) {
          console.log('📊 Slack marketPriceDebug.items:', items);
        } else {
          console.log('📊 Slack marketPriceDebug keys:', Object.keys(data.marketPriceDebug || {}));
        }
      }

      if (data.sent) {
        if (type === 'out_for_delivery') {
          showNotification(`Sent Out for Delivery to Slack! ${data?.summary?.outForDelivery ?? 0} item(s)`, 'success');
        } else {
          showNotification(
            `Sent to Slack! ${data.summary.arrivingToday} arriving today, ${data.summary.arrivingTomorrow} tomorrow`,
            'success'
          );
        }
      } else {
        showNotification('No deliveries to notify about', 'info');
      }
    } catch (e) {
      console.error('Failed to send Slack notification:', e);
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      
      const name = String((e as any)?.name || '');
      if (name === 'AbortError' || name.toLowerCase().includes('abort')) {
        // If our watchdog already fired, don't double-toast.
        if (!slackSendTimedOutRef.current) {
          showNotification(
            type === 'daily_summary'
              ? 'Slack send timed out — try again (daily summary can take longer)'
              : 'Slack send timed out — try again',
            'error'
          );
        }
        return;
      }

      if (errorMsg.includes('not configured')) {
        showNotification('Slack not configured. Add SLACK_WEBHOOK_URL to .env.local', 'error');
      } else {
        showNotification(`Failed to send notification: ${errorMsg}`, 'error');
      }
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      setSendingSlackNotification(false);
      setSendingSlackType(null);
    }
  };

  // Send Slack notification (daily summary)
  const handleSendSlackNotification = async () => {
    await sendSlack('daily_summary');
  };

  // Send Slack notification (out for delivery only)
  const handleSendSlackOutForDelivery = async () => {
    await sendSlack('out_for_delivery');
  };

  // Test-only: force a couple entries to OFD in the Slack payload so you can preview layout
  const handleTestSendSlackOutForDelivery = async () => {
    await sendSlack('out_for_delivery', { testForceOFDCount: 2 });
  };

  const loadSlackSchedule = async () => {
    if (!user) return;
    setSlackScheduleLoading(true);
    try {
      const res = await fetch(`/api/deliveries/slack-settings?userId=${encodeURIComponent(user.uid)}`, {
        method: 'GET',
        headers: { 'x-user-id': user.uid },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load Slack schedule');
      const s = data?.settings || {};
      const normalizeTzForUi = (tz: string) => {
        const t = String(tz || '').trim();
        if (!t) return 'ET';
        if (t === 'America/New_York') return 'ET';
        return t;
      };
      setSlackSchedule({
        enabled: s.enabled === true,
        webhookUrl: String(s.webhookUrl || ''),
        timeLocal: String(s.timeLocal || '09:30'),
        timezone: normalizeTzForUi(String(s.timezone || 'America/New_York')),
        lastSentLocalDate: typeof s.lastSentLocalDate === 'string' ? s.lastSentLocalDate : null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      showNotification(`Failed to load Slack schedule: ${msg}`, 'error');
    } finally {
      setSlackScheduleLoading(false);
    }
  };

  const saveSlackSchedule = async () => {
    if (!user) return;
    setSlackScheduleSaving(true);
    try {
      const normalizeTzForSave = (tz: string) => {
        const raw = String(tz || '').trim();
        const upper = raw.toUpperCase();
        if (!raw) return 'America/New_York';
        if (upper === 'ET' || upper === 'EST' || upper === 'EDT') return 'America/New_York';
        return raw;
      };
      const res = await fetch(`/api/deliveries/slack-settings?userId=${encodeURIComponent(user.uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
        body: JSON.stringify({
          enabled: slackSchedule.enabled,
          webhookUrl: slackSchedule.webhookUrl,
          timeLocal: slackSchedule.timeLocal,
          timezone: normalizeTzForSave(slackSchedule.timezone),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to save Slack schedule');
      const s = data?.settings || {};
      setSlackSchedule((prev) => ({
        ...prev,
        enabled: s.enabled === true,
        webhookUrl: String(s.webhookUrl || ''),
        timeLocal: String(s.timeLocal || prev.timeLocal),
        timezone: (() => {
          const t = String(s.timezone || prev.timezone || '').trim();
          return t === 'America/New_York' ? 'ET' : (t || 'ET');
        })(),
        lastSentLocalDate: typeof s.lastSentLocalDate === 'string' ? s.lastSentLocalDate : prev.lastSentLocalDate,
      }));
      showNotification('Saved daily Slack schedule', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      showNotification(`Failed to save Slack schedule: ${msg}`, 'error');
    } finally {
      setSlackScheduleSaving(false);
    }
  };

  const loadCronStatus = async () => {
    try {
      const res = await fetch('/api/cron/status', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      setCronStatus(data || null);
    } catch {
      setCronStatus(null);
    }
  };

  // Filter deliveries
  const filteredDeliveries = deliveries.filter((delivery) => {
    const archived = isArchivedDelivery(delivery);
    // Default: hide archived. When Archived preset is enabled, show only archived.
    if (presetArchived) {
      if (!archived) return false;
    } else {
      if (archived) return false;
    }

    const matchesSearch = !searchTerm || 
      delivery.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.productBrand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus =
      statusFilter === 'all' ||
      // "Shipped" is used as an "active shipments" view: include common in-progress states plus unknown.
      (statusFilter === 'shipped'
        ? delivery.status !== 'delivered'
        : statusFilter === 'delayed'
          ? delivery.status === 'exception'
        : statusFilter === 'today'
          ? (delivery.estimatedDelivery === toLocalYmd(new Date()) || delivery.status === 'out_for_delivery')
          : statusFilter === 'tomorrow'
            ? (() => {
                const t = new Date();
                t.setDate(t.getDate() + 1);
                return delivery.estimatedDelivery === toLocalYmd(t);
              })()
            : statusFilter === 'this_week'
              ? (() => {
                  if (delivery.status === 'delivered') return false;
                  const start = new Date();
                  start.setHours(0, 0, 0, 0);
                  const end = new Date(start);
                  end.setDate(end.getDate() + 7);
                  const dd = parseYmdAsLocalDate(delivery.estimatedDelivery);
                  if (!dd) return false;
                  return dd >= start && dd <= end;
                })()
              : delivery.status === statusFilter);
    const matchesCarrier = carrierFilter === 'all' || delivery.carrier === carrierFilter;

    const anyPresetOn = presetNeedsTracking || presetInvalidTracking;
    const matchesPreset = !anyPresetOn
      ? true
      : (presetNeedsTracking && isNeedsTracking(delivery)) ||
        (presetInvalidTracking && isInvalidTracking(delivery));
    
    return matchesSearch && matchesStatus && matchesCarrier && matchesPreset;
  });

  const toggleDeliverySort = () => {
    setTrackingSort(null);
    setDeliverySort((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const toggleTrackingSort = () => {
    setDeliverySort(null);
    setTrackingSort((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const sortedDeliveries = useMemo(() => {
    if (!deliverySort && !trackingSort) return filteredDeliveries;

    const toDateMs = (raw: string | undefined | null): number | null => {
      if (!raw) return null;
      const s = String(raw).trim();
      if (!s || s.toUpperCase() === 'TBD') return null;
      const ms = Date.parse(s);
      return Number.isFinite(ms) ? ms : null;
    };

    const getDeliveryMs = (d: DeliveryItem): number | null => {
      // Delivered items sort by actual delivery date when available.
      if (d.status === 'delivered') return toDateMs(d.actualDelivery) ?? toDateMs(d.estimatedDelivery);
      // Otherwise sort by ETA (estimatedDelivery).
      return toDateMs(d.estimatedDelivery);
    };

    const dir = (deliverySort || trackingSort) === 'asc' ? 1 : -1;

    return [...filteredDeliveries].sort((a, b) => {
      if (trackingSort) {
        const at = String(a.trackingNumber || '').trim();
        const bt = String(b.trackingNumber || '').trim();
        const aMissing = !at;
        const bMissing = !bt;
        // Keep missing tracking at the bottom regardless of direction.
        if (aMissing && !bMissing) return 1;
        if (!aMissing && bMissing) return -1;
        if (!aMissing && !bMissing && at !== bt) return at.localeCompare(bt) * dir;
        // Tie-breaker: product + id so it feels stable
        const aKey = `${a.productName || ''} ${a.id || ''}`.toLowerCase();
        const bKey = `${b.productName || ''} ${b.id || ''}`.toLowerCase();
        return aKey.localeCompare(bKey) * dir;
      }

      const am = getDeliveryMs(a);
      const bm = getDeliveryMs(b);

      // Keep TBD/invalid dates at the bottom regardless of direction.
      const aMissing = am == null;
      const bMissing = bm == null;
      if (aMissing && !bMissing) return 1;
      if (!aMissing && bMissing) return -1;

      if (am != null && bm != null && am !== bm) return (am - bm) * dir;

      // Stable-ish tie-breakers (so sort doesn't feel random)
      const aKey = `${a.productName || ''} ${a.trackingNumber || ''}`.toLowerCase();
      const bKey = `${b.productName || ''} ${b.trackingNumber || ''}`.toLowerCase();
      return aKey.localeCompare(bKey) * dir;
    });
  }, [deliverySort, filteredDeliveries, trackingSort]);

  // Keep the highlighted item easy to find after refresh/sorts by scrolling it into view.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!highlightedDeliveryId) return;
    if (suppressNextHighlightScrollRef.current) {
      suppressNextHighlightScrollRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-delivery-id="${CSS.escape(highlightedDeliveryId)}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 450);
    return () => window.clearTimeout(t);
  }, [highlightedDeliveryId, sortedDeliveries.length, viewMode]);

  // Save view mode to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deliveriesViewMode', viewMode);
      console.log(`✅ Saved view mode: ${viewMode}`);
    }
  }, [viewMode]);

  // Persist filters so Deliveries opens to what the user last used
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deliveriesStatusFilter', statusFilter);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deliveriesCarrierFilter', carrierFilter);
    }
  }, [carrierFilter]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deliveriesPresetNeedsTracking', String(!!presetNeedsTracking));
    }
  }, [presetNeedsTracking]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deliveriesPresetInvalidTracking', String(!!presetInvalidTracking));
    }
  }, [presetInvalidTracking]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deliveriesPresetArchived', String(!!presetArchived));
    }
  }, [presetArchived]);

  // NOTE: Do not auto-select a row on load.
  // (Users want reloads to start with no selected/highlighted entry.)

  // Load customizable stats settings from Firebase
  useEffect(() => {
    loadStatsSettings();
  }, [user]);

  // Only show the full-screen loader on the FIRST load.
  // Background refreshes should be silent so the page doesn't "flash" every minute.
  const initialLoading = loading && deliveries.length === 0;

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading deliveries...</p>
        </div>
      </div>
    );
  }

  if (error) {
  return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <X className="w-8 h-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400">Error loading deliveries: {error}</p>
        </div>
      </div>
    );
  }

  const outForDeliveryCount = deliveries.filter((d) => String(d.status || '').toLowerCase().trim() === 'out_for_delivery').length;
  const trackingLookupErrorCount = deliveries.filter((d) => {
    const note = String((d as any)?.statusNote || '').toLowerCase();
    return note.includes('tracking lookup error') || note.includes('live tracking not configured') || note.includes('fedex auth failed');
  }).length;
  const ofdDisabledBecauseNone = outForDeliveryCount === 0;
  // Tooltips should explain *why disabled*; during sending we already show spinner + "Sending..." on the button,
  // and a hover tooltip can "stick" because the button becomes disabled under the cursor.
  const ofdDisabledReason = !sendingSlackNotification && ofdDisabledBecauseNone
    ? `Disabled: no packages are currently marked “Out for Delivery”.${trackingLookupErrorCount > 0 ? ' Tracking lookups look unhealthy right now, so statuses may be wrong.' : ''}`
    : null;
  const slackSummaryDisabledReason = !sendingSlackNotification && deliveries.length === 0
    ? 'Disabled: no deliveries are loaded yet.'
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Wider layout on large screens so the table can show more columns */}
      <div className="max-w-screen-2xl mx-auto py-8">
      {/* Header */}
        <div className="flex-1 p-4 sm:p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div className="min-w-0">
              <h1 className="text-3xl font-bold text-white mb-2">Deliveries</h1>
              <p className="text-gray-300 leading-snug max-w-[min(720px,100%)] break-words">
                Track your packages and monitor delivery statuses
              </p>
          </div>
             <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
               <UPSOAuthButton className="shrink-0" />
               
               {/* Send Slack Notification Button */}
               <div className="relative group">
                 <button
                   onClick={handleSendSlackNotification}
                   disabled={sendingSlackNotification || deliveries.length === 0}
                   className={`h-11 px-4 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors text-white disabled:text-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 ${
                     currentTheme.name === 'Neon' ? 'focus:ring-cyan-400/40' : 'focus:ring-blue-500'
                   } bg-purple-600 hover:bg-purple-700 ${
                     sendingSlackNotification && sendingSlackType === 'daily_summary' ? 'animate-pulse cursor-wait' : ''
                   }`}
                   title={undefined}
                   aria-busy={sendingSlackNotification && sendingSlackType === 'daily_summary'}
                 >
                   {sendingSlackNotification && sendingSlackType === 'daily_summary' ? (
                     <RefreshCw className="w-4 h-4 animate-spin" />
                   ) : (
                     <Bell className="w-4 h-4" />
                   )}
                   {sendingSlackNotification && sendingSlackType === 'daily_summary' ? 'Sending...' : 'Send to Slack'}
                 </button>
                 {slackSummaryDisabledReason && (
                   <div className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
                    <div className="w-[min(28rem,calc(100vw-2rem))] whitespace-normal text-left rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-xs leading-snug text-white shadow-xl">
                       {slackSummaryDisabledReason}
                     </div>
                   </div>
                 )}
               </div>

               {/* Send Out-for-Delivery-only Slack Button + Test */}
               <div className="flex flex-col items-stretch gap-1">
                 <div className="relative group">
                   <button
                     onClick={handleSendSlackOutForDelivery}
                     disabled={sendingSlackNotification || ofdDisabledBecauseNone}
                     className={`h-11 px-4 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors text-white disabled:text-white disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 ${
                       currentTheme.name === 'Neon' ? 'focus:ring-cyan-400/40' : 'focus:ring-blue-500'
                     } bg-orange-600 hover:bg-orange-700 ${
                       sendingSlackNotification && sendingSlackType === 'out_for_delivery' ? 'animate-pulse cursor-wait' : ''
                     }`}
                     title={undefined}
                     aria-busy={sendingSlackNotification && sendingSlackType === 'out_for_delivery'}
                   >
                     {sendingSlackNotification && sendingSlackType === 'out_for_delivery' ? (
                       <RefreshCw className="w-4 h-4 animate-spin" />
                     ) : (
                       <Truck className="w-4 h-4" />
                     )}
                     {sendingSlackNotification && sendingSlackType === 'out_for_delivery' ? 'Sending...' : 'Send OFD'}
                   </button>
                   {ofdDisabledReason && (
                     <div className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
                      <div className="w-[min(28rem,calc(100vw-2rem))] whitespace-normal text-left rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-xs leading-snug text-white shadow-xl">
                         {ofdDisabledReason}
                       </div>
                     </div>
                   )}
                 </div>

                 <button
                   type="button"
                   onClick={handleTestSendSlackOutForDelivery}
                   disabled={sendingSlackNotification}
                   className={`h-9 px-4 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 ${
                     currentTheme.name === 'Neon' ? 'focus:ring-cyan-400/40' : 'focus:ring-blue-500'
                   } ${
                     currentTheme.name === 'Neon'
                       ? 'bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/30 text-orange-100'
                       : 'bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700'
                   }`}
                   title="Test layout: forces 2 items into Out for Delivery for the Slack payload only (no data changes)"
                 >
                   <Truck className="w-3.5 h-3.5" />
                   Test OFD
                 </button>
               </div>

               {/* Daily Slack schedule settings */}
               <button
                 onClick={async () => {
                   setShowSlackScheduleModal(true);
                   await Promise.all([loadSlackSchedule(), loadCronStatus()]);
                 }}
                 className={`h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 ${
                   currentTheme.name === 'Neon' ? 'focus:ring-cyan-400/40' : 'focus:ring-blue-500'
                 } bg-white/10 hover:bg-white/15 text-white border border-white/10`}
                 title="Configure daily Slack schedule"
               >
                 <Settings className="w-4 h-4" />
                 Slack Schedule
               </button>
               
               {/* View Mode Toggle */}
               <div className="h-11 inline-flex items-center rounded-xl p-1 bg-white/5 border border-white/10">
            <button
                   onClick={() => setViewMode('split')}
                   className={`h-9 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-2 focus:outline-none ${
                     viewMode === 'split'
                       ? 'bg-blue-600 text-white shadow-sm'
                       : 'text-gray-200 hover:text-white hover:bg-white/10'
                   }`}
                 >
                   <Grid3X3 className="w-4 h-4" />
                   Split View
            </button>
            <button
                   onClick={() => setViewMode('table')}
                   className={`h-9 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-2 focus:outline-none ${
                     viewMode === 'table'
                       ? 'bg-blue-600 text-white shadow-sm'
                       : 'text-gray-200 hover:text-white hover:bg-white/10'
                   }`}
                 >
                   <List className="w-4 h-4" />
                   Table View
            </button>
               </div>

               {/* Add Manual Tracking */}
               <button
                 onClick={() => setShowAddTrackingModal(true)}
                 className={`h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 ${
                   currentTheme.name === 'Neon' ? 'focus:ring-cyan-400/40' : 'focus:ring-blue-500'
                 } bg-emerald-600 hover:bg-emerald-700 text-white`}
               >
                 <Package className="w-4 h-4" />
                 Add Manual Tracking
               </button>
               
            <button
                 onClick={async () => {
                   try {
                     await refreshDeliveries();
                     showNotification('Deliveries refreshed successfully!', 'success');
                   } catch (error) {
                     showNotification('Failed to refresh deliveries', 'error');
                   }
                 }}
                 className={`h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 ${
                   currentTheme.name === 'Neon' ? 'focus:ring-cyan-400/40' : 'focus:ring-blue-500'
                 } bg-blue-600 hover:bg-blue-700 text-white`}
               >
                 <RefreshCw className="w-4 h-4" />
                 Refresh
            </button>
        </div>
      </div>

      {/* Setup status / debug card removed */}

      {/* Add Manual Tracking Modal */}
      {showAddTrackingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                {newTracking.purchaseId ? 'Set tracking number' : 'Add Manual Tracking Number'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddTrackingModal(false);
                  setNewTracking({ purchaseId: '', trackingNumber: '', carrier: 'AUTO', productName: '', productBrand: '', productSize: '' });
                }}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (addingTracking) return;
                handleAddManualTracking();
              }}
            >
              <div>
                <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Tracking Number *</label>
                <input
                  type="text"
                  ref={trackingInputRef}
                  autoFocus
                  value={newTracking.trackingNumber}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text') || '';
                    const extracted = extractTrackingNumberFromText(pasted);
                    if (extracted.trackingNumber) {
                      e.preventDefault();
                      setNewTracking((prev) => ({
                        ...prev,
                        trackingNumber: extracted.trackingNumber || '',
                        carrier: extracted.carrierHint ? extracted.carrierHint : prev.carrier,
                      }));
                    }
                  }}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    const extracted = extractTrackingNumberFromText(nextVal);
                    // Only auto-rewrite when the user pasted a URL-like string; avoid fighting manual typing.
                    const looksLikeUrl = nextVal.includes('http://') || nextVal.includes('https://') || nextVal.includes('fedex.com') || nextVal.includes('ups.com');
                    if (looksLikeUrl && extracted.trackingNumber) {
                      setNewTracking((prev) => ({
                        ...prev,
                        trackingNumber: extracted.trackingNumber || '',
                        carrier: extracted.carrierHint ? extracted.carrierHint : prev.carrier,
                      }));
                      return;
                    }
                    setNewTracking({ ...newTracking, trackingNumber: nextVal });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Paste a tracking # or a FedEx/UPS tracking link…"
                />
              </div>
              <div>
                <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Carrier</label>
                <div className="relative" ref={modalCarrierRef}>
                  <button
                    type="button"
                    onClick={() => setModalCarrierOpen((p) => !p)}
                    className={`w-full px-3 py-2 border rounded-lg text-left inline-flex items-center justify-between gap-2 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/5 border-cyan-500/30 text-white focus:ring-cyan-400/40'
                        : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} ${currentTheme.colors.textPrimary} focus:ring-blue-500`
                    } focus:outline-none focus:ring-2`}
                    aria-haspopup="listbox"
                    aria-expanded={modalCarrierOpen}
                  >
                    <span className="font-semibold">
                      {newTracking.carrier === 'AUTO' ? 'Auto-detect' : newTracking.carrier}
                    </span>
                    <ChevronDown className={`w-4 h-4 opacity-80 transition-transform ${modalCarrierOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <div
                    className={`absolute left-0 right-0 mt-2 rounded-xl border shadow-xl overflow-hidden z-50 ${dropdownMenuMotion(modalCarrierOpen)} ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900/95 border-cyan-500/30 text-white'
                        : 'bg-white border-gray-200 text-gray-900'
                    }`}
                    role="listbox"
                    aria-hidden={!modalCarrierOpen}
                  >
                    {[
                      { value: 'AUTO', label: 'Auto-detect' },
                      { value: 'UPS', label: 'UPS' },
                      { value: 'FedEx', label: 'FedEx' },
                      { value: 'USPS', label: 'USPS' },
                      { value: 'DHL', label: 'DHL' },
                    ].map((opt) => {
                      const selected = newTracking.carrier === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          tabIndex={modalCarrierOpen ? 0 : -1}
                          onClick={() => {
                            setNewTracking((prev) => ({ ...prev, carrier: opt.value }));
                            setModalCarrierOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                            currentTheme.name === 'Neon'
                              ? selected
                                ? 'bg-cyan-500/15 text-white'
                                : 'hover:bg-white/10 text-white'
                              : selected
                                ? 'bg-blue-50 text-blue-900'
                                : 'hover:bg-gray-100 text-gray-900'
                          }`}
                          role="option"
                          aria-selected={selected}
                        >
                          <span className={`w-4 inline-flex justify-center ${selected ? 'opacity-100' : 'opacity-0'}`}>✓</span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Product Name</label>
                  <input
                    type="text"
                    value={newTracking.productName}
                    onChange={(e) => setNewTracking({ ...newTracking, productName: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Brand</label>
                  <input
                    type="text"
                    value={newTracking.productBrand}
                    onChange={(e) => setNewTracking({ ...newTracking, productBrand: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Size</label>
                  <input
                    type="text"
                    value={newTracking.productSize}
                    onChange={(e) => setNewTracking({ ...newTracking, productSize: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTrackingModal(false);
                    setNewTracking({ purchaseId: '', trackingNumber: '', carrier: 'AUTO', productName: '', productBrand: '', productSize: '' });
                  }}
                  className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
                >
                  Cancel
                </button>
                {newTracking.purchaseId ? (
                  <button
                    type="button"
                    onClick={() => openPurchasesForDelivery(newTracking.purchaseId)}
                    className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                    title="Open this purchase in Purchases"
                  >
                    Open in Purchases
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={addingTracking}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
                >
                  {addingTracking ? 'Saving…' : (newTracking.purchaseId ? 'Save tracking' : 'Add Tracking')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Clear Tracking Modal */}
      {confirmClearTrackingOpen && clearTrackingTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Clear tracking number?</h3>
              <button
                onClick={() => {
                  if (clearingTracking) return;
                  setConfirmClearTrackingOpen(false);
                  setClearTrackingTarget(null);
                }}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
              This will remove <span className="font-mono font-semibold">{clearTrackingTarget.trackingNumber}</span> from this purchase.
              {' It will be saved to your purchases (Firebase if stored there; otherwise local storage).'}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (clearingTracking) return;
                  setConfirmClearTrackingOpen(false);
                  setClearTrackingTarget(null);
                }}
                className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
                disabled={clearingTracking}
              >
                Cancel
              </button>
              <button
                onClick={() => void clearTracking()}
                disabled={clearingTracking}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-semibold"
              >
                {clearingTracking ? 'Clearing…' : 'Yes, clear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Archive/Restore Modal */}
      {confirmArchiveOpen && archiveTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                {isArchivedDelivery(archiveTarget) ? 'Restore this entry?' : 'Archive this entry?'}
              </h3>
              <button
                onClick={() => {
                  if (archiving) return;
                  setConfirmArchiveOpen(false);
                  setArchiveTarget(null);
                }}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
              <span className="font-semibold">{archiveTarget.productName}</span>
              {isArchivedDelivery(archiveTarget)
                ? ' will be restored to Deliveries and included in tracking refreshes again.'
                : ' will be hidden from Deliveries (and skipped on future refreshes). You can restore it later from the Archived preset.'}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  if (archiving) return;
                  setConfirmArchiveOpen(false);
                  setArchiveTarget(null);
                }}
                className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
                disabled={archiving}
              >
                Cancel
              </button>
              <button
                onClick={() => void archiveOrRestore(isArchivedDelivery(archiveTarget) ? 'restore' : 'archive')}
                disabled={archiving}
                className={`px-4 py-2 ${
                  isArchivedDelivery(archiveTarget) ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:bg-gray-400 text-white rounded-lg font-semibold`}
              >
                {archiving
                  ? (isArchivedDelivery(archiveTarget) ? 'Restoring…' : 'Archiving…')
                  : (isArchivedDelivery(archiveTarget) ? 'Restore' : 'Archive')}
              </button>
            </div>
          </div>
        </div>
      )}

          {/* Customizable Stats */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Dashboard Stats</h2>
            <button
              onClick={() => setShowStatsSettings(!showStatsSettings)}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Customize
            </button>
          </div>

          {/* Stats Settings Modal */}
          {showStatsSettings && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Customize Dashboard Stats
                  </h3>
            <button
                    onClick={() => setShowStatsSettings(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
            </button>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Select up to 4 stats to display on your dashboard. Drag to reorder.
                </p>

                {/* Available Stats */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Available Stats</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(availableStats).map((stat) => {
                      const Icon = stat.icon;
                      const isSelected = selectedStats.includes(stat.id);
                      const canSelect = selectedStats.length < 4 || isSelected;
                      
                      return (
            <button
                          key={stat.id}
                          onClick={() => handleStatToggle(stat.id)}
                          disabled={!canSelect}
                          className={`p-3 rounded-lg border-2 transition-all duration-200 flex items-center gap-3 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : canSelect
                              ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              : 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${stat.color}`} />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {stat.label}
                          </span>
                          {isSelected && (
                            <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />
                          )}
            </button>
                      );
                    })}
        </div>
      </div>

                {/* Selected Stats Preview */}
            <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    Dashboard Preview ({selectedStats.length}/4) - Drag to reorder
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {selectedStats.map((statId, index) => {
                      const stat = availableStats[statId as keyof typeof availableStats];
                      if (!stat) return null;
                      
                      const Icon = stat.icon;
                      const isDragging = draggedIndex === index;
                      
                      return (
                        <div
                          key={statId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-3 flex items-center gap-2 cursor-move transition-all duration-200 ${
                            isDragging ? 'opacity-50 scale-95' : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                          }`}
                        >
                          <GripVertical className="w-4 h-4 text-gray-400" />
                          <Icon className={`w-4 h-4 ${stat.color}`} />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {stat.label}
                          </span>
            </div>
                      );
                    })}
          </div>
        </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowStatsSettings(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      await saveStatsSettings(selectedStats);
                      setShowStatsSettings(false);
                      showNotification('Dashboard stats saved successfully!', 'success');
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Save Changes
                  </button>
            </div>
            </div>
          </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {selectedStats.map((statId) => {
              const stat = availableStats[statId as keyof typeof availableStats];
              if (!stat) return null;
              
              const Icon = stat.icon;
              const mapped = statCardFilterMap[statId];
              const isActive = !!mapped && statusFilter === mapped.statusFilter;
              return (
                <button
                  key={statId}
                  type="button"
                  onClick={() => {
                    if (!mapped) return;
                    // Toggle behavior: clicking the active card clears the filter and shows the full table again.
                    if (isActive) {
                      suppressNextHighlightScrollRef.current = true;
                      setStatusFilter('all');
                      return;
                    }
                    setPresetNeedsTracking(false);
                    setPresetInvalidTracking(false);
                    setPresetArchived(false);
                    setCarrierFilter('all');
                    setSearchTerm('');
                    setDeliverySort(null);
                    setTrackingSort(null);
                    setStatusFilter(mapped.statusFilter);
                  }}
                  className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 text-left transition-all duration-200 flex flex-col ${
                    mapped ? 'cursor-pointer hover:bg-white/15' : 'cursor-default'
                  } ${isActive ? 'ring-2 ring-blue-500/80 shadow-lg shadow-blue-500/20' : ''} ${
                    showStatsSkeleton ? 'shadow-xl shadow-black/30 ring-1 ring-white/10' : ''
                  }`}
                  title={mapped ? `Filter table: ${mapped.label}` : undefined}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    <span className="text-white font-semibold">{stat.label}</span>
                  </div>
                  {showStatsSkeleton ? (
                    <div className="mt-2 flex justify-center">
                      <div className="h-7 w-14 rounded bg-white/15 animate-pulse" />
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-white mt-1 text-center w-full">
                      {hasDeliveries ? stat.getValue() : (cachedStatValues?.[statId] ?? 0)}
                    </p>
                  )}
                  {/* Reserve footer space so the active card doesn't appear taller */}
                  <div className="mt-2 h-4">
                    {mapped ? (
                      <p
                        className={`text-xs font-semibold ${isActive ? 'text-blue-200' : 'text-blue-200/0'}`}
                      >
                        Table filtered
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Filters */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} mb-6`}>
        {activeStatusFilterLabel ? (
          <div
            className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 backdrop-blur-sm ${
              currentTheme.name === 'Neon'
                ? 'border border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15),0_12px_40px_rgba(34,211,238,0.12)]'
                : 'border border-blue-200/70 bg-blue-50/70 dark:border-blue-400/25 dark:bg-blue-500/10'
            }`}
          >
            <div className={`text-sm ${currentTheme.colors.textPrimary}`}>
              <span className="font-semibold">Table filtered to:</span> {activeStatusFilterLabel}{' '}
              <span className={`${currentTheme.colors.textSecondary}`}>({sortedDeliveries.length})</span>
            </div>
            <button
              type="button"
              onClick={() => {
                suppressNextHighlightScrollRef.current = true;
                setStatusFilter('all');
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/90"
              title="Clear status filter"
            >
              Clear
            </button>
          </div>
        ) : null}

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={`text-xs font-semibold uppercase tracking-wider ${currentTheme.colors.textSecondary}`}>
            Presets
          </span>
          <button
            type="button"
            onClick={() => {
              setPresetNeedsTracking(false);
              setPresetInvalidTracking(false);
              setPresetArchived(false);
            }}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              !presetNeedsTracking && !presetInvalidTracking && !presetArchived
                ? 'bg-blue-600 text-white border-blue-600'
                : `${currentTheme.colors.border} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700`
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setPresetNeedsTracking((v) => !v);
              setPresetArchived(false);
              setStatusFilter('all');
              setCarrierFilter('all');
              setSearchTerm('');
              setDeliverySort(null);
              setTrackingSort(null);
            }}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              presetNeedsTracking
                ? 'bg-blue-600 text-white border-blue-600'
                : `${currentTheme.colors.border} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700`
            }`}
            title="Show deliveries missing a tracking number"
          >
            Needs tracking ({presetCounts.needs})
          </button>
          <button
            type="button"
            onClick={() => {
              setPresetInvalidTracking((v) => !v);
              setPresetArchived(false);
              setStatusFilter('all');
              setCarrierFilter('all');
              setSearchTerm('');
              setDeliverySort(null);
              setTrackingSort(null);
            }}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              presetInvalidTracking
                ? 'bg-blue-600 text-white border-blue-600'
                : `${currentTheme.colors.border} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700`
            }`}
            title="Show deliveries where the carrier lookup failed (tracking not found/invalid)"
          >
            Invalid tracking ({presetCounts.invalid})
          </button>
          <button
            type="button"
            onClick={() => {
              setPresetArchived((v) => !v);
              // Archived view is its own section
              setPresetNeedsTracking(false);
              setPresetInvalidTracking(false);
              setStatusFilter('all');
              setCarrierFilter('all');
              setSearchTerm('');
              setDeliverySort(null);
              setTrackingSort(null);
            }}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              presetArchived
                ? 'bg-blue-600 text-white border-blue-600'
                : `${currentTheme.colors.border} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700`
            }`}
            title="Show archived entries (can be restored)"
          >
            Archived ({presetCounts.archived})
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${currentTheme.colors.textSecondary}`} />
              <input
                type="text"
                placeholder="Search by product name, tracking number, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>
          
          <div className="flex gap-4">
            <div ref={statusRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setStatusOpen((v) => !v);
                  setCarrierOpen(false);
                }}
                className={`relative w-56 px-4 py-2 pr-11 border rounded-lg cursor-pointer transition-colors text-left whitespace-nowrap focus:outline-none focus:ring-2 ${
                  currentTheme.colors.border
                } ${currentTheme.name === 'Neon' ? 'bg-gray-900/85' : currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon'
                    ? 'hover:border-cyan-400/60 focus:ring-cyan-400/40 focus:border-cyan-400/60 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
                    : 'hover:border-gray-300 focus:ring-blue-500'
                }`}
                aria-haspopup="listbox"
                aria-expanded={statusOpen}
              >
                <span className="block truncate" title={getOptionLabel(statusOptions, statusFilter)}>
                  {getOptionLabel(statusOptions, statusFilter)}
                </span>
                <ChevronDown
                  className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 ${
                    currentTheme.name === 'Neon' ? 'text-cyan-200/80' : 'text-gray-500'
                  }`}
                />
              </button>
              <div
                role="listbox"
                aria-hidden={!statusOpen}
                className={`absolute z-50 mt-2 w-full rounded-xl border p-1 shadow-xl ${dropdownMenuMotion(statusOpen)} ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gray-900/95 border-cyan-500/30 text-white'
                    : 'bg-white border-gray-200 text-gray-900'
                }`}
              >
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    tabIndex={statusOpen ? 0 : -1}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setStatusOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      opt.value === statusFilter
                        ? currentTheme.name === 'Neon'
                          ? 'bg-white/10'
                          : 'bg-gray-100'
                        : ''
                    } ${currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div ref={carrierRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setCarrierOpen((v) => !v);
                  setStatusOpen(false);
                }}
                className={`relative w-44 px-4 py-2 pr-11 border rounded-lg cursor-pointer transition-colors text-left whitespace-nowrap focus:outline-none focus:ring-2 ${
                  currentTheme.colors.border
                } ${currentTheme.name === 'Neon' ? 'bg-gray-900/85' : currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon'
                    ? 'hover:border-cyan-400/60 focus:ring-cyan-400/40 focus:border-cyan-400/60 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
                    : 'hover:border-gray-300 focus:ring-blue-500'
                }`}
                aria-haspopup="listbox"
                aria-expanded={carrierOpen}
              >
                <span className="block truncate" title={getOptionLabel(carrierOptions, carrierFilter)}>
                  {getOptionLabel(carrierOptions, carrierFilter)}
                </span>
                <ChevronDown
                  className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 ${
                    currentTheme.name === 'Neon' ? 'text-cyan-200/80' : 'text-gray-500'
                  }`}
                />
              </button>
              <div
                role="listbox"
                aria-hidden={!carrierOpen}
                className={`absolute z-50 mt-2 w-full rounded-xl border p-1 shadow-xl ${dropdownMenuMotion(carrierOpen)} ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gray-900/95 border-cyan-500/30 text-white'
                    : 'bg-white border-gray-200 text-gray-900'
                }`}
              >
                {carrierOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    tabIndex={carrierOpen ? 0 : -1}
                    onClick={() => {
                      setCarrierFilter(opt.value);
                      setCarrierOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      opt.value === carrierFilter
                        ? currentTheme.name === 'Neon'
                          ? 'bg-white/10'
                          : 'bg-gray-100'
                        : ''
                    } ${currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            
            {(statusFilter !== 'all' ||
              carrierFilter !== 'all' ||
              presetNeedsTracking ||
              presetInvalidTracking ||
              presetArchived ||
              searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setCarrierFilter('all');
                  setSearchTerm('');
                  setPresetNeedsTracking(false);
                  setPresetInvalidTracking(false);
                  setPresetArchived(false);
                }}
                className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500`}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

         {/* Main Content */}
        <div id="deliveriesTableTop" />
        {sortedDeliveries.length === 0 ? (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg p-12 text-center border ${currentTheme.colors.border}`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            {(() => {
              const hasAnyFilter =
                !!searchTerm ||
                statusFilter !== 'all' ||
                carrierFilter !== 'all' ||
                presetNeedsTracking ||
                presetInvalidTracking ||
                presetArchived;

              const chips: string[] = [];
              if (presetNeedsTracking) chips.push('Needs tracking');
              if (presetInvalidTracking) chips.push('Invalid tracking');
              if (presetArchived) chips.push('Archived');
              if (statusFilter !== 'all') chips.push(`Status: ${getOptionLabel(statusOptions, statusFilter)}`);
              if (carrierFilter !== 'all') chips.push(`Carrier: ${getOptionLabel(carrierOptions, carrierFilter)}`);
              if (searchTerm) chips.push(`Search: "${searchTerm}"`);

              return (
                <>
                  <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                    {hasAnyFilter ? 'No deliveries match your current filters' : 'No deliveries found'}
                  </h3>
                  <p className={`${currentTheme.colors.textSecondary} mb-4`}>
                    {hasAnyFilter
                      ? 'Try clearing a preset/filter or broadening your search.'
                      : 'No purchases with tracking numbers found. Make sure your purchases have tracking information.'}
                  </p>
                  {hasAnyFilter && chips.length ? (
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                      {chips.map((c) => (
                        <span
                          key={c}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            currentTheme.name === 'Neon'
                              ? 'bg-white/5 border-white/10 text-white/80'
                              : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {hasAnyFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setCarrierFilter('all');
                        setSearchTerm('');
                        setPresetNeedsTracking(false);
                        setPresetInvalidTracking(false);
                        setPresetArchived(false);
                      }}
                      className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    >
                      Clear Filters
                    </button>
                  ) : null}
                </>
              );
            })()}
              </div>
         ) : viewMode === 'split' ? (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
            {/* Left Panel - Delivery List */}
            <div className="flex flex-col">
              <div className={`bg-white/10 backdrop-blur-sm rounded-lg border ${currentTheme.colors.border} flex-1 flex flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                    Deliveries ({sortedDeliveries.length})
                  </h3>
                  <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                    Click a delivery to view details
                  </p>
          </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 p-4">
                    {sortedDeliveries.map((delivery) => (
            <div 
              key={delivery.id} 
              data-delivery-id={delivery.id}
              style={getHighlightStyle(highlightedDeliveryId === delivery.id)}
                        onClick={() => setSelectedDelivery(delivery)}
                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all duration-200 ${
                          selectedDelivery?.id === delivery.id 
                            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700' 
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        } ${
                          getHighlightBgClass(highlightedDeliveryId === delivery.id)
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Product Image */}
                          {delivery.productImage ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeliveryImageClick(delivery);
                              }}
                              className={`relative w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                                currentTheme.name === 'Neon'
                                  ? 'ring-2 ring-white/10 hover:ring-cyan-400'
                                  : 'ring-2 ring-gray-200 hover:ring-blue-400 shadow-md'
                              }`}
                              title="Click to preview image"
                              aria-label={`Preview image for ${delivery.productName}`}
                            >
                              <img
                                src={delivery.productImage}
                                alt={delivery.productName}
                                className="w-full h-full object-cover rounded-xl"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (target.getAttribute('data-fallback') !== '1') {
                                    target.setAttribute('data-fallback', '1');
                                    target.src = '/placeholder-shoe.png';
                                    target.style.display = 'block';
                                  }
                                }}
                              />
                            </button>
                          ) : (
                            <div className="flex-shrink-0">
                              {getStatusIcon(getDisplayStatus(delivery))}
                            </div>
                          )}
                          
                          {/* Main Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                      {delivery.productName}
                              </h4>
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(getDisplayStatus(delivery))}`}>
                      {formatStatus(getDisplayStatus(delivery))}
                    </span>
                    {delivery.liveTracking && !delivery.liveTracking.error && (
                                <Wifi className="w-3 h-3 text-green-500" title="Live tracking" />
                    )}
                    {delivery.liveTracking?.error && (
                                <WifiOff className="w-3 h-3 text-red-500" title="Tracking error" />
                    )}
                    {!delivery.liveTracking && (
                                <Clock className="w-3 h-3 text-blue-500" title="Loading tracking" />
                    )}
                  </div>
                  
                            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <span>{delivery.productBrand}</span>
                                <span className="text-gray-400">•</span>
                                <SizePill size={delivery.productSize} />
                              </div>
                              <div className="flex items-center gap-1">
                                <span>{delivery.carrier} • </span>
                                {delivery.trackingNumber ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSetTrackingForDelivery(delivery);
                                      }}
                                      className={`font-mono underline underline-offset-2 decoration-1 ${
                                        currentTheme.name === 'Neon'
                                          ? 'text-cyan-200/80 hover:text-cyan-100 decoration-cyan-300/40 hover:decoration-cyan-200/70'
                                          : 'text-blue-600 hover:text-blue-500'
                                      }`}
                                      title="Edit tracking number"
                                    >
                                      {delivery.trackingNumber}
                                    </button>
                                    <a
                                      href={getFedExTrackingUrl(delivery.trackingNumber)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setHighlightedDeliveryId(delivery.id);
                                        setSelectedDelivery(delivery);
                                      }}
                                      className="ml-1 inline-flex items-center text-gray-400 hover:text-blue-400 transition-colors"
                                      title="Open FedEx tracking in a new tab"
                                      aria-label="Open FedEx tracking"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openSetTrackingForDelivery(delivery);
                                    }}
                                    className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
                                    title="Set the correct tracking number"
                                  >
                                    Needs tracking
                                  </button>
                                )}
                                {copiedTrackingId === delivery.id && (
                                  <span className="text-green-500 ml-1">✓</span>
                                )}
                                {delivery.trackingNumber ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void copyTrackingNumber(delivery.trackingNumber, delivery.id);
                                    }}
                                    className="ml-1 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                                    title="Copy tracking number"
                                    aria-label="Copy tracking number"
                                  >
                                    <Copy className="w-3 h-3 text-gray-500 hover:text-blue-500" />
                                  </button>
                                ) : null}
                                {isTrackingNotFound(delivery) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requestClearTracking(delivery);
                                    }}
                                    className="ml-1 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200"
                                    title="Clear invalid tracking number"
                                    aria-label="Clear invalid tracking number"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-500" />
                                  </button>
                                ) : null}
                                {/* Archive / Restore */}
                                {presetArchived || isArchivedDelivery(delivery) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setArchiveTarget(delivery);
                                      setConfirmArchiveOpen(true);
                                    }}
                                    className="ml-1 p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-200"
                                    title="Restore from archive"
                                    aria-label="Restore from archive"
                                  >
                                    <RefreshCw className="w-3 h-3 text-blue-500" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requestArchive(delivery);
                                    }}
                                    className="ml-1 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200"
                                    title="Archive entry"
                                    aria-label="Archive entry"
                                  >
                                    <Trash2 className="w-3 h-3 text-red-500" />
                                  </button>
                                )}
                              </div>
                              {delivery.emailUrl ? (
                                <div className="mt-1 flex items-center gap-1">
                                  <Mail className="w-3 h-3 text-blue-500" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openOrderEmail(delivery);
                                    }}
                                    className="text-blue-500 hover:text-blue-400 transition-colors duration-200 text-xs font-semibold"
                                    title="Open order confirmation email"
                                  >
                                    Open email
                                  </button>
                                </div>
                              ) : null}
                              <div className="flex items-start gap-2">
                                <Calendar className="w-3 h-3 mt-1" />
                                <div>{getDeliveryCell(delivery)}</div>
                              </div>
                  </div>
                </div>
                
                          {/* Selection Indicator */}
                          <div className="flex-shrink-0">
                            <div className={`w-2 h-2 rounded-full ${
                              selectedDelivery?.id === delivery.id 
                                ? 'bg-cyan-500' 
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`} />
                </div>
              </div>
                  </div>
                    ))}
                    </div>
                      </div>
                        </div>
                        </div>
            
            {/* Right Panel - Delivery Details */}
            <div className="flex flex-col">
              <div className={`bg-white/10 backdrop-blur-sm rounded-lg border ${currentTheme.colors.border} flex-1 flex flex-col`}>
                {selectedDelivery ? (
                  <>
                     <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                       <div className="flex items-center justify-between">
                         <div>
                           <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                             {selectedDelivery.productName}
                           </h3>
                           <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                             {selectedDelivery.productBrand} • Size {selectedDelivery.productSize} • {selectedDelivery.carrier}
                    </p>
                  </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(getDisplayStatus(selectedDelivery))}`}>
                                  {formatStatus(getDisplayStatus(selectedDelivery))}
                                </span>
                                {selectedDelivery.trackingNumber ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openSetTrackingForDelivery(selectedDelivery)}
                                      className="text-sm font-mono text-blue-500 hover:text-blue-400 underline underline-offset-2"
                                      title="Edit tracking number"
                                    >
                                      {selectedDelivery.trackingNumber}
                                    </button>
                                    <a
                                      href={getFedExTrackingUrl(selectedDelivery.trackingNumber)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => {
                                        setHighlightedDeliveryId(selectedDelivery.id);
                                      }}
                                      className="inline-flex items-center text-gray-400 hover:text-blue-400 transition-colors"
                                      title="Open FedEx tracking in a new tab"
                                      aria-label="Open FedEx tracking"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => void copyTrackingNumber(selectedDelivery.trackingNumber, selectedDelivery.id)}
                                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                                      title="Copy tracking number"
                                      aria-label="Copy tracking number"
                                    >
                                      <Copy className="w-4 h-4 text-gray-500 hover:text-blue-500" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openSetTrackingForDelivery(selectedDelivery)}
                                    className="text-sm font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
                                    title="Set the correct tracking number"
                                  >
                                    Needs tracking
                                  </button>
                                )}
                              </div>
                            </div>
                            </div>
                     <div className="flex-1 overflow-y-auto">
                       <div className="p-4">

                              {/* Tracking Updates */}
                        {selectedDelivery.updates && selectedDelivery.updates.length > 0 && (
                                <div>
                            <div className="flex items-center justify-between mb-3">
                              <h5 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                                Tracking History ({selectedDelivery.updates.length})
                              </h5>
                              <button
                                onClick={() => copyShipmentData(selectedDelivery, selectedDelivery.id)}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors duration-200"
                                title="Copy full shipment data as JSON"
                              >
                                <Copy className="w-4 h-4" />
                                Copy Data
                                {copiedShipmentId === selectedDelivery.id && (
                                  <span className="text-green-500 text-xs">✓</span>
                                )}
                              </button>
                            </div>
                             <div className="space-y-3 max-h-96 overflow-y-auto">
                              {selectedDelivery.updates.map((update, index) => (
                                <div key={index} className={`${currentTheme.colors.cardBackground} rounded-lg p-3 border ${currentTheme.colors.border}`}>
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                      <p className={`${currentTheme.colors.textPrimary} font-medium text-sm`}>
                                        {update.description || 'No description'}
                                      </p>
                                      <p className={`${currentTheme.colors.textSecondary} text-xs mt-1`}>
                                              {update.location || 'Unknown location'}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                      <p className={`${currentTheme.colors.textSecondary} text-xs`}>
                                              {update.timestamp ? new Date(update.timestamp).toLocaleString() : 'Unknown time'}
                                            </p>
                                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                                        update.status === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        update.status === 'exception' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                        update.status === 'in_transit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                        update.status === 'out_for_delivery' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                      }`}>
                                        {update.status.replace('_', ' ').toUpperCase()}
                                      </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
                      <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
                      <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                        Select a Delivery
                      </h3>
                      <p className={`${currentTheme.colors.textSecondary}`}>
                        Choose a delivery from the list to view details
                                </p>
                              </div>
                                </div>
                              )}
                            </div>
                          </div>
                      </div>
        ) : (
          /* Table View */
          <div className={`${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`bg-gray-50 dark:bg-gray-800 border-b ${currentTheme.colors.border}`}>
                  <tr>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Image
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Product
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      <button
                        type="button"
                        onClick={toggleTrackingSort}
                        className="inline-flex items-center gap-1 hover:opacity-90"
                        title={`Sort by Tracking ${trackingSort === 'asc' ? '(A→Z)' : '(Z→A)'}`}
                      >
                        Tracking
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            trackingSort === 'asc' ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Status
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      <button
                        type="button"
                        onClick={toggleDeliverySort}
                        className="inline-flex items-center gap-1 hover:opacity-90"
                        title={`Sort by Delivery ${deliverySort === 'asc' ? '(A→Z)' : '(Z→A)'}`}
                      >
                        Delivery
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            deliverySort === 'asc' ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Location
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Carrier
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      <span className="relative inline-flex items-center gap-1 group">
                        <span>Live</span>
                        <Info className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
                        <span
                          className={`pointer-events-none absolute left-0 top-full mt-2 w-64 rounded-lg border px-3 py-2 text-[11px] normal-case tracking-normal opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-50 ${
                            currentTheme.name === 'Neon'
                              ? 'bg-gray-900/95 border-cyan-500/30 text-gray-100 shadow-cyan-500/10'
                              : 'bg-white border-gray-200 text-gray-700 shadow-black/10'
                          }`}
                        >
                          Live tracking is enabled for this delivery — the app will fetch real-time carrier updates (scans/ETA) instead of only using the original email/purchase data.
                        </span>
                      </span>
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className={`${currentTheme.colors.cardBackground} divide-y ${currentTheme.colors.border}`}>
                  {sortedDeliveries.map((delivery) => (
                    <tr 
                      key={delivery.id}
                      data-delivery-id={delivery.id}
                      onClick={() => {
                        setSelectedDelivery(delivery);
                        setDetailsModalOpen(true);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDelivery(delivery);
                          setDetailsModalOpen(true);
                        }
                      }}
                      style={getHighlightStyle(highlightedDeliveryId === delivery.id)}
                      className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-150 ${
                        selectedDelivery?.id === delivery.id ? 'bg-cyan-50 dark:bg-cyan-900/20' : ''
                      } ${getHighlightBgClass(highlightedDeliveryId === delivery.id)}`}
                    >
                      {/* Image */}
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          {delivery.productImage ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeliveryImageClick(delivery);
                              }}
                              className={`relative w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                                currentTheme.name === 'Neon'
                                  ? 'ring-2 ring-white/10 hover:ring-cyan-400'
                                  : 'ring-2 ring-gray-200 hover:ring-blue-400 shadow-md'
                              }`}
                              title="Click to preview image"
                              aria-label={`Preview image for ${delivery.productName}`}
                            >
                              <img
                                src={delivery.productImage}
                                alt={delivery.productName}
                                className="w-full h-full object-cover rounded-xl"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (target.getAttribute('data-fallback') !== '1') {
                                    target.setAttribute('data-fallback', '1');
                                    target.src = '/placeholder-shoe.png';
                                    target.style.display = 'block';
                                  }
                                }}
                              />
                            </button>
                          ) : null}
                          <div className={`${delivery.productImage ? 'hidden' : ''} status-icon-fallback`}>
                            {getStatusIcon(getDisplayStatus(delivery))}
                          </div>
                        </div>
                      </td>

                      {/* Product */}
                      <td className="px-4 py-4">
                        <div className="min-w-0">
                          <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                            {delivery.productName}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className={`text-xs ${currentTheme.colors.textSecondary}`}>{delivery.productBrand}</span>
                            <SizePill size={delivery.productSize} />
                          </div>
                        </div>
                      </td>
                      
                      {/* Tracking */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-2">
                          {delivery.trackingNumber ? (
                            <>
                              {(() => {
                                const invalid = isTrackingNotFound(delivery);
                                const label = invalid ? 'Invalid' : delivery.trackingNumber;
                                const labelClass =
                                  invalid
                                    ? 'text-red-500 hover:text-red-400'
                                    : currentTheme.name === 'Neon'
                                      ? 'text-cyan-200/80 hover:text-cyan-100 decoration-cyan-300/40 hover:decoration-cyan-200/70'
                                      : 'text-blue-600 hover:text-blue-500';
                                return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSetTrackingForDelivery(delivery);
                                }}
                                className={`font-mono text-sm underline underline-offset-2 decoration-1 ${labelClass}`}
                                title={invalid ? 'Invalid tracking — click to edit' : 'Edit tracking number'}
                              >
                                {label}
                              </button>
                                );
                              })()}
                              <a
                                href={getFedExTrackingUrl(delivery.trackingNumber)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHighlightedDeliveryId(delivery.id);
                                  setSelectedDelivery(delivery);
                                }}
                                className="inline-flex items-center text-gray-400 hover:text-blue-400 transition-colors"
                                title="Open FedEx tracking in a new tab"
                                aria-label="Open FedEx tracking"
                                style={{ display: isTrackingNotFound(delivery) ? 'none' : undefined }}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyTrackingNumber(delivery.trackingNumber, delivery.id);
                                }}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                                title="Copy tracking number"
                                aria-label="Copy tracking number"
                              >
                                <Copy className="w-3 h-3 text-gray-500 hover:text-blue-500" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSetTrackingForDelivery(delivery);
                              }}
                              className="text-xs font-semibold text-amber-600 hover:text-amber-500"
                              title="Set the correct tracking number"
                            >
                              Needs tracking
                            </button>
                          )}
                          {copiedTrackingId === delivery.id && (
                            <span className="text-green-500 text-xs">✓</span>
                )}
                          {isTrackingNotFound(delivery) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestClearTracking(delivery);
                              }}
                              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                              title="Clear invalid tracking number"
                              aria-label="Clear invalid tracking number"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          ) : null}
              </div>
                          {delivery.emailUrl ? (
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-blue-500" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openOrderEmail(delivery);
                                }}
                                className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors"
                                title="Open order confirmation email"
                              >
                                Open email
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      
                      {/* Status */}
                      <td className="px-4 py-4 min-w-[160px]">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(getDisplayStatus(delivery))}`}>
                          {formatStatus(getDisplayStatus(delivery))}
                        </span>
                      </td>
                      
                      {/* Delivery */}
                      <td className="px-4 py-4">
                        <div className={`text-sm ${currentTheme.colors.textPrimary}`}>
                          {getDeliveryCell(delivery)}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-4">
                        {(() => {
                          const loc = getLastKnownLocation(delivery);
                          return (
                            <span
                              className={`text-sm ${currentTheme.colors.textPrimary} max-w-[240px] block truncate`}
                              title={loc === '—' ? undefined : loc}
                            >
                              {loc}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Carrier */}
                      <td className="px-4 py-4">
                        <span className={`text-sm ${currentTheme.colors.textPrimary}`}>
                          {delivery.carrier}
                        </span>
                      </td>
                      
                      {/* Live Tracking */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {delivery.liveTracking && !delivery.liveTracking.error && (
                            <Wifi className="w-4 h-4 text-green-500" title="Live tracking" />
                          )}
                          {delivery.liveTracking?.error && (
                            <WifiOff className="w-4 h-4 text-red-500" title="Tracking error" />
                          )}
                          {!delivery.liveTracking && (
                            <Clock className="w-4 h-4 text-blue-500" title="Loading tracking" />
                  )}
                </div>
                      </td>
            
                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
              <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyShipmentData(delivery, delivery.id);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400"
                            title="Copy shipment data"
                          >
                            <Copy className="w-4 h-4" />
              </button>
                          {isArchivedDelivery(delivery) ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setArchiveTarget(delivery);
                                setConfirmArchiveOpen(true);
                              }}
                              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors duration-200 text-blue-600 dark:text-blue-400"
                              title="Restore from archive"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                requestArchive(delivery);
                              }}
                              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200 text-red-600 dark:text-red-400"
                              title="Archive entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
            </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
      )}

        {/* Table View: Details Modal */}
        {viewMode === 'table' && selectedDelivery && detailsModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delivery details"
            onMouseDown={(e) => {
              // close when clicking the backdrop
              if (e.target === e.currentTarget) setDetailsModalOpen(false);
            }}
          >
            <div
              className={`w-full max-w-4xl rounded-xl border overflow-hidden shadow-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-900/95 border-cyan-500/30'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`
              }`}
            >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex items-start gap-3">
                    {/* Product Image */}
                    {selectedDelivery.productImage ? (
                      <button
                        type="button"
                        onClick={() => handleDeliveryImageClick(selectedDelivery)}
                        className={`relative w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-[1.02] ${
                          currentTheme.name === 'Neon'
                            ? 'ring-2 ring-white/10 hover:ring-cyan-400'
                            : 'ring-2 ring-gray-200 hover:ring-blue-400 shadow-md'
                        }`}
                        title="Click to preview image"
                        aria-label={`Preview image for ${selectedDelivery.productName}`}
                      >
                        <img
                          src={selectedDelivery.productImage}
                          alt={selectedDelivery.productName}
                          className="w-full h-full object-cover rounded-xl"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.getAttribute('data-fallback') !== '1') {
                              target.setAttribute('data-fallback', '1');
                              target.src = '/placeholder-shoe.png';
                              target.style.display = 'block';
                            }
                          }}
                        />
                      </button>
                    ) : (
                      <div className="mt-1">{getStatusIcon(getDisplayStatus(selectedDelivery))}</div>
                    )}

                    <div className="min-w-0">
                      <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} break-words`}>
                        {selectedDelivery.productName}
                      </h3>
                      <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1 break-words`}>
                        {selectedDelivery.productBrand} • Size {selectedDelivery.productSize} • {selectedDelivery.carrier}
                      </p>

                      {/* Tracking */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(() => {
                          const invalid = isTrackingNotFound(selectedDelivery);
                          const hasTracking = !!(selectedDelivery.trackingNumber && selectedDelivery.trackingNumber.trim());
                          if (!hasTracking) {
                            return (
                              <button
                                type="button"
                                onClick={() => openSetTrackingForDelivery(selectedDelivery)}
                                className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
                                title="Set the correct tracking number"
                              >
                                Needs tracking
                              </button>
                            );
                          }
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => openSetTrackingForDelivery(selectedDelivery)}
                                className={`font-mono text-sm underline underline-offset-2 decoration-1 ${
                                  invalid
                                    ? 'text-red-300 hover:text-red-200'
                                    : currentTheme.name === 'Neon'
                                      ? 'text-cyan-200/80 hover:text-cyan-100 decoration-cyan-300/40 hover:decoration-cyan-200/70'
                                      : 'text-blue-600 hover:text-blue-500'
                                }`}
                                title={invalid ? 'Invalid tracking — click to edit' : 'Edit tracking number'}
                              >
                                {invalid ? 'Invalid' : selectedDelivery.trackingNumber}
                              </button>

                              {!invalid ? (
                                <>
                                  <a
                                    href={getFedExTrackingUrl(selectedDelivery.trackingNumber)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => {
                                      setHighlightedDeliveryId(selectedDelivery.id);
                                    }}
                                    className="inline-flex items-center text-gray-400 hover:text-blue-400 transition-colors"
                                    title="Open FedEx tracking in a new tab"
                                    aria-label="Open FedEx tracking"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => void copyTrackingNumber(selectedDelivery.trackingNumber, selectedDelivery.id)}
                                    className="p-1 hover:bg-white/10 rounded transition-colors duration-200"
                                    title="Copy tracking number"
                                    aria-label="Copy tracking number"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-gray-400 hover:text-cyan-200/80" />
                                  </button>
                                  {copiedTrackingId === selectedDelivery.id && (
                                    <span className="text-green-500 text-xs">✓</span>
                                  )}
                                </>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(getDisplayStatus(selectedDelivery))}`}>
                      {formatStatus(getDisplayStatus(selectedDelivery))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDetailsModalOpen(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400"
                      title="Close details"
                      aria-label="Close details"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                {/* Tracking Updates */}
                {selectedDelivery.updates && selectedDelivery.updates.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                        Tracking History ({selectedDelivery.updates.length})
                      </h5>
                      <button
                        type="button"
                        onClick={() => copyShipmentData(selectedDelivery, selectedDelivery.id)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors duration-200"
                        title="Copy full shipment data as JSON"
                      >
                        <Copy className="w-4 h-4" />
                        Copy Data
                        {copiedShipmentId === selectedDelivery.id && (
                          <span className="text-green-500 text-xs">✓</span>
                        )}
                      </button>
                    </div>
                    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                      {selectedDelivery.updates.map((update, index) => (
                        <div
                          key={index}
                          className={`rounded-lg p-3 border ${
                            currentTheme.name === 'Neon'
                              ? 'bg-gray-800/60 border-cyan-500/20'
                              : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className={`${currentTheme.colors.textPrimary} font-medium text-sm`}>
                                {update.description || 'No description'}
                              </p>
                              <p className={`${currentTheme.colors.textSecondary} text-xs mt-1`}>
                                {update.location || 'Unknown location'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`${currentTheme.colors.textSecondary} text-xs`}>
                                {update.timestamp ? new Date(update.timestamp).toLocaleString() : 'Unknown time'}
                              </p>
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                                update.status === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                update.status === 'exception' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                update.status === 'in_transit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                update.status === 'out_for_delivery' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                              }`}>
                                {update.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Slack Schedule Modal */}
        {showSlackScheduleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div
              className={`w-full max-w-lg rounded-2xl border shadow-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-900/95 border-cyan-500/30 text-white'
                  : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              <div className="p-5 border-b border-white/10 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">Daily Slack Schedule</div>
                  <div className={`text-sm ${currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-gray-600'}`}>
                    Sends your daily delivery summary automatically at your chosen time.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlackScheduleModal(false)}
                  className={`p-2 rounded-lg transition-colors ${currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {slackScheduleLoading ? (
                  <div className={`text-sm ${currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-gray-600'}`}>Loading…</div>
                ) : (
                  <>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={slackSchedule.enabled}
                        onChange={(e) => setSlackSchedule((prev) => ({ ...prev, enabled: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-semibold">Enable daily Slack delivery summary</span>
                    </label>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Webhook URL</div>
                      <input
                        value={slackSchedule.webhookUrl}
                        onChange={(e) => setSlackSchedule((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                        placeholder="https://hooks.slack.com/services/..."
                        className={`w-full h-11 px-3 rounded-xl border bg-transparent text-sm ${
                          currentTheme.name === 'Neon'
                            ? 'border-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/30'
                            : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Time (local)</div>
                        <input
                          value={slackSchedule.timeLocal}
                          onChange={(e) => setSlackSchedule((prev) => ({ ...prev, timeLocal: e.target.value }))}
                          placeholder="09:30"
                          className={`w-full h-11 px-3 rounded-xl border bg-transparent text-sm ${
                            currentTheme.name === 'Neon'
                              ? 'border-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/30'
                              : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
                          }`}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Timezone (ET)</div>
                        <input
                          value={slackSchedule.timezone}
                          onChange={(e) => setSlackSchedule((prev) => ({ ...prev, timezone: e.target.value }))}
                          placeholder="ET"
                          className={`w-full h-11 px-3 rounded-xl border bg-transparent text-sm ${
                            currentTheme.name === 'Neon'
                              ? 'border-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/30'
                              : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30'
                          }`}
                        />
                        <div className={`text-[11px] ${currentTheme.name === 'Neon' ? 'text-gray-400' : 'text-gray-500'}`}>
                          Tip: enter <span className="font-semibold">ET</span> (recommended). We store it as <span className="font-mono">America/New_York</span> so daylight savings works.
                        </div>
                      </div>
                    </div>

                    <div className={`text-xs ${currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-gray-600'}`}>
                      <div>
                        <span className="font-semibold">Last sent:</span> {slackSchedule.lastSentLocalDate ? slackSchedule.lastSentLocalDate : '—'}
                      </div>
                      <div>
                        <span className="font-semibold">Cron status:</span>{' '}
                        {cronStatus?.status ? `${cronStatus.status}${cronStatus.paused ? ' (paused)' : ''}` : 'unknown'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleSendSlackNotification}
                        disabled={sendingSlackNotification}
                        className="h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60 bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        <Bell className="w-4 h-4" />
                        Send now (test)
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={loadCronStatus}
                          className={`h-11 px-4 rounded-xl text-sm font-semibold border transition-colors ${
                            currentTheme.name === 'Neon' ? 'border-cyan-500/30 hover:bg-white/10' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          Refresh status
                        </button>
                        <button
                          type="button"
                          onClick={saveSlackSchedule}
                          disabled={slackScheduleSaving}
                          className="h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {slackScheduleSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {notification.show && (
          <NeonNotification
            message={notification.message}
            type={(notification.type === 'error' ? 'error' : notification.type === 'success' ? 'success' : 'warning') as NotificationType}
            onClose={closeToast}
          />
        )}

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={imagePreview.isOpen}
        onClose={closeImagePreview}
        imageUrl={imagePreview.imageUrl}
        productName={imagePreview.productName}
        productBrand={imagePreview.productBrand}
        productSize={imagePreview.productSize}
      />
      </div>
    </div>
  );
};

export default DeliveriesNew;
