import { useState, useEffect, useCallback } from 'react';
import { TrackingInfo } from '../tracking/trackingService';

interface UseLiveTrackingOptions {
  trackingNumber: string;
  carrier?: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseLiveTrackingReturn {
  trackingInfo: TrackingInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useLiveTracking({
  trackingNumber,
  carrier,
  autoRefresh = true,
  refreshInterval = 30000 // 30 seconds
}: UseLiveTrackingOptions): UseLiveTrackingReturn {
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTrackingInfo = useCallback(async () => {
    if (!trackingNumber) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        trackingNumber,
        ...(carrier && { carrier })
      });
      
      const response = await fetch(`/api/tracking/live?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setTrackingInfo(data.data);
        setLastUpdated(new Date());
      } else {
        setError(data.error || 'Failed to fetch tracking info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [trackingNumber, carrier]);

  // Initial fetch
  useEffect(() => {
    fetchTrackingInfo();
  }, [fetchTrackingInfo]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !trackingNumber) return;
    
    const interval = setInterval(fetchTrackingInfo, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchTrackingInfo, trackingNumber]);

  return {
    trackingInfo,
    loading,
    error,
    refresh: fetchTrackingInfo,
    lastUpdated
  };
}

// Hook for bulk tracking
interface UseBulkLiveTrackingOptions {
  trackingNumbers: string[];
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseBulkLiveTrackingReturn {
  trackingInfos: TrackingInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useBulkLiveTracking({
  trackingNumbers,
  autoRefresh = true,
  refreshInterval = 60000 // 1 minute for bulk
}: UseBulkLiveTrackingOptions): UseBulkLiveTrackingReturn {
  const [trackingInfos, setTrackingInfos] = useState<TrackingInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBulkTrackingInfo = useCallback(async () => {
    if (!trackingNumbers.length) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tracking/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackingNumbers })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTrackingInfos(data.data);
        setLastUpdated(new Date());
      } else {
        setError(data.error || 'Failed to fetch tracking info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [trackingNumbers]);

  // Initial fetch
  useEffect(() => {
    fetchBulkTrackingInfo();
  }, [fetchBulkTrackingInfo]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !trackingNumbers.length) return;
    
    const interval = setInterval(fetchBulkTrackingInfo, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchBulkTrackingInfo, trackingNumbers]);

  return {
    trackingInfos,
    loading,
    error,
    refresh: fetchBulkTrackingInfo,
    lastUpdated
  };
}
