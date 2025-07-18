"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";

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

interface PriceMonitorContextType {
  monitoredProducts: MonitoredProduct[];
  isMonitoring: boolean;
  monitoringInterval: number;
  notifications: string[];
  isAuthenticated: boolean | null;
  unreadAlertCount: number;
  
  // Actions
  addMonitoredProduct: (product: MonitoredProduct) => void;
  removeMonitoredProduct: (productId: string) => void;
  setIsMonitoring: (monitoring: boolean) => void;
  setMonitoringInterval: (interval: number) => void;
  clearNotifications: () => void;
  markAlertsAsRead: () => void;
}

const PriceMonitorContext = createContext<PriceMonitorContextType | undefined>(undefined);

export const usePriceMonitor = () => {
  const context = useContext(PriceMonitorContext);
  if (!context) {
    throw new Error("usePriceMonitor must be used within PriceMonitorProvider");
  }
  return context;
};

export const PriceMonitorProvider = ({ children }: { children: ReactNode }) => {
  const [monitoredProducts, setMonitoredProducts] = useState<MonitoredProduct[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitoringInterval, setMonitoringInterval] = useState(300000); // 5 minutes default
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [lastReadTimestamp, setLastReadTimestamp] = useState(Date.now());
  
  const monitoredProductsRef = useRef<MonitoredProduct[]>([]);
  const isCheckingRef = useRef(false);

  // Load saved data from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('stockx_monitored_products');
    if (saved) {
      setMonitoredProducts(JSON.parse(saved));
    }

    const savedMonitoring = localStorage.getItem('stockx_monitoring_active');
    if (savedMonitoring === 'true') {
      setIsMonitoring(true);
    }

    const savedInterval = localStorage.getItem('stockx_monitoring_interval');
    if (savedInterval) {
      setMonitoringInterval(parseInt(savedInterval));
    }

    const savedLastRead = localStorage.getItem('stockx_last_read_timestamp');
    if (savedLastRead) {
      setLastReadTimestamp(parseInt(savedLastRead));
    }
  }, []);

  // Save products to localStorage and update ref
  useEffect(() => {
    localStorage.setItem('stockx_monitored_products', JSON.stringify(monitoredProducts));
    monitoredProductsRef.current = monitoredProducts;
    
    // Calculate unread alerts
    const unreadCount = monitoredProducts.reduce((count, product) => {
      return count + product.alerts.filter(alert => alert.timestamp > lastReadTimestamp).length;
    }, 0);
    setUnreadAlertCount(unreadCount);
  }, [monitoredProducts, lastReadTimestamp]);

  // Save monitoring state
  useEffect(() => {
    localStorage.setItem('stockx_monitoring_active', isMonitoring.toString());
  }, [isMonitoring]);

  // Save monitoring interval
  useEffect(() => {
    localStorage.setItem('stockx_monitoring_interval', monitoringInterval.toString());
  }, [monitoringInterval]);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/stockx/test');
        if (response.ok) {
          const data = await response.json();
          const isAuth = data.accessTokenPresent && data.summary?.hasCatalogAccess;
          setIsAuthenticated(isAuth);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
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
        if (isCheckingRef.current) {
          console.log('⏭️ Skipping check - previous check still in progress');
          return;
        }
        
        isCheckingRef.current = true;
        const currentProducts = monitoredProductsRef.current;
        if (currentProducts.length === 0) {
          isCheckingRef.current = false;
          return;
        }
        
        console.log('🔍 [Background] Starting price check for', currentProducts.length, 'products at', new Date().toLocaleTimeString());
        
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
              data.results.forEach((result: any) => {
                if (result.success && result.marketData) {
                  const productId = `${result.productId}-${result.variantId}`;
                  const newAsk = parseInt(result.marketData.lowestAskAmount);
                  const newBid = parseInt(result.marketData.highestBidAmount);
                  const newFlexAsk = result.marketData.flexLowestAskAmount ? parseInt(result.marketData.flexLowestAskAmount) : undefined;
                  
                  updateProductPrice(productId, newAsk, newBid, newFlexAsk);
                }
              });
              
              setMonitoredProducts(prev => prev.map(product => ({
                ...product,
                lastChecked: checkStartTime
              })));
              
              const checkDuration = Date.now() - checkStartTime;
              console.log(`✅ [Background] Price check completed at ${new Date(checkStartTime).toLocaleTimeString()} (took ${(checkDuration / 1000).toFixed(1)}s)`);
            }
          } else if (response.status === 401) {
            console.error('❌ Authentication error - please re-authenticate with StockX');
            sendNotification('StockX Authentication', 'Authentication error - please reconnect to StockX');
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error('❌ Error checking prices:', error);
          setMonitoredProducts(prev => prev.map(product => ({
            ...product,
            lastChecked: checkStartTime
          })));
        }
        
        isCheckingRef.current = false;
      };

      checkPrices();
      intervalId = setInterval(checkPrices, monitoringInterval);
      console.log(`⏰ [Background] Monitoring interval set to ${monitoringInterval / 1000} seconds`);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log('🛑 [Background] Monitoring interval cleared');
      }
    };
  }, [isMonitoring, monitoringInterval]);

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

      // Add to price history
      const priceHistory = [...product.priceHistory, {
        timestamp: now,
        highestBid: newBid,
        lowestAsk: newAsk,
        flexLowestAsk: newFlexAsk
      }].slice(-100);

      return {
        ...product,
        currentAsk: newAsk,
        currentBid: newBid,
        currentFlexAsk: newFlexAsk,
        priceHistory,
        lastChecked: now,
        alerts: alerts.slice(0, 50)
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

  // Context actions
  const addMonitoredProduct = (product: MonitoredProduct) => {
    setMonitoredProducts(prev => [...prev, product]);
  };

  const removeMonitoredProduct = (productId: string) => {
    setMonitoredProducts(prev => prev.filter(p => p.id !== productId));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const markAlertsAsRead = () => {
    const now = Date.now();
    setLastReadTimestamp(now);
    localStorage.setItem('stockx_last_read_timestamp', now.toString());
  };

  const value: PriceMonitorContextType = {
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
  };

  return (
    <PriceMonitorContext.Provider value={value}>
      {children}
    </PriceMonitorContext.Provider>
  );
};