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
      
      // Fetch both manual sales and StockX sales in parallel
      const [manualSalesData, stockxSalesData] = await Promise.all([
        getUserSales(user.uid),
        getDocuments('stockxSales')
      ]);
      
      console.log('🔍 Raw StockX sales data:', stockxSalesData.length, 'total sales');
      console.log('🔍 Current user.uid:', user.uid);
      if (stockxSalesData.length > 0) {
        console.log('🔍 First StockX sale raw data:', stockxSalesData[0]);
        console.log('🔍 First sale userId:', stockxSalesData[0].userId);
        console.log('🔍 UserID match?', stockxSalesData[0].userId === user.uid);
      }
      
      // Filter StockX sales for current user and add platform field
      const userStockxSales = stockxSalesData
        .filter((sale: any) => sale.userId === user.uid)
        .map((sale: any) => {
          // StockX sales data is stored directly in the document
          const saleData = sale.saleData;
          
          // Skip if no saleData
          if (!saleData) {
            console.warn('⚠️ StockX sale missing saleData:', sale);
            return null;
          }
          
          // Debug log first sale's saleData
          if (stockxSalesData.indexOf(sale) === 0) {
            console.log('🔍 Full StockX sale data:', JSON.stringify(saleData, null, 2));
            console.log('🔍 Key fields check:', {
              'pricing': saleData.pricing,
              'payout': saleData.payout,
              'amount': saleData.amount,
              'salePrice': saleData.salePrice,
              'totalPayout': saleData.totalPayout,
              'fees': saleData.fees,
              'sellerFees': saleData.sellerFees
            });
          }
          
          // Remove debug logging
          // The issue was pricing.salesPrice vs pricing.salePrice
          
          return {
            ...sale,
            id: sale.id || saleData.orderNumber,
            platform: 'stockx',
            // Map StockX fields to match manual sales structure
            product: saleData.product?.productName || 'Unknown Product',
            brand: saleData.product?.brand || 'Unknown Brand',
            size: saleData.variant?.size || 'Unknown',
            orderNumber: saleData.orderNumber || sale.stockxOrderId || '',
            // Normalize date field
            date: saleData.createdAt || sale.createdAt || sale.updatedAt,
            // Normalize price fields for consistent calculations
            // Try multiple locations for the sale price
            salePrice: saleData.pricing?.salePrice || saleData.pricing?.buyerPaid || saleData.salePrice || parseFloat(saleData.amount) || 0,
            purchasePrice: sale.purchasePrice || 0,
            // StockX fees - check multiple locations
            fees: saleData.pricing?.sellerFees || saleData.fees || saleData.totalFees || saleData.sellerFees || 0,
            // For payout, use the totalPayout from pricing which is now calculated in the API
            payout: saleData.pricing?.totalPayout || saleData.totalPayout || 0,
            // Calculate profit if not provided
            profit: (saleData.pricing?.totalPayout || saleData.totalPayout || 0) - (sale.purchasePrice || 0)
          };
        })
        .filter(sale => sale !== null); // Remove any null entries
      
      // Add platform field to manual sales
      const normalizedManualSales = manualSalesData.map((sale: any) => ({
        ...sale,
        platform: 'manual'
      }));
      
      // Combine all sales
      const allSales = [...normalizedManualSales, ...userStockxSales];
      
      console.log('🔄 useSales: Found', normalizedManualSales.length, 'manual sales');
      console.log('🔄 useSales: Found', userStockxSales.length, 'StockX sales');
      console.log('🔄 useSales: Total sales:', allSales.length);
      
      // Additional debug: Log sample of processed StockX sales
      if (userStockxSales.length > 0) {
        console.log('🔍 Sample processed StockX sale:', {
          id: userStockxSales[0].id,
          platform: userStockxSales[0].platform,
          product: userStockxSales[0].product,
          salePrice: userStockxSales[0].salePrice,
          date: userStockxSales[0].date,
          profit: userStockxSales[0].profit
        });
      }
      
      if (mountedRef.current) {
        setSales(allSales);
        setManualSales(normalizedManualSales);
        setStockxSales(userStockxSales);
        setMetrics(calculateMetrics(allSales));
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
    if (!user) {
      console.error('❌ useSales: No user authenticated for clear all');
      return false;
    }

    try {
      setIsDeleting(true);
      console.log('🗑️ useSales: Clearing all sales for user:', user.uid);
      
      // Clear manual sales from 'sales' collection
      const result = await clearAllUserSales(user.uid);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to clear manual sales');
      }
      
      // Also clear StockX sales from 'stockxSales' collection
      console.log('🗑️ useSales: Clearing StockX sales...');
      const stockxSalesData = await getDocuments('stockxSales');
      const userStockxSales = stockxSalesData.filter((sale: any) => sale.userId === user.uid);
      
      console.log(`🗑️ useSales: Found ${userStockxSales.length} StockX sales to clear`);
      
      // Delete each StockX sale
      for (const sale of userStockxSales) {
        await deleteDocument('stockxSales', sale.id);
      }
      
      // Also clear StockX sync info
      const syncInfo = await getDocuments('stockxSyncInfo');
      const userSyncInfo = syncInfo.find((info: any) => info.userId === user.uid);
      if (userSyncInfo) {
        await deleteDocument('stockxSyncInfo', userSyncInfo.id);
      }
      
      console.log('✅ useSales: All sales (manual + StockX) cleared successfully');
      
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