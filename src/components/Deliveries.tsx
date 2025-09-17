'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal, RefreshCw, Wrench, Wifi, WifiOff, X, ChevronDown, Trash2 } from 'lucide-react';
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
                trackingNumbers: [trackingValue]
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
        await loadDeliveries();
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
        // Remove from local state
        setDeliveries(prev => prev.filter(delivery => delivery.id !== deliveryId));
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
          
          // Prioritize tracking data over calculated estimate
          let estimatedDelivery = getEstimatedDelivery(purchase.createdAt || purchase.purchaseDate, purchase.status);
          
          // If we have live tracking data, use its estimated delivery
          if (purchase.trackingData?.estimatedDelivery) {
            console.log(`📦 Using tracking data estimated delivery: ${purchase.trackingData.estimatedDelivery} for ${trackingValue}`);
            estimatedDelivery = purchase.trackingData.estimatedDelivery;
          } else if (purchase.estimatedDelivery) {
            console.log(`📦 Using purchase estimated delivery: ${purchase.estimatedDelivery} for ${trackingValue}`);
            estimatedDelivery = purchase.estimatedDelivery;
          } else {
            console.log(`📦 Using calculated estimated delivery: ${estimatedDelivery} for ${trackingValue}`);
          }

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
      
      // Deduplicate deliveries by tracking number (keep the most recent one)
      const uniqueDeliveries = deliveriesWithTracking.reduce((acc: DeliveryItem[], current: DeliveryItem) => {
        const existingIndex = acc.findIndex(delivery => delivery.trackingNumber === current.trackingNumber);
        
        if (existingIndex === -1) {
          // No duplicate found, add the delivery
          acc.push(current);
        } else {
          // Duplicate found, keep the one with the most recent lastUpdate
          const existing = acc[existingIndex];
          const currentDate = new Date(current.lastUpdate);
          const existingDate = new Date(existing.lastUpdate);
          
          if (currentDate > existingDate) {
            // Current delivery is more recent, replace the existing one
            acc[existingIndex] = current;
            console.log(`📦 Replaced duplicate delivery for tracking ${current.trackingNumber} with more recent data`);
          } else {
            console.log(`📦 Skipped duplicate delivery for tracking ${current.trackingNumber} (keeping existing more recent data)`);
          }
        }
        
        return acc;
      }, []);
      
      console.log(`📦 After deduplication: ${uniqueDeliveries.length} unique deliveries (removed ${deliveriesWithTracking.length - uniqueDeliveries.length} duplicates)`);
      
      // Extract tracking numbers for live tracking
      const trackingNumbersList = uniqueDeliveries.map(d => d.trackingNumber);
      setTrackingNumbers(trackingNumbersList);
      
      setDeliveries(uniqueDeliveries);
      
      // Set debug info
      setDebugInfo({
        totalPurchases: userPurchases.length,
        userPurchases: userPurchases.length,
        deliveriesWithTracking: uniqueDeliveries.length,
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
            estimatedDelivery: (() => {
              // If live tracking has a valid estimated delivery, use it
              if (liveTracking.estimatedDelivery && liveTracking.estimatedDelivery !== null) {
                console.log(`📦 Using live tracking estimated delivery: ${liveTracking.estimatedDelivery} for ${delivery.trackingNumber}`);
                return liveTracking.estimatedDelivery;
              }
              
              // If live tracking exists but no estimated delivery, show "TBD" instead of calculated estimate
              if (liveTracking && !liveTracking.error) {
                console.log(`📦 Live tracking active but no estimated delivery yet for ${delivery.trackingNumber}`);
                return 'TBD';
              }
              
              // Fall back to calculated estimate only if no live tracking
              return delivery.estimatedDelivery;
            })(),
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
            <div 
              key={delivery.id} 
              onClick={() => handleShipmentClick(delivery)}
              className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] ${
                expandedCardId === delivery.id ? 'ring-2 ring-cyan-400 shadow-cyan-400/20' : ''
              }`}
            >
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
                    {delivery.liveTracking && !delivery.liveTracking.error && (
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
                    {!delivery.liveTracking && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">LOADING</span>
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
                        : delivery.estimatedDelivery === 'TBD'
                        ? 'Est. TBD'
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
                              <p className={`${currentTheme.colors.textPrimary} font-mono font-medium`}>{delivery.trackingNumber || 'N/A'}</p>
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
                                  <h5 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-3`}>Tracking History</h5>
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
                  onChange={(e) => setNewTrackingData({...newTrackingData, trackingNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 1Z999AA1234567890"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Carrier
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
                </select>
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
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Size
                  </label>
                  <input
                    type="text"
                    value={newTrackingData.productSize}
                    onChange={(e) => setNewTrackingData({...newTrackingData, productSize: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 10.5"
                  />
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