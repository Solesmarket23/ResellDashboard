'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Calculator, Calendar, X, Palette, Trash2, RotateCcw } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { saveUserDashboardSettings, getUserDashboardSettings, getUserSales, clearAllUserData } from '../lib/firebase/userDataUtils';
import { getDocuments } from '../lib/firebase/firebaseUtils';
import DatePicker from './DatePicker';
import MarketAlerts from './MarketAlerts';

const Dashboard = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const { user } = useAuth();
  const [activeTimePeriod, setActiveTimePeriod] = useState('This Month');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customRangeLabel, setCustomRangeLabel] = useState('Custom Range');
  const [showBackground, setShowBackground] = useState(true);
  
  // Real user data state
  const [userPurchases, setUserPurchases] = useState<any[]>([]);
  const [userSales, setUserSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
      setUserSales([]);
      setRealMetrics({
        totalProfit: 0,
        totalRevenue: 0,
        totalSpend: 0,
        inventoryCount: 0,
        inventoryValue: 0,
        avgProfitPerSale: 0,
        recentSales: []
      });
      
      // Reset theme to default
      setTheme('Default');
      
      // Reset time period
      setActiveTimePeriod('This Month');
      
      console.log('🎉 Account successfully reset to fresh state!');
      alert(`🎉 Account Reset Complete!\n\nCleared:\n• ${result.cleared.purchases} purchases\n• ${result.cleared.themes} theme settings\n• ${result.cleared.profiles} profile data\n• ${result.cleared.emailConfigs} email configs\n• All sales and dashboard settings\n\nYour account is now fresh!`);
      
    } catch (error) {
      console.error('❌ Error resetting account:', error);
      alert('❌ Error resetting account. Please try again.');
    } finally {
      setResetLoading(false);
      setShowResetConfirm(false);
    }
  };

  // Load real user data
  useEffect(() => {
    const loadUserData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Load purchases from Firebase
        const allPurchases = await getDocuments('purchases');
        const userPurchasesData = allPurchases.filter(
          (purchase: any) => purchase.userId === user.uid
        );
        
        // Load sales from Firebase
        const userSalesData = await getUserSales(user.uid);
        
        setUserPurchases(userPurchasesData);
        setUserSales(userSalesData);
        
        // Calculate real metrics
        calculateRealMetrics(userPurchasesData, userSalesData);
        
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user]);

  // Calculate real metrics from user data
  const calculateRealMetrics = (purchases: any[], sales: any[]) => {
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

    setRealMetrics({
      totalProfit,
      totalRevenue,
      totalSpend,
      inventoryCount,
      inventoryValue,
      avgProfitPerSale,
      recentSales
    });
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
  if (loading) {
    return (
      <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`${currentTheme.colors.textSecondary}`}>Loading your dashboard...</p>
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
        
        {/* Reset Data & Theme Selector */}
        <div className="flex items-center space-x-4">
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
                          #{flip.orderNumber || `Sale ${index + 1}`}
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