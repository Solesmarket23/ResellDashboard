'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal, RefreshCw, Wrench, Wifi, WifiOff } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { useSiteAuth } from '../lib/hooks/useSiteAuth';
import { useBulkLiveTracking } from '../lib/hooks/useLiveTracking';
import { TrackingInfo } from '../lib/tracking/trackingService';
import { deliveryArrivalLogger } from '../lib/delivery/arrivalLogger';
// import { getDocuments } from '../lib/firebase/firebaseUtils'; // No longer needed - using API route

interface DeliveryItem {
  id: string;
  trackingNumber: string;
  carrier: string;
  productName: string;
  productBrand: string;
  productSize: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
  estimatedDelivery: string;
  actualDelivery?: string;
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

const Deliveries: React.FC = () => {
  const { currentTheme } = useTheme();
  const { user: firebaseUser } = useAuth();
  const { user: siteUser } = useSiteAuth();
  
  // Use either Firebase user or site user
  const user = firebaseUser || siteUser;
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [carrierFilter, setCarrierFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [repairing, setRepairing] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [protecting, setProtecting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [safeRefreshing, setSafeRefreshing] = useState(false);
  const [liveTrackingEnabled, setLiveTrackingEnabled] = useState(true);
  const [trackingNumbers, setTrackingNumbers] = useState<string[]>([]);
  const [arrivalStats, setArrivalStats] = useState<any>(null);
  const [syncingArrivals, setSyncingArrivals] = useState(false);

  // Live tracking hook
  const { 
    trackingInfos: liveTrackingInfos, 
    loading: liveTrackingLoading, 
    error: liveTrackingError,
    refresh: refreshLiveTracking,
    lastUpdated: liveTrackingLastUpdated
  } = useBulkLiveTracking({
    trackingNumbers,
    autoRefresh: liveTrackingEnabled,
    refreshInterval: 60000 // 1 minute
  });

  // Load real purchase data
  const loadDeliveries = async () => {
    console.log('📦 Starting loadDeliveries function');
    console.log('📦 User state:', user ? `Logged in as ${user.email} (${user.uid})` : 'Not logged in');
    
    // Debug authentication state
    console.log('📦 Authentication debug:');
    console.log('  - Firebase user:', firebaseUser);
    console.log('  - Site user:', siteUser);
    console.log('  - Document cookies:', document.cookie);
    console.log('  - localStorage siteUserId:', localStorage.getItem('siteUserId'));
    console.log('  - localStorage siteUserEmail:', localStorage.getItem('siteUserEmail'));
    
    if (!user) {
      console.log('📦 No user found, skipping deliveries load');
      setLoading(false);
      setRefreshing(false);
      setDebugInfo({
        user: null,
        totalPurchases: 0,
        userPurchases: 0,
        deliveriesWithTracking: 0,
        trackingFieldAnalysis: null,
        samplePurchase: null
      });
      return;
    }

    try {
      console.log('📦 Loading deliveries for user:', user.uid);
      
      // Load purchases via API (bypasses Firebase auth requirements)
      console.log('📦 Loading purchases via API...');
      const response = await fetch(`/api/purchases?userId=${encodeURIComponent(user.uid)}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load purchases');
      }
      
      const userPurchases = data.purchases;
      console.log(`📦 Found ${userPurchases.length} total purchases for user`);
      
      // Filter for purchases with actual tracking numbers (not "No tracking")
      const deliveriesWithTracking = userPurchases
        .filter((purchase: any) => {
          // Check multiple possible tracking field names
          const trackingValue = purchase.tracking || 
                               purchase.trackingNumber || 
                               purchase.tracking_number ||
                               purchase.shipment?.tracking ||
                               purchase.shipment?.trackingNumber;
          
          const hasTracking = trackingValue && 
                 trackingValue !== '' && 
                 trackingValue !== 'No tracking' &&
                 trackingValue !== null &&
                 trackingValue !== undefined &&
                 trackingValue !== 'N/A' &&
                 trackingValue !== 'TBD';
          
          if (!hasTracking) {
            console.log('📦 Purchase without tracking:', {
              orderNumber: purchase.orderNumber,
              tracking: purchase.tracking,
              trackingNumber: purchase.trackingNumber,
              tracking_number: purchase.tracking_number,
              shipment: purchase.shipment,
              status: purchase.status
            });
          } else {
            console.log('📦 Purchase with tracking:', {
              orderNumber: purchase.orderNumber,
              trackingValue: trackingValue,
              status: purchase.status
            });
          }
          
          return hasTracking;
        })
        .map((purchase: any) => {
          // Get the actual tracking value from any of the possible fields
          const trackingValue = purchase.tracking || 
                               purchase.trackingNumber || 
                               purchase.tracking_number ||
                               purchase.shipment?.tracking ||
                               purchase.shipment?.trackingNumber;

          // Map purchase status to delivery status
          const getDeliveryStatus = (status: string) => {
            switch (status?.toLowerCase()) {
              case 'delivered':
                return 'delivered';
              case 'shipped':
                return 'shipped';
              case 'in transit':
              case 'in_transit':
                return 'in_transit';
              case 'out for delivery':
              case 'out_for_delivery':
                return 'out_for_delivery';
              default:
                return 'shipped'; // Default to shipped for orders with tracking
            }
          };

          // Determine carrier from tracking number or use stored carrier
          const getCarrier = (tracking: string, storedCarrier?: string) => {
            if (storedCarrier) return storedCarrier;
            
            if (tracking.startsWith('1Z')) return 'UPS';
            if (tracking.length === 12 || tracking.length === 15) return 'FedEx';
            if (tracking.length >= 20) return 'USPS';
            if (tracking.length === 10) return 'DHL';
            return 'Unknown';
          };

          // Calculate estimated delivery based on purchase date and status
          const getEstimatedDelivery = (purchaseDate: string, status: string) => {
            const purchase = new Date(purchaseDate);
            
            if (status?.toLowerCase() === 'delivered') {
              return purchase.toISOString().split('T')[0];
            }
            
            // Add 3-7 days for shipped items
            const estimated = new Date(purchase);
            estimated.setDate(estimated.getDate() + 5);
            return estimated.toISOString().split('T')[0];
          };

          const deliveryStatus = getDeliveryStatus(purchase.status);
          const carrier = getCarrier(trackingValue, purchase.carrier);
          const estimatedDelivery = getEstimatedDelivery(purchase.createdAt || purchase.purchaseDate, purchase.status);

          return {
            id: purchase.id || purchase.orderNumber,
            trackingNumber: trackingValue,
            carrier: carrier,
            productName: purchase.product?.name || purchase.productName || 'Unknown Product',
            productBrand: purchase.product?.brand || purchase.brand || 'Unknown Brand',
            productSize: purchase.product?.size || purchase.size || 'Unknown Size',
            status: deliveryStatus,
            estimatedDelivery: estimatedDelivery,
            actualDelivery: deliveryStatus === 'delivered' ? estimatedDelivery : undefined,
            origin: 'StockX Warehouse', // Default origin for StockX orders
            destination: 'Your Address', // Could be enhanced with user address
            lastUpdate: purchase.updatedAt || purchase.createdAt || new Date().toISOString(),
            updates: [
              {
                timestamp: purchase.updatedAt || purchase.createdAt || new Date().toISOString(),
                location: deliveryStatus === 'delivered' ? 'Your Address' : 'In Transit',
                status: deliveryStatus === 'delivered' ? 'Delivered' : 
                       deliveryStatus === 'out_for_delivery' ? 'Out for Delivery' :
                       deliveryStatus === 'in_transit' ? 'In Transit' : 'Shipped',
                description: deliveryStatus === 'delivered' ? 'Package delivered' :
                            deliveryStatus === 'out_for_delivery' ? 'Package is out for delivery' :
                            deliveryStatus === 'in_transit' ? 'Package in transit' : 'Package shipped'
              }
            ]
          };
        });
      
      console.log(`📦 Converted ${deliveriesWithTracking.length} purchases to deliveries`);
      console.log('📦 Sample delivery data:', deliveriesWithTracking.slice(0, 2));
      
      // Extract tracking numbers for live tracking
      const trackingNumbersList = deliveriesWithTracking.map(d => d.trackingNumber);
      setTrackingNumbers(trackingNumbersList);
      
      setDeliveries(deliveriesWithTracking);
      
      // Set debug info
      setDebugInfo({
        totalPurchases: userPurchases.length,
        userPurchases: userPurchases.length,
        deliveriesWithTracking: deliveriesWithTracking.length,
        user: user ? { 
          uid: user.uid, 
          email: user.email,
          authType: firebaseUser ? 'Firebase' : 'Site Password'
        } : null,
        samplePurchase: userPurchases[0] || null,
        trackingFieldAnalysis: {
          withTrackingField: userPurchases.filter(p => p.tracking && p.tracking !== 'No tracking').length,
          withTrackingNumberField: userPurchases.filter(p => p.trackingNumber && p.trackingNumber !== 'No tracking').length,
          withTrackingNumberFieldAlt: userPurchases.filter(p => p.tracking_number && p.tracking_number !== 'No tracking').length,
          withShipmentTracking: userPurchases.filter(p => p.shipment?.tracking && p.shipment.tracking !== 'No tracking').length,
          withShipmentTrackingNumber: userPurchases.filter(p => p.shipment?.trackingNumber && p.shipment.trackingNumber !== 'No tracking').length,
          withAnyTracking: userPurchases.filter(p => {
            const trackingValue = p.tracking || p.trackingNumber || p.tracking_number || p.shipment?.tracking || p.shipment?.trackingNumber;
            return trackingValue && trackingValue !== 'No tracking' && trackingValue !== '' && trackingValue !== null && trackingValue !== undefined;
          }).length,
          withBothFields: userPurchases.filter(p => p.tracking && p.trackingNumber).length,
          sampleFields: userPurchases.slice(0, 5).map(p => {
            const trackingValue = p.tracking || p.trackingNumber || p.tracking_number || p.shipment?.tracking || p.shipment?.trackingNumber;
            return {
              orderNumber: p.orderNumber,
              tracking: p.tracking,
              trackingNumber: p.trackingNumber,
              tracking_number: p.tracking_number,
              shipmentTracking: p.shipment?.tracking,
              shipmentTrackingNumber: p.shipment?.trackingNumber,
              finalTrackingValue: trackingValue,
              hasAnyTracking: !!(trackingValue && trackingValue !== 'No tracking' && trackingValue !== '' && trackingValue !== null && trackingValue !== undefined)
            };
          })
        }
      });
      
    } catch (error) {
      console.error('❌ Error loading deliveries:', error);
      console.error('❌ Error details:', error);
      
      // Set empty deliveries on error
      setDeliveries([]);
    } finally {
      console.log('📦 Setting loading to false');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    console.log('📦 useEffect triggered');
    console.log('📦 Firebase user:', firebaseUser ? `Logged in as ${firebaseUser.email}` : 'Not logged in');
    console.log('📦 Site user:', siteUser ? `Logged in as ${siteUser.email}` : 'Not logged in');
    console.log('📦 Combined user:', user ? `Logged in as ${user.email}` : 'Not logged in');
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.log('📦 Loading timeout reached, stopping loading state');
        setLoading(false);
        setRefreshing(false);
      }
    }, 10000); // 10 second timeout

    loadDeliveries();

    return () => clearTimeout(timeoutId);
  }, [user, firebaseUser, siteUser]);

  // Merge live tracking data with deliveries
  useEffect(() => {
    if (liveTrackingInfos.length > 0 && deliveries.length > 0) {
      console.log('🔄 Merging live tracking data with deliveries');
      
      const updatedDeliveries = deliveries.map(delivery => {
        const liveTracking = liveTrackingInfos.find(
          lt => lt.trackingNumber === delivery.trackingNumber
        );
        
        if (liveTracking) {
          return {
            ...delivery,
            liveTracking,
            isLiveTrackingEnabled: true,
            // Update delivery status with live data if available
            status: liveTracking.status !== 'unknown' ? liveTracking.status : delivery.status,
            estimatedDelivery: liveTracking.estimatedDelivery || delivery.estimatedDelivery,
            actualDelivery: liveTracking.actualDelivery || delivery.actualDelivery,
            origin: liveTracking.origin || delivery.origin,
            destination: liveTracking.destination || delivery.destination,
            lastUpdate: liveTracking.lastUpdate,
            updates: liveTracking.updates.length > 0 ? liveTracking.updates.map(update => ({
              timestamp: update.timestamp,
              location: update.location,
              status: update.status,
              description: update.description
            })) : delivery.updates
          };
        }
        
        return delivery;
      });
      
      setDeliveries(updatedDeliveries);
    }
  }, [liveTrackingInfos, deliveries.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDeliveries();
  };

  const handleRepairTracking = async () => {
    setRepairing(true);
    try {
      console.log('🔧 Starting tracking repair...');
      const response = await fetch('/api/repair-missing-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Tracking repair completed:', data.results);
        // Reload deliveries after repair
        await loadDeliveries();
        alert(`✅ Tracking repair completed! Found ${data.results.repaired} tracking numbers.`);
      } else {
        console.error('❌ Tracking repair failed:', data.error);
        alert(`❌ Tracking repair failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error running tracking repair:', error);
      alert(`❌ Error running tracking repair: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRepairing(false);
    }
  };

  const handleConsolidateTracking = async () => {
    setConsolidating(true);
    try {
      console.log('🔧 Starting tracking consolidation...');
      const response = await fetch('/api/consolidate-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Tracking consolidation completed:', data.results);
        // Reload deliveries after consolidation
        await loadDeliveries();
        alert(`✅ Tracking consolidation completed! Consolidated ${data.results.consolidated} tracking numbers.`);
      } else {
        console.error('❌ Tracking consolidation failed:', data.error);
        alert(`❌ Tracking consolidation failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error running tracking consolidation:', error);
      alert(`❌ Error running tracking consolidation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setConsolidating(false);
    }
  };

  const handleProtectTracking = async () => {
    setProtecting(true);
    try {
      console.log('🛡️ Starting tracking protection...');
      const response = await fetch('/api/protect-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Tracking protection completed:', data.results);
        // Reload deliveries after protection
        await loadDeliveries();
        alert(`✅ Tracking protection completed! Protected ${data.results.protected} tracking numbers.`);
      } else {
        console.error('❌ Tracking protection failed:', data.error);
        alert(`❌ Tracking protection failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error running tracking protection:', error);
      alert(`❌ Error running tracking protection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProtecting(false);
    }
  };

  const handleRecoverLostPurchases = async () => {
    setRecovering(true);
    try {
      console.log('🔍 Starting lost purchases recovery...');
      const response = await fetch('/api/recover-lost-purchases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.uid })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Lost purchases recovery completed:', data.analysis);
        // Reload deliveries after recovery
        await loadDeliveries();
        alert(`✅ Recovery analysis completed! Found ${data.analysis.userPurchases} user purchases. Check console for details.`);
      } else {
        console.error('❌ Lost purchases recovery failed:', data.error);
        alert(`❌ Lost purchases recovery failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error running lost purchases recovery:', error);
      alert(`❌ Error running lost purchases recovery: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRecovering(false);
    }
  };

  const handleSafeRefresh = async () => {
    setSafeRefreshing(true);
    try {
      console.log('🔄 Starting safe Gmail refresh...');
      const response = await fetch('/api/safe-gmail-refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Safe Gmail refresh completed:', data.results);
        // Reload deliveries after refresh
        await loadDeliveries();
        alert(`✅ Safe refresh completed! Found ${data.results.newPurchases} new purchases without deleting existing data.`);
      } else {
        console.error('❌ Safe Gmail refresh failed:', data.error);
        alert(`❌ Safe Gmail refresh failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error running safe Gmail refresh:', error);
      alert(`❌ Error running safe Gmail refresh: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSafeRefreshing(false);
    }
  };

  const handleSyncArrivals = async () => {
    setSyncingArrivals(true);
    try {
      console.log('🔄 Starting arrival sync...');
      const response = await fetch('/api/delivery/sync-arrivals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Arrival sync completed:', data.results);
        setArrivalStats(data.stats);
        // Reload deliveries after sync
        await loadDeliveries();
        alert(`✅ Arrival sync completed! ${data.results.successful} deliveries synced. ${data.stats.arrivingToday} arriving today!`);
      } else {
        console.error('❌ Arrival sync failed:', data.error);
        alert(`❌ Arrival sync failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error running arrival sync:', error);
      alert(`❌ Error running arrival sync: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncingArrivals(false);
    }
  };

  const handleAuthTest = () => {
    console.log('🔍 AUTH TEST:');
    console.log('  - Firebase user:', firebaseUser);
    console.log('  - Site user:', siteUser);
    console.log('  - Combined user:', user);
    console.log('  - Document cookies:', document.cookie);
    console.log('  - localStorage siteUserId:', localStorage.getItem('siteUserId'));
    console.log('  - localStorage siteUserEmail:', localStorage.getItem('siteUserEmail'));
    
    alert(`Auth Test Results:\nFirebase: ${firebaseUser ? 'Yes' : 'No'}\nSite: ${siteUser ? 'Yes' : 'No'}\nCombined: ${user ? 'Yes' : 'No'}\nCheck console for details.`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'shipped':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'in_transit':
        return <Truck className="w-5 h-5 text-orange-500" />;
      case 'out_for_delivery':
        return <MapPin className="w-5 h-5 text-purple-500" />;
      case 'delivered':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'in_transit':
        return 'bg-orange-100 text-orange-800';
      case 'out_for_delivery':
        return 'bg-purple-100 text-purple-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const filteredDeliveries = deliveries.filter(delivery => {
    const matchesSearch = delivery.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.productBrand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    const matchesCarrier = carrierFilter === 'all' || delivery.carrier === carrierFilter;
    
    return matchesSearch && matchesStatus && matchesCarrier;
  });

  const getDeliveryTimingCounts = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    
    const counts = {
      today: 0,
      tomorrow: 0,
      thisWeek: 0,
      delivered: 0
    };
    
    deliveries.forEach(delivery => {
      if (delivery.status === 'delivered') {
        counts.delivered++;
      } else {
        const deliveryDate = new Date(delivery.estimatedDelivery);
        const todayStr = today.toDateString();
        const tomorrowStr = tomorrow.toDateString();
        const deliveryStr = deliveryDate.toDateString();
        
        if (deliveryStr === todayStr) {
          counts.today++;
        } else if (deliveryStr === tomorrowStr) {
          counts.tomorrow++;
        } else if (deliveryDate <= oneWeekFromNow) {
          counts.thisWeek++;
        }
      }
    });
    
    return counts;
  };

  const timingCounts = getDeliveryTimingCounts();

  if (loading) {
    return (
      <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
        <div className="flex items-center justify-center h-64">
          <div className={`w-8 h-8 border-2 border-transparent border-t-current rounded-full animate-spin ${currentTheme.colors.accent}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
              Deliveries
            </h1>
            <p className={`${currentTheme.colors.textSecondary}`}>
              Track your package deliveries and shipping status
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLiveTrackingEnabled(!liveTrackingEnabled)}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                liveTrackingEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              {liveTrackingEnabled ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {liveTrackingEnabled ? 'Live Tracking ON' : 'Live Tracking OFF'}
            </button>
            <button
              onClick={refreshLiveTracking}
              disabled={liveTrackingLoading}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                liveTrackingLoading
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${liveTrackingLoading ? 'animate-spin' : ''}`} />
              {liveTrackingLoading ? 'Refreshing...' : 'Refresh Live Data'}
            </button>
            <button
              onClick={handleSyncArrivals}
              disabled={syncingArrivals}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                syncingArrivals
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${syncingArrivals ? 'animate-spin' : ''}`} />
              {syncingArrivals ? 'Syncing Arrivals...' : 'Sync Arrivals'}
            </button>
            <button
              onClick={handleAuthTest}
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white"
            >
              <Wrench className="w-4 h-4" />
              Test Auth
            </button>
            <button
              onClick={handleRecoverLostPurchases}
              disabled={recovering}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                recovering
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              <Wrench className={`w-4 h-4 ${recovering ? 'animate-spin' : ''}`} />
              {recovering ? 'Analyzing...' : 'Recover Lost Data'}
            </button>
            <button
              onClick={handleSafeRefresh}
              disabled={safeRefreshing}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                safeRefreshing
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${safeRefreshing ? 'animate-spin' : ''}`} />
              {safeRefreshing ? 'Safe Refreshing...' : 'Safe Gmail Refresh'}
            </button>
            <button
              onClick={handleConsolidateTracking}
              disabled={consolidating}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                consolidating
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              <Wrench className={`w-4 h-4 ${consolidating ? 'animate-spin' : ''}`} />
              {consolidating ? 'Consolidating...' : 'Consolidate Tracking'}
            </button>
            <button
              onClick={handleProtectTracking}
              disabled={protecting}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                protecting
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              <Wrench className={`w-4 h-4 ${protecting ? 'animate-spin' : ''}`} />
              {protecting ? 'Protecting...' : 'Protect Tracking'}
            </button>
            <button
              onClick={handleRepairTracking}
              disabled={repairing}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                repairing
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <Wrench className={`w-4 h-4 ${repairing ? 'animate-spin' : ''}`} />
              {repairing ? 'Repairing...' : 'Repair Tracking'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                refreshing
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Debug Panel - Always show for debugging */}
      {true && (
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-4 border ${currentTheme.colors.border} mb-6`}>
          <h3 className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>Debug Info</h3>
          <div className="text-xs space-y-1">
            <p><strong>User:</strong> {debugInfo?.user ? `${debugInfo.user.email} (${debugInfo.user.uid}) - ${debugInfo.user.authType || 'Unknown'}` : 'Not logged in'}</p>
            <p><strong>Total Purchases:</strong> {debugInfo?.totalPurchases || 'Loading...'}</p>
            <p><strong>User Purchases:</strong> {debugInfo?.userPurchases || 'Loading...'}</p>
            <p><strong>With Tracking:</strong> {debugInfo?.deliveriesWithTracking || 'Loading...'}</p>
            <p><strong>Debug Info Status:</strong> {debugInfo ? 'Available' : 'Not set'}</p>
            <p><strong>Deliveries Count:</strong> {deliveries.length}</p>
            <p><strong>Loading State:</strong> {loading ? 'Yes' : 'No'}</p>
            <p><strong>Live Tracking:</strong> {liveTrackingEnabled ? 'Enabled' : 'Disabled'}</p>
            <p><strong>Live Tracking Loading:</strong> {liveTrackingLoading ? 'Yes' : 'No'}</p>
            <p><strong>Live Tracking Error:</strong> {liveTrackingError || 'None'}</p>
            <p><strong>Live Tracking Last Updated:</strong> {liveTrackingLastUpdated ? liveTrackingLastUpdated.toLocaleString() : 'Never'}</p>
            <p><strong>Tracking Numbers:</strong> {trackingNumbers.length}</p>
            <p><strong>Live Tracking Infos:</strong> {liveTrackingInfos.length}</p>
            {arrivalStats && (
              <div className="mt-2 p-2 bg-green-100 rounded">
                <p><strong>Arrival Statistics:</strong></p>
                <p>Total Deliveries: {arrivalStats.total}</p>
                <p>Arriving Today: {arrivalStats.arrivingToday}</p>
                <p>This Week: {arrivalStats.arrivingThisWeek}</p>
                <p>Delivered: {arrivalStats.delivered}</p>
                <p>Pending Notifications: {arrivalStats.pendingNotifications}</p>
              </div>
            )}
            {debugInfo?.trackingFieldAnalysis && (
              <div className="mt-2 p-2 bg-gray-100 rounded">
                <p><strong>Tracking Field Analysis:</strong></p>
                <p>With 'tracking' field: {debugInfo.trackingFieldAnalysis.withTrackingField}</p>
                <p>With 'trackingNumber' field: {debugInfo.trackingFieldAnalysis.withTrackingNumberField}</p>
                <p>With 'tracking_number' field: {debugInfo.trackingFieldAnalysis.withTrackingNumberFieldAlt}</p>
                <p>With 'shipment.tracking' field: {debugInfo.trackingFieldAnalysis.withShipmentTracking}</p>
                <p>With 'shipment.trackingNumber' field: {debugInfo.trackingFieldAnalysis.withShipmentTrackingNumber}</p>
                <p><strong>With ANY tracking field: {debugInfo.trackingFieldAnalysis.withAnyTracking}</strong></p>
                <p>With both 'tracking' and 'trackingNumber': {debugInfo.trackingFieldAnalysis.withBothFields}</p>
                <div className="mt-1">
                  <p><strong>Sample Fields:</strong></p>
                  {debugInfo.trackingFieldAnalysis.sampleFields.map((sample, idx) => (
                    <div key={idx} className="text-xs border-b pb-1 mb-1">
                      <p><strong>{sample.orderNumber}:</strong></p>
                      <p>tracking: "{sample.tracking}"</p>
                      <p>trackingNumber: "{sample.trackingNumber}"</p>
                      <p>tracking_number: "{sample.tracking_number}"</p>
                      <p>shipment.tracking: "{sample.shipmentTracking}"</p>
                      <p>shipment.trackingNumber: "{sample.shipmentTrackingNumber}"</p>
                      <p><strong>Final Value: "{sample.finalTrackingValue}" (Valid: {sample.hasAnyTracking ? 'YES' : 'NO'})</strong></p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {debugInfo?.samplePurchase && (
              <div>
                <p><strong>Sample Purchase:</strong></p>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                  {JSON.stringify(debugInfo.samplePurchase, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Arriving Today</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{timingCounts.today}</p>
            </div>
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">📦</span>
            </div>
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Arriving Tomorrow</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{timingCounts.tomorrow}</p>
            </div>
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">📅</span>
            </div>
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Arriving This Week</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{timingCounts.thisWeek}</p>
            </div>
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">📈</span>
            </div>
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Delivered</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{timingCounts.delivered}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
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
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
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
          </div>
        </div>
      </div>

      {/* Deliveries List */}
      <div className="space-y-4">
        {filteredDeliveries.length === 0 ? (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg p-12 text-center border ${currentTheme.colors.border}`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>No deliveries found</h3>
            <p className={`${currentTheme.colors.textSecondary} mb-4`}>
              {searchTerm || statusFilter !== 'all' || carrierFilter !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'No purchases with tracking numbers found. Make sure your purchases have tracking information.'}
            </p>
            {!searchTerm && statusFilter === 'all' && carrierFilter === 'all' && (
              <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                <p>To see deliveries here, your purchases need to have tracking numbers.</p>
                <p>Check your purchases page to ensure tracking information is properly saved.</p>
              </div>
            )}
          </div>
        ) : (
          filteredDeliveries.map((delivery) => (
            <div key={delivery.id} className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Product Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(delivery.status)}
                    <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                      {delivery.productName}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                      {formatStatus(delivery.status)}
                    </span>
                    {delivery.isLiveTrackingEnabled && (
                      <div className="flex items-center gap-1">
                        <Wifi className="w-3 h-3 text-green-500" />
                        <span className="text-xs text-green-600 font-medium">LIVE</span>
                      </div>
                    )}
                    {delivery.liveTracking?.error && (
                      <div className="flex items-center gap-1">
                        <WifiOff className="w-3 h-3 text-red-500" />
                        <span className="text-xs text-red-600 font-medium">ERROR</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className={`${currentTheme.colors.textSecondary}`}>
                      {delivery.productBrand} • Size {delivery.productSize}
                    </span>
                    <span className={`${currentTheme.colors.textSecondary}`}>
                      {delivery.carrier} • {delivery.trackingNumber}
                    </span>
                  </div>
                </div>
                
                {/* Delivery Info */}
                <div className="flex flex-col lg:items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {delivery.status === 'delivered' && delivery.actualDelivery
                        ? `Delivered ${new Date(delivery.actualDelivery).toLocaleDateString()}`
                        : `Est. ${new Date(delivery.estimatedDelivery).toLocaleDateString()}`
                      }
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {delivery.origin} → {delivery.destination}
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100 transition-colors`}>
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Live Tracking Status */}
              {delivery.isLiveTrackingEnabled && delivery.liveTracking && (
                <div className={`mt-4 pt-4 border-t ${currentTheme.colors.border}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Wifi className={`w-4 h-4 text-green-500`} />
                    <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                      Live Tracking Status
                    </span>
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                      {delivery.liveTracking.carrier}
                    </span>
                  </div>
                  
                  {delivery.liveTracking.error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-600">
                        <strong>Error:</strong> {delivery.liveTracking.error}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                          Status: <strong className={currentTheme.colors.textPrimary}>{formatStatus(delivery.liveTracking.status)}</strong>
                        </span>
                      </div>
                      {delivery.liveTracking.estimatedDelivery && (
                        <div className="flex items-center gap-2">
                          <Calendar className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                          <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                            Est. Delivery: {new Date(delivery.liveTracking.estimatedDelivery).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {delivery.liveTracking.origin && delivery.liveTracking.destination && (
                        <div className="flex items-center gap-2">
                          <MapPin className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                          <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                            {delivery.liveTracking.origin} → {delivery.liveTracking.destination}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Latest Update */}
              {delivery.updates && delivery.updates.length > 0 && (
                <div className={`mt-4 pt-4 border-t ${currentTheme.colors.border}`}>
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                      {delivery.isLiveTrackingEnabled ? 'Tracking History' : 'Latest Update'}
                    </span>
                  </div>
                  <div className="mt-2 ml-6">
                    <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {delivery.updates[0].description}
                    </p>
                    <p className={`text-xs ${currentTheme.colors.textSecondary} mt-1`}>
                      {delivery.updates[0].location} • {new Date(delivery.updates[0].timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Deliveries;