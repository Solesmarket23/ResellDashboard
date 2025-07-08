'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDocuments, deleteDocument } from '../firebase/firebaseUtils';
import { clearAllUserSales, getUserSales } from '../firebase/userDataUtils';

export interface SaleMetrics {
  totalProfit: number;
  totalRevenue: number;
  totalSpend: number;
  avgProfitPerSale: number;
  salesCount: number;
  profitMargin: number;
  recentSales: any[];
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'reconnecting';
  lastUpdated: Date | null;
  error: string | null;
}

export const useSales = () => {
  const { user } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<SaleMetrics>({
    totalProfit: 0,
    totalRevenue: 0,
    totalSpend: 0,
    avgProfitPerSale: 0,
    salesCount: 0,
    profitMargin: 0,
    recentSales: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    lastUpdated: null,
    error: null
  });
  
  // Refs for cleanup
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Calculate metrics from sales data
  const calculateMetrics = (salesData: any[]): SaleMetrics => {
    if (!salesData || salesData.length === 0) {
      return {
        totalProfit: 0,
        totalRevenue: 0,
        totalSpend: 0,
        avgProfitPerSale: 0,
        salesCount: 0,
        profitMargin: 0,
        recentSales: []
      };
    }

    const totalRevenue = salesData.reduce((sum, sale) => sum + (parseFloat(sale.salePrice) || 0), 0);
    const totalSpend = salesData.reduce((sum, sale) => sum + (parseFloat(sale.purchasePrice) || 0), 0);
    const totalFees = salesData.reduce((sum, sale) => sum + (parseFloat(sale.fees) || 0), 0);
    const totalProfit = totalRevenue - totalSpend - totalFees;
    const avgProfitPerSale = salesData.length > 0 ? totalProfit / salesData.length : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    // Get recent sales (last 5)
    const recentSales = salesData
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return {
      totalProfit,
      totalRevenue,
      totalSpend,
      avgProfitPerSale,
      salesCount: salesData.length,
      profitMargin,
      recentSales
    };
  };

  // Load sales data from Firebase
  const loadSalesData = async (showLoading = true) => {
    if (!user) {
      console.log('🔄 useSales: No user found, skipping sales load');
      setLoading(false);
      setConnectionState({
        status: 'disconnected',
        lastUpdated: null,
        error: 'No user authenticated'
      });
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      setConnectionState(prev => ({ ...prev, status: 'reconnecting' }));

      console.log('🔄 useSales: Loading sales data for user:', user.uid);
      
      // Use the dedicated getUserSales function instead of manual filtering
      const userSalesData = await getUserSales(user.uid);
      
      console.log('🔄 useSales: Found', userSalesData.length, 'sales');
      console.log('🔄 useSales: Sales data preview:', userSalesData.slice(0, 3));
      
      if (mountedRef.current) {
        setSales(userSalesData);
        setMetrics(calculateMetrics(userSalesData));
        setConnectionState({
          status: 'connected',
          lastUpdated: new Date(),
          error: null
        });
      }
      
    } catch (err) {
      console.error('❌ useSales: Error loading sales:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sales data';
      
      if (mountedRef.current) {
        setError(errorMessage);
        setConnectionState({
          status: 'disconnected',
          lastUpdated: null,
          error: errorMessage
        });
      }
    } finally {
      if (mountedRef.current && showLoading) {
        setLoading(false);
      }
    }
  };

  // Delete a single sale
  const deleteSale = async (saleId: string): Promise<boolean> => {
    if (!user) {
      console.error('❌ useSales: No user authenticated for delete');
      return false;
    }

    try {
      setIsDeleting(true);
      console.log('🗑️ useSales: Deleting sale with Firebase doc ID:', saleId);
      
      await deleteDocument('sales', saleId);
      
      console.log('✅ useSales: Sale deleted from Firebase');
      
      // Refresh data after deletion
      await loadSalesData(false);
      
      console.log('✅ useSales: Sale deleted successfully and data refreshed');
      return true;
      
    } catch (err) {
      console.error('❌ useSales: Error deleting sale:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete sale';
      setError(errorMessage);
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  // Clear all user sales
  const clearAllSales = async (): Promise<boolean> => {
    if (!user) {
      console.error('❌ useSales: No user authenticated for clear all');
      return false;
    }

    try {
      setIsDeleting(true);
      console.log('🗑️ useSales: Clearing all sales for user:', user.uid);
      
      const result = await clearAllUserSales(user.uid);
      
      if (result.success) {
        // Refresh data after clearing
        await loadSalesData(false);
        console.log('✅ useSales: All sales cleared successfully');
        return true;
      } else {
        throw new Error(result.error || 'Failed to clear all sales');
      }
      
    } catch (err) {
      console.error('❌ useSales: Error clearing all sales:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear all sales';
      setError(errorMessage);
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  // Force refresh function
  const forceRefresh = async () => {
    console.log('🔄 useSales: Force refresh requested');
    await loadSalesData(true);
  };

  // Initial load and user change handling
  useEffect(() => {
    mountedRef.current = true;
    loadSalesData();
    
    return () => {
      mountedRef.current = false;
    };
  }, [user]);

  // Set up auto-refresh when user is active
  useEffect(() => {
    if (!user) return;

    const setupAutoRefresh = () => {
      // Clear existing interval
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }

      // Set up new interval for auto-refresh every 30 seconds
      refreshIntervalRef.current = setInterval(() => {
        // Only refresh if document is visible (user is actively using the app)
        if (!document.hidden && mountedRef.current) {
          console.log('🔄 useSales: Auto-refresh triggered (30s interval)');
          loadSalesData(false);
        }
      }, 30000); // 30 seconds
    };

    setupAutoRefresh();

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden && mountedRef.current) {
        console.log('🔄 useSales: Page became visible - refreshing');
        loadSalesData(false);
      }
    };

    // Handle window focus
    const handleFocus = () => {
      if (mountedRef.current) {
        console.log('🔄 useSales: Window focused - refreshing');
        loadSalesData(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      // Cleanup
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  return {
    sales,
    metrics,
    loading,
    error,
    isDeleting,
    connectionState,
    deleteSale,
    clearAllSales,
    forceRefresh
  };
}; 