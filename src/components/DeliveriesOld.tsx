'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal, RefreshCw, Wrench, Wifi, WifiOff, X, ChevronDown, Trash2, Copy } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { useSiteAuth } from '../lib/hooks/useSiteAuth';
// Live tracking is now integrated into useRealTimeDeliveries
import { useRealTimeDeliveries } from '../lib/hooks/useRealTimeDeliveries';
import { TrackingInfo } from '../lib/tracking/trackingService';
import { deliveryArrivalLogger } from '../lib/delivery/arrivalLogger';
import UPSOAuthButton from './UPSOAuthButton';
import { useUPSOAuth } from '../lib/hooks/useUPSOAuth';
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
    error: deliveryError,
    lastSync,
    refresh: refreshDeliveries,
    stats
  } = useRealTimeDeliveries({
    userId: user?.uid || '',
    autoRefresh: true,
    refreshInterval: 60000, // 1 minute
    enableWebSocket: false
  });

  // UPS OAuth status
  const { isAuthenticated: upsOAuthConnected, isLoading: upsOAuthLoading, error: upsOAuthError } = useUPSOAuth();

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
  // trackingNumbers is now handled by the real-time deliveries hook
  const [arrivalStats, setArrivalStats] = useState<any>(null);
  const [syncingArrivals, setSyncingArrivals] = useState(false);
  const [showAddTrackingModal, setShowAddTrackingModal] = useState(false);
  const [newTrackingData, setNewTrackingData] = useState({
    orderNumber: '',
    trackingNumber: '',
    carrier: 'UPS',
    productName: '',
    productBrand: '',
    productSize: ''
  });
  const [addingTracking, setAddingTracking] = useState(false);
  
  // Size suggestions state
  const [showSizeSuggestions, setShowSizeSuggestions] = useState(false);
  const [filteredSizes, setFilteredSizes] = useState<string[]>([]);
  
  // Common size suggestions
  const sizeSuggestions = [
    'M', 'L', 'XL', 'XXL',
    '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '13.5', '14', '14.5', '15',
    '28', '30', '32', '34', '36', '38', '40', '42', '44', '46',
    'Small', 'Medium', 'Large',
    'One Size'
  ];
  
  // Filter size suggestions based on input
  const filterSizes = (input: string) => {
    if (!input.trim()) {
      setFilteredSizes([]);
      setShowSizeSuggestions(false);
      return;
    }
    
    const filtered = sizeSuggestions.filter(size => 
      size.toLowerCase().includes(input.toLowerCase())
    );
    setFilteredSizes(filtered);
    setShowSizeSuggestions(filtered.length > 0);
  };
  
  // Handle size selection from dropdown
  const handleSizeSelect = (size: string) => {
    setNewTrackingData({...newTrackingData, productSize: size});
    setShowSizeSuggestions(false);
    setFilteredSizes([]);
  };
  
  // Copy tracking number to clipboard
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [copiedShipmentId, setCopiedShipmentId] = useState<string | null>(null);
  
  const copyTrackingNumber = async (trackingNumber: string, deliveryId: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopiedTrackingId(deliveryId);
      setTimeout(() => setCopiedTrackingId(null), 2000); // Hide message after 2 seconds
    } catch (error) {
      console.error('Failed to copy tracking number:', error);
      setToast({
        show: true,
        message: 'Failed to copy tracking number',
        type: 'error'
      });
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
      setTimeout(() => setCopiedShipmentId(null), 2000); // Hide message after 2 seconds
    } catch (error) {
      console.error('Failed to copy shipment data:', error);
      setToast({
        show: true,
        message: 'Failed to copy shipment data',
        type: 'error'
      });
    }
  };
  
  // Auto-detect carrier from tracking number
  const detectCarrierFromTrackingNumber = (trackingNumber: string): string => {
    if (!trackingNumber) return 'UPS';
    
    // Clean the tracking number (remove spaces, dashes, etc.)
    const cleanTracking = trackingNumber.replace(/[\s\-_]/g, '').toUpperCase();
    
    // UPS: Multiple formats
    // Format 1: 1Z + 6 alphanumeric + 2 digits + 8 alphanumeric (18 chars total)
    if (/^1Z[0-9A-Z]{6}[0-9]{2}[0-9A-Z]{8}$/.test(cleanTracking)) return 'UPS';
    // Format 2: 1Z + 6 alphanumeric + 2 digits + 7 alphanumeric (17 chars total)
    if (/^1Z[0-9A-Z]{6}[0-9]{2}[0-9A-Z]{7}$/.test(cleanTracking)) return 'UPS';
    // Format 3: Starts with 1Z and is 18-20 characters
    if (/^1Z[0-9A-Z]{16,18}$/.test(cleanTracking)) return 'UPS';
    
    // FedEx: 12-15 digits (most common), or 20+ digits (some formats)
    if (/^[0-9]{12,15}$/.test(cleanTracking)) return 'FedEx';
    if (/^[0-9]{20,}$/.test(cleanTracking)) return 'FedEx';
    
    // USPS: 20-22 digits starting with 9, or 13 digits starting with 9
    if (/^9[0-9]{19,21}$/.test(cleanTracking)) return 'USPS';
    if (/^9[0-9]{12}$/.test(cleanTracking)) return 'USPS';
    
    // DHL: 10 digits, or starts with DHL
    if (/^[0-9]{10}$/.test(cleanTracking)) return 'DHL';
    if (/^DHL[0-9A-Z]+$/.test(cleanTracking)) return 'DHL';
    
    // Amazon: Various formats
    if (/^TBA[0-9A-Z]+$/.test(cleanTracking)) return 'Amazon';
    if (/^TBA[0-9]{9}$/.test(cleanTracking)) return 'Amazon';
    if (/^AMZN[0-9A-Z]+$/.test(cleanTracking)) return 'Amazon';
    
    // OnTrac: Various formats
    if (/^C1[0-9A-Z]+$/.test(cleanTracking)) return 'OnTrac';
    if (/^[0-9]{12}$/.test(cleanTracking) && cleanTracking.startsWith('1')) return 'OnTrac';
    
    // Lasership: Various formats
    if (/^1LS[0-9A-Z]+$/.test(cleanTracking)) return 'Lasership';
    if (/^LS[0-9A-Z]+$/.test(cleanTracking)) return 'Lasership';
    
    // Purolator: Starts with PU
    if (/^PU[0-9A-Z]+$/.test(cleanTracking)) return 'Purolator';
    
    // Canada Post: Starts with CA
    if (/^CA[0-9A-Z]+$/.test(cleanTracking)) return 'Canada Post';
    
    // Default to FedEx for unknown formats (most common for e-commerce)
    return 'FedEx';
  };
  
  // Expanded card state
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [detailedTrackingInfo, setDetailedTrackingInfo] = useState<{[key: string]: any}>({});
  const [loadingDetails, setLoadingDetails] = useState<{[key: string]: boolean}>({});
  
  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  // Toast state
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Live tracking is now integrated into the real-time deliveries hook

  // Handle clicking on a shipment for detailed view
  const handleShipmentClick = async (shipment: any) => {
    const isCurrentlyExpanded = expandedCardId === shipment.id;
    
    if (isCurrentlyExpanded) {
      // Collapse the card
      setExpandedCardId(null);
    } else {
      // Expand the card
      setExpandedCardId(shipment.id);
      
      // Only fetch detailed tracking if we don't have it yet
      if (!detailedTrackingInfo[shipment.id]) {
        setLoadingDetails(prev => ({ ...prev, [shipment.id]: true }));
        
        try {
          // Get detailed tracking info
          const trackingValue = shipment.tracking || 
                               shipment.trackingNumber || 
                               shipment.tracking_number ||
                               shipment.shipment?.tracking ||
                               shipment.shipment?.trackingNumber;
          
          if (trackingValue) {
            const response = await fetch('/api/tracking/live', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                trackingNumbers: [shipment.trackingNumber]
              })
            });
            
            const result = await response.json();
            if (result.success && result.data && result.data.length > 0) {
              setDetailedTrackingInfo(prev => ({ ...prev, [shipment.id]: result.data[0] }));
            }
          }
        } catch (error) {
          console.error('Error fetching detailed tracking info:', error);
        } finally {
          setLoadingDetails(prev => ({ ...prev, [shipment.id]: false }));
        }
      }
    }
  };

  // Add manual tracking number
  const handleAddTracking = async () => {
    if (!newTrackingData.trackingNumber) {
      alert('Please enter a tracking number');
      return;
    }

    setAddingTracking(true);
    try {
      const response = await fetch('/api/tracking/add-manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.uid || 'manual-user'
        },
        body: JSON.stringify({
          orderNumber: newTrackingData.orderNumber || `manual-${Date.now()}`,
          tracking: newTrackingData.trackingNumber,
          carrier: newTrackingData.carrier,
          shippingStatus: 'shipped',
          productName: newTrackingData.productName,
          productBrand: newTrackingData.productBrand,
          productSize: newTrackingData.productSize
        })
      });

      const result = await response.json();
      
      if (result.success) {
        if (result.warning) {
          alert(`Tracking number added successfully! (${result.warning})`);
        } else {
          alert('Tracking number added successfully!');
        }
        setShowAddTrackingModal(false);
        setNewTrackingData({
          orderNumber: '',
          trackingNumber: '',
          carrier: 'UPS',
          productName: '',
          productBrand: '',
          productSize: ''
        });
        // Refresh deliveries
        await refreshDeliveries();
      } else {
        // Handle duplicate tracking number error specifically
        if (result.error && result.error.includes('already exists')) {
          alert(`❌ ${result.error}`);
        } else {
          alert(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error adding tracking:', error);
      alert('Failed to add tracking number');
    } finally {
      setAddingTracking(false);
    }
  };

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({
      show: true,
      message,
      type
    });
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  // Delete delivery
  const handleDeleteDelivery = async (deliveryId: string) => {
    if (!user?.uid) {
      showToast('User not authenticated', 'error');
      return;
    }

    setDeletingId(deliveryId);
    try {
      const response = await fetch('/api/purchases/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purchaseId: deliveryId,
          userId: user.uid
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log('✅ Delivery deleted successfully');
        // Refresh deliveries to get updated data
        await refreshDeliveries();
        setShowDeleteConfirm(null);
        showToast('Delivery deleted successfully!', 'success');
      } else {
        console.error('❌ Failed to delete delivery:', result.error);
        showToast('Failed to delete delivery: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('❌ Error deleting delivery:', error);
      showToast('Error deleting delivery', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Real-time deliveries are now handled by the useRealTimeDeliveries hook

  // Real-time deliveries are now handled by the useRealTimeDeliveries hook
  // No need for manual useEffect hooks or live tracking merging

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshDeliveries();
    setRefreshing(false);
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
        await refreshDeliveries();
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
        await refreshDeliveries();
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
        await refreshDeliveries();
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
        await refreshDeliveries();
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
        await refreshDeliveries();
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
        await refreshDeliveries();
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
    
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      switch (statusFilter) {
        case 'today':
          const today = new Date().toISOString().split('T')[0];
          matchesStatus = delivery.estimatedDelivery === today || delivery.status === 'out_for_delivery';
          break;
        case 'tomorrow':
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          matchesStatus = delivery.estimatedDelivery === tomorrowStr;
          break;
        case 'this_week':
          const todayDate = new Date();
          const weekFromNow = new Date(todayDate);
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          const deliveryDate = new Date(delivery.estimatedDelivery);
          matchesStatus = deliveryDate >= todayDate && deliveryDate <= weekFromNow;
          break;
        case 'delivered':
          matchesStatus = delivery.status === 'delivered';
          break;
        default:
          matchesStatus = delivery.status === statusFilter;
      }
    }
    
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
            <div className="flex items-center gap-3 mb-2">
              <h1 className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary}`}>
                Deliveries
              </h1>
              {/* Real-time status indicator */}
              {lastSync && (
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Wifi className="w-3 h-3 text-green-500" />
                  <span>Last sync: {lastSync.toLocaleTimeString()}</span>
                </div>
              )}
              {deliveryError && (
                <div className="flex items-center gap-1 text-sm text-red-500">
                  <WifiOff className="w-3 h-3" />
                  <span>Sync error</span>
                </div>
              )}
            </div>
            <p className={`${currentTheme.colors.textSecondary}`}>
              Track your package deliveries and shipping status
              {stats && (
                <span className="ml-2 text-xs">
                  • {stats.total} total • {stats.liveTracking} live • {stats.delivered} delivered
                  {upsOAuthConnected && (
                    <span className="ml-2 text-green-600">• UPS OAuth Connected</span>
                  )}
                  {upsOAuthError && (
                    <span className="ml-2 text-red-600">• UPS OAuth Error</span>
                  )}
                </span>
              )}
            </p>
          </div>
          
          {/* UPS OAuth Integration */}
          <div className="flex-shrink-0">
            <UPSOAuthButton 
              userId={user?.uid || 'anonymous'}
              onAuthSuccess={(tokenInfo) => {
                console.log('UPS OAuth successful:', tokenInfo);
                // You can add additional logic here, like refreshing deliveries
              }}
              onAuthError={(error) => {
                console.error('UPS OAuth error:', error);
              }}
            />
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
              onClick={refreshDeliveries}
              disabled={loading}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh Live Data'}
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
              onClick={() => setShowAddTrackingModal(true)}
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <Package className="w-4 h-4" />
              Add Manual Tracking
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


      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div 
          onClick={() => setStatusFilter('today')}
          className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02] ${
            statusFilter === 'today' ? 'ring-2 ring-blue-500 shadow-blue-500/20' : ''
          }`}
        >
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

        <div 
          onClick={() => setStatusFilter('tomorrow')}
          className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02] ${
            statusFilter === 'tomorrow' ? 'ring-2 ring-blue-500 shadow-blue-500/20' : ''
          }`}
        >
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

        <div 
          onClick={() => setStatusFilter('this_week')}
          className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02] ${
            statusFilter === 'this_week' ? 'ring-2 ring-blue-500 shadow-blue-500/20' : ''
          }`}
        >
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

        <div 
          onClick={() => setStatusFilter('delivered')}
          className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02] ${
            statusFilter === 'delivered' ? 'ring-2 ring-blue-500 shadow-blue-500/20' : ''
          }`}
        >
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

      {/* Deliveries Layout - Left/Right Split */}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
          {/* Left Panel - Delivery List (Sticky) */}
          <div className="flex flex-col">
            <div className={`${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border} flex-1 flex flex-col`}>
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
                      onClick={() => handleShipmentClick(delivery)}
                      className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all duration-200 ${
                        expandedCardId === delivery.id 
                          ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700' 
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                {/* Product Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(delivery.status)}
                    <h3 className={`text-base font-semibold ${currentTheme.colors.textPrimary}`}>
                      {delivery.productName}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
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
                  
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <span>{delivery.productBrand} • Size {delivery.productSize}</span>
                    <span>
                      {delivery.carrier} • 
                      <button
                        onClick={() => copyTrackingNumber(delivery.trackingNumber, delivery.id)}
                        className="ml-1 inline-flex items-center gap-1 hover:text-blue-500 transition-colors duration-200"
                        title="Click to copy tracking number"
                      >
                        {delivery.trackingNumber}
                        <Copy className="w-3 h-3" />
                        {copiedTrackingId === delivery.id && (
                          <span className="text-green-500 text-xs ml-1">✓</span>
                        )}
                      </button>
                    </span>
                  </div>
                </div>
                
                {/* Delivery Info */}
                <div className="flex flex-col lg:items-end gap-1">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {delivery.status === 'delivered' && delivery.actualDelivery
                        ? `Delivered ${new Date(delivery.actualDelivery).toLocaleDateString()}`
                        : delivery.estimatedDelivery === 'TBD'
                        ? 'Est. TBD'
                        : `Est. ${new Date(delivery.estimatedDelivery).toLocaleDateString()}`
                      }
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="truncate max-w-48">
                      {delivery.origin} → {delivery.destination}
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(delivery.id);
                    }}
                    className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors`}
                    title="Delete delivery"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100 transition-colors`}>
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  <ChevronDown 
                    className={`w-5 h-5 ${currentTheme.colors.textSecondary} transition-transform duration-300 ${
                      expandedCardId === delivery.id ? 'rotate-180' : ''
                    }`} 
                  />
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
                      {delivery.liveTracking.courierEstimatedDelivery && delivery.liveTracking.courierEstimatedDelivery !== delivery.liveTracking.estimatedDelivery && (
                        <div className="flex items-center gap-2">
                          <Truck className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                          <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                            Courier Est: {new Date(delivery.liveTracking.courierEstimatedDelivery).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {delivery.liveTracking.transitTime && (
                        <div className="flex items-center gap-2">
                          <Clock className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                          <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                            Transit: {delivery.liveTracking.transitTime} days
                          </span>
                        </div>
                      )}
                      {delivery.liveTracking.signatureRequired && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                          <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                            Signature: {delivery.liveTracking.signatureRequired.replace('_', ' ').toLowerCase()}
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
                      {delivery.liveTracking.courierTrackingLink && (
                        <div className="flex items-center gap-2">
                          <a 
                            href={delivery.liveTracking.courierTrackingLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-500 hover:text-blue-600 text-sm"
                          >
                            <Truck className="w-4 h-4" />
                            <span>Track on {delivery.liveTracking.carrier.toUpperCase()}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Latest Update */}
              {delivery.updates && delivery.updates.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${currentTheme.colors.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className={`w-3.5 h-3.5 ${currentTheme.colors.textSecondary}`} />
                      <span className={`text-xs font-medium ${currentTheme.colors.textPrimary}`}>
                        {delivery.isLiveTrackingEnabled ? 'Tracking History' : 'Latest Update'}
                      </span>
                    </div>
                    <button
                      onClick={() => copyShipmentData(delivery, delivery.id)}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded transition-colors duration-200"
                      title="Copy full shipment data as JSON"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                      {copiedShipmentId === delivery.id && (
                        <span className="text-green-500 text-xs">✓</span>
                      )}
                    </button>
                  </div>
                  <div className="ml-5">
                    {(() => {
                      const bestUpdate = getBestUpdate(delivery.updates);
                      return (
                        <>
                          <p className={`text-sm ${currentTheme.colors.textPrimary} overflow-hidden`} style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {bestUpdate?.description || 'No description'}
                          </p>
                          <p className={`text-xs ${currentTheme.colors.textSecondary} mt-0.5`}>
                            {bestUpdate?.location || 'Unknown location'} • {bestUpdate?.timestamp ? new Date(bestUpdate.timestamp).toLocaleDateString() : 'Unknown time'}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Expanded Details */}
              {expandedCardId === delivery.id && (
                <div className={`mt-6 pt-6 border-t ${currentTheme.colors.border} animate-in slide-in-from-top-2 duration-300`}>
                  <div className={`${currentTheme.colors.cardBackground} rounded-xl p-6 border ${currentTheme.colors.border} animate-in fade-in duration-500`}>
                    {/* Header */}
                    <div className="mb-6">
                      <h3 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2 flex items-center gap-3`}>
                        <Package className="w-6 h-6" />
                        Shipment Details
                      </h3>
                      <div className={`h-1 ${currentTheme.colors.border} rounded-full`}></div>
                    </div>

                    {loadingDetails[delivery.id] ? (
                      <div className="flex items-center justify-center py-12">
                        <div className={`w-8 h-8 border-2 ${currentTheme.colors.border} border-t-transparent rounded-full animate-spin`}></div>
                        <span className={`ml-3 ${currentTheme.colors.textPrimary}`}>Loading tracking details...</span>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Shipment Info */}
                        <div className={`${currentTheme.colors.cardBackground} rounded-xl p-6 border ${currentTheme.colors.border}`}>
                          <h4 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4 flex items-center gap-2`}>
                            <Truck className="w-5 h-5" />
                            Shipment Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                              <p className={`${currentTheme.colors.textSecondary} text-sm`}>Product</p>
                              <p className={`${currentTheme.colors.textPrimary} font-medium`}>{delivery.productName || 'Unknown Product'}</p>
                            </div>
                            <div>
                              <p className={`${currentTheme.colors.textSecondary} text-sm`}>Brand</p>
                              <p className={`${currentTheme.colors.textPrimary} font-medium`}>{delivery.productBrand || 'Unknown Brand'}</p>
                            </div>
                            <div>
                              <p className={`${currentTheme.colors.textSecondary} text-sm`}>Tracking Number</p>
                              <div className="flex items-center gap-2">
                                <p className={`${currentTheme.colors.textPrimary} font-mono font-medium`}>{delivery.trackingNumber || 'N/A'}</p>
                                {delivery.trackingNumber && (
                                  <button
                                    onClick={() => copyTrackingNumber(delivery.trackingNumber, delivery.id)}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                                    title="Click to copy tracking number"
                                  >
                                    <Copy className="w-4 h-4 text-gray-500 hover:text-blue-500" />
                                  </button>
                                )}
                                {copiedTrackingId === delivery.id && (
                                  <span className="text-green-500 text-sm">✓ Copied!</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className={`${currentTheme.colors.textSecondary} text-sm`}>Carrier</p>
                              <p className={`${currentTheme.colors.textPrimary} font-medium`}>{delivery.carrier || 'Unknown'}</p>
                            </div>
                            <div>
                              <p className={`${currentTheme.colors.textSecondary} text-sm`}>Status</p>
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                delivery.status === 'delivered' ? 'bg-green-500 text-white' :
                                delivery.status === 'out_for_delivery' ? 'bg-orange-500 text-white' :
                                delivery.status === 'in_transit' ? 'bg-blue-500 text-white' :
                                'bg-gray-500 text-white'
                              }`}>
                                {delivery.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                              </span>
                            </div>
                            <div>
                              <p className={`${currentTheme.colors.textSecondary} text-sm`}>Last Update</p>
                              <p className={`${currentTheme.colors.textPrimary} font-medium`}>
                                {delivery.lastUpdate ? new Date(delivery.lastUpdate).toLocaleString() : 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Live Tracking Info */}
                        {detailedTrackingInfo[delivery.id] && (
                          <div className={`${currentTheme.colors.cardBackground} rounded-xl p-6 border ${currentTheme.colors.border}`}>
                            <h4 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4 flex items-center gap-2`}>
                              <Wifi className="w-5 h-5" />
                              Live Tracking Data
                            </h4>
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className={`${currentTheme.colors.textSecondary} text-sm`}>Current Status</p>
                                  <p className={`${currentTheme.colors.textPrimary} font-medium`}>
                                    {detailedTrackingInfo[delivery.id].status || 'Unknown'}
                                  </p>
                                </div>
                                <div>
                                  <p className={`${currentTheme.colors.textSecondary} text-sm`}>Carrier</p>
                                  <p className={`${currentTheme.colors.textPrimary} font-medium`}>
                                    {detailedTrackingInfo[delivery.id].carrier || 'Unknown'}
                                  </p>
                                </div>
                              </div>

                              {/* Tracking Updates */}
                              {detailedTrackingInfo[delivery.id].updates && detailedTrackingInfo[delivery.id].updates.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <h5 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Tracking History</h5>
                                    <button
                                      onClick={() => copyShipmentData(delivery, delivery.id)}
                                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors duration-200"
                                      title="Copy full shipment data as JSON"
                                    >
                                      <Copy className="w-4 h-4" />
                                      Copy Data
                                      {copiedShipmentId === delivery.id && (
                                        <span className="text-green-500 text-xs">✓</span>
                                      )}
                                    </button>
                                  </div>
                                  <div className="space-y-3">
                                    {detailedTrackingInfo[delivery.id].updates.map((update: any, index: number) => (
                                      <div key={index} className={`${currentTheme.colors.cardBackground} rounded-lg p-4 border ${currentTheme.colors.border}`}>
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <p className={`${currentTheme.colors.textPrimary} font-medium`}>{update.description || 'No description'}</p>
                                            <p className={`${currentTheme.colors.textSecondary} text-sm mt-1`}>
                                              {update.location || 'Unknown location'}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <p className={`${currentTheme.colors.textSecondary} text-sm`}>
                                              {update.timestamp ? new Date(update.timestamp).toLocaleString() : 'Unknown time'}
                                            </p>
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

                        {/* Estimated Delivery */}
                        {delivery.estimatedDelivery && (
                          <div className={`${currentTheme.colors.cardBackground} rounded-xl p-6 border ${currentTheme.colors.border}`}>
                            <h4 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4 flex items-center gap-2`}>
                              <Calendar className="w-5 h-5" />
                              Delivery Information
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className={`${currentTheme.colors.textSecondary} text-sm`}>Estimated Delivery</p>
                                <p className={`${currentTheme.colors.textPrimary} font-medium`}>
                                  {delivery.estimatedDelivery === 'TBD' 
                                    ? 'To Be Determined' 
                                    : new Date(delivery.estimatedDelivery).toLocaleDateString()
                                  }
                                </p>
                              </div>
                              {delivery.actualDelivery && (
                                <div>
                                  <p className={`${currentTheme.colors.textSecondary} text-sm`}>Actual Delivery</p>
                                  <p className="text-green-400 font-medium">
                                    {new Date(delivery.actualDelivery).toLocaleDateString()}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>


      {/* Add Manual Tracking Modal */}
      {showAddTrackingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]">
          <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-gray-600 shadow-2xl relative z-[10000]`}>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Add Manual Tracking Number
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Order Number (Optional)
                </label>
                <input
                  type="text"
                  value={newTrackingData.orderNumber}
                  onChange={(e) => setNewTrackingData({...newTrackingData, orderNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., SX123456789"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tracking Number *
                </label>
                <input
                  type="text"
                  value={newTrackingData.trackingNumber}
                  onChange={(e) => {
                    const trackingNumber = e.target.value;
                    const detectedCarrier = detectCarrierFromTrackingNumber(trackingNumber);
                    setNewTrackingData({
                      ...newTrackingData, 
                      trackingNumber: trackingNumber,
                      carrier: detectedCarrier
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 1Z999AA1234567890 or 884393693931"
                />
                {newTrackingData.trackingNumber && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    🚚 Detected carrier: <span className="font-medium">{newTrackingData.carrier}</span>
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Carrier {newTrackingData.trackingNumber && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      (Auto-detected)
                    </span>
                  )}
                </label>
                <select
                  value={newTrackingData.carrier}
                  onChange={(e) => setNewTrackingData({...newTrackingData, carrier: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="USPS">USPS</option>
                  <option value="DHL">DHL</option>
                  <option value="Amazon">Amazon</option>
                  <option value="OnTrac">OnTrac</option>
                  <option value="Lasership">Lasership</option>
                  <option value="Purolator">Purolator</option>
                  <option value="Canada Post">Canada Post</option>
                  <option value="Other">Other</option>
                </select>
                {newTrackingData.trackingNumber && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    💡 You can change the carrier if the auto-detection is incorrect
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  value={newTrackingData.productName}
                  onChange={(e) => setNewTrackingData({...newTrackingData, productName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Air Jordan 1 Retro High"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={newTrackingData.productBrand}
                    onChange={(e) => setNewTrackingData({...newTrackingData, productBrand: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Nike"
                  />
                </div>
                
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Size
                  </label>
                  <input
                    type="text"
                    value={newTrackingData.productSize}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewTrackingData({...newTrackingData, productSize: value});
                      filterSizes(value);
                    }}
                    onFocus={() => {
                      if (newTrackingData.productSize) {
                        filterSizes(newTrackingData.productSize);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding suggestions to allow clicking on them
                      setTimeout(() => setShowSizeSuggestions(false), 200);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 10.5 or S"
                  />
                  
                  {/* Size Suggestions Dropdown */}
                  {showSizeSuggestions && filteredSizes.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredSizes.map((size, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSizeSelect(size)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 focus:bg-gray-100 dark:focus:bg-gray-600 focus:outline-none"
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddTrackingModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTracking}
                disabled={addingTracking}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  addingTracking
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {addingTracking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Add Tracking
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 w-full max-w-md mx-4 border-2 border-red-500 shadow-2xl relative z-[10000] animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
                <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Delete Delivery
              </h2>
              
              <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">
                Are you sure you want to delete this delivery? This action cannot be undone.
              </p>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg font-semibold transition-all duration-200 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteDelivery(showDeleteConfirm)}
                  disabled={deletingId === showDeleteConfirm}
                  className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    deletingId === showDeleteConfirm
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white hover:shadow-lg transform hover:scale-105'
                  }`}
                >
                  {deletingId === showDeleteConfirm ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-[10001] animate-in slide-in-from-right-2 duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-2 ${
            toast.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-800 dark:text-green-200'
              : toast.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-800 dark:text-red-200'
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-800 dark:text-blue-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              toast.type === 'success' 
                ? 'bg-green-500'
                : toast.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}></div>
            <span className="font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deliveries;