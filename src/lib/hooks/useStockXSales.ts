import { useState, useEffect, useCallback } from 'react';
import { StockXSale, StockXSyncStatus } from '@/lib/types/stockx';
import { useAuth } from '@/lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument, deleteDocument } from '@/lib/firebase/firebaseUtils';

export const useStockXSales = () => {
  const { user } = useAuth();
  const [sales, setSales] = useState<StockXSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<StockXSyncStatus>({
    isAuthenticated: false,
    totalSales: 0,
    totalRevenue: 0,
    pendingPayouts: 0,
    authenticationRate: 0
  });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; status: string } | null>(null);

  // Check authentication status and load cached sales from Firebase
  useEffect(() => {
    if (!user) return;

    const initializeStockXData = async () => {
      try {
        // Check authentication by making a simple API call
        try {
          const authCheckResponse = await fetch('/api/stockx/sales?limit=1&offset=0&status=active', {
            credentials: 'include'
          });
          
          if (authCheckResponse.ok) {
            setSyncStatus(prev => ({ ...prev, isAuthenticated: true }));
          } else if (authCheckResponse.status === 401) {
            setSyncStatus(prev => ({ ...prev, isAuthenticated: false }));
          }
        } catch (error) {
          console.log('Could not verify StockX authentication status');
        }
        
        // Load cached sales - handle case where collection doesn't exist yet
        try {
          const cachedSales = await getDocuments('stockxSales');
          const userSales = cachedSales
            .filter(sale => sale.userId === user.uid)
            .map(sale => sale.saleData as StockXSale)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          setSales(userSales);
          calculateSyncStatus(userSales);
        } catch (error) {
          console.log('No cached StockX sales found - this is normal for first time use');
          setSales([]);
          calculateSyncStatus([]);
        }
        
        // Get last sync time - handle case where collection doesn't exist yet
        try {
          const syncInfo = await getDocuments('stockxSyncInfo');
          const userSyncInfo = syncInfo.find(info => info.userId === user.uid);
          if (userSyncInfo?.lastSyncTime) {
            setLastSyncTime(userSyncInfo.lastSyncTime);
          }
        } catch (error) {
          console.log('No sync info found - this is normal for first time use');
        }
      } catch (error) {
        console.error('Error initializing StockX data:', error);
      }
    };

    initializeStockXData();
  }, [user]);

  // Calculate sync status metrics
  const calculateSyncStatus = (salesData: StockXSale[]) => {
    const completedSales = salesData.filter(sale => 
      sale.status === 'PAYOUT_COMPLETED' || sale.status === 'AUTHENTICATED'
    );
    
    const totalRevenue = completedSales.reduce((sum, sale) => 
      sum + sale.pricing.totalPayout, 0
    );
    
    const pendingPayouts = salesData.filter(sale => 
      sale.status === 'PAYOUT_PENDING' || sale.status === 'AUTHENTICATED'
    ).length;
    
    const authenticatedCount = salesData.filter(sale => 
      sale.authentication?.status === 'PASSED'
    ).length;
    
    const authenticationRate = salesData.length > 0 
      ? (authenticatedCount / salesData.length) * 100 
      : 0;

    setSyncStatus(prev => ({
      ...prev,
      totalSales: salesData.length,
      totalRevenue,
      pendingPayouts,
      authenticationRate,
      lastSyncTime
    }));
  };

  // Sync sales from StockX API
  const syncSales = useCallback(async (silent = false, fullSync = false) => {
    if (!user) {
      setError('Please login to sync StockX sales');
      return;
    }

    if (!silent) setLoading(true);
    setError(null);
    setSyncProgress(null);

    try {
      // Calculate date range
      const now = new Date();
      let fromDate: string;
      
      if (fullSync) {
        // Full sync: go back 90 days max
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        fromDate = ninetyDaysAgo.toISOString();
      } else if (lastSyncTime) {
        // Incremental sync: from last sync time
        fromDate = lastSyncTime;
      } else {
        // Initial sync: last 30 days
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        fromDate = thirtyDaysAgo.toISOString();
      }
      
      const toDate = now.toISOString();
      
      console.log(`🔄 StockX Sync: ${fullSync ? 'Full' : lastSyncTime ? 'Incremental' : 'Initial'} sync`);
      // Note: Date filtering will be done after fetching since StockX API doesn't support it
      
      // Fetch all pages of sales data
      let allSales: StockXSale[] = [];
      let pageNumber = 1;
      let hasNextPage = true;
      const pageSize = 100; // Use maximum allowed per docs
      const maxPages = fullSync ? 10 : 3; // Limit pages to prevent timeout

      // Fetch completed sales first
      while (hasNextPage && pageNumber <= maxPages) {
        setSyncProgress({ 
          current: pageNumber, 
          total: maxPages, 
          status: `Fetching page ${pageNumber} of completed sales...` 
        });
        
        const offset = (pageNumber - 1) * pageSize;
        // Note: Removing date params as StockX API doesn't support them
        const url = `/api/stockx/sales?limit=${pageSize}&offset=${offset}&status=completed`;
        
        const response = await fetch(url, {
          credentials: 'include'
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 401) {
            setError('Invalid StockX API credentials');
            setSyncStatus(prev => ({ ...prev, isAuthenticated: false }));
            return;
          } else if (response.status === 504) {
            // Timeout - try with smaller page size
            console.log('⚠️ Timeout detected, reducing scope...');
            setError('StockX sync timed out. Try syncing again with a shorter date range.');
            break;
          }
          throw new Error(errorData.error || 'Failed to fetch StockX sales');
        }

        const data = await response.json();
        
        if (data.success && data.data) {
          allSales = allSales.concat(data.data);
          console.log(`✅ Fetched ${data.data.length} sales from page ${pageNumber}`);
          
          // Use hasNextPage from response
          hasNextPage = data.hasNextPage || false;
          pageNumber++;
        } else {
          hasNextPage = false;
        }
      }
      
      if (pageNumber > maxPages && hasNextPage) {
        console.log(`⚠️ Reached max pages limit (${maxPages}). Some sales may not be synced.`);
      }

      // Also fetch active/pending sales with pagination (limited)
      pageNumber = 1;
      hasNextPage = true;
      const maxActivePage = 1; // Only fetch 1 page of active sales to prevent timeout
      
      while (hasNextPage && pageNumber <= maxActivePage) {
        setSyncProgress({ 
          current: pageNumber + maxPages, 
          total: maxPages + maxActivePage, 
          status: 'Fetching active sales...' 
        });
        
        const offset = (pageNumber - 1) * pageSize;
        const activeUrl = `/api/stockx/sales?limit=${pageSize}&offset=${offset}&status=active`;
        
        try {
          const activeResponse = await fetch(activeUrl, {
            credentials: 'include'
          });
          
          if (activeResponse.ok) {
            const activeData = await activeResponse.json();
            if (activeData.success && activeData.data) {
              allSales = allSales.concat(activeData.data);
              console.log(`✅ Fetched ${activeData.data.length} active sales`);
              hasNextPage = activeData.hasNextPage || false;
              pageNumber++;
            } else {
              hasNextPage = false;
            }
          } else if (activeResponse.status === 504) {
            console.log('⚠️ Timeout fetching active sales, skipping...');
            break;
          } else {
            // If active sales fail, just continue with completed sales
            console.log('Note: Could not fetch active sales, continuing with completed sales only');
            break;
          }
        } catch (error) {
          console.log('Error fetching active sales, continuing with completed sales only:', error);
          break;
        }
      }

      // Apply date filtering client-side since StockX API doesn't support it
      let filteredSales = allSales;
      if (!fullSync && (fromDate || toDate)) {
        const fromDateObj = fromDate ? new Date(fromDate) : new Date('1970-01-01');
        const toDateObj = toDate ? new Date(toDate) : new Date();
        
        // For incremental syncs, check updatedAt to catch sales that were updated since last sync
        filteredSales = allSales.filter(sale => {
          // Use updatedAt if available, otherwise fall back to createdAt
          const saleDate = new Date(sale.updatedAt || sale.createdAt);
          const isInRange = saleDate >= fromDateObj && saleDate <= toDateObj;
          
          // Also include sales created after the fromDate
          const createdDate = new Date(sale.createdAt);
          const isNewSale = createdDate >= fromDateObj && createdDate <= toDateObj;
          
          return isInRange || isNewSale;
        });
        
        console.log(`📅 Date filter applied: ${filteredSales.length} of ${allSales.length} sales match date range`);
        console.log(`   From: ${fromDateObj.toISOString()}`);
        console.log(`   To: ${toDateObj.toISOString()}`);
        console.log(`   Filter type: ${lastSyncTime ? 'Incremental (checking updatedAt or createdAt)' : 'Initial (last 30 days)'}`);
      } else if (fullSync) {
        console.log(`🔄 Full sync: Including all ${allSales.length} sales (no date filtering)`);
      }
      
      // Save to Firebase
      await saveSalesToFirebase(filteredSales);
      
      // Update local state
      setSales(filteredSales);
      calculateSyncStatus(filteredSales);
      
      // Update sync time
      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      await updateSyncTime(syncTime);

      setSyncProgress({ 
        current: allSales.length, 
        total: allSales.length, 
        status: `Successfully synced ${allSales.length} sales` 
      });
      
      if (!silent) {
        console.log(`✅ Successfully synced ${allSales.length} StockX sales`);
      }
      
      // Clear progress after 3 seconds
      setTimeout(() => setSyncProgress(null), 3000);

    } catch (error) {
      console.error('Error syncing StockX sales:', error);
      setError(error instanceof Error ? error.message : 'Failed to sync sales');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user, lastSyncTime]);

  // Save sales to Firebase
  const saveSalesToFirebase = async (salesData: StockXSale[]) => {
    if (!user) return;

    console.log('🔍 Saving StockX sales with userId:', user.uid);

    try {
      // Get existing sales to check for duplicates
      let existingSales: any[] = [];
      try {
        existingSales = await getDocuments('stockxSales');
      } catch (error) {
        console.log('No existing StockX sales found - will create new collection');
      }
      
      const userSalesMap = new Map(
        existingSales
          .filter(sale => sale.userId === user.uid)
          .map(sale => [sale.stockxOrderId, sale])
      );

      // Save each sale
      for (const sale of salesData) {
        const existingSale = userSalesMap.get(sale.orderNumber);
        
        if (existingSale) {
          // Update existing sale if status changed
          if (existingSale.saleData.status !== sale.status) {
            await updateDocument('stockxSales', existingSale.id, {
              saleData: sale,
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          // Add new sale
          await addDocument('stockxSales', {
            userId: user.uid,
            stockxOrderId: sale.orderNumber,
            saleData: sale,
            createdAt: new Date().toISOString(),
            source: 'stockx_api'
          });
        }
      }
    } catch (error) {
      console.error('Error saving sales to Firebase:', error);
      throw error;
    }
  };

  // Update sync time in Firebase
  const updateSyncTime = async (syncTime: string) => {
    if (!user) return;

    try {
      let syncInfo: any[] = [];
      try {
        syncInfo = await getDocuments('stockxSyncInfo');
      } catch (error) {
        console.log('No existing sync info found - will create new collection');
      }
      
      const userSyncInfo = syncInfo.find(info => info.userId === user.uid);
      
      if (userSyncInfo) {
        await updateDocument('stockxSyncInfo', userSyncInfo.id, {
          lastSyncTime: syncTime,
          updatedAt: syncTime
        });
      } else {
        await addDocument('stockxSyncInfo', {
          userId: user.uid,
          lastSyncTime: syncTime,
          createdAt: syncTime
        });
      }
    } catch (error) {
      console.error('Error updating sync time:', error);
    }
  };

  // Convert StockX sale to main sales format
  const convertToMainSale = useCallback(async (stockxSale: StockXSale) => {
    if (!user) return;

    try {
      const mainSaleData = {
        userId: user.uid,
        productName: stockxSale.product.productName,
        brand: stockxSale.product.brand,
        size: stockxSale.variant.size,
        purchasePrice: 0, // User would need to add this manually
        salePrice: stockxSale.pricing.salePrice,
        tax: 0, // StockX handles tax
        shipping: stockxSale.pricing.shippingFee,
        fees: stockxSale.pricing.sellerFees,
        saleDate: stockxSale.createdAt,
        platform: 'StockX',
        orderNumber: stockxSale.orderNumber,
        status: stockxSale.status === 'PAYOUT_COMPLETED' ? 'completed' : 'pending',
        imageUrl: stockxSale.product.imageUrl || '/placeholder-shoe.png',
        stockxOrderType: stockxSale.orderType,
        stockxAuthentication: stockxSale.authentication?.status,
        source: 'stockx_api' as const
      };

      await addDocument('sales', mainSaleData);
      return true;
    } catch (error) {
      console.error('Error converting StockX sale:', error);
      return false;
    }
  }, [user]);

  // Clear all StockX sales for fresh sync
  const clearStockXSales = async () => {
    if (!user) return false;
    
    try {
      const existingSales = await getDocuments('stockxSales');
      const userSales = existingSales.filter(sale => sale.userId === user.uid);
      
      console.log(`🗑️ Clearing ${userSales.length} StockX sales...`);
      
      for (const sale of userSales) {
        await deleteDocument('stockxSales', sale.id);
      }
      
      setSales([]);
      calculateSyncStatus([]);
      setLastSyncTime(null);
      
      // Clear sync info
      const syncInfo = await getDocuments('stockxSyncInfo');
      const userSyncInfo = syncInfo.find(info => info.userId === user.uid);
      if (userSyncInfo) {
        await deleteDocument('stockxSyncInfo', userSyncInfo.id);
      }
      
      console.log('✅ StockX sales cleared successfully');
      return true;
    } catch (error) {
      console.error('❌ Error clearing StockX sales:', error);
      return false;
    }
  };

  // Fix user ID mismatch for existing sales
  const fixUserIdMismatch = async () => {
    if (!user) return false;
    
    try {
      console.log('🔧 Fixing user ID mismatch for StockX sales...');
      const allSales = await getDocuments('stockxSales');
      const wrongUserSales = allSales.filter(sale => sale.userId !== user.uid);
      
      console.log(`🔧 Found ${wrongUserSales.length} sales with wrong user ID`);
      
      for (const sale of wrongUserSales) {
        await updateDocument('stockxSales', sale.id, {
          userId: user.uid,
          updatedAt: new Date().toISOString()
        });
      }
      
      console.log('✅ User ID mismatch fixed');
      return true;
    } catch (error) {
      console.error('❌ Error fixing user ID mismatch:', error);
      return false;
    }
  };

  // Refresh payouts in background
  const refreshPayoutsInBackground = async () => {
    if (!user) {
      console.error('❌ No user found for payout refresh');
      return;
    }
    
    console.log('🔄 Starting payout refresh for user:', user.uid);
    setSyncProgress({
      current: 0,
      total: 0,
      status: 'Starting payout refresh...'
    });
    
    try {
      // Use simple fetch approach that works on Vercel
      const response = await fetch(`/api/stockx/refresh-payouts-simple?userId=${user.uid}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Payout refresh completed:', result);
        
        setSyncProgress({
          current: result.updated,
          total: result.total,
          status: `Updated ${result.updated} payouts successfully!`
        });
        
        // Reload sales data to show updated payouts
        await loadSalesData(false);
        
        // Clear progress after 5 seconds
        setTimeout(() => setSyncProgress(null), 5000);
        
        if (result.failed > 0) {
          setError(`Updated ${result.updated} payouts, but ${result.failed} failed. Check console for details.`);
        }
      } else {
        const error = await response.text();
        console.error('❌ Payout refresh failed:', error);
        setError('Failed to refresh payouts. Please check console.');
        setSyncProgress(null);
      }
    } catch (error) {
      console.error('❌ Error refreshing payouts:', error);
      setError('Failed to refresh payouts. Please check console for details.');
      setSyncProgress(null);
    }
  };

  return {
    sales,
    loading,
    error,
    syncStatus,
    syncSales,
    convertToMainSale,
    lastSyncTime,
    syncProgress,
    clearStockXSales,
    fixUserIdMismatch,
    refreshPayoutsInBackground
  };
};