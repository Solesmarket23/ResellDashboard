"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { addDocument, updateDocument, deleteDocument, subscribeToCollection } from "@/lib/firebase/firebaseUtils";
import { useAuth } from "@/lib/hooks/useAuth";
import { Unsubscribe } from "firebase/firestore";

interface PriceData {
  timestamp: number;
  highestBid: number;
  lowestAsk: number;
  flexLowestAsk?: number;
}

interface MonitoredProduct {
  id?: string; // Firebase document ID
  userId: string; // User ID for Firebase queries
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
  thresholdType?: 'percentage' | 'amount'; // Track whether thresholds are percentages or dollar amounts
  askThresholdAmount?: number; // Store dollar amount if using amount mode
  flexThresholdAmount?: number; // Store dollar amount if using amount mode
  priceHistory: PriceData[];
  lastChecked: number;
  stockxUrl?: string;
  urlKey?: string;
  slug?: string;
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
  updateAllProductThresholds: (askThreshold: number, flexThreshold: number) => void;
  updateAllProductThresholdsByAmount: (askAmount: number, flexAmount: number) => void;
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
  const { user } = useAuth();
  const [monitoredProducts, setMonitoredProducts] = useState<MonitoredProduct[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitoringInterval, setMonitoringInterval] = useState(300000); // 5 minutes default
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [lastReadTimestamp, setLastReadTimestamp] = useState(Date.now());
  
