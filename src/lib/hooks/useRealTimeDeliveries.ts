import { useState, useEffect, useCallback, useRef } from 'react';

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
  const hasLoadedOnceRef = useRef(false);

  const fetchDeliveries = useCallback(async () => {
    if (!userId) return;
    
    // Only show the "blocking" loading state for the first paint.
    if (!hasLoadedOnceRef.current) setLoading(true);
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
            
            // Phase 1 (fast): return deliveries without live tracking so the page renders quickly.
            if (!hasLoadedOnceRef.current) {
              const liteResponse = await fetch(`/api/deliveries/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId,
                  purchases,
                  fromLocalStorage: true,
                  includeLiveTracking: false
                })
              });
              const liteData = await liteResponse.json();
              if (liteData.success) {
                setDeliveries(liteData.deliveries);
                setLastSync(new Date(liteData.lastSync));
                hasLoadedOnceRef.current = true;
                console.log(`✅ Loaded ${liteData.deliveries.length} deliveries (lite)`);
              } else {
                throw new Error(liteData.error || 'Failed to fetch deliveries');
              }
              setLoading(false);
            }

            // Phase 2 (slow): hydrate live tracking in the background (no blocking loader).
            const fullResponse = await fetch(`/api/deliveries/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                purchases,
                fromLocalStorage: true,
                includeLiveTracking: true
              })
            });
            const fullData = await fullResponse.json();
            if (fullData.success) {
              setDeliveries(fullData.deliveries);
              setLastSync(new Date(fullData.lastSync));
              hasLoadedOnceRef.current = true;
              console.log(`✅ Loaded ${fullData.deliveries.length} deliveries (${fullData.liveTrackingCount} with live data)`);
            } else {
              throw new Error(fullData.error || 'Failed to fetch deliveries');
            }

            return;
          } catch (error) {
            console.error('❌ Error parsing localStorage purchases:', error);
            // Fall through to regular Firebase fetch
          }
        }
      }
      
      // Regular Firebase user flow
      // Phase 1 (fast): fetch without live tracking on first load.
      if (!hasLoadedOnceRef.current) {
        const liteResp = await fetch(`${url}&includeLiveTracking=0`);
        const lite = await liteResp.json();
        if (lite.success) {
          setDeliveries(lite.deliveries);
          setLastSync(new Date(lite.lastSync));
          hasLoadedOnceRef.current = true;
          console.log(`✅ Loaded ${lite.deliveries.length} deliveries (lite)`);
        } else {
          throw new Error(lite.error || 'Failed to fetch deliveries');
        }
        setLoading(false);
      }

      // Phase 2 (slow): hydrate live tracking in background.
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setDeliveries(data.deliveries);
        setLastSync(new Date(data.lastSync));
        hasLoadedOnceRef.current = true;
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
