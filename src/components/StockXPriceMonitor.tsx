'use client';

import React, { useState, useEffect } from 'react';
import { Bell, BellRing, TrendingDown, TrendingUp, Plus, Trash2, Settings, AlertTriangle, DollarSign, Clock, Target } from 'lucide-react';

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
  currentFlexAsk?: number; // Track flex ask separately
  targetAskPrice?: number; // Alert when ask drops below this
  targetFlexAskPrice?: number; // Alert when flex ask drops below this
  targetBidPrice?: number; // Alert when bid goes above this
  priceDropThreshold: number; // Percentage drop to trigger alert
  flexPriceDropThreshold: number; // Percentage drop to trigger flex alert
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
  const [monitoredProducts, setMonitoredProducts] = useState<MonitoredProduct[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
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
  const [monitoringInterval, setMonitoringInterval] = useState(300000); // 5 minutes default
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const monitoredProductsRef = React.useRef<MonitoredProduct[]>([]);

  // Load saved products from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('stockx_monitored_products');
    if (saved) {
      setMonitoredProducts(JSON.parse(saved));
    }

    const savedMonitoring = localStorage.getItem('stockx_monitoring_active');
    if (savedMonitoring === 'true') {
      setIsMonitoring(true);
    }
  }, []);

  // Save products to localStorage and update ref
  useEffect(() => {
    localStorage.setItem('stockx_monitored_products', JSON.stringify(monitoredProducts));
    monitoredProductsRef.current = monitoredProducts;
  }, [monitoredProducts]);

  // Save monitoring state
  useEffect(() => {
    localStorage.setItem('stockx_monitoring_active', isMonitoring.toString());
  }, [isMonitoring]);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/stockx/test');
        if (response.ok) {
          const data = await response.json();
          console.log('🔍 Auth check response:', data);
          // Check if we have access token and catalog access (needed for search)
          const isAuthenticated = data.accessTokenPresent && data.summary?.hasCatalogAccess;
          setIsAuthenticated(isAuthenticated);
          console.log('✅ Authentication status:', isAuthenticated);
        } else {
          console.log('❌ Auth check failed with status:', response.status);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('❌ Auth check error:', error);
        setIsAuthenticated(false);
      }
    };
    
    checkAuth();
  }, []);

  // Monitoring loop
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isMonitoring) {
      const checkPrices = async () => {
        const currentProducts = monitoredProductsRef.current;
        if (currentProducts.length === 0) return;
        
        console.log('🔍 Checking prices for', currentProducts.length, 'products');
        
        // Use batch API for better performance
        const products = currentProducts.map(p => ({
          productId: p.productId,
          variantId: p.variantId
        }));
        
        const checkStartTime = Date.now();
        
        try {
          const response = await fetch('/api/stockx/monitor', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ products })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.results) {
              // Process results
              data.results.forEach((result: any) => {
                if (result.success && result.marketData) {
                  const productId = `${result.productId}-${result.variantId}`;
                  const newAsk = parseInt(result.marketData.lowestAskAmount);
                  const newBid = parseInt(result.marketData.highestBidAmount);
                  const newFlexAsk = result.marketData.flexLowestAskAmount ? parseInt(result.marketData.flexLowestAskAmount) : undefined;
                  
                  updateProductPrice(productId, newAsk, newBid, newFlexAsk);
                }
              });
              
              // Update last check time even if no price changes
              setMonitoredProducts(prev => prev.map(product => ({
                ...product,
                lastChecked: checkStartTime
              })));
              
              console.log('✅ Price check completed at', new Date(checkStartTime).toLocaleTimeString());
            }
          } else if (response.status === 401) {
            // Handle authentication error
            console.error('❌ Authentication error - please re-authenticate with StockX');
            setNotifications(prev => ['Authentication error - please reconnect to StockX', ...prev.slice(0, 9)]);
          }
        } catch (error) {
          console.error('❌ Error checking prices:', error);
          // Still update last check time to show the attempt was made
          setMonitoredProducts(prev => prev.map(product => ({
            ...product,
            lastChecked: checkStartTime
          })));
        }
      };

      // Initial check
      checkPrices();
      
      // Set up interval
      intervalId = setInterval(checkPrices, monitoringInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isMonitoring, monitoringInterval]); // Removed monitoredProducts to prevent re-creating intervals

  const updateProductPrice = (productId: string, newAsk: number, newBid: number, newFlexAsk?: number) => {
    setMonitoredProducts(prev => prev.map(product => {
      if (product.id !== productId) return product;

      const alerts = [...product.alerts];
      const now = Date.now();

      // Check for ask price drop
      if (newAsk < product.currentAsk) {
        const dropPercentage = ((product.currentAsk - newAsk) / product.currentAsk) * 100;
        
        if (dropPercentage >= product.priceDropThreshold) {
          const alert = {
            id: `${productId}-${now}`,
            type: 'ask_drop' as const,
            message: `Ask price dropped ${dropPercentage.toFixed(1)}% from $${product.currentAsk} to $${newAsk}`,
            timestamp: now,
            oldPrice: product.currentAsk,
            newPrice: newAsk,
            percentage: dropPercentage
          };
          alerts.unshift(alert);
          
          // Send browser notification
          sendNotification(`📉 ${product.title} (${product.size})`, alert.message);
        }
      }

             // Check for target ask price hit
       if (product.targetAskPrice && newAsk <= product.targetAskPrice) {
         const alert = {
           id: `${productId}-target-${now}`,
           type: 'target_hit' as const,
           message: `Target ask price hit! Ask is now $${newAsk} (target: $${product.targetAskPrice})`,
           timestamp: now,
           oldPrice: product.currentAsk,
           newPrice: newAsk,
           percentage: 0
         };
         alerts.unshift(alert);
         
         sendNotification(`🎯 ${product.title} (${product.size})`, alert.message);
       }

       // Check for flex ask price drop
       if (newFlexAsk && product.currentFlexAsk && newFlexAsk < product.currentFlexAsk) {
         const dropPercentage = ((product.currentFlexAsk - newFlexAsk) / product.currentFlexAsk) * 100;
         
         if (dropPercentage >= product.flexPriceDropThreshold) {
           const alert = {
             id: `${productId}-flex-${now}`,
             type: 'flex_ask_drop' as const,
             message: `Flex ask dropped ${dropPercentage.toFixed(1)}% from $${product.currentFlexAsk} to $${newFlexAsk}`,
             timestamp: now,
             oldPrice: product.currentFlexAsk,
             newPrice: newFlexAsk,
             percentage: dropPercentage
           };
           alerts.unshift(alert);
           
           sendNotification(`📉 FLEX ${product.title} (${product.size})`, alert.message);
         }
       }

       // Check for target flex ask price hit
       if (product.targetFlexAskPrice && newFlexAsk && newFlexAsk <= product.targetFlexAskPrice) {
         const alert = {
           id: `${productId}-flex-target-${now}`,
           type: 'flex_target_hit' as const,
           message: `Target flex ask hit! Flex ask is now $${newFlexAsk} (target: $${product.targetFlexAskPrice})`,
           timestamp: now,
           oldPrice: product.currentFlexAsk || 0,
           newPrice: newFlexAsk,
           percentage: 0
         };
         alerts.unshift(alert);
         
         sendNotification(`🎯 FLEX ${product.title} (${product.size})`, alert.message);
       }

      // Check for bid price rise
      if (newBid > product.currentBid) {
        const risePercentage = ((newBid - product.currentBid) / product.currentBid) * 100;
        
        if (product.targetBidPrice && newBid >= product.targetBidPrice) {
          const alert = {
            id: `${productId}-bid-${now}`,
            type: 'bid_rise' as const,
            message: `Target bid price hit! Bid is now $${newBid} (target: $${product.targetBidPrice})`,
            timestamp: now,
            oldPrice: product.currentBid,
            newPrice: newBid,
            percentage: risePercentage
          };
          alerts.unshift(alert);
          
          sendNotification(`📈 ${product.title} (${product.size})`, alert.message);
        }
      }

             // Add to price history
       const priceHistory = [...product.priceHistory, {
         timestamp: now,
         highestBid: newBid,
         lowestAsk: newAsk,
         flexLowestAsk: newFlexAsk
       }].slice(-100); // Keep last 100 data points

       return {
         ...product,
         currentAsk: newAsk,
         currentBid: newBid,
         currentFlexAsk: newFlexAsk,
         priceHistory,
         lastChecked: now,
         alerts: alerts.slice(0, 50) // Keep last 50 alerts
       };
    }));
  };

  const sendNotification = (title: string, message: string) => {
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/flip-flow-logo.svg'
      });
    }

    // In-app notification
    setNotifications(prev => [`${title}: ${message}`, ...prev.slice(0, 9)]);
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
          // Show user feedback
          setNotifications(prev => [`No products found for "${newProduct.query}"`, ...prev.slice(0, 9)]);
        }
      } else if (response.status === 401) {
        console.error('❌ Authentication error');
        setNotifications(prev => [`Authentication error - please login to StockX first`, ...prev.slice(0, 9)]);
        setSearchResults([]);
      } else {
        console.error('❌ Search failed with status:', response.status);
        const errorData = await response.text();
        console.error('Error details:', errorData);
        setNotifications(prev => [`Search failed - please try again`, ...prev.slice(0, 9)]);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      setNotifications(prev => [`Search error - please check your connection`, ...prev.slice(0, 9)]);
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

    setMonitoredProducts(prev => [...prev, newMonitoredProduct]);
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

  const removeProduct = (productId: string) => {
    setMonitoredProducts(prev => prev.filter(p => p.id !== productId));
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
          <div className="mb-6">
            <button
              onClick={() => setShowAddForm(true)}
              disabled={isAuthenticated === false}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product to Monitor
              {isAuthenticated === false && <span className="text-xs">(Login Required)</span>}
            </button>
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
                      <span className="text-yellow-400">
                        Ask Alert: {product.priceDropThreshold}%
                      </span>
                      {product.currentFlexAsk && (
                        <span className="text-orange-400">
                          Flex Alert: {product.flexPriceDropThreshold}%
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => removeProduct(product.id)}
                    className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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