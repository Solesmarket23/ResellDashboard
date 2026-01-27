'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal, RefreshCw, Wifi, WifiOff, X, ChevronDown, Trash2, Copy, Grid3X3, List, Settings, GripVertical, Bell, Shield, AlertTriangle, Mail } from 'lucide-react';
import NeonNotification, { type NotificationType } from './NeonNotification';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { useSiteAuth } from '../lib/hooks/useSiteAuth';
import { useRealTimeDeliveries } from '../lib/hooks/useRealTimeDeliveries';
import { TrackingInfo } from '../lib/tracking/trackingService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/firebase';
import { deliveryArrivalLogger } from '../lib/delivery/arrivalLogger';
import { formatDisplayDate } from '../lib/utils/dateUtils';
import UPSOAuthButton from './UPSOAuthButton';
import { useUPSOAuth } from '../lib/hooks/useUPSOAuth';

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

const DeliveriesNew: React.FC = () => {
  const { currentTheme } = useTheme();
  const { user: firebaseUser } = useAuth();
  const { user: siteUser } = useSiteAuth();
  
  // Use either Firebase user or site user
  const user = firebaseUser || siteUser;

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

  // UPS OAuth status
  const { isAuthenticated: upsOAuthConnected, isLoading: upsOAuthLoading, error: upsOAuthError } = useUPSOAuth();

  const [searchTerm, setSearchTerm] = useState('');
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
  const [viewMode, setViewMode] = useState<'split' | 'table'>(() => {
    // Load saved view mode from localStorage
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('deliveriesViewMode');
      return (savedViewMode === 'split' || savedViewMode === 'table') ? savedViewMode : 'split';
    }
    return 'split';
  });
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
    trackingNumber: '',
    carrier: 'AUTO',
    productName: '',
    productBrand: '',
    productSize: ''
  });
  const [sendingSlackNotification, setSendingSlackNotification] = useState(false);

  const [setupStatus, setSetupStatus] = useState<any | null>(null);
  const [setupStatusLoading, setSetupStatusLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setSetupStatusLoading(true);
      try {
        const res = await fetch('/api/deliveries/setup-status', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setSetupStatus({ success: false, error: data?.error || `HTTP ${res.status}` });
          return;
        }
        setSetupStatus(data);
      } catch (e: any) {
        if (!cancelled) setSetupStatus({ success: false, error: e?.message || 'Failed to load setup status' });
      } finally {
        if (!cancelled) setSetupStatusLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const setupPills = useMemo(() => {
    const firebaseEnvOk = !!setupStatus?.firebase?.envOk;
    const firebaseAdminOk = !!setupStatus?.firebase?.adminOk;
    const firebaseOk = firebaseEnvOk && firebaseAdminOk;

    const fedexOk = !!setupStatus?.tracking?.fedexOk;
    const upsOk = !!setupStatus?.tracking?.upsOk;
    const trackingOk = fedexOk || upsOk;

    const localOk = !!localSetup.siteUserId && localSetup.purchasesCount > 0;

    return {
      firebase: { ok: firebaseOk, envOk: firebaseEnvOk, adminOk: firebaseAdminOk, error: setupStatus?.firebase?.adminError || null },
      tracking: { ok: trackingOk, fedexOk, upsOk },
      local: { ok: localOk, siteUserId: localSetup.siteUserId, purchasesCount: localSetup.purchasesCount },
    };
  }, [localSetup.purchasesCount, localSetup.siteUserId, setupStatus]);
  
  // Copy tracking number to clipboard
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [copiedShipmentId, setCopiedShipmentId] = useState<string | null>(null);
  // Persist the blue "active" highlight until another copy action.
  const [highlightedDeliveryId, setHighlightedDeliveryId] = useState<string | null>(null);
  
  const copyTrackingNumber = async (trackingNumber: string, deliveryId: string) => {
    try {
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
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Status icon helper
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'out_for_delivery':
        return <Truck className="w-4 h-4 text-orange-500" />;
      case 'in_transit':
        return <Package className="w-4 h-4 text-blue-500" />;
      case 'exception':
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  // Status color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'out_for_delivery':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'exception':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Format status helper
  const formatStatus = (status: string) => {
    return status.replace('_', ' ').toUpperCase();
  };

  // Stats configuration
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
        const today = new Date().toISOString().split('T')[0];
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
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        return deliveries.filter(d => d.estimatedDelivery === tomorrowStr).length;
      }
    },
    arriving_this_week: {
      id: 'arriving_this_week',
      label: 'Arriving This Week',
      icon: Calendar,
      color: 'text-purple-400',
      getValue: () => {
        const today = new Date();
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return deliveries.filter(d => {
          const deliveryDate = new Date(d.estimatedDelivery);
          return deliveryDate >= today && deliveryDate <= weekFromNow && d.status !== 'delivered';
        }).length;
      }
    },
    exceptions: {
      id: 'exceptions',
      label: 'Exceptions',
      icon: X,
      color: 'text-red-500',
      getValue: () => deliveries.filter(d => d.status === 'exception').length
    }
  };

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
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({
      show: true,
      message,
      type
    });
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
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
      showNotification('Tracking added');
      setShowAddTrackingModal(false);
      setNewTracking({ trackingNumber: '', carrier: 'AUTO', productName: '', productBrand: '', productSize: '' });
      await refreshDeliveries();
    } catch (e) {
      console.error(e);
      showNotification('Failed to add tracking', 'error');
    } finally {
      setAddingTracking(false);
    }
  };

  // Send Slack notification
  const handleSendSlackNotification = async () => {
    if (!user) {
      showNotification('Please sign in to send notifications', 'error');
      return;
    }

    try {
      setSendingSlackNotification(true);
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
      const timeout = window.setTimeout(() => controller.abort(), 45_000);

      const res = await fetch('/api/notifications/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userId: user.uid,
          type: 'daily_summary',
          purchases // Send purchases for localStorage users
        })
      });
      window.clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send notification');
      }

      if (data?.marketPriceDebug) {
        console.log('📊 Slack marketPriceDebug:', data.marketPriceDebug);
      }

      if (data.sent) {
        showNotification(
          `✅ Sent to Slack! ${data.summary.arrivingToday} arriving today, ${data.summary.arrivingTomorrow} tomorrow`,
          'success'
        );
      } else {
        showNotification('No deliveries to notify about', 'info');
      }
    } catch (e) {
      console.error('Failed to send Slack notification:', e);
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      
      if (String((e as any)?.name || '').toLowerCase().includes('abort')) {
        showNotification('Slack send timed out — try again (or reduce the number of tracked items)', 'error');
        return;
      }

      if (errorMsg.includes('not configured')) {
        showNotification('Slack not configured. Add SLACK_WEBHOOK_URL to .env.local', 'error');
      } else {
        showNotification(`Failed to send notification: ${errorMsg}`, 'error');
      }
    } finally {
      setSendingSlackNotification(false);
    }
  };

  // Filter deliveries
  const filteredDeliveries = deliveries.filter((delivery) => {
    const matchesSearch = !searchTerm || 
      delivery.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.productBrand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus =
      statusFilter === 'all' ||
      // "Shipped" is used as an "active shipments" view: include common in-progress states plus unknown.
      (statusFilter === 'shipped'
        ? delivery.status !== 'delivered'
        : delivery.status === statusFilter);
    const matchesCarrier = carrierFilter === 'all' || delivery.carrier === carrierFilter;
    
    return matchesSearch && matchesStatus && matchesCarrier;
  });

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

  // Auto-select first delivery if none selected
  useEffect(() => {
    if (filteredDeliveries.length > 0 && !selectedDelivery) {
      setSelectedDelivery(filteredDeliveries[0]);
    }
  }, [filteredDeliveries, selectedDelivery]);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto py-8">
      {/* Header */}
        <div className="flex-1 p-4 sm:p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
          <div className="flex items-center justify-between mb-6">
          <div>
              <h1 className="text-3xl font-bold text-white mb-2">Deliveries</h1>
              <p className="text-gray-300">
                Track your packages and monitor delivery status
                {upsOAuthConnected && (
                  <span className="ml-2 text-green-400">• UPS OAuth Connected</span>
                )}
                {upsOAuthError && (
                  <span className="ml-2 text-red-400">• UPS OAuth Error</span>
              )}
            </p>
          </div>
             <div className="flex items-center gap-4">
               <UPSOAuthButton />
               
               {/* Send Slack Notification Button */}
               <button
                 onClick={handleSendSlackNotification}
                 disabled={sendingSlackNotification || deliveries.length === 0}
                 className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                 title="Send delivery summary to Slack"
               >
                 <Bell className="w-4 h-4" />
                 {sendingSlackNotification ? 'Sending...' : 'Send to Slack'}
               </button>
               
               {/* View Mode Toggle */}
               <div className="flex items-center bg-gray-800 rounded-lg p-1">
            <button
                   onClick={() => setViewMode('split')}
                   className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                     viewMode === 'split'
                       ? 'bg-blue-600 text-white'
                       : 'text-gray-300 hover:text-white hover:bg-gray-700'
                   }`}
                 >
                   <Grid3X3 className="w-4 h-4" />
                   Split View
            </button>
            <button
                   onClick={() => setViewMode('table')}
                   className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                     viewMode === 'table'
                       ? 'bg-blue-600 text-white'
                       : 'text-gray-300 hover:text-white hover:bg-gray-700'
                   }`}
                 >
                   <List className="w-4 h-4" />
                   Table View
            </button>

            {/* Add Manual Tracking */}
            <button
              onClick={() => setShowAddTrackingModal(true)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Package className="w-4 h-4" />
              Add Manual Tracking
            </button>
               </div>
               
            <button
                 onClick={async () => {
                   try {
                     await refreshDeliveries();
                     showNotification('Deliveries refreshed successfully!', 'success');
                   } catch (error) {
                     showNotification('Failed to refresh deliveries', 'error');
                   }
                 }}
                 className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
               >
                 <RefreshCw className="w-4 h-4" />
                 Refresh
            </button>
        </div>
      </div>

      {/* Setup Status */}
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-300" />
            <div className="text-sm font-semibold text-white">Setup status</div>
            {setupStatusLoading ? (
              <span className="text-xs text-gray-400">Checking…</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const payload = {
                    firebase: setupPills.firebase,
                    tracking: setupPills.tracking,
                    local: setupPills.local,
                    upsOAuthConnected,
                    userMode: user?.uid ? (firebaseUser ? 'firebase' : 'site') : 'none',
                  };
                  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                  showNotification('Copied setup debug', 'success');
                } catch {
                  showNotification('Failed to copy debug', 'error');
                }
              }}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 transition-colors flex items-center gap-2"
              title="Copy setup debug"
            >
              <Copy className="w-4 h-4" />
              Copy debug
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-300">Firebase Admin</div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                setupPills.firebase.ok
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              }`}>
                {setupPills.firebase.ok ? 'Ready' : 'Not ready'}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Env vars</span>
                <span className={setupPills.firebase.envOk ? 'text-emerald-300' : 'text-amber-300'}>
                  {setupPills.firebase.envOk ? 'OK' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Admin init</span>
                <span className={setupPills.firebase.adminOk ? 'text-emerald-300' : 'text-amber-300'}>
                  {setupPills.firebase.adminOk ? 'OK' : 'Failed'}
                </span>
              </div>
              {!setupPills.firebase.adminOk && setupPills.firebase.error ? (
                <div className="mt-2 flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="break-words">{String(setupPills.firebase.error)}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-300">Tracking APIs</div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                setupPills.tracking.ok
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              }`}>
                {setupPills.tracking.ok ? 'Ready' : 'Not set'}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>UPS</span>
                <span className={setupPills.tracking.upsOk ? 'text-emerald-300' : 'text-amber-300'}>
                  {setupPills.tracking.upsOk ? 'OK' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>FedEx</span>
                <span className={setupPills.tracking.fedexOk ? 'text-emerald-300' : 'text-amber-300'}>
                  {setupPills.tracking.fedexOk ? 'OK' : 'Missing'}
                </span>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                If neither is set, deliveries still load but tracking may show “Unknown”.
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-300">Site-user fallback</div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                setupPills.local.ok
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              }`}>
                {setupPills.local.ok ? 'Ready' : 'Empty'}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>siteUserId</span>
                <span className={setupPills.local.siteUserId ? 'text-emerald-300' : 'text-amber-300'}>
                  {setupPills.local.siteUserId ? 'Present' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Local purchases</span>
                <span className={setupPills.local.purchasesCount > 0 ? 'text-emerald-300' : 'text-amber-300'}>
                  {setupPills.local.purchasesCount || 0}
                </span>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Used only if you’re logged in via site password (not Firebase).
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Manual Tracking Modal */}
      {showAddTrackingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Add Manual Tracking Number</h3>
              <button onClick={() => setShowAddTrackingModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Tracking Number *</label>
                <input
                  type="text"
                  value={newTracking.trackingNumber}
                  onChange={(e) => setNewTracking({ ...newTracking, trackingNumber: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="e.g., 1Z..."
                />
              </div>
              <div>
                <label className={`block text-sm mb-1 ${currentTheme.colors.textSecondary}`}>Carrier</label>
                <select
                  value={newTracking.carrier}
                  onChange={(e) => setNewTracking({ ...newTracking, carrier: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="AUTO">Auto-detect</option>
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="USPS">USPS</option>
                  <option value="DHL">DHL</option>
                </select>
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
                  onClick={() => setShowAddTrackingModal(false)}
                  className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddManualTracking}
                  disabled={addingTracking}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
                >
                  {addingTracking ? 'Adding…' : 'Add Tracking'}
                </button>
              </div>
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
              return (
                <div key={statId} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    <span className="text-white font-semibold">{stat.label}</span>
            </div>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stat.getValue()}
                  </p>
          </div>
              );
            })}
        </div>
      </div>

      {/* Filters */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} mb-6`}>
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">All Status</option>
              <option value="today">Arriving Today</option>
              <option value="tomorrow">Arriving Tomorrow</option>
              <option value="this_week">Arriving This Week</option>
              <option value="delivered">Delivered</option>
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out for Delivery</option>
            </select>
            
            <select
              value={carrierFilter}
              onChange={(e) => setCarrierFilter(e.target.value)}
              className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">All Carriers</option>
              <option value="UPS">UPS</option>
              <option value="FedEx">FedEx</option>
              <option value="USPS">USPS</option>
            </select>
            
            {(statusFilter !== 'all' || carrierFilter !== 'all' || searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setCarrierFilter('all');
                  setSearchTerm('');
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
        {filteredDeliveries.length === 0 ? (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg p-12 text-center border ${currentTheme.colors.border}`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>No deliveries found</h3>
            <p className={`${currentTheme.colors.textSecondary} mb-4`}>
              {searchTerm || statusFilter !== 'all' || carrierFilter !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'No purchases with tracking numbers found. Make sure your purchases have tracking information.'}
            </p>
              </div>
         ) : viewMode === 'split' ? (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
            {/* Left Panel - Delivery List */}
            <div className="flex flex-col">
              <div className={`bg-white/10 backdrop-blur-sm rounded-lg border ${currentTheme.colors.border} flex-1 flex flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                    Deliveries ({filteredDeliveries.length})
                  </h3>
                  <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                    Click a delivery to view details
                  </p>
          </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 p-4">
                    {filteredDeliveries.map((delivery) => (
            <div 
              key={delivery.id} 
                        onClick={() => setSelectedDelivery(delivery)}
                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all duration-200 ${
                          selectedDelivery?.id === delivery.id 
                            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700' 
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        } ${
                          highlightedDeliveryId === delivery.id
                            ? 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.65)] border-blue-400/70 dark:border-blue-500/60'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Product Image */}
                          {delivery.productImage ? (
                            <div className="flex-shrink-0">
                              <img 
                                src={delivery.productImage} 
                                alt={delivery.productName}
                                className="w-12 h-12 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                                onError={(e) => {
                                  // Fallback to status icon if image fails to load
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling!.style.display = 'flex';
                                }}
                              />
                              <div className="hidden flex-shrink-0">
                                {getStatusIcon(delivery.status)}
                              </div>
                            </div>
                          ) : (
                            <div className="flex-shrink-0">
                              {getStatusIcon(delivery.status)}
                            </div>
                          )}
                          
                          {/* Main Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                      {delivery.productName}
                              </h4>
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                      {formatStatus(delivery.status)}
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
                                <span>{delivery.productBrand} • Size {delivery.productSize}</span>
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
                                    className="text-blue-500 hover:text-blue-400 transition-colors duration-200 text-xs font-semibold"
                                    title="Open order confirmation email"
                                  >
                                    Open email
                                  </button>
                                </div>
                              ) : null}
                              <div className="flex items-center gap-1">
                                <span>{delivery.carrier} • </span>
                      <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyTrackingNumber(delivery.trackingNumber, delivery.id);
                                  }}
                                  className="hover:text-blue-500 transition-colors duration-200 font-mono"
                        title="Click to copy tracking number"
                      >
                        {delivery.trackingNumber}
                        {copiedTrackingId === delivery.id && (
                                    <span className="text-green-500 ml-1">✓</span>
                        )}
                      </button>
                  </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                      {delivery.status === 'delivered' && delivery.actualDelivery
                        ? `Delivered ${formatDisplayDate(delivery.actualDelivery)}`
                        : delivery.estimatedDelivery === 'TBD'
                        ? (delivery.statusNote ? `Est. TBD • ${delivery.statusNote}` : 'Est. TBD')
                        : `Est. ${formatDisplayDate(delivery.estimatedDelivery)}`
                      }
                    </span>
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
                           <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedDelivery.status)}`}>
                             {formatStatus(selectedDelivery.status)}
                           </span>
                                  <button
                             onClick={() => copyTrackingNumber(selectedDelivery.trackingNumber, selectedDelivery.id)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                                    title="Click to copy tracking number"
                                  >
                                    <Copy className="w-4 h-4 text-gray-500 hover:text-blue-500" />
                                  </button>
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
                      Product
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Tracking
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Status
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Carrier
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Delivery
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Route
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Live
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className={`${currentTheme.colors.cardBackground} divide-y ${currentTheme.colors.border}`}>
                  {filteredDeliveries.map((delivery) => (
                    <tr 
                      key={delivery.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-150 ${
                        selectedDelivery?.id === delivery.id ? 'bg-cyan-50 dark:bg-cyan-900/20' : ''
                      } ${
                        highlightedDeliveryId === delivery.id
                          ? 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.65)]'
                          : ''
                      }`}
                    >
                      {/* Product */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {delivery.productImage ? (
                            <img 
                              src={delivery.productImage} 
                              alt={delivery.productName}
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0"
                              onError={(e) => {
                                // Fallback to status icon if image fails to load
                                e.currentTarget.style.display = 'none';
                                const statusIcon = e.currentTarget.parentElement?.querySelector('.status-icon-fallback');
                                if (statusIcon) statusIcon.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`${delivery.productImage ? 'hidden' : ''} status-icon-fallback`}>
                            {getStatusIcon(delivery.status)}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                              {delivery.productName}
                  </div>
                            <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                              {delivery.productBrand} • Size {delivery.productSize}
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
                                  className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors"
                                  title="Open order confirmation email"
                                >
                                  Open email
                                </button>
                              </div>
                            ) : null}
            </div>
      </div>
                      </td>
                      
                      {/* Tracking */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-sm ${currentTheme.colors.textPrimary}`}>
                            {delivery.trackingNumber}
                    </span>
                          <button
                            onClick={() => copyTrackingNumber(delivery.trackingNumber, delivery.id)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                            title="Click to copy tracking number"
                          >
                            <Copy className="w-3 h-3 text-gray-500 hover:text-blue-500" />
                          </button>
                          {copiedTrackingId === delivery.id && (
                            <span className="text-green-500 text-xs">✓</span>
                )}
              </div>
                      </td>
                      
                      {/* Status */}
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                          {formatStatus(delivery.status)}
                        </span>
                      </td>
                      
                      {/* Carrier */}
                      <td className="px-4 py-4">
                        <span className={`text-sm ${currentTheme.colors.textPrimary}`}>
                          {delivery.carrier}
                        </span>
                      </td>
                      
                      {/* Delivery */}
                      <td className="px-4 py-4">
                        <div className={`text-sm ${currentTheme.colors.textPrimary}`}>
                          {delivery.status === 'delivered' && delivery.actualDelivery
                            ? `Delivered ${formatDisplayDate(delivery.actualDelivery)}`
                            : delivery.estimatedDelivery === 'TBD'
                            ? (delivery.statusNote ? `TBD • ${delivery.statusNote}` : 'TBD')
                            : formatDisplayDate(delivery.estimatedDelivery)
                          }
                        </div>
                      </td>
                      
                      {/* Route */}
                      <td className="px-4 py-4">
                        <div className={`text-sm ${currentTheme.colors.textPrimary} truncate max-w-32`}>
                          {delivery.origin} → {delivery.destination}
                    </div>
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
                            onClick={() => setSelectedDelivery(delivery)}
                            className={`p-2 rounded-lg transition-colors duration-200 ${
                              selectedDelivery?.id === delivery.id 
                                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400' 
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}
                            title="View details"
                          >
                            <ChevronDown className="w-4 h-4" />
              </button>
              <button
                            onClick={() => copyShipmentData(delivery, delivery.id)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400"
                            title="Copy shipment data"
                          >
                            <Copy className="w-4 h-4" />
              </button>
            </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
      )}

        {/* Details Panel for Table View */}
        {viewMode === 'table' && selectedDelivery && (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border} mt-6`}>
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
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedDelivery.status)}`}>
                    {formatStatus(selectedDelivery.status)}
                  </span>
                <button
                    onClick={() => setSelectedDelivery(null)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400"
                    title="Close details"
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
      )}

        {notification.show && (
          <NeonNotification
            message={notification.message}
            type={(notification.type === 'error' ? 'error' : notification.type === 'success' ? 'success' : 'warning') as NotificationType}
            onClose={() => setNotification((p) => ({ ...p, show: false }))}
          />
        )}
      </div>
    </div>
  );
};

export default DeliveriesNew;
