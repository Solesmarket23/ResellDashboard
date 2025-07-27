import { useState, useEffect, useCallback } from 'react';
import { StockXSale, StockXSyncStatus } from '@/lib/types/stockx';
import { useAuth } from '@/lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

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
  const syncSales = useCallback(async (silent = false) => {
    if (!user) {
      setError('Please login to sync StockX sales');
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      // Fetch all pages of sales data
      let allSales: StockXSale[] = [];
      let pageNumber = 1;
      let hasNextPage = true;
      const pageSize = 100; // Use maximum allowed per docs

      // Fetch completed sales first
      while (hasNextPage) {
        const offset = (pageNumber - 1) * pageSize;
        const response = await fetch(`/api/stockx/sales?limit=${pageSize}&offset=${offset}&status=completed`, {
          credentials: 'include'
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 401) {
            setError('Invalid StockX API credentials');
            setSyncStatus(prev => ({ ...prev, isAuthenticated: false }));
            return;
          }
          throw new Error(errorData.error || 'Failed to fetch StockX sales');
        }

        const data = await response.json();
        
        if (data.success && data.data) {
          allSales = allSales.concat(data.data);
          
          // Use hasNextPage from response
          hasNextPage = data.hasNextPage || false;
          pageNumber++;
        } else {
          hasNextPage = false;
        }
      }

      // Also fetch active/pending sales with pagination
      pageNumber = 1;
      hasNextPage = true;
      
      while (hasNextPage) {
        const offset = (pageNumber - 1) * pageSize;
        const activeResponse = await fetch(`/api/stockx/sales?limit=${pageSize}&offset=${offset}&status=active`, {
          credentials: 'include'
        });
        
        if (activeResponse.ok) {
          const activeData = await activeResponse.json();
          if (activeData.success && activeData.data) {
            allSales = allSales.concat(activeData.data);
            hasNextPage = activeData.hasNextPage || false;
            pageNumber++;
          } else {
            hasNextPage = false;
          }
        } else {
          // If active sales fail, just continue with completed sales
          console.log('Note: Could not fetch active sales, continuing with completed sales only');
          break;
        }
      }

      // Save to Firebase
      await saveSalesToFirebase(allSales);
      
      // Update local state
      setSales(allSales);
      calculateSyncStatus(allSales);
      
      // Update sync time
      const now = new Date().toISOString();
      setLastSyncTime(now);
      await updateSyncTime(now);

      if (!silent) {
        console.log(`✅ Successfully synced ${allSales.length} StockX sales`);
      }

    } catch (error) {
      console.error('Error syncing StockX sales:', error);
      setError(error instanceof Error ? error.message : 'Failed to sync sales');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  // Save sales to Firebase
  const saveSalesToFirebase = async (salesData: StockXSale[]) => {
    if (!user) return;

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

  return {
    sales,
    loading,
    error,
    syncStatus,
    syncSales,
    convertToMainSale,
    lastSyncTime
  };
};