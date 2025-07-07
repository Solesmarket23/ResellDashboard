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

  // Helper function to safely convert price values to numbers
  const safeToFixed = (value: any, decimals: number = 2): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(numValue) ? '0.00' : numValue.toFixed(decimals);
  };

  // Computed values
  const unreadAlerts = alerts.filter(alert => !alert.isRead);

  // Load tracked items from localStorage on component mount
  useEffect(() => {
    const loadData = () => {
      console.log('🔍 FlexAskMonitor Loading Data - START');
      const savedItems = localStorage.getItem('flexAskTrackedItems');
      const savedAlerts = localStorage.getItem('flexAskAlerts');
      const savedMonitoringState = localStorage.getItem('flexAskMonitoringActive');
      const savedInterval = localStorage.getItem('flexAskCheckInterval');
      const savedThreshold = localStorage.getItem('flexAskGlobalThreshold');

      console.log('🔍 FlexAskMonitor Loading Data:');
      console.log('📦 Raw savedItems:', savedItems);
      console.log('🔔 Raw savedAlerts:', savedAlerts);
      console.log('⚙️ Raw savedMonitoringState:', savedMonitoringState);
      console.log('⏰ Raw savedInterval:', savedInterval);
      console.log('🎯 Raw savedThreshold:', savedThreshold);

      if (savedItems) {
        try {
          const parsedItems = JSON.parse(savedItems);
          console.log('✅ Parsed Items:', parsedItems);
          console.log('✅ Parsed Items count:', parsedItems.length);
          console.log('✅ Setting trackedItems state with', parsedItems.length, 'items');
          
          // Ensure price values are numbers
          const normalizedItems = parsedItems.map((item: any) => ({
            ...item,
            currentFlexAsk: Number(item.currentFlexAsk) || 0,
            baselineFlexAsk: Number(item.baselineFlexAsk) || 0,
            alertThreshold: Number(item.alertThreshold) || 20
          }));
          
          console.log('✅ Normalized Items:', normalizedItems);
          setTrackedItems(normalizedItems);
          console.log('✅ trackedItems state updated successfully');
        } catch (error) {
          console.error('❌ Error parsing saved items:', error);
          setTrackedItems([]);
        }
      } else {
        console.log('❌ No saved items found - localStorage is empty or null');
        setTrackedItems([]);
      }
      
      if (savedAlerts) {
        try {
          console.log('🔔 Loading alerts...');
          setAlerts(JSON.parse(savedAlerts));
        } catch (error) {
          console.error('❌ Error parsing saved alerts:', error);
          setAlerts([]);
        }
      }
      
      if (savedMonitoringState) {
        console.log('⚙️ Loading monitoring state...');
        setIsMonitoring(JSON.parse(savedMonitoringState));
      }
      if (savedInterval) {
        console.log('⏰ Loading check interval...');
        setCheckInterval(parseInt(savedInterval));
      }
      if (savedThreshold) {
        console.log('🎯 Loading global threshold...');
        setGlobalAlertThreshold(parseInt(savedThreshold));
      }
      
      console.log('🔍 FlexAskMonitor Loading Data - COMPLETE');
    };

    loadData();

    // Also listen for storage events to sync across tabs
    const handleStorageChange = (e: StorageEvent) => {
      console.log('🔄 Storage event received:', e);
      console.log('🔄 Storage event key:', e.key);
      console.log('🔄 Storage event newValue:', e.newValue);
      if (e.key === 'flexAskTrackedItems') {
        console.log('🔄 Storage change detected for flexAskTrackedItems, reloading data...');
        loadData();
      }
    };

    // Listen for custom events when items are added
    const handleItemAdded = (event: any) => {
      console.log('🔄 Custom event received:', event);
      console.log('🔄 Event detail:', event.detail);
      console.log('🔄 Item added event detected, reloading data...');
      setTimeout(() => {
        console.log('🔄 Executing delayed loadData after custom event...');
        loadData();
      }, 100); // Small delay to ensure localStorage is updated
    };

    // Add debugging for component mount
    console.log('🔄 FlexAskMonitor component mounting, setting up event listeners...');

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('flexAskItemAdded', handleItemAdded);
    
    console.log('✅ Event listeners added successfully');
    console.log('✅ Initial data load starting...');
    
    return () => {
      console.log('🔄 FlexAskMonitor unmounting, removing event listeners...');
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('flexAskItemAdded', handleItemAdded);
    };
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
      const newFlexAsk = Number(data.flexLowestAskAmount) || 0;
      const currentFlexAsk = Number(item.currentFlexAsk) || 0;
      const baselineFlexAsk = Number(item.baselineFlexAsk) || 0;

      if (newFlexAsk && newFlexAsk !== currentFlexAsk) {
        const percentageChange = ((newFlexAsk - baselineFlexAsk) / baselineFlexAsk) * 100;
        
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
            oldPrice: currentFlexAsk,
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
    const flexAskValue = Number(item.flexAskAmount) || 0;
    const newItem: FlexAskItem = {
      id: `tracked-${Date.now()}-${item.productId}-${item.variantId}`,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName || item.title,
      size: item.size,
      imageUrl: item.imageUrl,
      currentFlexAsk: flexAskValue,
      baselineFlexAsk: flexAskValue,
      lastChecked: new Date().toISOString(),
      alertThreshold: globalAlertThreshold,
      isActive: true,
      priceHistory: [{
        price: flexAskValue,
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

  const testMonitor = async () => {
    if (trackedItems.length === 0) {
      setErrorMessage('No items to test! Add some items first.');
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setIsLoading(true);
    setSuccessMessage('🧪 Testing monitor... Checking all tracked items with $1 threshold');

    try {
      let testResults = 0;
      let alertsGenerated = 0;

      for (const item of trackedItems.filter(item => item.isActive)) {
        try {
          console.log(`🧪 Testing ${item.productName} (${item.size})`);
          
          const response = await fetch(`/api/stockx/market-data?productId=${item.productId}&variantId=${item.variantId}`);
          if (!response.ok) {
            console.error(`Test failed for ${item.productName}:`, response.status);
            continue;
          }

          const data = await response.json();
          const newFlexAsk = Number(data.flexLowestAskAmount) || 0;
          const currentFlexAsk = Number(item.currentFlexAsk) || 0;
          const baselineFlexAsk = Number(item.baselineFlexAsk) || 0;

          if (newFlexAsk) {
            const priceDifference = Math.abs(newFlexAsk - baselineFlexAsk);
            const percentageChange = ((newFlexAsk - baselineFlexAsk) / baselineFlexAsk) * 100;
            
            console.log(`🧪 ${item.productName}: Current $${newFlexAsk}, Baseline $${baselineFlexAsk}, Diff: $${priceDifference.toFixed(2)} (${percentageChange.toFixed(2)}%)`);
            
            // Test with $1 threshold OR any price change
            if (priceDifference >= 1 || newFlexAsk !== currentFlexAsk) {
              const alert: PriceAlert = {
                id: `test-alert-${Date.now()}-${item.id}`,
                itemId: item.id,
                productName: item.productName,
                size: item.size,
                oldPrice: currentFlexAsk,
                newPrice: newFlexAsk,
                percentageChange,
                timestamp: new Date().toISOString(),
                isRead: false
              };

              setAlerts(prev => [alert, ...prev]);
              alertsGenerated++;

              // Show browser notification for test
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`🧪 Test Alert: Flex Ask Monitor Working!`, {
                  body: `${item.productName} (${item.size}) - Current: $${newFlexAsk} (${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%)`,
                  icon: item.imageUrl
                });
              }

              // Update the item with new price for testing
              const updatedItem: FlexAskItem = {
                ...item,
                currentFlexAsk: newFlexAsk,
                lastChecked: new Date().toISOString(),
                priceHistory: [
                  ...item.priceHistory,
                  { price: newFlexAsk, timestamp: new Date().toISOString() }
                ].slice(-50)
              };

              setTrackedItems(prev => 
                prev.map(trackedItem => 
                  trackedItem.id === item.id ? updatedItem : trackedItem
                )
              );
            }
            
            testResults++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`Test error for ${item.productName}:`, error);
        }
      }

      if (alertsGenerated > 0) {
        setSuccessMessage(`✅ Monitor test complete! Generated ${alertsGenerated} test alerts from ${testResults} items. Check the alerts section above.`);
      } else if (testResults > 0) {
        setSuccessMessage(`✅ Monitor test complete! Checked ${testResults} items successfully. No price changes detected (prices are stable).`);
      } else {
        setErrorMessage('❌ Test failed - could not fetch price data for any items. Check your connection and authentication.');
      }

    } catch (error) {
      console.error('Test monitor error:', error);
      setErrorMessage('❌ Test failed with error. Check console for details.');
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 8000);
    }
  };

  const addDemoItems = () => {
    // Add some demo items from your recent Denim Tears search for testing
    const demoItems = [
      {
        productId: 'c54bdfe8-b581-463e-bd1a-899b2054e127',
        variantId: '2f21dd38-995a-4ba6-9492-c3b197bfb5a2',
        productName: 'Denim Tears The Cotton Wreath Sweatshirt Black',
        size: 'M',
        flexAskAmount: 500,
        imageUrl: '/placeholder-shoe.png'
      },
      {
        productId: '44d29094-a26d-4021-b3ab-8df473a96bb2',
        variantId: 'a272d872-921e-4902-934e-9e2200c61d01',
        productName: 'Denim Tears The Cotton Wreath Sweatpants Black',
        size: 'XXL',
        flexAskAmount: 399,
        imageUrl: '/placeholder-shoe.png'
      },
      {
        productId: '69a64445-e9b8-4239-8533-1c2e2d58d6f4',
        variantId: '2cd4d330-f76a-44c7-acd6-74570f6f911f',
        productName: 'Denim Tears The Cotton Wreath Shorts Black',
        size: 'L',
        flexAskAmount: 271,
        imageUrl: '/placeholder-shoe.png'
      }
    ];

    let addedCount = 0;
    
    demoItems.forEach(item => {
      // Check if item is already being tracked
      const isAlreadyTracked = trackedItems.some((trackedItem: any) => 
        trackedItem.productId === item.productId && trackedItem.variantId === item.variantId
      );
      
      if (!isAlreadyTracked) {
        const flexAskValue = Number(item.flexAskAmount) || 0;
        const newItem = {
          id: `demo-${Date.now()}-${item.productId}-${item.variantId}`,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          size: item.size,
          imageUrl: item.imageUrl,
          currentFlexAsk: flexAskValue,
          baselineFlexAsk: flexAskValue,
          lastChecked: new Date().toISOString(),
          alertThreshold: 1, // Set very low threshold for testing
          isActive: true,
          priceHistory: [{
            price: flexAskValue,
            timestamp: new Date().toISOString()
          }],
          stockxUrl: `https://stockx.com/${item.productName.toLowerCase().replace(/\s+/g, '-')}`
        };

        setTrackedItems(prev => [...prev, newItem]);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setSuccessMessage(`Added ${addedCount} demo items for testing! Set threshold to 1% and click "Test Monitor" to see it work.`);
    } else {
      setSuccessMessage('Demo items already added! Click "Test Monitor" to check if monitoring is working.');
    }
    
    setTimeout(() => setSuccessMessage(null), 5000);
  };

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

        {/* Debug Status - only show in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-700 rounded-lg p-3 mb-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">🔧 Debug Status:</span>
              <div className="flex gap-4 text-gray-400">
                <span>State: {trackedItems.length} items</span>
                <span>localStorage: {localStorage.getItem('flexAskTrackedItems') ? 
                  `${JSON.parse(localStorage.getItem('flexAskTrackedItems') || '[]').length} items` : 
                  'empty'
                }</span>
                <span>Last render: {new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        )}

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
                onClick={() => {
                  console.log('🔍 DEBUG BUTTON CLICKED - Manual debug & reload initiated');
                  console.log('🔍 DEBUG: Full component state check:');
                  console.log('📦 Current trackedItems state:', trackedItems);
                  console.log('📦 trackedItems.length:', trackedItems.length);
                  console.log('📦 flexAskTrackedItems localStorage:', localStorage.getItem('flexAskTrackedItems'));
                  
                  const savedItems = localStorage.getItem('flexAskTrackedItems');
                  if (savedItems) {
                    try {
                      const parsedItems = JSON.parse(savedItems);
                      console.log('✅ Manual debug - Parsed items count:', parsedItems.length);
                      console.log('✅ Manual debug - Parsed items:', parsedItems);
                      
                      // Ensure price values are numbers and force update the state
                      const normalizedItems = parsedItems.map((item: any) => ({
                        ...item,
                        currentFlexAsk: Number(item.currentFlexAsk) || 0,
                        baselineFlexAsk: Number(item.baselineFlexAsk) || 0,
                        alertThreshold: Number(item.alertThreshold) || 20
                      }));
                      
                      console.log('✅ Manual debug - Normalized items:', normalizedItems);
                      setTrackedItems([...normalizedItems]); // Create new array reference to force re-render
                      console.log('✅ Manual debug - State updated with normalized items');
                      
                      setSuccessMessage(`🔍 Debug: Found ${parsedItems.length} items in localStorage. Force reloaded component state.`);
                    } catch (error) {
                      console.error('❌ Manual debug - Error parsing localStorage data:', error);
                      setErrorMessage('Error parsing localStorage data: ' + error.message);
                    }
                  } else {
                    console.log('❌ Manual debug - No items found in localStorage');
                    setTrackedItems([]);
                    setErrorMessage('No items found in localStorage - localStorage is empty');
                  }
                  
                  // Also test event dispatching
                  console.log('📡 Manual debug - Testing custom event dispatch...');
                  const testEvent = new CustomEvent('flexAskItemAdded', { 
                    detail: { item: {test: 'data'}, count: 1 } 
                  });
                  window.dispatchEvent(testEvent);
                  console.log('✅ Manual debug - Test event dispatched');
                  
                  setTimeout(() => {
                    setSuccessMessage(null);
                    setErrorMessage(null);
                  }, 4000);
                }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                🔍 Debug & Reload
              </button>

              <button
                onClick={requestNotificationPermission}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                Enable Notifications
              </button>

              <button
                onClick={testMonitor}
                disabled={trackedItems.length === 0}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Test Monitor
              </button>

              <button
                onClick={addDemoItems}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                Add Demo Items
              </button>

              <button
                onClick={() => {
                  console.log('🔄 Force refreshing page...');
                  window.location.reload();
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                🔄 Refresh Page
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
                    min="1"
                    max="50"
                    step="0.1"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    💡 For testing, try 1% or lower
                  </div>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Tracked Items ({trackedItems.length})</h2>
            <div className="text-sm text-gray-400">
              {trackedItems.length > 0 ? (
                <span>
                  Active: {trackedItems.filter(item => item.isActive).length} | 
                  Inactive: {trackedItems.filter(item => !item.isActive).length}
                </span>
              ) : (
                <span className="text-yellow-400">
                  🔍 State: {trackedItems.length} items | 
                  LocalStorage: {localStorage.getItem('flexAskTrackedItems') ? 'HAS DATA' : 'EMPTY'}
                </span>
              )}
            </div>
          </div>
          
          {trackedItems.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No Items Being Tracked</h3>
              <p className="text-gray-500 mb-4">
                Go to the Arbitrage Finder and add items with flex ask prices to start monitoring
              </p>
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 text-left">
                <h4 className="text-blue-300 font-medium mb-2">📝 How to Add Items:</h4>
                <ol className="text-sm text-blue-200 space-y-1">
                  <li>1. Go to <strong>StockX Integration → Arbitrage Finder</strong></li>
                  <li>2. Search for products (e.g. "Denim Tears", "Fear of God")</li>
                  <li>3. Enable "Show Flex Ask Prices" toggle</li>
                  <li>4. Click green "Track Flex Ask" buttons on items with flex prices</li>
                  <li>5. Return here to see your tracked items</li>
                </ol>
              </div>
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
                            Current: ${safeToFixed(item.currentFlexAsk, 2)}
                          </span>
                          <span className="text-gray-400">
                            Baseline: ${safeToFixed(item.baselineFlexAsk, 2)}
                          </span>
                          <span className={`${
                            Number(item.currentFlexAsk) < Number(item.baselineFlexAsk) ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {Number(item.currentFlexAsk) < Number(item.baselineFlexAsk) ? '↓' : '↑'}
                            {Math.abs(((Number(item.currentFlexAsk) - Number(item.baselineFlexAsk)) / Number(item.baselineFlexAsk)) * 100).toFixed(1)}%
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