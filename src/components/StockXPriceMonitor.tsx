'use client';

import React, { useState, useEffect } from 'react';
import { Bell, BellRing, TrendingDown, TrendingUp, Plus, Trash2, Settings, AlertTriangle, DollarSign, Clock, Target, Zap, Loader2 } from 'lucide-react';
import { usePriceMonitor } from '@/lib/contexts/PriceMonitorContext';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface PriceData {
  timestamp: number;
  highestBid: number;
  lowestAsk: number;
  flexLowestAsk?: number;
}

interface MonitoredProduct {
  id: string;
  productId: string;
  variantId: string;
  title: string;
  brand: string;
  size: string;
  currentAsk: number;
  currentBid: number;
  currentFlexAsk?: number;
  targetAskPrice?: number;
  targetFlexAskPrice?: number;
  targetBidPrice?: number;
  priceDropThreshold: number;
  flexPriceDropThreshold: number;
  priceHistory: PriceData[];
  lastChecked: number;
  alerts: Array<{
    id: string;
    type: 'ask_drop' | 'bid_rise' | 'target_hit' | 'flex_ask_drop' | 'flex_target_hit';
    message: string;
    timestamp: number;
    oldPrice: number;
    newPrice: number;
    percentage: number;
  }>;
}

interface NewProductForm {
  query: string;
  targetAskPrice: string;
  targetFlexAskPrice: string;
  targetBidPrice: string;
  priceDropThreshold: string;
  flexPriceDropThreshold: string;
}

