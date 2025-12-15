import { useState, useEffect, useCallback } from 'react';

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
  liveTracking?: any;
  isLiveTrackingEnabled?: boolean;
  courierEstimatedDelivery?: string;
  afterShipEstimatedDelivery?: string;
  transitTime?: number;
  deliveryType?: string;
  signatureRequired?: string;
  courierTrackingLink?: string;
  onTimeStatus?: string;
}

interface UseRealTimeDeliveriesOptions {
  userId: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
  enableWebSocket?: boolean;
}

interface UseRealTimeDeliveriesReturn {
  deliveries: DeliveryItem[];
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
  refresh: () => Promise<void>;
  stats: {
    total: number;
    liveTracking: number;
    errors: number;
    delivered: number;
    inTransit: number;
    outForDelivery: number;
  };
}

export function useRealTimeDeliveries({
  userId,
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
  enableWebSocket = false
}: UseRealTimeDeliveriesOptions): UseRealTimeDeliveriesReturn {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetchDeliveries = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔄 Fetching deliveries for user: ${userId}`);
      
      // Only use the localStorage "site password" flow when the active userId matches siteUserId.
      // Otherwise, a stale siteUserId from a previous session can cause Deliveries to use the wrong dataset.
      const siteUserId = typeof window !== 'undefined' ? localStorage.getItem('siteUserId') : null;
      const shouldUseLocalStoragePurchases = !!(siteUserId && siteUserId === userId);
      let url = `/api/deliveries/sync?userId=${encodeURIComponent(userId)}`;
      
      // If site password user, get purchases from localStorage and send to API
      if (shouldUseLocalStoragePurchases && typeof window !== 'undefined') {
        const storageKey = `purchases_${siteUserId}`;
        const purchasesJson = localStorage.getItem(storageKey);
        
        if (purchasesJson) {
          try {
            const purchases = JSON.parse(purchasesJson);
            console.log(`📦 Found ${purchases.length} purchases in localStorage, sending to API`);
            
            // Send purchases as query param (for GET) or use POST
            // Using POST is better for large data
            const response = await fetch(`/api/deliveries/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                purchases,
                fromLocalStorage: true
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              setDeliveries(data.deliveries);
              setLastSync(new Date(data.lastSync));
              console.log(`✅ Loaded ${data.deliveries.length} deliveries (${data.liveTrackingCount} with live data)`);
            } else {
              throw new Error(data.error || 'Failed to fetch deliveries');
            }
            
            setLoading(false);
            return;
          } catch (error) {
            console.error('❌ Error parsing localStorage purchases:', error);
            // Fall through to regular Firebase fetch
          }
        }
      }
      
      // Regular Firebase user flow
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setDeliveries(data.deliveries);
        setLastSync(new Date(data.lastSync));
        console.log(`✅ Loaded ${data.deliveries.length} deliveries (${data.liveTrackingCount} with live data)`);
      } else {
        throw new Error(data.error || 'Failed to fetch deliveries');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Error fetching deliveries:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !userId) return;
    
    const interval = setInterval(fetchDeliveries, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchDeliveries, userId]);

  // Calculate stats
  const stats = {
    total: deliveries.length,
    liveTracking: deliveries.filter(d => d.isLiveTrackingEnabled).length,
    errors: deliveries.filter(d => d.liveTracking?.error).length,
    delivered: deliveries.filter(d => d.status === 'delivered').length,
    inTransit: deliveries.filter(d => d.status === 'in_transit').length,
    outForDelivery: deliveries.filter(d => d.status === 'out_for_delivery').length,
  };

  return {
    deliveries,
    loading,
    error,
    lastSync,
    refresh: fetchDeliveries,
    stats
  };
}
