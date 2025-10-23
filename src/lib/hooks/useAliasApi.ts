// React hook for Alias API integration
import { useState, useEffect, useCallback } from 'react';

export interface AliasApiStatus {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  version: string;
}

export interface AliasApiHook {
  status: AliasApiStatus;
  testConnection: () => Promise<void>;
  searchCatalog: (query: string, limit?: number) => Promise<any>;
  getCatalogItem: (id: string) => Promise<any>;
  getPricingInsights: (params: {
    catalog_id: string;
    size: number;
    product_condition: string;
    packaging_condition: string;
    consigned?: boolean;
    region_id?: string;
  }) => Promise<any>;
  getRecentSales: (params: {
    catalog_id: string;
    size?: number;
    product_condition?: string;
    packaging_condition?: string;
    consigned?: boolean;
    region_id?: string;
    limit?: number;
  }) => Promise<any>;
}

export function useAliasApi(): AliasApiHook {
  const [status, setStatus] = useState<AliasApiStatus>({
    isConnected: false,
    isLoading: true,
    error: null,
    version: 'v1.3.4',
  });

  const testConnection = useCallback(async () => {
    setStatus(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await fetch('/api/alias/test');
      const data = await response.json();
      
      if (data.success) {
        setStatus(prev => ({
          ...prev,
          isConnected: true,
          isLoading: false,
          error: null,
        }));
      } else {
        setStatus(prev => ({
          ...prev,
          isConnected: false,
          isLoading: false,
          error: data.error || 'Connection failed',
        }));
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        isConnected: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  const searchCatalog = useCallback(async (query: string, limit = 25) => {
    try {
      const params = new URLSearchParams({ query, limit: limit.toString() });
      const response = await fetch(`/api/alias/catalog/search?${params}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      
      return data.data;
    } catch (error) {
      console.error('Catalog search error:', error);
      throw error;
    }
  }, []);

  const getCatalogItem = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/alias/catalog/${id}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch catalog item');
      }
      
      return data.data;
    } catch (error) {
      console.error('Get catalog item error:', error);
      throw error;
    }
  }, []);

  const getPricingInsights = useCallback(async (params: {
    catalog_id: string;
    size: number;
    product_condition: string;
    packaging_condition: string;
    consigned?: boolean;
    region_id?: string;
  }) => {
    try {
      const searchParams = new URLSearchParams({
        catalog_id: params.catalog_id,
        size: params.size.toString(),
        product_condition: params.product_condition,
        packaging_condition: params.packaging_condition,
      });
      
      if (params.consigned !== undefined) {
        searchParams.append('consigned', params.consigned.toString());
      }
      if (params.region_id) {
        searchParams.append('region_id', params.region_id);
      }

      const response = await fetch(`/api/alias/pricing/insights?${searchParams}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch pricing insights');
      }
      
      return data.data;
    } catch (error) {
      console.error('Pricing insights error:', error);
      throw error;
    }
  }, []);

  const getRecentSales = useCallback(async (params: {
    catalog_id: string;
    size?: number;
    product_condition?: string;
    packaging_condition?: string;
    consigned?: boolean;
    region_id?: string;
    limit?: number;
  }) => {
    try {
      const searchParams = new URLSearchParams({
        catalog_id: params.catalog_id,
      });
      
      if (params.size !== undefined) {
        searchParams.append('size', params.size.toString());
      }
      if (params.product_condition) {
        searchParams.append('product_condition', params.product_condition);
      }
      if (params.packaging_condition) {
        searchParams.append('packaging_condition', params.packaging_condition);
      }
      if (params.consigned !== undefined) {
        searchParams.append('consigned', params.consigned.toString());
      }
      if (params.region_id) {
        searchParams.append('region_id', params.region_id);
      }
      if (params.limit) {
        searchParams.append('limit', params.limit.toString());
      }

      const response = await fetch(`/api/alias/pricing/sales?${searchParams}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch recent sales');
      }
      
      return data.data;
    } catch (error) {
      console.error('Recent sales error:', error);
      throw error;
    }
  }, []);

  // Test connection on mount
  useEffect(() => {
    testConnection();
  }, [testConnection]);

  return {
    status,
    testConnection,
    searchCatalog,
    getCatalogItem,
    getPricingInsights,
    getRecentSales,
  };
}