  const monitoredProductsRef = useRef<MonitoredProduct[]>([]);
  const isCheckingRef = useRef(false);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // Subscribe to Firebase monitored products
  useEffect(() => {
    if (!user?.uid) {
      console.log('No user ID, skipping Firebase subscription');
      return;
    }

    console.log('Setting up Firebase subscription for monitored products');
    
    // Subscribe to real-time updates from Firebase
    const unsubscribe = subscribeToCollection(
      'monitored_products',
      user.uid,
      (products: MonitoredProduct[]) => {
        console.log(`Received ${products.length} monitored products from Firebase`);
        setMonitoredProducts(products);
        
        // Calculate unread alerts
        const unreadCount = products.reduce((count, product) => {
          return count + (product.alerts?.filter(alert => alert.timestamp > lastReadTimestamp).length || 0);
        }, 0);
        setUnreadAlertCount(unreadCount);
      }
    );

    if (unsubscribe) {
      unsubscribeRef.current = unsubscribe;
    }

    // Load user preferences from localStorage (these can stay local)
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

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [user?.uid]);

  // Update ref when products change
  useEffect(() => {
    monitoredProductsRef.current = monitoredProducts;
  }, [monitoredProducts]);

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
        // First check if we have cookies
        const response = await fetch('/api/stockx/auth/status');
        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(data.isAuthenticated);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
      }
    };
    
    checkAuth();
    // Re-check auth status every minute
    const interval = setInterval(checkAuth, 60000);
    return () => clearInterval(interval);
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
        const dropAmount = product.currentAsk - newAsk;
        const dropPercentage = ((product.currentAsk - newAsk) / product.currentAsk) * 100;
        
        // Check based on threshold type
        const thresholdMet = product.thresholdType === 'amount' && product.askThresholdAmount
          ? dropAmount >= product.askThresholdAmount
          : dropPercentage >= product.priceDropThreshold;
        
        if (thresholdMet) {
          const dropDescription = product.thresholdType === 'amount' && product.askThresholdAmount
            ? `$${dropAmount.toFixed(0)}`
            : `${dropPercentage.toFixed(1)}%`;
            
          const alert = {
            id: `${productId}-${now}`,
            type: 'ask_drop' as const,
            message: `Ask price dropped ${dropDescription} from $${product.currentAsk} to $${newAsk}`,
            timestamp: now,
            oldPrice: product.currentAsk,
            newPrice: newAsk,
            percentage: dropPercentage
          };
          alerts.unshift(alert);
          sendNotification(`📉 ${product.title} (${product.size})`, alert.message, product, alert);
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
        sendNotification(`🎯 ${product.title} (${product.size})`, alert.message, product, alert);
      }

      // Check for flex ask price drop
      if (newFlexAsk && product.currentFlexAsk && newFlexAsk < product.currentFlexAsk) {
        const dropAmount = product.currentFlexAsk - newFlexAsk;
        const dropPercentage = ((product.currentFlexAsk - newFlexAsk) / product.currentFlexAsk) * 100;
        
        // Check based on threshold type
        const thresholdMet = product.thresholdType === 'amount' && product.flexThresholdAmount
          ? dropAmount >= product.flexThresholdAmount
          : dropPercentage >= product.flexPriceDropThreshold;
        
        if (thresholdMet) {
          const dropDescription = product.thresholdType === 'amount' && product.flexThresholdAmount
            ? `$${dropAmount.toFixed(0)}`
            : `${dropPercentage.toFixed(1)}%`;
            
          const alert = {
            id: `${productId}-flex-${now}`,
            type: 'flex_ask_drop' as const,
            message: `Flex ask dropped ${dropDescription} from $${product.currentFlexAsk} to $${newFlexAsk}`,
            timestamp: now,
            oldPrice: product.currentFlexAsk,
            newPrice: newFlexAsk,
            percentage: dropPercentage
          };
          alerts.unshift(alert);
          sendNotification(`📉 FLEX ${product.title} (${product.size})`, alert.message, product, alert);
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

  const sendNotification = (title: string, message: string, product?: any, alert?: any) => {
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/flip-flow-logo.svg'
      });
    }

    // In-app notification
    setNotifications(prev => [`${title}: ${message}`, ...prev.slice(0, 9)]);

    // Send Slack notification if enabled
    if (product && alert) {
      const slackEnabled = localStorage.getItem('stockx_slack_enabled') === 'true';
      const slackWebhookUrl = localStorage.getItem('stockx_slack_webhook');
      
      if (slackEnabled && slackWebhookUrl) {
        fetch('/api/stockx/slack-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product,
            alert,
            webhookUrl: slackWebhookUrl
          })
        }).catch(error => {
          console.error('Failed to send Slack notification:', error);
        });
      }
    }
  };

  // Context actions
  const addMonitoredProduct = async (product: MonitoredProduct) => {
    if (!user?.uid) {
      console.error('No user ID available');
      return;
    }

    try {
      // Add userId to product
      const productWithUser = {
        ...product,
        userId: user.uid,
        lastChecked: Date.now()
      };
      
      // Remove id field before adding to Firebase
      const { id, ...productData } = productWithUser;
      
      // Add to Firebase
      await addDocument('monitored_products', productData);
      console.log('Product added to Firebase');
    } catch (error) {
      console.error('Error adding product to Firebase:', error);
      throw error;
    }
  };

  const removeMonitoredProduct = async (productId: string) => {
    try {
      // Delete from Firebase
      await deleteDocument('monitored_products', productId);
      console.log('Product removed from Firebase');
    } catch (error) {
      console.error('Error removing product from Firebase:', error);
      throw error;
    }
  };

  const updateAllProductThresholds = async (askThreshold: number, flexThreshold: number) => {
    try {
      // Update each product in Firebase
      const updatePromises = monitoredProducts.map(product => {
        if (product.id) {
          return updateDocument('monitored_products', product.id, {
            priceDropThreshold: askThreshold,
            flexPriceDropThreshold: flexThreshold,
            thresholdType: 'percentage',
            askThresholdAmount: null,
            flexThresholdAmount: null
          }, true); // Use merge to only update these fields
        }
        return Promise.resolve();
      });
      
      await Promise.all(updatePromises);
      console.log('All product thresholds updated in Firebase');
    } catch (error) {
      console.error('Error updating thresholds:', error);
      throw error;
    }
  };

  const updateAllProductThresholdsByAmount = async (askAmount: number, flexAmount: number) => {
    try {
      // Update each product in Firebase with calculated percentages
      const updatePromises = monitoredProducts.map(product => {
        if (product.id) {
          // Calculate percentage for each product based on its current price
          const askPercentage = product.currentAsk > 0 ? (askAmount / product.currentAsk) * 100 : 1;
          const flexPercentage = product.currentFlexAsk && product.currentFlexAsk > 0 
            ? (flexAmount / product.currentFlexAsk) * 100 
            : 1;
          
          return updateDocument('monitored_products', product.id, {
            priceDropThreshold: Math.max(0.1, Math.min(50, askPercentage)),
            flexPriceDropThreshold: Math.max(0.1, Math.min(50, flexPercentage)),
            thresholdType: 'amount',
            askThresholdAmount: askAmount,
            flexThresholdAmount: flexAmount,
            // Update target prices based on dollar amount thresholds
            targetAskPrice: product.currentAsk > askAmount ? product.currentAsk - askAmount : product.currentAsk * 0.9,
            targetFlexAskPrice: product.currentFlexAsk && product.currentFlexAsk > flexAmount ? product.currentFlexAsk - flexAmount : product.currentFlexAsk ? product.currentFlexAsk * 0.9 : null
          }, true); // Use merge
        }
        return Promise.resolve();
      });
      
      await Promise.all(updatePromises);
      console.log('All product thresholds updated by amount in Firebase');
    } catch (error) {
      console.error('Error updating thresholds by amount:', error);
      throw error;
    }
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
    updateAllProductThresholds,
    updateAllProductThresholdsByAmount,
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