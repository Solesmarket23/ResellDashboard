'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Calculator, Calendar, X, Palette, Trash2, RotateCcw, RefreshCw, Wifi, WifiOff, AlertCircle, Settings, GripVertical, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { saveUserDashboardSettings, getUserDashboardSettings, clearAllUserData } from '../lib/firebase/userDataUtils';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/firebase';
import { formatShortDate, parseLocalDate } from '../lib/utils/dateUtils';
import { getDocuments } from '../lib/firebase/firebaseUtils';
import { useSales } from '../lib/hooks/useSales';
import { formatOrderNumberForDisplay } from '../lib/utils/orderNumberUtils';
import DatePicker from './DatePicker';

const Dashboard = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const { user } = useAuth();
  
  // Use the new useSales hook for real-time sales data
  const { 
    sales, 
    metrics: salesMetrics, 
    loading: salesLoading, 
    error: salesError,
    connectionState,
    forceRefresh: refreshSales 
  } = useSales();
  
  const [activeTimePeriod, setActiveTimePeriod] = useState('This Month');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customRangeLabel, setCustomRangeLabel] = useState('Custom Range');
  const [showBackground, setShowBackground] = useState(true);
  
  // Customizable stats state
  const [showStatsSettings, setShowStatsSettings] = useState(false);
  const [selectedStats, setSelectedStats] = useState<string[]>([
    'total_profit', 'total_revenue', 'unsold_inventory', 'inventory_value', 'avg_profit', 'total_spend'
  ]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'success'
  });
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [mockDataEnabled, setMockDataEnabled] = useState(false);
  const profitChartOverlayRef = useRef<HTMLDivElement | null>(null);
  const [profitChartAspectRatio, setProfitChartAspectRatio] = useState(1);
  
  // Other data state (purchases, etc.)
  const [userPurchases, setUserPurchases] = useState<any[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [realMetrics, setRealMetrics] = useState({
    totalProfit: 0,
    totalRevenue: 0,
    totalSpend: 0,
    inventoryCount: 0,
    inventoryValue: 0,
    avgProfitPerSale: 0,
    recentSales: [],
    platformBreakdown: {
      manual: { count: 0, revenue: 0, profit: 0 },
      stockx: { count: 0, revenue: 0, profit: 0 }
    }
  });
  
  const timePeriods = ['Today', 'Yesterday', 'This Month', 'This Year', 'Custom Range'];

  // Reset all user data function
  const handleResetAllData = async () => {
    if (!user) return;
    
    setResetLoading(true);
    try {
      const result = await clearAllUserData(user.uid);
      
      // Reset local state
      setUserPurchases([]);
      setRealMetrics({
        totalProfit: 0,
        totalRevenue: 0,
        totalSpend: 0,
        inventoryCount: 0,
        inventoryValue: 0,
        avgProfitPerSale: 0,
        recentSales: []
      });
      
      // Refresh sales data through the hook
      refreshSales();
      
      // Reset theme to default
      setTheme('Default');
      
      // Reset time period
      setActiveTimePeriod('This Month');
      
      // Handle both success and partial success
      if (result.success) {
        console.log('🎉 Account successfully reset to fresh state!');
        alert(`🎉 Account Reset Complete!\n\nCleared:\n• ${result.cleared.purchases} purchases\n• ${result.cleared.sales} sales\n• ${result.cleared.themes} theme settings\n• ${result.cleared.profiles} profile data\n• ${result.cleared.emailConfigs} email configs\n• ${result.cleared.dashboardSettings} dashboard settings\n\nYour account is now fresh!`);
      } else {
        // Partial success
        console.log('⚠️ Account partially reset with some errors');
        const totalCleared = Object.values(result.cleared).reduce((sum: number, count: number) => sum + count, 0);
        alert(`⚠️ Account Partially Reset\n\nCleared ${totalCleared} items:\n• ${result.cleared.purchases} purchases\n• ${result.cleared.sales} sales\n• ${result.cleared.themes} theme settings\n• ${result.cleared.profiles} profile data\n• ${result.cleared.emailConfigs} email configs\n• ${result.cleared.dashboardSettings} dashboard settings\n\nSome errors occurred but your account has been mostly cleared.\nError: ${result.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('❌ Error resetting account:', error);
      
      // Provide more specific error message
      let errorMessage = '❌ Error resetting account. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('Firebase')) {
          errorMessage = '❌ Database error occurred. Please check your internet connection and try again.';
        } else if (error.message.includes('permission')) {
          errorMessage = '❌ Permission denied. Please make sure you\'re logged in and try again.';
        } else if (error.message.includes('network')) {
          errorMessage = '❌ Network error. Please check your internet connection and try again.';
        } else {
          errorMessage = `❌ Error resetting account: ${error.message}`;
        }
      }
      
      alert(errorMessage);
    } finally {
      setResetLoading(false);
      setShowResetConfirm(false);
    }
  };

  // Load purchases data (sales are handled by useSales hook)
  const loadPurchasesData = async (skipCache = false) => {
    if (!user) {
      console.log('📊 Dashboard: No user found, skipping purchases load');
      setPurchasesLoading(false);
      return;
    }

    try {
      // Check if user is using site password (localStorage)
      const siteUserId = localStorage.getItem('siteUserId');
      const userId = siteUserId || user.uid;
      
      // Try cache first (unless explicitly skipping)
      if (!skipCache) {
        const { dataCache, CacheKeys } = await import('@/lib/utils/dataCache');
        const cachedPurchases = dataCache.get<any[]>(CacheKeys.purchases(userId));
        if (cachedPurchases) {
          console.log('📊 Dashboard: Using cached purchases');
          setUserPurchases(cachedPurchases);
          return;
        }
      }
      
      console.log('📊 Dashboard: Starting purchases load for user:', userId);
      setPurchasesLoading(true);
      
      let userPurchasesData: any[] = [];
      
      if (siteUserId) {
        // Load from localStorage for site password users (much faster)
        console.log('📊 Dashboard: Loading from localStorage (site password user)');
        const storageKey = `purchases_${siteUserId}`;
        const purchasesJson = localStorage.getItem(storageKey);
        userPurchasesData = purchasesJson ? JSON.parse(purchasesJson) : [];
        console.log('📊 Dashboard: Found', userPurchasesData.length, 'purchases in localStorage');
      } else {
        // Load purchases from Firebase (only for this user, with limit)
        console.log('📊 Dashboard: Loading from Firebase...');
        const allPurchases = await getDocuments('purchases');
        userPurchasesData = allPurchases.filter(
          (purchase: any) => purchase.userId === user.uid
        );
        console.log('📊 Dashboard: Found', userPurchasesData.length, 'purchases');
      }
      
      setUserPurchases(userPurchasesData);
      
      // Cache the results
      const { dataCache, CacheKeys, CacheTTL } = await import('@/lib/utils/dataCache');
      dataCache.set(CacheKeys.purchases(userId), userPurchasesData, CacheTTL.MEDIUM);
      
      console.log('📊 Dashboard: Purchases load completed successfully');
      
    } catch (error) {
      console.error('❌ Dashboard: Error loading purchases:', error);
    } finally {
      setPurchasesLoading(false);
    }
  };

  // Load purchases data on mount and when user changes
  useEffect(() => {
    loadPurchasesData();
  }, [user]);

  // Calculate combined metrics when sales or purchases change
  useEffect(() => {
    if (!salesLoading && !purchasesLoading) {
      console.log('📊 Dashboard: Calculating combined metrics...');
      
      // Combine salesMetrics from useSales hook with purchase data
      const totalSpend = userPurchases.reduce((sum, purchase) => {
        const price = parseFloat(purchase.price?.replace(/[$,]/g, '')) || 0;
        return sum + price;
      }, 0);
      
      const inventoryCount = Math.max(0, userPurchases.length - salesMetrics.salesCount);
      const inventoryValue = Math.max(0, totalSpend - salesMetrics.totalRevenue);
      
      setRealMetrics({
        totalProfit: salesMetrics.totalProfit,
        totalRevenue: salesMetrics.totalRevenue,
        totalSpend,
        inventoryCount,
        inventoryValue,
        avgProfitPerSale: salesMetrics.avgProfitPerSale,
        recentSales: salesMetrics.recentSales,
        platformBreakdown: salesMetrics.platformBreakdown
      });
    }
  }, [sales, userPurchases, salesLoading, purchasesLoading, salesMetrics]);

  // Track the rendered chart aspect ratio so SVG dots can stay visually circular even when the SVG is stretched.
  useEffect(() => {
    const el = profitChartOverlayRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const ratio = rect.height > 0 ? rect.width / rect.height : 1;
      setProfitChartAspectRatio(Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);



  // Force purchases refresh when returning to dashboard
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        console.log('📡 Dashboard: Page became visible - refreshing purchases');
        loadPurchasesData();
      }
    };

    const handleFocus = () => {
      if (user) {
        console.log('📡 Dashboard: Window focused - refreshing purchases');
        loadPurchasesData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // Add periodic refresh for purchases data
  useEffect(() => {
    if (!user) return;

    // Refresh purchases data every 5 minutes when user is active (reduced from 30s to save Firebase reads)
    const interval = setInterval(() => {
      // Only refresh if the document is visible (user is actively using the app)
      if (!document.hidden) {
        console.log('🔄 Auto-refresh triggered (5min interval) - refreshing purchases');
        loadPurchasesData();
      }
    }, 5 * 60 * 1000); // 5 minutes (300 seconds)

    return () => {
      console.log('📡 Dashboard: Cleaning up interval');
      clearInterval(interval);
    };
  }, [user]);

  // calculateRealMetrics function removed - now using salesMetrics from useSales hook

  // Mock data for demonstration
  const mockMetrics = {
    totalProfit: 15420,
    totalRevenue: 28450,
    totalSpend: 13030,
    inventoryCount: 23,
    inventoryValue: 18450,
    avgProfitPerSale: 385,
    platformBreakdown: {
      stockx: { count: 18, profit: 12350 },
      manual: { count: 5, profit: 3070 }
    },
    recentSales: [
      { profit: 150, date: '2024-01-10', product: 'Air Jordan 1 Retro' },
      { profit: 320, date: '2024-01-11', product: 'Nike Dunk Low' },
      { profit: 85, date: '2024-01-12', product: 'Yeezy 350 V2' },
      { profit: 450, date: '2024-01-13', product: 'Travis Scott Jordan 1' },
      { profit: 200, date: '2024-01-14', product: 'Off-White Air Max 90' },
      { profit: 180, date: '2024-01-15', product: 'Fragment Design Jordan 1' },
      { profit: 290, date: '2024-01-16', product: 'Union LA Jordan 1' }
    ]
  };

  // Use mock data if enabled, otherwise use real data
  const displayMetrics = mockDataEnabled ? mockMetrics : realMetrics;

  // Load dashboard settings from Firebase
  useEffect(() => {
    const loadDashboardSettings = async () => {
      if (user) {
        try {
          const settings = await getUserDashboardSettings(user.uid);
          if (settings) {
            setActiveTimePeriod(settings.activeTimePeriod);
            setStartDate(settings.customDateRange.startDate);
            setEndDate(settings.customDateRange.endDate);
            setShowBackground(settings.preferences.showBackground);
          }
        } catch (error) {
          console.error('Error loading dashboard settings:', error);
        }
      }
    };

    loadDashboardSettings();
  }, [user]);

  // Load customizable stats settings from Firebase
  useEffect(() => {
    loadStatsSettings();
  }, [user]);

  // Auto-save stats settings whenever selectedStats changes (but not on initial load)
  useEffect(() => {
    if (user && selectedStats.length > 0) {
      // Only save if we have a user and stats are not empty
      // This prevents saving on initial load when selectedStats is still the default
      const timeoutId = setTimeout(() => {
        saveStatsSettings(selectedStats);
      }, 1000); // Debounce saves by 1 second
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedStats, user]);

  // Save dashboard settings to Firebase
  const saveDashboardSettings = async () => {
    if (user) {
      try {
        await saveUserDashboardSettings(user.uid, {
          activeTimePeriod,
          customDateRange: {
            startDate,
            endDate
          },
          preferences: {
            showBackground,
            defaultView: 'dashboard'
          }
        });
      } catch (error) {
        console.error('Error saving dashboard settings:', error);
      }
    }
  };

  // Save settings when they change
  useEffect(() => {
    if (user) {
      saveDashboardSettings();
    }
  }, [activeTimePeriod, startDate, endDate, showBackground, user]);

  // Handle time period selection
  const handleTimePeriodChange = (period: string) => {
    if (period === 'Custom Range') {
      setShowDatePicker(true);
    } else {
      setActiveTimePeriod(period);
      setShowDatePicker(false);
    }
  };

  // Handle custom date range selection
  const handleCustomDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const end = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      setCustomRangeLabel(`${start} - ${end}`);
      setActiveTimePeriod('Custom Range');
      setShowDatePicker(false);
    }
  };

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showDatePicker) {
        setShowDatePicker(false);
      }
      // Press 'B' to toggle background
      if (event.key === 'b' || event.key === 'B') {
        if (showDatePicker) {
          setShowBackground(!showBackground);
        }
      }
    };

    if (showDatePicker) {
      document.addEventListener('keydown', handleKeyPress);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [showDatePicker, showBackground]);
  
  // Show notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({
      show: true,
      message,
      type
    });
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  // Stats configuration
  const availableStats = {
    total_profit: {
      id: 'total_profit',
      label: 'Total Profit',
      icon: DollarSign,
      color: 'text-green-600',
      getValue: () => `$${displayMetrics.totalProfit.toLocaleString()}`,
      getSubtitle: () => `${displayMetrics.platformBreakdown?.stockx?.count || 0} StockX, ${displayMetrics.platformBreakdown?.manual?.count || 0} Manual`
    },
    total_revenue: {
      id: 'total_revenue',
      label: 'Total Revenue',
      icon: TrendingUp,
      color: 'text-blue-600',
      getValue: () => `$${displayMetrics.totalRevenue.toLocaleString()}`,
      getSubtitle: () => 'From all sales'
    },
    unsold_inventory: {
      id: 'unsold_inventory',
      label: 'Unsold Inventory',
      icon: Package,
      color: 'text-purple-600',
      getValue: () => displayMetrics.inventoryCount.toString(),
      getSubtitle: () => 'Items in stock'
    },
    inventory_value: {
      id: 'inventory_value',
      label: 'Inventory Value',
      icon: ShoppingCart,
      color: 'text-orange-600',
      getValue: () => `$${displayMetrics.inventoryValue.toLocaleString()}`,
      getSubtitle: () => 'Estimated value'
    },
    avg_profit: {
      id: 'avg_profit',
      label: 'Avg Profit/Sale',
      icon: BarChart3,
      color: 'text-green-600',
      getValue: () => `$${Math.round(displayMetrics.avgProfitPerSale).toLocaleString()}`,
      getSubtitle: () => 'Per transaction'
    },
    total_spend: {
      id: 'total_spend',
      label: 'Total Spend',
      icon: Calculator,
      color: 'text-red-600',
      getValue: () => `$${displayMetrics.totalSpend.toLocaleString()}`,
      getSubtitle: () => 'Purchase costs'
    }
  };

  // Handle stat selection
  const handleStatToggle = (statId: string) => {
    let newStats;
    if (selectedStats.includes(statId)) {
      // Remove if already selected
      newStats = selectedStats.filter(id => id !== statId);
    } else {
      // Add if not selected
      newStats = [...selectedStats, statId];
    }
    setSelectedStats(newStats);
    // Auto-save when toggling stats
    saveStatsSettings(newStats);
  };

  // Handle stat reordering
  const handleStatReorder = (fromIndex: number, toIndex: number) => {
    const newStats = [...selectedStats];
    const [removed] = newStats.splice(fromIndex, 1);
    newStats.splice(toIndex, 0, removed);
    setSelectedStats(newStats);
    // Auto-save when reordering
    saveStatsSettings(newStats);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      handleStatReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Save customizable stats settings to Firebase
  const saveStatsSettings = async (stats: string[]) => {
    if (!user) return;
    
    try {
      const userSettingsRef = doc(db, 'userSettings', user.uid);
      await setDoc(userSettingsRef, {
        customizableStats: stats,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      console.log('✅ Dashboard stats saved successfully:', stats);
    } catch (error) {
      console.error('❌ Error saving stats settings:', error);
      showNotification('Failed to save dashboard settings', 'error');
    }
  };

  // Load customizable stats settings from Firebase
  const loadStatsSettings = async () => {
    if (!user) return;
    
    try {
      const userSettingsRef = doc(db, 'userSettings', user.uid);
      const userSettingsDoc = await getDoc(userSettingsRef);
      
      if (userSettingsDoc.exists()) {
        const data = userSettingsDoc.data();
        if (data.customizableStats && Array.isArray(data.customizableStats)) {
          console.log('✅ Dashboard stats loaded from Firebase:', data.customizableStats);
          setSelectedStats(data.customizableStats);
        } else {
          console.log('ℹ️ No custom stats found, using defaults');
        }
      } else {
        console.log('ℹ️ No user settings found, using defaults');
      }
    } catch (error) {
      console.error('❌ Error loading stats settings:', error);
    }
  };

  // Real metric cards using actual user data
  const metricCards = [
    {
      title: 'Total Profit',
      value: `$${displayMetrics.totalProfit.toLocaleString()}`,
      subtitle: `${displayMetrics.platformBreakdown?.stockx?.count || 0} StockX, ${displayMetrics.platformBreakdown?.manual?.count || 0} Manual`,
      icon: DollarSign,
      iconColor: 'text-green-600'
    },
    {
      title: 'Total Revenue',
      value: `$${displayMetrics.totalRevenue.toLocaleString()}`,
      subtitle: 'From all sales',
      icon: TrendingUp,
      iconColor: 'text-blue-600'
    },
    {
      title: 'Unsold Inventory',
      value: displayMetrics.inventoryCount.toString(),
      subtitle: 'Items in stock',
      icon: Package,
      iconColor: 'text-purple-600'
    },
    {
      title: 'Inventory Value',
      value: `$${displayMetrics.inventoryValue.toLocaleString()}`,
      subtitle: 'Estimated value',
      icon: ShoppingCart,
      iconColor: 'text-orange-600'
    },
    {
      title: 'Avg Profit/Sale',
      value: `$${Math.round(displayMetrics.avgProfitPerSale).toLocaleString()}`,
      subtitle: 'Per transaction',
      icon: BarChart3,
      iconColor: 'text-green-600'
    },
    {
      title: 'Total Spend',
      value: `$${displayMetrics.totalSpend.toLocaleString()}`,
      subtitle: 'Purchase costs',
      icon: Calculator,
      iconColor: 'text-red-600'
    }
  ];

  // Generate simple chart data from recent sales (showing profit by day)
  const chartData = displayMetrics.recentSales.length > 0 
    ? displayMetrics.recentSales.map((sale, index) => ({
        value: sale.profit || 0,
        date: sale.date || `Sale ${index + 1}`,
        items: sale.product || 'Unknown Product'
      }))
    : [
        { value: 0, date: 'No profit data yet', items: 'Start selling to see data' },
        // Mock data for demonstration
        { value: 150, date: '2024-01-10', items: 'Air Jordan 1 Retro' },
        { value: 320, date: '2024-01-11', items: 'Nike Dunk Low' },
        { value: 85, date: '2024-01-12', items: 'Yeezy 350 V2' },
        { value: 450, date: '2024-01-13', items: 'Travis Scott Jordan 1' },
        { value: 200, date: '2024-01-14', items: 'Off-White Air Max 90' },
        { value: 180, date: '2024-01-15', items: 'Fragment Design Jordan 1' },
        { value: 290, date: '2024-01-16', items: 'Union LA Jordan 1' }
      ];

  // Calculate chart metrics
  const totalProfit = chartData.reduce((sum, item) => sum + item.value, 0);
  const avgProfitPerDay = chartData.length > 0 ? Math.round(totalProfit / chartData.length) : 0;
  const peakDay = chartData.length > 0 ? Math.max(...chartData.map(d => d.value)) : 0;
  const peakDayItem = chartData.find(d => d.value === peakDay)?.items || '';

  // Precompute SVG point geometry once so the line + dots share identical coordinates.
  const maxProfitValue = Math.max(0, ...chartData.map((d) => d.value));
  // Add padding so the first/last dots and line caps never get clipped by the SVG viewBox.
  // Note: SVG circles use viewBox units for radius, which scale with width; keep padding conservative.
  const xPaddingPct = 6; // percent of the 0–100 viewBox
  const yPaddingPct = 6; // percent of the 0–100 viewBox
  const minBarHeightPct = 8; // keep tiny values visible/clickable
  const yUsablePct = 100 - 2 * yPaddingPct;

  const getBarHeightPct = (value: number) => {
    if (maxProfitValue <= 0) return minBarHeightPct;
    const raw = (value / maxProfitValue) * yUsablePct;
    return Math.min(yUsablePct, Math.max(raw, minBarHeightPct));
  };

  const formatYAxisValue = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `$${(value / 1000000).toFixed(1)}m`;
    if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${Math.round(value).toLocaleString()}`;
  };
  const profitPoints = chartData.map((bar, index) => {
    const barHeight = getBarHeightPct(bar.value);
    const denom = Math.max(1, chartData.length - 1);
    // If there's only 1 point, center it.
    const x =
      chartData.length === 1
        ? 50
        : xPaddingPct + (index / denom) * (100 - 2 * xPaddingPct);
    const y = 100 - yPaddingPct - barHeight;
    return { x, y, bar, index };
  });
  const profitPolylinePoints = profitPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const formatChartDate = (date: string) => {
    try {
      // Prefer stable local parsing for YYYY-MM-DD strings.
      const d = parseLocalDate(date);
      return {
        top: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        bottom: d.toLocaleDateString('en-US', { year: 'numeric' })
      };
    } catch {
      // Fallback: preserve prior behavior.
      const full = formatShortDate(date);
      const parts = full.split(',').map((s) => s.trim());
      if (parts.length >= 2) {
        return { top: parts.slice(0, -1).join(', '), bottom: parts[parts.length - 1] };
      }
      return { top: full, bottom: '' };
    }
  };

  // Calculate best flip percentage
  const bestFlipData = displayMetrics.recentSales.length > 0 
    ? displayMetrics.recentSales[0] // Already sorted by profit
    : { profit: 0, salePrice: 0, purchasePrice: 0 };
  
  const bestFlipPercent = bestFlipData.salePrice > 0 && bestFlipData.purchasePrice > 0
    ? Math.round((bestFlipData.profit / bestFlipData.purchasePrice) * 100)
    : 0;

  // Show loading state
  if (salesLoading || purchasesLoading) {
    const loadingLines = [
      salesLoading ? 'Loading sales data…' : null,
      purchasesLoading ? 'Loading purchases data…' : null,
    ].filter(Boolean) as string[];

    return (
      <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
        <div
          className={`rounded-2xl border ${currentTheme.colors.border} ${
            currentTheme.name === 'Neon' ? 'bg-gray-950/30' : 'bg-white'
          } min-h-[70vh] flex items-center justify-center`}
        >
          <div className="text-center px-6">
            <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600 mx-auto mb-6" />
            <p className={`text-xl font-semibold ${currentTheme.colors.textPrimary}`}>Loading your dashboard…</p>
            <p className={`mt-2 text-base ${currentTheme.colors.textSecondary}`}>
              {loadingLines.length ? loadingLines.join(' • ') : 'Loading…'}
            </p>
          </div>
        </div>
      </div>
    );
  }



  // Show empty state for new users (only if no Firebase user AND no site password auth)
  const siteUserId = typeof window !== 'undefined' ? localStorage.getItem('siteUserId') : null;
  if (!user && !siteUserId) {
    return (
      <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
              Welcome to Your Dashboard
            </h2>
            <p className={`${currentTheme.colors.textSecondary} mb-4`}>
              Sign in to start tracking your reselling business
            </p>
            
            {/* Add Sign In Button */}
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/login'}
                className={`inline-flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-cyan-500/25'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-purple-500/25'
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <h1 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mr-8`}>Dashboard</h1>
          
          {/* Connection State Indicator - Only show for Firebase users */}
          {user && (
            <div className="flex items-center space-x-2 text-sm">
              {connectionState.status === 'connected' && (
                <div className="flex items-center space-x-1 text-green-500">
                  <Wifi className="w-4 h-4" />
                  <span>Connected</span>
                </div>
              )}
              {connectionState.status === 'connecting' && (
                <div className="flex items-center space-x-1 text-yellow-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </div>
              )}
              {connectionState.status === 'error' && (
                <div className="flex items-center space-x-1 text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  <span>Error</span>
                </div>
              )}
              {connectionState.status === 'disconnected' && (
                <div className="flex items-center space-x-1 text-gray-500">
                  <WifiOff className="w-4 h-4" />
                  <span>Offline</span>
                </div>
              )}
            </div>
          )}
          <div className="relative flex items-center space-x-2">
            {timePeriods.map((period) => (
              <button
                key={period}
                onClick={() => handleTimePeriodChange(period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                  activeTimePeriod === period
                    ? currentTheme.name === 'Neon'
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white'
                      : `${currentTheme.colors.primary} text-white`
                    : currentTheme.name === 'Neon'
                      ? 'bg-white/10 backdrop-blur-sm text-gray-300 hover:bg-white/20 border border-white/10'
                      : `${currentTheme.colors.cardBackground} ${currentTheme.colors.textSecondary} hover:bg-gray-100 ${currentTheme.colors.border} border`
                }`}
              >
                {period === 'Custom Range' && <Calendar className="w-4 h-4 mr-1" />}
                {period === 'Custom Range' ? customRangeLabel : period}
              </button>
            ))}
          </div>
        </div>
        
        {/* Theme Selector Only */}
        <div className="flex items-center space-x-4">
          {/* Theme Number Selector */}
          <div className="flex items-center space-x-2">
            <span className={`text-sm font-medium ${currentTheme.colors.textSecondary} mr-2`}>Theme:</span>
            <div className="flex items-center space-x-1 p-1 rounded-lg bg-black/20 backdrop-blur-sm">
              {Object.values(themes).map((theme, index) => (
                <button
                  key={theme.name}
                  onClick={() => setTheme(theme.name)}
                  className={`w-8 h-8 rounded-md font-bold text-xs transition-all duration-200 ${
                    currentTheme.name === theme.name
                      ? 'bg-white text-black shadow-lg scale-110'
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom Date Range Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl border border-slate-700"
               style={{ 
                 background: showBackground ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#0f172a',
                 boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)'
               }}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white">Select Date Range</h2>
              <button
                onClick={() => setShowDatePicker(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="group">
                <label className="block text-sm font-semibold text-slate-300 mb-3 tracking-wide uppercase">
                  Start Date
                </label>
                <div className="relative">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Select start date"
                    variant="premium"
                  />
                </div>
              </div>
              
              <div className="group">
                <label className="block text-sm font-semibold text-slate-300 mb-3 tracking-wide uppercase">
                  End Date
                </label>
                <div className="relative">
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="Select end date"
                    variant="premium"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-8 mt-8"
                   style={{ borderTop: '1px solid rgba(148,163,184,0.2)' }}>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="px-6 py-3 text-slate-400 hover:text-white transition-all duration-300 hover:bg-white/5 rounded-xl font-medium tracking-wide"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomDateRange}
                  disabled={!startDate || !endDate}
                  className={`relative px-8 py-3 rounded-xl font-bold tracking-wide transition-all duration-300 transform hover:scale-105 ${
                    startDate && endDate
                      ? 'text-white shadow-xl hover:shadow-2xl'
                      : 'text-slate-500 cursor-not-allowed'
                  }`}
                  style={{
                    background: startDate && endDate 
                      ? 'linear-gradient(135deg, #f59e0b, #ef4444, #8b5cf6)' 
                      : 'rgba(148,163,184,0.2)',
                    boxShadow: startDate && endDate 
                      ? '0 12px 24px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.2)' 
                      : 'none'
                  }}
                >
                  Apply Range
                  {startDate && endDate && (
                    <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-20 transition-opacity"
                         style={{ background: 'linear-gradient(135deg, #ffffff, #ffffff)' }}></div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Data Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl border border-red-500/30">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Reset All Data</h2>
                  <p className="text-sm text-gray-400">This will wipe your account clean</p>
                </div>
              </div>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                This will permanently delete <strong>ALL</strong> of your data:
              </p>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                  <span>All purchases (Gmail and manual)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                  <span>All sales records</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                  <span>Profile information</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                  <span>Theme and settings</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                  <span>Email configurations</span>
                </li>
              </ul>
              <p className="text-amber-400 text-sm mt-4 font-medium">
                ⚠️ This action cannot be undone!
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-6 py-3 text-gray-400 hover:text-white transition-all duration-300 hover:bg-white/5 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAllData}
                disabled={resetLoading}
                className={`px-8 py-3 rounded-xl font-bold transition-all duration-300 ${
                  resetLoading
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                {resetLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Resetting...</span>
                  </div>
                ) : (
                  'Reset Everything'
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Customizable Stats */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Dashboard Metrics</h2>
        <div className="flex items-center gap-4">
          {/* Mock Data Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">
              {mockDataEnabled ? 'Mock Data' : 'Real Data'}
            </span>
            <button
              onClick={() => {
                setMockDataEnabled(!mockDataEnabled);
                showNotification(
                  mockDataEnabled ? 'Switched to real data' : 'Switched to mock data', 
                  'info'
                );
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                mockDataEnabled ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  mockDataEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          <button
            onClick={() => setShowStatsSettings(!showStatsSettings)}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Customize
          </button>
        </div>
      </div>

      {/* Stats Settings Modal */}
      {showStatsSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Customize Dashboard Metrics
              </h3>
              <button
                onClick={() => setShowStatsSettings(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select which metrics to display on your dashboard. Drag to reorder.
            </p>

            {/* Available Stats */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Available Metrics</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(availableStats).map((stat) => {
                  const Icon = stat.icon;
                  const isSelected = selectedStats.includes(stat.id);
                  
                  return (
                    <button
                      key={stat.id}
                      onClick={() => handleStatToggle(stat.id)}
                      className={`p-3 rounded-lg border-2 transition-all duration-200 flex items-center gap-3 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {stat.label}
                      </span>
                      {isSelected && (
                        <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Stats Preview */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Dashboard Preview ({selectedStats.length} metrics) - Drag to reorder
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {selectedStats.map((statId, index) => {
                  const stat = availableStats[statId as keyof typeof availableStats];
                  if (!stat) return null;
                  
                  const Icon = stat.icon;
                  const isDragging = draggedIndex === index;
                  
                  return (
                    <div
                      key={statId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-3 flex items-center gap-2 cursor-move transition-all duration-200 ${
                        isDragging ? 'opacity-50 scale-95' : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                    >
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {stat.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowStatsSettings(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await saveStatsSettings(selectedStats);
                  setShowStatsSettings(false);
                  showNotification('Dashboard metrics saved successfully!', 'success');
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {selectedStats.map((statId) => {
          const stat = availableStats[statId as keyof typeof availableStats];
          if (!stat) return null;
          
          const IconComponent = stat.icon;
          const isNeon = currentTheme.name === 'Neon';
          
          return (
            <div key={statId} className={`metric-card ${
              isNeon
                ? 'dark-neon-card neon-glow'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
            } rounded-lg p-6 shadow-sm`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className={`text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                    {stat.label}
                  </p>
                  <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-1`}>
                    {stat.getValue()}
                  </p>
                  <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                    {stat.getSubtitle()}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${
                  isNeon ? 'bg-white/10 backdrop-blur-sm' : 'bg-gray-50'
                }`}>
                  <IconComponent className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Chart Section */}
        <div className={`${
          currentTheme.name === 'Neon' 
            ? 'dark-neon-card neon-glow' 
            : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
        } rounded-lg p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
              Recent Profit Performance
            </h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600 font-semibold">
                {displayMetrics.recentSales.length > 0 ? 'Active' : 'No profit data yet'}
              </span>
            </div>
          </div>
          
          {/* Enhanced Bar Chart with Gradient Line */}
          <div className="relative h-64 mb-4">
            {/* Interactive Chart Header */}
            <div className="absolute top-2 right-2 text-xs text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded">
              Click bars to select
            </div>
            
            {/* Background Grid */}
            <div className="absolute inset-y-0 left-12 right-0 opacity-20">
              <div className="h-full flex flex-col justify-between">
                {[0, 25, 50, 75, 100].map((percent) => (
                  <div key={percent} className="border-t border-gray-300 dark:border-gray-600"></div>
                ))}
              </div>
            </div>

            {/* Y Axis */}
            <div className="absolute inset-y-0 left-0 w-12 flex flex-col justify-between pr-2">
              {[1, 0.75, 0.5, 0.25, 0].map((t) => {
                const v = Math.round(maxProfitValue * t);
                return (
                  <div
                    key={t}
                    className={`text-[10px] sm:text-xs tabular-nums ${currentTheme.colors.textSecondary} text-right`}
                  >
                    {formatYAxisValue(v)}
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-y-0 left-12 border-l border-gray-300/40 dark:border-gray-600/40" />
            
            {/* Chart Container */}
            <div className="relative h-full flex items-end justify-between space-x-1 pl-12 pr-2">
              {chartData.map((bar, index) => {
                const barHeight = getBarHeightPct(bar.value);
                const isHighProfit = bar.value > 300;
                const isMediumProfit = bar.value > 100 && bar.value <= 300;
                const isSelected = selectedBar === index;
                
                return (
                  <div key={index} className="group relative flex flex-col items-center flex-1">
                    <div className="relative w-full">
                      <div 
                        className={`w-full rounded-t-lg shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer relative overflow-hidden ${
                          isSelected
                            ? 'ring-4 ring-blue-400 ring-opacity-50 scale-105'
                            : ''
                        } ${
                          isHighProfit 
                            ? 'bg-gradient-to-t from-green-600 to-green-400 hover:from-green-500 hover:to-green-300' 
                            : isMediumProfit 
                            ? 'bg-gradient-to-t from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300'
                            : 'bg-gradient-to-t from-gray-500 to-gray-400 hover:from-gray-400 hover:to-gray-300'
                        }`}
                        style={{ height: `${barHeight}%` }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Chart bar clicked:', index, bar.items);
                          setSelectedBar(selectedBar === index ? null : index);
                        }}
                      >
                        {/* Animated shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 transform -skew-x-12 animate-pulse"></div>
                        
                        {/* Click indicator */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-white/20 rounded-t-lg flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          </div>
                        )}
                        
                        {/* Hover value display */}
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs font-bold text-gray-700 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-lg">
                          ${bar.value}
                        </div>
                      </div>
                      
                      {/* Enhanced Tooltip */}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-black/95 text-white text-xs px-4 py-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-20 border border-gray-600">
                        <div className="font-semibold text-white">{bar.items}</div>
                        <div className="text-gray-300 text-xs">{bar.date}</div>
                        <div className="text-green-400 font-bold">${bar.value} profit</div>
                        <div className="text-gray-400 text-xs mt-1">Click to select</div>
                      </div>
                    </div>
                    
                    {/* Date label */}
                    <div className={`mt-2 w-full text-center ${
                      isSelected ? 'font-bold text-blue-400' : ''
                    }`}>
                      {(() => {
                        const d = formatChartDate(bar.date);
                        return (
                          <div className={`leading-tight ${currentTheme.colors.textSecondary}`}>
                            <div className="text-[10px] sm:text-xs">{d.top}</div>
                            {d.bottom ? (
                              <div className="text-[10px] sm:text-xs opacity-70">{d.bottom}</div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Gradient line overlay + perfectly aligned SVG dots (same coordinates) */}
            <div ref={profitChartOverlayRef} className="absolute inset-0 pl-12 pr-2">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="profitGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                <polyline
                  fill="none"
                  stroke="url(#profitGradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={profitPolylinePoints}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
                {profitPoints.map(({ x, y, bar, index }) => {
                  const isSelected = selectedBar === index;
                  // With preserveAspectRatio="none", the SVG is stretched non-uniformly (x != y).
                  // Compensate by pre-distorting y radii so dots render as true circles on screen.
                  const ar = profitChartAspectRatio || 1;
                  const outerRx = isSelected ? 1.7 : 1.5;
                  const outerRy = outerRx * ar;
                  const innerRx = isSelected ? 0.75 : 0.65;
                  const innerRy = innerRx * ar;
                  return (
                    <g
                      key={`dot-${index}`}
                      style={{ pointerEvents: 'all', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Chart dot clicked:', index, bar.items, bar.value);
                        setSelectedBar(selectedBar === index ? null : index);
                      }}
                    >
                      {/* Outer ring */}
                      <ellipse
                        cx={x}
                        cy={y}
                        rx={outerRx}
                        ry={outerRy}
                        fill={isSelected ? '#3b82f6' : '#ffffff'}
                        stroke={isSelected ? '#93c5fd' : '#3b82f6'}
                        strokeWidth={isSelected ? 1.4 : 1.2}
                        vectorEffect="non-scaling-stroke"
                      />
                      {/* Inner dot */}
                      <ellipse
                        cx={x}
                        cy={y}
                        rx={innerRx}
                        ry={innerRy}
                        fill={isSelected ? '#ffffff' : '#3b82f6'}
                        vectorEffect="non-scaling-stroke"
                      />
                      <title>{`${bar.items} • ${bar.date} • $${bar.value} profit`}</title>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Selected Bar Details */}
          {selectedBar !== null && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                    Selected: {chartData[selectedBar]?.items}
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {chartData[selectedBar]?.date} • ${chartData[selectedBar]?.value} profit
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBar(null)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Peak Profit</div>
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>${peakDay}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{peakDayItem}</div>
            </div>
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Average</div>
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>${avgProfitPerDay}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>per day</div>
            </div>
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Best ROI</div>
              <div className="text-sm font-semibold text-green-600">{bestFlipPercent}%</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>return</div>
            </div>
          </div>
        </div>

        {/* Top Flips Section */}
        <div className={`${
          currentTheme.name === 'Neon' 
            ? 'dark-neon-card neon-glow' 
            : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
        } rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-6`}>
            Top Profit Performers
          </h3>
          
          {displayMetrics.recentSales.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className={`${currentTheme.colors.textSecondary} mb-2`}>No profit data yet</p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Your top profit performers will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayMetrics.recentSales.map((flip, index) => (
                <div key={index} className={`p-4 rounded-lg ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-white/5 backdrop-blur-sm border border-white/10' 
                    : 'bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                          #{flip.orderNumber ? formatOrderNumberForDisplay(flip.orderNumber) : `Sale ${index + 1}`}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          currentTheme.name === 'Neon' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {flip.market || 'Manual'}
                        </span>
                      </div>
                      <p className={`font-semibold ${currentTheme.colors.textPrimary} mt-1`}>
                        {flip.product || 'Product Name'}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-sm">
                        <span className={`${currentTheme.colors.textSecondary}`}>
                          Sale: ${flip.salePrice?.toLocaleString() || '0'}
                        </span>
                        <span className={`${currentTheme.colors.textSecondary}`}>
                          Cost: ${flip.purchasePrice?.toLocaleString() || '0'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">
                        ${flip.profit?.toLocaleString() || '0'}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                        profit
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-2 duration-300">
          <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg border-2 p-4 max-w-sm ${
            notification.type === 'success' 
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
              : notification.type === 'error'
              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
              : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${
                notification.type === 'success' 
                  ? 'bg-green-500'
                  : notification.type === 'error'
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}></div>
              <span className={`font-medium ${
                notification.type === 'success' 
                  ? 'text-green-800 dark:text-green-200'
                  : notification.type === 'error'
                  ? 'text-red-800 dark:text-red-200'
                  : 'text-blue-800 dark:text-blue-200'
              }`}>
                {notification.message}
              </span>
              <button
                onClick={() => setNotification(prev => ({ ...prev, show: false }))}
                className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard; 