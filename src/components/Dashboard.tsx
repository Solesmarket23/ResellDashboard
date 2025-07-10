'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Calculator, Calendar, X, Palette, Trash2, RotateCcw, RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { saveUserDashboardSettings, getUserDashboardSettings, clearAllUserData } from '../lib/firebase/userDataUtils';
import { getDocuments } from '../lib/firebase/firebaseUtils';
import { useSales } from '../lib/hooks/useSales';
import { formatOrderNumberForDisplay } from '../lib/utils/orderNumberUtils';
import DatePicker from './DatePicker';
import MarketAlerts from './MarketAlerts';

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
    recentSales: []
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
  const loadPurchasesData = async () => {
    if (!user) {
      console.log('📊 Dashboard: No user found, skipping purchases load');
      setPurchasesLoading(false);
      return;
    }

    try {
      console.log('📊 Dashboard: Starting purchases load for user:', user.uid);
      setPurchasesLoading(true);
      
      // Load purchases from Firebase
      console.log('📊 Dashboard: Loading purchases...');
      const allPurchases = await getDocuments('purchases');
      const userPurchasesData = allPurchases.filter(
        (purchase: any) => purchase.userId === user.uid
      );
      console.log('📊 Dashboard: Found', userPurchasesData.length, 'purchases');
      
      setUserPurchases(userPurchasesData);
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
      calculateRealMetrics(userPurchases, sales);
    }
  }, [sales, userPurchases, salesLoading, purchasesLoading]);



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

    // Refresh purchases data every 30 seconds when user is active
    const interval = setInterval(() => {
      // Only refresh if the document is visible (user is actively using the app)
      if (!document.hidden) {
        console.log('🔄 Auto-refresh triggered (30s interval) - refreshing purchases');
        loadPurchasesData();
      }
    }, 30000); // 30 seconds

    return () => {
      console.log('📡 Dashboard: Cleaning up interval');
      clearInterval(interval);
    };
  }, [user]);

  // Calculate real metrics from user data
  const calculateRealMetrics = (purchases: any[], sales: any[]) => {
    console.log('📊 Dashboard: Calculating metrics with', purchases.length, 'purchases and', sales.length, 'sales');
    
    // Calculate total spend from purchases
    const totalSpend = purchases.reduce((sum, purchase) => {
      const price = parseFloat(purchase.price?.replace(/[$,]/g, '')) || 0;
      return sum + price;
    }, 0);

    // Calculate revenue and profit from sales
    const totalRevenue = sales.reduce((sum, sale) => sum + (sale.salePrice || 0), 0);
    const totalProfit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0);
    
    // Calculate inventory (purchases minus sales)
    const inventoryCount = Math.max(0, purchases.length - sales.length);
    const inventoryValue = Math.max(0, totalSpend - totalRevenue);
    
    // Calculate average profit per sale
    const avgProfitPerSale = sales.length > 0 ? totalProfit / sales.length : 0;
    
    // Get recent sales for flip data
    const recentSales = sales
      .filter(sale => sale.profit && sale.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const newMetrics = {
      totalProfit,
      totalRevenue,
      totalSpend,
      inventoryCount,
      inventoryValue,
      avgProfitPerSale,
      recentSales
    };

    console.log('📊 Dashboard: New metrics calculated:', newMetrics);
    setRealMetrics(newMetrics);
  };

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
  
  // Real metric cards using actual user data
  const metricCards = [
    {
      title: 'Total Profit',
      value: `$${realMetrics.totalProfit.toLocaleString()}`,
      subtitle: 'All time',
      icon: DollarSign,
      iconColor: 'text-green-600'
    },
    {
      title: 'Total Revenue',
      value: `$${realMetrics.totalRevenue.toLocaleString()}`,
      subtitle: 'From sales',
      icon: TrendingUp,
      iconColor: 'text-blue-600'
    },
    {
      title: 'Unsold Inventory',
      value: realMetrics.inventoryCount.toString(),
      subtitle: 'Items in stock',
      icon: Package,
      iconColor: 'text-purple-600'
    },
    {
      title: 'Inventory Value',
      value: `$${realMetrics.inventoryValue.toLocaleString()}`,
      subtitle: 'Estimated value',
      icon: ShoppingCart,
      iconColor: 'text-orange-600'
    },
    {
      title: 'Avg Profit/Sale',
      value: `$${Math.round(realMetrics.avgProfitPerSale).toLocaleString()}`,
      subtitle: 'Per transaction',
      icon: BarChart3,
      iconColor: 'text-green-600'
    },
    {
      title: 'Total Spend',
      value: `$${realMetrics.totalSpend.toLocaleString()}`,
      subtitle: 'Purchase costs',
      icon: Calculator,
      iconColor: 'text-red-600'
    }
  ];

  // Generate simple chart data from recent sales
  const chartData = realMetrics.recentSales.length > 0 
    ? realMetrics.recentSales.map((sale, index) => ({
        value: sale.profit || 0,
        date: sale.date || `Sale ${index + 1}`,
        items: sale.product || 'Unknown Product'
      }))
    : [{ value: 0, date: 'No sales yet', items: 'Start selling to see data' }];

  // Calculate chart metrics
  const totalProfit = chartData.reduce((sum, item) => sum + item.value, 0);
  const avgProfitPerDay = chartData.length > 0 ? Math.round(totalProfit / chartData.length) : 0;
  const peakDay = chartData.length > 0 ? Math.max(...chartData.map(d => d.value)) : 0;
  const peakDayItem = chartData.find(d => d.value === peakDay)?.items || '';

  // Calculate best flip percentage
  const bestFlipData = realMetrics.recentSales.length > 0 
    ? realMetrics.recentSales[0] // Already sorted by profit
    : { profit: 0, salePrice: 0, purchasePrice: 0 };
  
  const bestFlipPercent = bestFlipData.salePrice > 0 && bestFlipData.purchasePrice > 0
    ? Math.round((bestFlipData.profit / bestFlipData.purchasePrice) * 100)
    : 0;

  // Show loading state
  if (salesLoading || purchasesLoading) {
    return (
      <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`${currentTheme.colors.textSecondary}`}>Loading your dashboard...</p>
            <div className="mt-4 text-sm text-gray-500">
              {salesLoading && "Loading sales data..."}
              {purchasesLoading && "Loading purchases data..."}
            </div>
          </div>
        </div>
      </div>
    );
  }



  // Show empty state for new users
  if (!user) {
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
          
          {/* Connection State Indicator */}
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
        
        {/* Refresh, Reset Data & Theme Selector */}
        <div className="flex items-center space-x-4">
          {/* Refresh Data Button */}
          <button
            onClick={() => {
              console.log('🔄 Manual refresh button clicked');
              loadPurchasesData();
              refreshSales();
            }}
            disabled={salesLoading || purchasesLoading}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentTheme.name === 'Neon'
                ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 disabled:opacity-50'
                : 'bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 disabled:opacity-50'
            }`}
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-4 h-4 ${(salesLoading || purchasesLoading) ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Test Event Button - Remove this after testing */}
          <button
            onClick={() => {
              console.log('🧪 Test: Dispatching salesDataChanged event manually');
              window.dispatchEvent(new CustomEvent('salesDataChanged'));
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentTheme.name === 'Neon'
                ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30'
                : 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700 border border-yellow-300'
            }`}
            title="Test event communication"
          >
            <span>🧪</span>
            <span>Test Event</span>
          </button>

          {/* Reset All Data Button */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentTheme.name === 'Neon'
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                : 'bg-red-100 hover:bg-red-200 text-red-700 border border-red-300'
            }`}
            title="Reset all your data to start fresh"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Data</span>
          </button>

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

      {/* Debug Info Section - Remove in production */}
      <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold">Debug Info</span>
          <div className="flex items-center space-x-4">
            <span>Sales: {sales.length}</span>
            <span>Purchases: {userPurchases.length}</span>
            <span>Connection: {connectionState.status}</span>
            {connectionState.lastSync && (
              <span>Last sync: {connectionState.lastSync.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4 text-xs text-gray-600">
          <span>From cache: {connectionState.fromCache ? 'Yes' : 'No'}</span>
          <span>Pending writes: {connectionState.hasPendingWrites ? 'Yes' : 'No'}</span>
          {salesError && <span className="text-red-500">Error: {salesError}</span>}
          <button
            onClick={refreshSales}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            Force Refresh Sales
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {metricCards.map((card, index) => {
          const IconComponent = card.icon;
          const isNeon = currentTheme.name === 'Neon';
          
          return (
            <div key={index} className={`metric-card ${
              isNeon
                ? 'dark-neon-card neon-glow'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
            } rounded-lg p-6 shadow-sm`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className={`text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                    {card.title}
                  </p>
                  <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-1`}>
                    {card.value}
                  </p>
                  <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                    {card.subtitle}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${
                  isNeon ? 'bg-white/10 backdrop-blur-sm' : 'bg-gray-50'
                }`}>
                  <IconComponent className={`w-6 h-6 ${card.iconColor}`} />
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
              Recent Sales Performance
            </h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600 font-semibold">
                {realMetrics.recentSales.length > 0 ? 'Active' : 'No sales yet'}
              </span>
            </div>
          </div>
          
          {/* Simple Bar Chart */}
          <div className="flex items-end justify-between space-x-2 h-64 mb-4">
            {chartData.map((bar, index) => {
              const maxValue = Math.max(...chartData.map(d => d.value));
              const barHeight = maxValue > 0 ? Math.max((bar.value / maxValue) * 100, 8) : 8;
              const barColor = bar.value > 300 ? 'bg-green-500' : bar.value > 100 ? 'bg-blue-500' : 'bg-gray-500';
              
              return (
                <div key={index} className="group relative flex flex-col items-center">
                  <div className="relative">
                    <div 
                      className={`w-10 ${barColor} rounded-t-lg shadow-lg transition-all duration-300 hover:scale-110 cursor-pointer relative overflow-hidden`}
                      style={{ height: `${barHeight}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 transform -skew-x-12 animate-pulse"></div>
                      
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${bar.value}
                      </div>
                    </div>
                    
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3 bg-black/90 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      <div className="font-semibold">{bar.items}</div>
                      <div className="text-gray-300">{bar.date}</div>
                      <div className="text-green-400">${bar.value} profit</div>
                    </div>
                  </div>
                  
                  <div className={`text-xs ${currentTheme.colors.textSecondary} mt-2 text-center`}>
                    {bar.date}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Peak Sale</div>
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>${peakDay}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{peakDayItem}</div>
            </div>
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Average</div>
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>${avgProfitPerDay}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>per sale</div>
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
            Top Profitable Sales
          </h3>
          
          {realMetrics.recentSales.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className={`${currentTheme.colors.textSecondary} mb-2`}>No sales recorded yet</p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Your top profitable sales will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {realMetrics.recentSales.map((flip, index) => (
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

      {/* Market Alerts Component */}
      <div className="mt-8">
        <MarketAlerts />
      </div>
    </div>
  );
};

export default Dashboard; 