const StockXPriceMonitor: React.FC = () => {
  const { theme } = useTheme();
  const {
    monitoredProducts,
    isMonitoring,
    monitoringInterval,
    notifications,
    isAuthenticated,
    unreadAlertCount,
    addMonitoredProduct,
    removeMonitoredProduct,
    setIsMonitoring,
    setMonitoringInterval,
    clearNotifications,
    markAlertsAsRead
  } = usePriceMonitor();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductForm>({
    query: '',
    targetAskPrice: '',
    targetFlexAskPrice: '',
    targetBidPrice: '',
    priceDropThreshold: '10',
    flexPriceDropThreshold: '10'
  });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState({
    current: 0,
    total: 0,
    phase: '',
    productName: ''
  });
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [selectedSizeRange, setSelectedSizeRange] = useState({ min: 7, max: 13 });
  const [showBulkImportSettings, setShowBulkImportSettings] = useState(false);
  const [bulkImportThreshold, setBulkImportThreshold] = useState(20);
  const [editingThresholdId, setEditingThresholdId] = useState<string | null>(null);
  const [tempThreshold, setTempThreshold] = useState<{ ask: number; flex: number }>({ ask: 20, flex: 20 });

  // Mark alerts as read when viewing the page
  useEffect(() => {
    markAlertsAsRead();
  }, [markAlertsAsRead]);

  // Update product threshold
  const updateProductThreshold = (productId: string, askThreshold: number, flexThreshold: number) => {
    setMonitoredProducts(prev => {
      const updated = prev.map(p => {
        if (p.id === productId) {
          return {
            ...p,
            priceDropThreshold: askThreshold,
            flexPriceDropThreshold: flexThreshold
          };
        }
        return p;
      });
      // Update localStorage
      const existingData = localStorage.getItem('stockx_monitored_products');
      if (existingData) {
        localStorage.setItem('stockx_monitored_products', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
  };

  const searchProducts = async () => {
    if (!newProduct.query.trim()) return;

    setIsSearching(true);
    console.log('🔍 Searching for:', newProduct.query);
    
    try {
      const response = await fetch(`/api/stockx/search?query=${encodeURIComponent(newProduct.query)}&limit=10`);
      console.log('Search response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Search data received:', data);
        
        if (data.products && data.products.length > 0) {
          // Process the products and add market data
          const productsWithMarketData = data.products.map((product: any) => ({
            ...product,
            marketData: data.marketData?.filter((m: any) => m.productId === product.productId) || [],
            variants: product.variants || []
          }));
          
          setSearchResults(productsWithMarketData);
          console.log('✅ Found', productsWithMarketData.length, 'products');
        } else {
          console.log('❌ No products found');
          setSearchResults([]);
        }
      } else if (response.status === 401) {
        console.error('❌ Authentication error');
        setSearchResults([]);
      } else {
        console.error('❌ Search failed with status:', response.status);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      setSearchResults([]);
    }
    setIsSearching(false);
  };

  const addProductToMonitor = (product: any, variant: any, marketData: any) => {
    const newMonitoredProduct: MonitoredProduct = {
      id: `${product.productId}-${variant.variantId}`,
      productId: product.productId,
      variantId: variant.variantId,
      title: product.title,
      brand: product.brand,
      size: variant.size || 'One Size',
      currentAsk: parseInt(marketData.lowestAskAmount) || 0,
      currentBid: parseInt(marketData.highestBidAmount) || 0,
      currentFlexAsk: marketData.flexLowestAskAmount ? parseInt(marketData.flexLowestAskAmount) : undefined,
      targetAskPrice: newProduct.targetAskPrice ? parseInt(newProduct.targetAskPrice) : undefined,
      targetFlexAskPrice: newProduct.targetFlexAskPrice ? parseInt(newProduct.targetFlexAskPrice) : undefined,
      targetBidPrice: newProduct.targetBidPrice ? parseInt(newProduct.targetBidPrice) : undefined,
      priceDropThreshold: parseInt(newProduct.priceDropThreshold) || 10,
      flexPriceDropThreshold: parseInt(newProduct.flexPriceDropThreshold) || 10,
      priceHistory: [{
        timestamp: Date.now(),
        highestBid: parseInt(marketData.highestBidAmount) || 0,
        lowestAsk: parseInt(marketData.lowestAskAmount) || 0,
        flexLowestAsk: marketData.flexLowestAskAmount ? parseInt(marketData.flexLowestAskAmount) : undefined
      }],
      lastChecked: Date.now(),
      alerts: []
    };

    addMonitoredProduct(newMonitoredProduct);
    setShowAddForm(false);
    setSearchResults([]);
    setNewProduct({
      query: '',
      targetAskPrice: '',
      targetFlexAskPrice: '',
      targetBidPrice: '',
      priceDropThreshold: '10',
      flexPriceDropThreshold: '10'
    });
  };

  const bulkImportMostActive = async (category: string = 'sneakers') => {
    if (!isAuthenticated) {
      alert('Please authenticate with StockX first');
      return;
    }

    setIsBulkImporting(true);
    setShowBulkImport(true);
    setBulkImportProgress({
      current: 0,
      total: 0,
      phase: 'Searching for most active products...',
      productName: ''
    });

    const stockxUrl = `https://stockx.com/category/${category}?sort=most-active`;
    const allProductsToMonitor: MonitoredProduct[] = [];
    let totalVariantsProcessed = 0;

    try {
      // Fetch multiple pages of most active products
      const pagesToFetch = 3; // Fetch 3 pages to get ~30 products (to then expand to hundreds of sizes)
      const productsPerPage = 10;
      let allProducts: any[] = [];

      for (let page = 1; page <= pagesToFetch; page++) {
        setBulkImportProgress(prev => ({
          ...prev,
          phase: `Fetching most active products (page ${page} of ${pagesToFetch})...`,
          current: (page - 1) * productsPerPage,
          total: pagesToFetch * productsPerPage
        }));

        try {
          const response = await fetch(
            `/api/stockx/search?query=${encodeURIComponent(stockxUrl)}&limit=${productsPerPage}&page=${page}&streaming=true`,
            {
              method: 'GET',
              headers: {
                'Accept': 'text/event-stream',
              }
            }
          );

          if (!response.ok) {
            console.error(`Failed to fetch page ${page}`);
            continue;
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'result' && data.data) {
                      allProducts.push(data.data);
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching page ${page}:`, error);
        }

        // Add delay between pages to avoid rate limiting
        if (page < pagesToFetch) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Group products by productId to get unique products
      const uniqueProductIds = new Set<string>();
      const uniqueProductsMap = new Map();
      
      allProducts.forEach(product => {
        if (!uniqueProductIds.has(product.productId)) {
          uniqueProductIds.add(product.productId);
          uniqueProductsMap.set(product.productId, product);
        }
      });

      const uniqueProductsList = Array.from(uniqueProductsMap.values());
      console.log(`Found ${uniqueProductsList.length} unique products to process`);

      // Now fetch ALL variants for each unique product
      setBulkImportProgress({
        current: 0,
        total: uniqueProductsList.length,
        phase: 'Fetching all sizes for each product...',
        productName: ''
      });

      let productIndex = 0;
      for (const product of uniqueProductsList) {
        productIndex++;
        setBulkImportProgress({
          current: productIndex,
          total: uniqueProductsList.length,
          phase: `Fetching sizes for ${product.title}...`,
          productName: product.title || ''
        });

        // Skip if we already processed this product
        const alreadyProcessedSizes = allProductsToMonitor.filter(p => p.productId === product.productId).length;
        if (alreadyProcessedSizes > 0) {
          console.log(`Skipping ${product.title} - already processed ${alreadyProcessedSizes} sizes`);
          continue;
        }

        // Use the arbitrage finder to get all sizes with profit data
        try {
          // Search for the specific product to get all its variants
          const searchUrl = `/api/stockx/search?query=${encodeURIComponent(product.title + ' ' + product.brand)}&limit=20&streaming=true&minSpreadPercent=0`;
          
          const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/event-stream',
            }
          });

          if (!response.ok) {
            console.error(`Failed to fetch variants for ${product.title}`);
            continue;
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let variantsForProduct: any[] = [];

          if (reader) {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'result' && data.data) {
                      // Only add variants that match this product
                      if (data.data.productId === product.productId) {
                        variantsForProduct.push(data.data);
                      }
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
          }

          // Process all variants found for this product
          variantsForProduct.forEach((variant: any) => {
            // Parse size and check if it's within range
            let shouldAdd = false;
            const sizeStr = variant.size || '';
            
            // Handle numeric sizes
            const sizeNum = parseFloat(sizeStr);
            if (!isNaN(sizeNum) && sizeNum >= selectedSizeRange.min && sizeNum <= selectedSizeRange.max) {
              shouldAdd = true;
            }
            
            // Also include common non-numeric sizes
            if (['S', 'M', 'L', 'XL', 'XXL', 'One Size'].includes(sizeStr)) {
              shouldAdd = true;
            }
            
            if (shouldAdd && variant.lowestAsk > 0) {
              const existingId = `${variant.productId}-${variant.variantId}`;
              if (!monitoredProducts.some(p => p.id === existingId)) {
                const newMonitoredProduct: MonitoredProduct = {
                  id: existingId,
                  productId: variant.productId,
                  variantId: variant.variantId,
                  title: variant.title,
                  brand: variant.brand,
                  size: variant.size,
                  currentAsk: variant.lowestAsk,
                  currentBid: variant.highestBid || variant.rawBid || 0,
                  currentFlexAsk: variant.flexLowestAskAmount,
                  targetAskPrice: undefined,
                  targetFlexAskPrice: undefined,
                  targetBidPrice: undefined,
                  priceDropThreshold: bulkImportThreshold, // Use user-defined threshold
                  flexPriceDropThreshold: bulkImportThreshold,
                  priceHistory: [{
                    timestamp: Date.now(),
                    highestBid: variant.highestBid || variant.rawBid || 0,
                    lowestAsk: variant.lowestAsk,
                    flexLowestAsk: variant.flexLowestAskAmount
                  }],
                  lastChecked: Date.now(),
                  alerts: []
                };
                allProductsToMonitor.push(newMonitoredProduct);
                totalVariantsProcessed++;
              }
            }
          });

          console.log(`Added ${variantsForProduct.length} variants for ${product.title}`);
          
        } catch (error) {
          console.error(`Error fetching variants for ${product.title}:`, error);
        }

        // Add delay between products to avoid rate limiting
        if (productIndex < uniqueProductsList.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Add all products to monitoring in batches
      setBulkImportProgress({
        current: 0,
        total: allProductsToMonitor.length,
        phase: 'Finalizing import...',
        productName: ''
      });

      for (let i = 0; i < allProductsToMonitor.length; i++) {
        addMonitoredProduct(allProductsToMonitor[i]);
        setBulkImportProgress({
          current: i + 1,
          total: allProductsToMonitor.length,
          phase: 'Finalizing import...',
          productName: allProductsToMonitor[i].title
        });

        // Small delay every 20 products
        if ((i + 1) % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Success message
      setBulkImportProgress({
        current: allProductsToMonitor.length,
        total: allProductsToMonitor.length,
        phase: `Successfully added ${allProductsToMonitor.length} items to monitor!`,
        productName: ''
      });

      // Auto-hide after 3 seconds
      setTimeout(() => {
        setShowBulkImport(false);
        setIsBulkImporting(false);
      }, 3000);

    } catch (error) {
      console.error('Bulk import error:', error);
      setBulkImportProgress({
        current: 0,
        total: 0,
        phase: 'Import failed. Please try again.',
        productName: ''
      });
      setTimeout(() => {
        setShowBulkImport(false);
        setIsBulkImporting(false);
      }, 3000);
    }
  };

  const getPriceChange = (product: MonitoredProduct) => {
    if (product.priceHistory.length < 2) return null;
    
    const current = product.priceHistory[product.priceHistory.length - 1];
    const previous = product.priceHistory[product.priceHistory.length - 2];
    
    const askChange = ((current.lowestAsk - previous.lowestAsk) / previous.lowestAsk) * 100;
    const bidChange = ((current.highestBid - previous.highestBid) / previous.highestBid) * 100;
    
    let flexAskChange = 0;
    if (current.flexLowestAsk && previous.flexLowestAsk) {
      flexAskChange = ((current.flexLowestAsk - previous.flexLowestAsk) / previous.flexLowestAsk) * 100;
    }
    
    return { askChange, bidChange, flexAskChange };
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Bell className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                StockX Price Monitor
              </h1>
              {isMonitoring && (
                <div className="flex items-center gap-2 bg-green-900/20 border border-green-500/30 rounded-lg px-3 py-1">
                  <BellRing className="w-4 h-4 text-green-400 animate-pulse" />
                  <span className="text-green-400 text-sm font-medium">Monitoring Active</span>
                </div>
              )}
              {unreadAlertCount > 0 && (
                <div className="bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                  {unreadAlertCount}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={requestNotificationPermission}
                className="bg-yellow-900/20 border border-yellow-500/30 text-yellow-400 px-3 py-2 rounded-lg text-sm hover:bg-yellow-900/30 transition-colors"
              >
                Enable Notifications
              </button>
              <button
                onClick={() => setIsMonitoring(!isMonitoring)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                  isMonitoring 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
              </button>
            </div>
          </div>
          
          <p className="text-gray-400 text-lg mb-4">
            Track price changes on StockX products and get alerts when opportunities arise
            {isMonitoring && ' (Running in background across all pages)'}
          </p>

          {/* Monitoring Settings */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400 text-sm">Check interval:</span>
              <select
                value={monitoringInterval}
                onChange={(e) => setMonitoringInterval(parseInt(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value={60000}>1 minute</option>
                <option value={300000}>5 minutes</option>
                <option value={600000}>10 minutes</option>
                <option value={1800000}>30 minutes</option>
                <option value={3600000}>1 hour</option>
              </select>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-400">Monitoring {monitoredProducts.length} products</span>
              {isAuthenticated === true && (
                <span className="text-green-400 flex items-center gap-1">
                  ✅ StockX Connected
                </span>
              )}
              {isAuthenticated === false && (
                <span className="text-red-400 flex items-center gap-1">
                  ❌ Not Connected
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded ml-2"
                  >
                    Refresh
                  </button>
                </span>
              )}
              {isAuthenticated === null && (
                <span className="text-gray-400 flex items-center gap-1">
                  🔄 Checking...
                </span>
              )}
            </div>
          </div>

          {/* Recent Notifications */}
          {notifications.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
              <h3 className="text-blue-400 font-semibold mb-2">Recent Alerts</h3>
              <div className="space-y-1">
                {notifications.slice(0, 3).map((notification, index) => (
                  <div key={index} className="text-sm text-blue-200">
                    {notification}
                  </div>
                ))}
              </div>
              {notifications.length > 3 && (
                <div className="text-xs text-blue-400 mt-2">
                  +{notifications.length - 3} more alerts
                </div>
              )}
            </div>
          )}
        </div>

        {/* Authentication Warning */}
        {isAuthenticated === false && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-red-400 font-semibold">StockX Authentication Required</h3>
            </div>
            <p className="text-red-200 mb-3">
              You need to authenticate with StockX before you can search for products or monitor prices.
            </p>
            <button
              onClick={() => window.location.href = '/dashboard?view=stockx-arbitrage'}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Go to Arbitrage Finder to Login
            </button>
          </div>
        )}

        {/* Add Product Form */}
        {showAddForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Add Product to Monitor</h3>
              {isAuthenticated === false && (
                <div className="text-red-400 text-sm">⚠️ Authentication required</div>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newProduct.query}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, query: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSearching && newProduct.query.trim()) {
                        searchProducts();
                      }
                    }}
                    placeholder="Search for product (e.g., Jordan 1, Supreme, Denim Tears)"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {newProduct.query && (
                    <button
                      onClick={() => {
                        setNewProduct(prev => ({ ...prev, query: '' }));
                        setSearchResults([]);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={searchProducts}
                  disabled={isSearching || !newProduct.query.trim() || isAuthenticated === false}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                >
                  {isSearching ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Searching...
                    </div>
                  ) : (
                    'Search'
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Target Ask Price ($)
                  </label>
                  <input
                    type="number"
                    value={newProduct.targetAskPrice}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, targetAskPrice: e.target.value }))}
                    placeholder="Alert when ask drops below"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Target Flex Ask Price ($)
                  </label>
                  <input
                    type="number"
                    value={newProduct.targetFlexAskPrice}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, targetFlexAskPrice: e.target.value }))}
                    placeholder="Alert when flex ask drops below"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Target Bid Price ($)
                  </label>
                  <input
                    type="number"
                    value={newProduct.targetBidPrice}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, targetBidPrice: e.target.value }))}
                    placeholder="Alert when bid rises above"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Ask Drop Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={newProduct.priceDropThreshold}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, priceDropThreshold: e.target.value }))}
                    placeholder="Alert on % drop"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Flex Ask Drop Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={newProduct.flexPriceDropThreshold}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, flexPriceDropThreshold: e.target.value }))}
                    placeholder="Alert on flex % drop"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Search Status */}
              {isSearching && (
                <div className="mt-4 text-center py-8">
                  <div className="inline-flex items-center gap-3 bg-blue-900/20 border border-blue-500/30 rounded-lg px-6 py-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
                    <span className="text-blue-400">Searching StockX...</span>
                  </div>
                </div>
              )}

              {/* No Results Message */}
              {!isSearching && newProduct.query.trim() && searchResults.length === 0 && (
                <div className="mt-4 text-center py-8">
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-6 py-3">
                    <span className="text-yellow-400">No products found for "{newProduct.query}". Try different keywords or check authentication.</span>
                  </div>
                </div>
              )}

              {/* Search Results */}
              {!isSearching && searchResults.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-lg font-semibold mb-3 text-green-400">
                    ✅ Found {searchResults.length} product{searchResults.length > 1 ? 's' : ''} - Select variants to monitor:
                  </h4>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {searchResults.map(product => (
                      <div key={product.productId} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                        <h5 className="font-semibold text-white mb-2">{product.title}</h5>
                        <p className="text-gray-400 text-sm mb-3">{product.brand}</p>
                        
                        {/* Show variants if available */}
                        <div className="space-y-2">
                          {product.variants && product.variants.length > 0 ? (
                            product.variants.map((variant: any) => {
                              const marketData = product.marketData?.find((m: any) => m.variantId === variant.variantId);
                              if (!marketData) {
                                return (
                                  <div key={variant.variantId} className="flex items-center justify-between bg-gray-600 rounded p-3 opacity-50">
                                    <div>
                                      <span className="text-gray-400 font-medium">Size: {variant.size || 'One Size'}</span>
                                      <div className="text-sm text-gray-500 mt-1">No market data available</div>
                                    </div>
                                    <button
                                      disabled
                                      className="bg-gray-500 text-gray-300 px-3 py-1 rounded text-sm cursor-not-allowed"
                                    >
                                      No Data
                                    </button>
                                  </div>
                                );
                              }
                              
                              return (
                                <div key={variant.variantId} className="flex items-center justify-between bg-gray-600 rounded p-3 hover:bg-gray-500 transition-colors">
                                  <div className="flex-1">
                                    <span className="text-white font-medium">Size: {variant.size || 'One Size'}</span>
                                    <div className="text-sm text-gray-300 mt-1">
                                      <span className="text-green-400">Bid: ${marketData.highestBidAmount}</span>
                                      <span className="text-gray-400"> • </span>
                                      <span className="text-cyan-400">Ask: ${marketData.lowestAskAmount}</span>
                                      {marketData.flexLowestAskAmount && (
                                        <>
                                          <span className="text-gray-400"> • </span>
                                          <span className="text-purple-400">Flex: ${marketData.flexLowestAskAmount}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                      Spread: ${parseInt(marketData.lowestAskAmount) - parseInt(marketData.highestBidAmount)}
                                      {marketData.flexLowestAskAmount && ` • Flex spread: ${parseInt(marketData.flexLowestAskAmount) - parseInt(marketData.highestBidAmount)}`}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => addProductToMonitor(product, variant, marketData)}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-semibold transition-colors ml-4"
                                  >
                                    Monitor This
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <div className="bg-gray-600 rounded p-3 text-center">
                              <span className="text-gray-400">No size variants available</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setSearchResults([]);
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Product Button */}
        {!showAddForm && (
          <div className="mb-6 space-y-4">
            {/* Size Range Selector for Bulk Import */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-gray-300 font-medium">Size Range for Bulk Import:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={selectedSizeRange.min}
                      onChange={(e) => setSelectedSizeRange(prev => ({ ...prev, min: parseInt(e.target.value) || 0 }))}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center"
                      min="0"
                      max="20"
                      step="0.5"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="number"
                      value={selectedSizeRange.max}
                      onChange={(e) => setSelectedSizeRange(prev => ({ ...prev, max: parseInt(e.target.value) || 20 }))}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center"
                      min="0"
                      max="20"
                      step="0.5"
                    />
                  </div>
                </div>
                <div className="text-sm text-gray-400">
                  This will add all sizes within this range for each product
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setShowAddForm(true)}
                disabled={isAuthenticated === false}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Product to Monitor
                {isAuthenticated === false && <span className="text-xs">(Login Required)</span>}
              </button>
              
              {/* Bulk Import Button */}
              {theme === 'neon' ? (
                <button
                  onClick={() => setShowBulkImportSettings(true)}
                  disabled={isAuthenticated === false || isBulkImporting}
                  className="relative bg-black border-2 border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition-all duration-300 flex items-center gap-2 overflow-hidden group"
                  style={{
                    background: 'linear-gradient(45deg, #000, #111)',
                    borderImage: 'linear-gradient(45deg, #ff00ff, #00ffff, #ff00ff) 1',
                    borderImageSlice: 1,
                    boxShadow: '0 0 20px rgba(255, 0, 255, 0.5), 0 0 40px rgba(0, 255, 255, 0.3)',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-cyan-500/20 animate-pulse" />
                  <Zap className="w-5 h-5 text-cyan-400 animate-pulse relative z-10" />
                  <span className="relative z-10 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    Auto-Monitor Most Active
                  </span>
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setShowBulkImportSettings(true)}
                  disabled={isAuthenticated === false || isBulkImporting}
                  className="bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Auto-Monitor Most Active
                  {isAuthenticated === false && <span className="text-xs">(Login Required)</span>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bulk Import Settings Modal */}
        {showBulkImportSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowBulkImportSettings(false)} />
            <div className={`relative w-full max-w-md ${
              theme === 'neon' 
                ? 'bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 border-2 border-purple-500/50 shadow-2xl shadow-purple-500/25'
                : 'bg-gray-800 border border-gray-700'
            } rounded-2xl p-6 transform transition-all`}>
              <h2 className={`text-xl font-bold mb-4 ${
                theme === 'neon' ? 'text-cyan-400' : 'text-white'
              }`}>
                Bulk Import Settings
              </h2>
              
              <div className="space-y-4">
                {/* Price Drop Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Alert me when prices drop by:
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={bulkImportThreshold}
                      onChange={(e) => setBulkImportThreshold(parseInt(e.target.value))}
                      className={`flex-1 ${theme === 'neon' ? 'accent-purple-500' : 'accent-blue-500'}`}
                    />
                    <div className={`w-16 text-center font-bold text-lg ${
                      theme === 'neon' ? 'text-purple-400' : 'text-blue-400'
                    }`}>
                      {bulkImportThreshold}%
                    </div>
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>5%</span>
                    <span>Aggressive</span>
                    <span>Conservative</span>
                    <span>50%</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quick Presets:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setBulkImportThreshold(10)}
                      className={`py-2 px-3 rounded-lg font-medium transition-all ${
                        bulkImportThreshold === 10
                          ? theme === 'neon' 
                            ? 'bg-purple-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      10%
                    </button>
                    <button
                      onClick={() => setBulkImportThreshold(20)}
                      className={`py-2 px-3 rounded-lg font-medium transition-all ${
                        bulkImportThreshold === 20
                          ? theme === 'neon' 
                            ? 'bg-purple-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      20%
                    </button>
                    <button
                      onClick={() => setBulkImportThreshold(30)}
                      className={`py-2 px-3 rounded-lg font-medium transition-all ${
                        bulkImportThreshold === 30
                          ? theme === 'neon' 
                            ? 'bg-purple-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      30%
                    </button>
                  </div>
                </div>

                {/* Size Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Size Range:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={selectedSizeRange.min}
                      onChange={(e) => setSelectedSizeRange(prev => ({ ...prev, min: parseInt(e.target.value) || 0 }))}
                      className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center"
                      min="0"
                      max="20"
                      step="0.5"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="number"
                      value={selectedSizeRange.max}
                      onChange={(e) => setSelectedSizeRange(prev => ({ ...prev, max: parseInt(e.target.value) || 20 }))}
                      className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center"
                      min="0"
                      max="20"
                      step="0.5"
                    />
                  </div>
                </div>

                {/* Info */}
                <div className={`p-3 rounded-lg ${
                  theme === 'neon' ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-blue-900/20 border border-blue-500/30'
                }`}>
                  <p className="text-sm text-gray-300">
                    This will monitor the most active StockX products. Each product in the selected size range will alert you when prices drop by {bulkImportThreshold}%.
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowBulkImportSettings(false)}
                    className="flex-1 py-2 px-4 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowBulkImportSettings(false);
                      bulkImportMostActive('sneakers');
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                      theme === 'neon'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white'
                    }`}
                  >
                    Start Monitoring
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Import Progress Modal */}
        {showBulkImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !isBulkImporting && setShowBulkImport(false)} />
            <div className={`relative w-full max-w-2xl ${
              theme === 'neon' 
                ? 'bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 border-2 border-purple-500/50 shadow-2xl shadow-purple-500/25'
                : 'bg-gray-800 border border-gray-700'
            } rounded-2xl p-8 transform transition-all`}>
              {/* Neon glow effects */}
              {theme === 'neon' && (
                <>
                  <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl blur-lg opacity-25 animate-pulse" />
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl opacity-10" />
                </>
              )}
              
              <div className="relative">
                <h2 className={`text-2xl font-bold mb-6 ${
                  theme === 'neon'
                    ? 'bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent'
                    : 'text-white'
                }`}>
                  {isBulkImporting ? 'Bulk Import in Progress' : 'Import Complete!'}
                </h2>
                
                {/* Progress Info */}
                <div className="mb-6">
                  <p className={`text-lg mb-2 ${theme === 'neon' ? 'text-cyan-400' : 'text-gray-300'}`}>
                    {bulkImportProgress.phase}
                  </p>
                  {bulkImportProgress.productName && (
                    <p className="text-sm text-gray-400 truncate">
                      {bulkImportProgress.productName}
                    </p>
                  )}
                </div>
                
                {/* Progress Bar */}
                <div className="mb-6">
                  <div className={`h-6 rounded-full overflow-hidden ${
                    theme === 'neon'
                      ? 'bg-gray-800 border border-purple-500/30'
                      : 'bg-gray-700'
                  }`}>
                    <div 
                      className={`h-full transition-all duration-500 ease-out flex items-center justify-center text-xs font-bold ${
                        theme === 'neon'
                          ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 shadow-lg shadow-purple-500/50'
                          : 'bg-gradient-to-r from-blue-500 to-purple-500'
                      }`}
                      style={{
                        width: bulkImportProgress.total > 0 
                          ? `${(bulkImportProgress.current / bulkImportProgress.total) * 100}%` 
                          : '0%'
                      }}
                    >
                      {bulkImportProgress.total > 0 && (
                        <span className="text-white drop-shadow-lg">
                          {Math.round((bulkImportProgress.current / bulkImportProgress.total) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress Numbers */}
                  <div className="flex justify-between mt-2 text-sm">
                    <span className={theme === 'neon' ? 'text-pink-400' : 'text-gray-400'}>
                      {bulkImportProgress.current} / {bulkImportProgress.total}
                    </span>
                    <span className={theme === 'neon' ? 'text-cyan-400' : 'text-gray-400'}>
                      {bulkImportProgress.total > 0 
                        ? `${Math.round((bulkImportProgress.current / bulkImportProgress.total) * 100)}%`
                        : 'Initializing...'}
                    </span>
                  </div>
                </div>
                
                {/* Loading Animation */}
                {isBulkImporting && (
                  <div className="flex justify-center mb-6">
                    <Loader2 className={`w-8 h-8 animate-spin ${
                      theme === 'neon' ? 'text-purple-400' : 'text-blue-400'
                    }`} />
                  </div>
                )}
                
                {/* Close Button (only when complete) */}
                {!isBulkImporting && (
                  <button
                    onClick={() => setShowBulkImport(false)}
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      theme === 'neon'
                        ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white shadow-lg shadow-purple-500/30'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {monitoredProducts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-blue-400" />
                <span className="text-gray-400 text-sm">Monitored Products</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">{monitoredProducts.length}</p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BellRing className="w-5 h-5 text-yellow-400" />
                <span className="text-gray-400 text-sm">Total Alerts</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400">
                {monitoredProducts.reduce((sum, p) => sum + p.alerts.length, 0)}
              </p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-green-400" />
                <span className="text-gray-400 text-sm">Ask Drops Today</span>
              </div>
              <p className="text-2xl font-bold text-green-400">
                {monitoredProducts.reduce((sum, p) => 
                  sum + p.alerts.filter(a => 
                    a.type === 'ask_drop' && 
                    Date.now() - a.timestamp < 24 * 60 * 60 * 1000
                  ).length, 0
                )}
              </p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-purple-400" />
                <span className="text-gray-400 text-sm">Flex Drops Today</span>
              </div>
              <p className="text-2xl font-bold text-purple-400">
                {monitoredProducts.reduce((sum, p) => 
                  sum + p.alerts.filter(a => 
                    a.type === 'flex_ask_drop' && 
                    Date.now() - a.timestamp < 24 * 60 * 60 * 1000
                  ).length, 0
                )}
              </p>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-purple-400" />
                <span className="text-gray-400 text-sm">Last Check</span>
              </div>
              <p className="text-sm text-purple-400">
                {monitoredProducts.length > 0 ? 
                  new Date(Math.max(...monitoredProducts.map(p => p.lastChecked))).toLocaleTimeString() 
                  : 'Never'
                }
              </p>
            </div>
          </div>
        )}

        {/* Monitored Products */}
        <div className="space-y-4">
          {monitoredProducts.map(product => {
            const priceChange = getPriceChange(product);
            const recentAlerts = product.alerts.slice(0, 3);
            
            return (
              <div key={product.id} className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-1">{product.title}</h3>
                    <p className="text-gray-400">{product.brand} • Size: {product.size}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Ask:</span>
                        <span className="text-cyan-400 font-semibold">${product.currentAsk}</span>
                        {priceChange && priceChange.askChange !== 0 && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            priceChange.askChange < 0 ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
                          }`}>
                            {priceChange.askChange > 0 ? '+' : ''}{priceChange.askChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      
                      {product.currentFlexAsk && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">Flex Ask:</span>
                          <span className="text-purple-400 font-semibold">${product.currentFlexAsk}</span>
                          {priceChange && priceChange.flexAskChange !== 0 && (
                            <span className={`text-xs px-2 py-1 rounded ${
                              priceChange.flexAskChange < 0 ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
                            }`}>
                              {priceChange.flexAskChange > 0 ? '+' : ''}{priceChange.flexAskChange.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Bid:</span>
                        <span className="text-green-400 font-semibold">${product.currentBid}</span>
                        {priceChange && priceChange.bidChange !== 0 && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            priceChange.bidChange > 0 ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
                          }`}>
                            {priceChange.bidChange > 0 ? '+' : ''}{priceChange.bidChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Targets */}
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                      {product.targetAskPrice && (
                        <span className="text-blue-400">
                          Target Ask: ${product.targetAskPrice}
                        </span>
                      )}
                      {product.targetFlexAskPrice && (
                        <span className="text-purple-400">
                          Target Flex Ask: ${product.targetFlexAskPrice}
                        </span>
                      )}
                      {product.targetBidPrice && (
                        <span className="text-green-400">
                          Target Bid: ${product.targetBidPrice}
                        </span>
                      )}
                      {editingThresholdId === product.id ? (
                        <div className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1">
                          <span className="text-gray-300 text-xs">Ask:</span>
                          <input
                            type="number"
                            value={tempThreshold.ask}
                            onChange={(e) => setTempThreshold(prev => ({ ...prev, ask: parseInt(e.target.value) || 5 }))}
                            className="w-12 px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-white text-center text-xs"
                            min="5"
                            max="50"
                            step="5"
                          />
                          <span className="text-gray-300 text-xs">%</span>
                          {product.currentFlexAsk && (
                            <>
                              <span className="text-gray-300 text-xs ml-2">Flex:</span>
                              <input
                                type="number"
                                value={tempThreshold.flex}
                                onChange={(e) => setTempThreshold(prev => ({ ...prev, flex: parseInt(e.target.value) || 5 }))}
                                className="w-12 px-1 py-0.5 bg-gray-800 border border-gray-600 rounded text-white text-center text-xs"
                                min="5"
                                max="50"
                                step="5"
                              />
                              <span className="text-gray-300 text-xs">%</span>
                            </>
                          )}
                          <button
                            onClick={() => {
                              updateProductThreshold(product.id, tempThreshold.ask, tempThreshold.flex);
                              setEditingThresholdId(null);
                            }}
                            className="ml-2 px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingThresholdId(null)}
                            className="px-2 py-0.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingThresholdId(product.id);
                              setTempThreshold({ ask: product.priceDropThreshold, flex: product.flexPriceDropThreshold });
                            }}
                            className="text-yellow-400 hover:text-yellow-300 cursor-pointer underline-offset-2 hover:underline"
                          >
                            Ask Alert: {product.priceDropThreshold}%
                          </button>
                          {product.currentFlexAsk && (
                            <button
                              onClick={() => {
                                setEditingThresholdId(product.id);
                                setTempThreshold({ ask: product.priceDropThreshold, flex: product.flexPriceDropThreshold });
                              }}
                              className="text-orange-400 hover:text-orange-300 cursor-pointer underline-offset-2 hover:underline"
                            >
                              Flex Alert: {product.flexPriceDropThreshold}%
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="relative w-40 flex justify-end">
                    {confirmDeleteId === product.id ? (
                      <div className={`absolute right-0 flex items-center gap-2 rounded-lg px-3 py-2 ${
                        theme === 'neon' 
                          ? 'bg-gradient-to-r from-red-900/40 via-pink-900/40 to-purple-900/40 border border-red-500/60 shadow-lg shadow-red-500/30'
                          : 'bg-gradient-to-r from-red-900/30 to-pink-900/30 border border-red-500/50 shadow-lg shadow-red-500/20'
                      }`}>
                        <span className={`text-sm font-medium ${
                          theme === 'neon' ? 'text-red-300' : 'text-red-400'
                        }`}>Delete?</span>
                        <button
                          onClick={() => {
                            removeMonitoredProduct(product.id);
                            setConfirmDeleteId(null);
                          }}
                          className={`px-3 py-1 rounded text-sm font-semibold transition-all duration-200 ${
                            theme === 'neon'
                              ? 'bg-gradient-to-r from-red-500 via-pink-500 to-red-600 hover:from-red-600 hover:via-pink-600 hover:to-red-700 text-white shadow-lg shadow-red-500/40 animate-pulse'
                              : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className={`px-3 py-1 rounded text-sm font-semibold transition-all duration-200 ${
                            theme === 'neon'
                              ? 'bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 hover:from-gray-800 hover:via-gray-700 hover:to-gray-800 text-gray-200 border border-gray-600/50'
                              : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(product.id)}
                        className={`p-2 rounded-lg transition-all duration-200 ${
                          theme === 'neon'
                            ? 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white shadow-lg shadow-red-500/30'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Recent Alerts */}
                {recentAlerts.length > 0 && (
                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Recent Alerts</h4>
                    <div className="space-y-2">
                      {recentAlerts.map(alert => (
                        <div key={alert.id} className={`p-3 rounded-lg border ${
                          alert.type === 'ask_drop' ? 'bg-green-900/20 border-green-500/30 text-green-200' :
                          alert.type === 'flex_ask_drop' ? 'bg-purple-900/20 border-purple-500/30 text-purple-200' :
                          alert.type === 'bid_rise' ? 'bg-blue-900/20 border-blue-500/30 text-blue-200' :
                          alert.type === 'target_hit' ? 'bg-cyan-900/20 border-cyan-500/30 text-cyan-200' :
                          alert.type === 'flex_target_hit' ? 'bg-purple-900/20 border-purple-500/30 text-purple-200' :
                          'bg-gray-900/20 border-gray-500/30 text-gray-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {alert.type === 'ask_drop' && <TrendingDown className="w-4 h-4" />}
                            {alert.type === 'flex_ask_drop' && <TrendingDown className="w-4 h-4 text-purple-400" />}
                            {alert.type === 'bid_rise' && <TrendingUp className="w-4 h-4" />}
                            {alert.type === 'target_hit' && <Target className="w-4 h-4" />}
                            {alert.type === 'flex_target_hit' && <Target className="w-4 h-4 text-purple-400" />}
                            <span className="text-xs">
                              {new Date(alert.timestamp).toLocaleString()}
                            </span>
                            {(alert.type === 'flex_ask_drop' || alert.type === 'flex_target_hit') && (
                              <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                                FLEX
                              </span>
                            )}
                          </div>
                          <p className="text-sm">{alert.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-4">
                  Last checked: {new Date(product.lastChecked).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {monitoredProducts.length === 0 && !showAddForm && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-300 mb-2">No Products Monitored</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-4">
                Add products to monitor their prices and get alerts when opportunities arise.
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Add Your First Product
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockXPriceMonitor;