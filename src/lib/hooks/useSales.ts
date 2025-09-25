'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDocuments, deleteDocument } from '../firebase/firebaseUtils';
import { clearAllUserSales, getUserSales } from '../firebase/userDataUtils';

// Helper function to extract brand from product name
const extractBrandFromProductName = (productName: string): string | null => {
  if (!productName) return null;
  
  // Common sneaker brands to look for at the beginning of product names
  const brands = [
    'Nike', 'Jordan', 'Adidas', 'Yeezy', 'New Balance', 'Asics', 'Puma', 
    'Vans', 'Converse', 'Reebok', 'Under Armour', 'Fear of God', 'Polo Ralph Lauren',
    'Off-White', 'Travis Scott', 'Stone Island', 'Supreme', 'BAPE', 'Kith',
    'UGG', 'Timberland', 'Dr. Martens', 'Balenciaga', 'Gucci', 'Louis Vuitton',
    'Dior', 'Chrome Hearts', 'Golf Wang', 'A Bathing Ape', 'Human Made'
  ];
  
  const productNameLower = productName.toLowerCase();
  
  for (const brand of brands) {
    if (productNameLower.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }
  
  // If no match found, try to get first word if it looks like a brand
  const firstWord = productName.split(' ')[0];
  if (firstWord && firstWord.length > 2) {
    return firstWord;
  }
  
  return null;
};

export interface SaleMetrics {
  totalProfit: number;
  totalRevenue: number;
  totalSpend: number;
  avgProfitPerSale: number;
  salesCount: number;
  profitMargin: number;
  recentSales: any[];
  platformBreakdown: {
    manual: { count: number; revenue: number; profit: number };
    stockx: { count: number; revenue: number; profit: number };
  };
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'reconnecting';
  lastUpdated: Date | null;
  error: string | null;
}

export const useSales = () => {
  const { user } = useAuth();
  
  // Get site password user as fallback
  const getUserId = () => {
    if (user?.uid) return user.uid;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('siteUserId');
    }
    return null;
  };
  const [sales, setSales] = useState<any[]>([]);
  const [manualSales, setManualSales] = useState<any[]>([]);
  const [stockxSales, setStockxSales] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<SaleMetrics>({
    totalProfit: 0,
    totalRevenue: 0,
    totalSpend: 0,
    avgProfitPerSale: 0,
    salesCount: 0,
    profitMargin: 0,
    recentSales: [],
    platformBreakdown: {
      manual: { count: 0, revenue: 0, profit: 0 },
      stockx: { count: 0, revenue: 0, profit: 0 }
    }
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
        recentSales: [],
        platformBreakdown: {
          manual: { count: 0, revenue: 0, profit: 0 },
          stockx: { count: 0, revenue: 0, profit: 0 }
        }
      };
    }

    const totalRevenue = salesData.reduce((sum, sale) => {
      // Handle both manual sales (salePrice) and StockX sales (amount/payout.amount)
      const revenue = parseFloat(sale.salePrice) || parseFloat(sale.amount) || 
                     (sale.payout && parseFloat(sale.payout.amount)) || 0;
      return sum + revenue;
    }, 0);
    
    const totalSpend = salesData.reduce((sum, sale) => sum + (parseFloat(sale.purchasePrice) || 0), 0);
    const totalFees = salesData.reduce((sum, sale) => sum + (parseFloat(sale.fees) || 0), 0);
    const totalProfit = totalRevenue - totalSpend - totalFees;
    const avgProfitPerSale = salesData.length > 0 ? totalProfit / salesData.length : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    // Calculate platform breakdown
    const platformBreakdown = {
      manual: {
        count: 0,
        revenue: 0,
        profit: 0
      },
      stockx: {
        count: 0,
        revenue: 0,
        profit: 0
      }
    };
    
    salesData.forEach(sale => {
      const platform = sale.platform || 'manual';
      const revenue = parseFloat(sale.salePrice) || parseFloat(sale.amount) || 
                     (sale.payout && parseFloat(sale.payout.amount)) || 0;
      const spend = parseFloat(sale.purchasePrice) || 0;
      const fees = parseFloat(sale.fees) || 0;
      const profit = revenue - spend - fees;
      
      if (platform === 'stockx') {
        platformBreakdown.stockx.count++;
        platformBreakdown.stockx.revenue += revenue;
        platformBreakdown.stockx.profit += profit;
      } else {
        platformBreakdown.manual.count++;
        platformBreakdown.manual.revenue += revenue;
        platformBreakdown.manual.profit += profit;
      }
    });
    
    // Get recent sales (last 5)
    const recentSales = salesData
      .sort((a, b) => {
        const dateA = new Date(a.date || a.createdAt).getTime();
        const dateB = new Date(b.date || b.createdAt).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);

    return {
      totalProfit,
      totalRevenue,
      totalSpend,
      avgProfitPerSale,
      salesCount: salesData.length,
      profitMargin,
      recentSales,
      platformBreakdown
    };
  };

  // Load sales data from Firebase
  const loadSalesData = async (showLoading = true) => {
    const userId = getUserId();
    if (!userId) {
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

      console.log('🔄 useSales: Loading sales data for user:', userId);
      
      // Fetch sales from server (admin) to guarantee we read what the API wrote
      console.log('🔎 useSales: Fetching server sales via /api/sales/list (first page fast)');
      const pageSize = 400; // Increased page size for better performance
      let cursorId: string | null = null;
      let aggregatedSales: any[] = [];

      // Fetch first page quickly and render immediately
      const firstUrl = `/api/sales/list?userId=${encodeURIComponent(userId)}&limit=${pageSize}`;
      const firstResp = await fetch(firstUrl, { cache: 'no-store' });
      if (!firstResp.ok) throw new Error(`First page fetch failed: ${firstResp.status}`);
      const firstJson = await firstResp.json();
      if (!firstJson.success) throw new Error('First page fetch not successful');
      aggregatedSales = aggregatedSales.concat(firstJson.sales || []);
      cursorId = firstJson.nextCursorId || null;

      const initialNormalized = aggregatedSales.map((sale: any) => ({
        ...sale,
        platform: sale.platform || (sale.source?.includes('stockx') ? 'stockx' : 'manual')
      }));

      if (mountedRef.current) {
        setSales(initialNormalized);
        setManualSales(initialNormalized);
        setStockxSales([]);
        setMetrics(calculateMetrics(initialNormalized));
        setConnectionState({ status: 'connected', lastUpdated: new Date(), error: null });
        if (showLoading) setLoading(false);
      }

      // Background prefetch remaining pages (load all pages)
      let page = 1;
      console.log(`🔄 useSales: Starting background loading. Page size: ${pageSize}, Initial cursor: ${cursorId}`);
      
      while (cursorId && page < 50) { // Increased limit to handle up to 20,000 sales (50 × 400)
        console.log(`🔄 useSales: Loading page ${page}, cursor: ${cursorId}`);
        
        const url = `/api/sales/list?userId=${encodeURIComponent(userId)}&limit=${pageSize}&cursorId=${cursorId}`;
        const resp = await fetch(url, { cache: 'no-store' });
        
        if (!resp.ok) {
          console.log(`❌ useSales: Page ${page} fetch failed: ${resp.status}`);
          break;
        }
        
        const json = await resp.json();
        if (!json.success) {
          console.log(`❌ useSales: Page ${page} not successful:`, json);
          break;
        }
        
        const newSales = json.sales || [];
        console.log(`📊 useSales: Page ${page} loaded ${newSales.length} sales. Total so far: ${aggregatedSales.length + newSales.length}`);
        
        aggregatedSales = aggregatedSales.concat(newSales);
        cursorId = json.nextCursorId;
        page++;
        
        if (mountedRef.current) {
          const normalized = aggregatedSales.map((sale: any) => ({
            ...sale,
            platform: sale.platform || (sale.source?.includes('stockx') ? 'stockx' : 'manual')
          }));
          setSales(normalized);
          setManualSales(normalized);
          setMetrics(calculateMetrics(normalized));
          setConnectionState({ status: 'connected', lastUpdated: new Date(), error: null });
        }
        
        // If no more cursor, we're done
        if (!json.nextCursorId) {
          console.log(`✅ useSales: No more cursor, finished loading at page ${page}`);
          break;
        }
      }
      
      console.log(`✅ useSales: Background loading completed. Total sales loaded: ${aggregatedSales.length}`);
      
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
    const userId = getUserId();
    if (!userId) {
      console.error('❌ useSales: No user authenticated for delete');
      return false;
    }

    try {
      setIsDeleting(true);
      console.log('🗑️ useSales: Deleting sale with ID:', saleId, 'Type:', typeof saleId);
      
      // Ensure saleId is a string
      if (typeof saleId !== 'string') {
        console.error('❌ useSales: Sale ID is not a string:', saleId, typeof saleId);
        throw new Error(`Invalid sale ID type: ${typeof saleId}. Expected string.`);
      }
      
      await deleteDocument('user_sales', saleId);
      
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
    const userId = getUserId();
    if (!userId) {
      console.error('❌ useSales: No user authenticated for clear all');
      return false;
    }

    try {
      setIsDeleting(true);
      console.log('🗑️ useSales: Clearing all sales for user:', userId);
      console.log('🗑️ useSales: User ID type:', typeof userId);
      console.log('🗑️ useSales: User ID length:', userId.length);
      
      // Use API endpoint to clear sales (bypasses client-side permissions)
      const response = await fetch('/api/sales/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ useSales: API cleared sales successfully:', result);
      
      // Refresh data after clearing
      await loadSalesData(false);
      return true;
      
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
    console.log('🔄 useSales: Current sales count before refresh:', sales.length);
    await loadSalesData(true);
    console.log('🔄 useSales: Force refresh completed');
  };

  // Initial load and user change handling
  useEffect(() => {
    mountedRef.current = true;
    loadSalesData();
    
    return () => {
      mountedRef.current = false;
    };
  }, [user, getUserId()]);

  // Set up auto-refresh when user is active
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;

    const setupAutoRefresh = () => {
      // Clear existing interval
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }

      // Set up new interval for auto-refresh every 60 seconds (reduced frequency)
      refreshIntervalRef.current = setInterval(() => {
        // Only refresh if document is visible (user is actively using the app)
        if (!document.hidden && mountedRef.current) {
          console.log('🔄 useSales: Auto-refresh triggered (60s interval)');
          loadSalesData(false);
        }
      }, 60000); // 60 seconds (reduced from 30)
    };

    setupAutoRefresh();

    // Temporarily disabled automatic refresh on visibility/focus changes
    // to prevent flickering issues
    
    // const handleVisibilityChange = () => {
    //   if (!document.hidden && mountedRef.current) {
    //     console.log('🔄 useSales: Page became visible - refreshing');
    //     loadSalesData(false);
    //   }
    // };

    // const handleFocus = () => {
    //   if (mountedRef.current) {
    //     console.log('🔄 useSales: Window focused - refreshing');
    //     loadSalesData(false);
    //   }
    // };

    // document.addEventListener('visibilitychange', handleVisibilityChange);
    // window.addEventListener('focus', handleFocus);

    return () => {
      // Cleanup
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      // Temporarily disabled event listeners
      // document.removeEventListener('visibilitychange', handleVisibilityChange);
      // window.removeEventListener('focus', handleFocus);
    };
  }, [user, getUserId()]);

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
    manualSales,
    stockxSales,
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