'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { Bell, Plus, Trash2, TrendingDown, Eye, EyeOff, Settings, AlertTriangle, CheckCircle } from 'lucide-react';

interface FlexAskItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  imageUrl: string;
  currentFlexAsk: number;
  baselineFlexAsk: number; // Price when first added to tracking
  lastChecked: string;
  alertThreshold: number; // Percentage drop to trigger alert (e.g., 20 = 20%)
  isActive: boolean;
  priceHistory: Array<{
    price: number;
    timestamp: string;
  }>;
  stockxUrl?: string;
}

interface PriceAlert {
  id: string;
  itemId: string;
  productName: string;
  size: string;
  oldPrice: number;
  newPrice: number;
  percentageChange: number;
  timestamp: string;
  isRead: boolean;
}

const StockXFlexAskMonitor: React.FC = () => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'neon';
  
  const [trackedItems, setTrackedItems] = useState<FlexAskItem[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [checkInterval, setCheckInterval] = useState(30); // minutes
  const [globalAlertThreshold, setGlobalAlertThreshold] = useState(20); // percentage
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load tracked items from localStorage on component mount
  useEffect(() => {
    const savedItems = localStorage.getItem('flexAskTrackedItems');
    const savedAlerts = localStorage.getItem('flexAskAlerts');
    const savedMonitoringState = localStorage.getItem('flexAskMonitoringActive');
    const savedInterval = localStorage.getItem('flexAskCheckInterval');
    const savedThreshold = localStorage.getItem('flexAskGlobalThreshold');

    if (savedItems) {
      setTrackedItems(JSON.parse(savedItems));
    }
    if (savedAlerts) {
      setAlerts(JSON.parse(savedAlerts));
    }
    if (savedMonitoringState) {
      setIsMonitoring(JSON.parse(savedMonitoringState));
    }
    if (savedInterval) {
      setCheckInterval(parseInt(savedInterval));
    }
    if (savedThreshold) {
      setGlobalAlertThreshold(parseInt(savedThreshold));
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('flexAskTrackedItems', JSON.stringify(trackedItems));
  }, [trackedItems]);

  useEffect(() => {
    localStorage.setItem('flexAskAlerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('flexAskMonitoringActive', JSON.stringify(isMonitoring));
  }, [isMonitoring]);

  useEffect(() => {
    localStorage.setItem('flexAskCheckInterval', checkInterval.toString());
  }, [checkInterval]);

  useEffect(() => {
    localStorage.setItem('flexAskGlobalThreshold', globalAlertThreshold.toString());
  }, [globalAlertThreshold]);

  // Periodic price checking
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isMonitoring && trackedItems.length > 0) {
      const checkPrices = async () => {
        console.log('🔍 Checking flex ask prices for tracked items...');
        await checkAllItemPrices();
      };

      // Check immediately, then set interval
      checkPrices();
      intervalId = setInterval(checkPrices, checkInterval * 60 * 1000); // Convert minutes to milliseconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isMonitoring, trackedItems, checkInterval]);

  const checkAllItemPrices = async () => {
    for (const item of trackedItems.filter(item => item.isActive)) {
      try {
        await checkItemPrice(item);
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error checking price for ${item.productName}:`, error);
      }
    }
  };

  const checkItemPrice = async (item: FlexAskItem) => {
    try {
      const response = await fetch(`/api/stockx/market-data?productId=${item.productId}&variantId=${item.variantId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }

      const data = await response.json();
      const newFlexAsk = data.flexLowestAskAmount;

      if (newFlexAsk && newFlexAsk !== item.currentFlexAsk) {
        const percentageChange = ((newFlexAsk - item.baselineFlexAsk) / item.baselineFlexAsk) * 100;
        
        // Update item with new price
        const updatedItem: FlexAskItem = {
          ...item,
          currentFlexAsk: newFlexAsk,
          lastChecked: new Date().toISOString(),
          priceHistory: [
            ...item.priceHistory,
            { price: newFlexAsk, timestamp: new Date().toISOString() }
          ].slice(-50) // Keep only last 50 price points
        };

        // Check if price drop meets alert threshold
        if (percentageChange <= -item.alertThreshold) {
          const alert: PriceAlert = {
            id: `alert-${Date.now()}-${item.id}`,
            itemId: item.id,
            productName: item.productName,
            size: item.size,
            oldPrice: item.currentFlexAsk,
            newPrice: newFlexAsk,
            percentageChange,
            timestamp: new Date().toISOString(),
            isRead: false
          };

          setAlerts(prev => [alert, ...prev]);
          
          // Show browser notification if supported
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Flex Ask Price Drop Alert!`, {
              body: `${item.productName} (${item.size}) dropped ${Math.abs(percentageChange).toFixed(1)}% to $${newFlexAsk}`,
              icon: item.imageUrl
            });
          }
        }

        // Update the tracked items
        setTrackedItems(prev => 
          prev.map(trackedItem => 
            trackedItem.id === item.id ? updatedItem : trackedItem
          )
        );
      }
    } catch (error) {
      console.error(`Error checking ${item.productName}:`, error);
    }
  };

  const addItemToTracking = (item: any) => {
    const newItem: FlexAskItem = {
      id: `tracked-${Date.now()}-${item.productId}-${item.variantId}`,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName || item.title,
      size: item.size,
      imageUrl: item.imageUrl,
      currentFlexAsk: item.flexAskAmount || 0,
      baselineFlexAsk: item.flexAskAmount || 0,
      lastChecked: new Date().toISOString(),
      alertThreshold: globalAlertThreshold,
      isActive: true,
      priceHistory: [{
        price: item.flexAskAmount || 0,
        timestamp: new Date().toISOString()
      }],
      stockxUrl: item.stockxUrl
    };

    setTrackedItems(prev => [...prev, newItem]);
    setSuccessMessage(`Added ${item.productName} (${item.size}) to flex ask monitoring`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const removeItemFromTracking = (itemId: string) => {
    setTrackedItems(prev => prev.filter(item => item.id !== itemId));
  };

  const toggleItemActive = (itemId: string) => {
    setTrackedItems(prev => 
      prev.map(item => 
        item.id === itemId ? { ...item, isActive: !item.isActive } : item
      )
    );
  };

  const markAlertAsRead = (alertId: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId ? { ...alert, isRead: true } : alert
      )
    );
  };

  const clearAllAlerts = () => {
    setAlerts([]);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setSuccessMessage('Browser notifications enabled!');
      } else {
        setErrorMessage('Browser notifications denied');
      }
      setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 3000);
    }
  };

  const unreadAlerts = alerts.filter(alert => !alert.isRead);

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Flex Ask Price Monitor
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Track flex ask prices and get alerted when items drop below your threshold
          </p>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">{successMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <p className="text-red-400">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Control Panel */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsMonitoring(!isMonitoring)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isMonitoring
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {isMonitoring ? (
                  <>
                    <Eye className="w-4 h-4" />
                    Monitoring Active
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Start Monitoring
                  </>
                )}
              </button>

              <button
                onClick={requestNotificationPermission}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                Enable Notifications
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-400">
                <p>Tracking: {trackedItems.filter(item => item.isActive).length} items</p>
                <p>Alerts: {unreadAlerts.length} unread</p>
              </div>
              
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-all duration-200"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mt-4 p-4 bg-gray-700 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Monitor Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Check Interval (minutes)
                  </label>
                  <input
                    type="number"
                    value={checkInterval}
                    onChange={(e) => setCheckInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                    min="5"
                    max="1440"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Default Alert Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={globalAlertThreshold}
                    onChange={(e) => setGlobalAlertThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                    min="5"
                    max="50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Price Drop Alerts</h2>
              <button
                onClick={clearAllAlerts}
                className="text-sm text-gray-400 hover:text-white"
              >
                Clear All
              </button>
            </div>
            
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border-l-4 ${
                    alert.isRead 
                      ? 'bg-gray-700 border-gray-500' 
                      : 'bg-red-900/20 border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-red-400" />
                        <p className="font-medium">
                          {alert.productName} ({alert.size})
                        </p>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Dropped {Math.abs(alert.percentageChange).toFixed(1)}% from ${alert.oldPrice} to ${alert.newPrice}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!alert.isRead && (
                      <button
                        onClick={() => markAlertAsRead(alert.id)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tracked Items */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Tracked Items</h2>
          
          {trackedItems.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No Items Being Tracked</h3>
              <p className="text-gray-500">
                Go to the Arbitrage Finder and add items with flex ask prices to start monitoring
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {trackedItems.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 ${
                    item.isActive 
                      ? 'border-gray-600 bg-gray-700' 
                      : 'border-gray-700 bg-gray-800 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                      <div>
                        <h3 className="font-medium">{item.productName}</h3>
                        <p className="text-sm text-gray-400">Size: {item.size}</p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-purple-400">
                            Current: ${item.currentFlexAsk.toFixed(2)}
                          </span>
                          <span className="text-gray-400">
                            Baseline: ${item.baselineFlexAsk.toFixed(2)}
                          </span>
                          <span className={`${
                            item.currentFlexAsk < item.baselineFlexAsk ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {item.currentFlexAsk < item.baselineFlexAsk ? '↓' : '↑'}
                            {Math.abs(((item.currentFlexAsk - item.baselineFlexAsk) / item.baselineFlexAsk) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleItemActive(item.id)}
                        className={`p-2 rounded-lg transition-all duration-200 ${
                          item.isActive 
                            ? 'bg-green-600 hover:bg-green-700 text-white' 
                            : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                        }`}
                      >
                        {item.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      
                      <button
                        onClick={() => removeItemFromTracking(item.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockXFlexAskMonitor; 