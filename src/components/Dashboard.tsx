'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Calculator, Calendar, X, Palette } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { saveUserDashboardSettings, getUserDashboardSettings } from '../lib/firebase/userDataUtils';
import DatePicker from './DatePicker';
import MarketAlerts from './MarketAlerts';

const Dashboard = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const { user } = useAuth();
  const [activeTimePeriod, setActiveTimePeriod] = useState('This Month');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customRangeLabel, setCustomRangeLabel] = useState('Custom Range');
  const [showBackground, setShowBackground] = useState(true);
  
  const timePeriods = ['Today', 'Yesterday', 'This Month', 'This Year', 'Custom Range'];

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
  
  // Calculate realistic profits based on actual sales data
  const dailyProfitData = [
    { value: 125, date: 'Jun 19', items: 'Jordan 1 High', purchasePrice: 200, salePrice: 325, fees: 25 },
    { value: 280, date: 'Jun 20', items: 'Dunk Low Panda', purchasePrice: 120, salePrice: 425, fees: 25 },
    { value: 95, date: 'Jun 21', items: 'Yeezy 350', purchasePrice: 180, salePrice: 300, fees: 25 },
    { value: 340, date: 'Jun 22', items: 'Travis Scott x Fragment', purchasePrice: 450, salePrice: 815, fees: 25 },
    { value: 520, date: 'Jun 23', items: 'Off-White Chicago', purchasePrice: 800, salePrice: 1345, fees: 25 },
    { value: 180, date: 'Jun 24', items: 'New Balance 550', purchasePrice: 140, salePrice: 345, fees: 25 },
    { value: 720, date: 'Jun 25', items: 'Dior Jordan 1', purchasePrice: 1200, salePrice: 1945, fees: 25 }
  ];
  
  // Calculate totals from daily data
  const totalProfit = dailyProfitData.reduce((sum, day) => sum + day.value, 0);
  const avgProfitPerDay = Math.round(totalProfit / dailyProfitData.length);
  const peakDay = Math.max(...dailyProfitData.map(d => d.value));
  const peakDayItem = dailyProfitData.find(d => d.value === peakDay)?.items || '';
  
  // Calculate best flip percentage
  const bestFlipData = dailyProfitData.reduce((best, current) => {
    const currentPercent = ((current.salePrice - current.fees - current.purchasePrice) / current.purchasePrice) * 100;
    const bestPercent = ((best.salePrice - best.fees - best.purchasePrice) / best.purchasePrice) * 100;
    return currentPercent > bestPercent ? current : best;
  }, dailyProfitData[0]);
  
  const bestFlipPercent = Math.round(((bestFlipData.salePrice - bestFlipData.fees - bestFlipData.purchasePrice) / bestFlipData.purchasePrice) * 100);

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
  
  const metricCards = [
    {
      title: 'Total Profit',
      value: `$${totalProfit.toLocaleString()}`,
      subtitle: 'Selected period',
      icon: DollarSign,
      iconColor: 'text-green-600'
    },
    {
      title: 'This Month',
      value: `$${totalProfit.toLocaleString()}`,
      subtitle: 'Monthly profit',
      icon: TrendingUp,
      iconColor: 'text-blue-600'
    },
    {
      title: 'Unsold Inventory',
      value: '468',
      subtitle: 'Items in stock',
      icon: Package,
      iconColor: 'text-purple-600'
    },
    {
      title: 'Inventory Value',
      value: '$89,492.63',
      subtitle: 'Estimated value',
      icon: ShoppingCart,
      iconColor: 'text-orange-600'
    },
    {
      title: 'Avg Profit/Sale',
      value: `$${avgProfitPerDay}`,
      subtitle: 'Per transaction',
      icon: BarChart3,
      iconColor: 'text-green-600'
    },
    {
      title: 'Total Spend',
      value: '$89,492.63',
      subtitle: 'Purchase costs',
      icon: Calculator,
      iconColor: 'text-red-600'
    }
  ];

  // Top 5 Most Profitable Flips data
  const topFlips = [
    {
      id: '1598',
      platform: 'StockX',
      product: 'Dior Jordan 1 High',
      orderPrice: 1945.00,
      purchasePrice: 1200.00,
      profit: 720.00
    },
    {
      id: '1597',
      platform: 'StockX',
      product: 'Off-White Chicago',
      orderPrice: 1345.00,
      purchasePrice: 800.00,
      profit: 520.00
    },
    {
      id: '1596',
      platform: 'GOAT',
      product: 'Travis Scott Fragment',
      orderPrice: 815.00,
      purchasePrice: 450.00,
      profit: 340.00
    },
    {
      id: '1595',
      platform: 'StockX',
      product: 'Dunk Low Panda',
      orderPrice: 425.00,
      purchasePrice: 120.00,
      profit: 280.00
    },
    {
      id: '1594',
      platform: 'GOAT',
      product: 'New Balance 550',
      orderPrice: 345.00,
      purchasePrice: 140.00,
      profit: 180.00
    }
  ];

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
        
        {/* Theme Number Selector */}
        <div className="flex items-center space-x-2">
          <span className={`text-sm font-medium ${currentTheme.colors.textSecondary} mr-2`}>Theme:</span>
          <div className="flex items-center space-x-1 p-1 rounded-lg bg-black/20 backdrop-blur-sm">
            {Object.values(themes).map((theme, index) => (
              <button
                key={theme.name}
                onClick={() => setTheme(theme.name)}
                className={`w-8 h-8 rounded-md text-sm font-bold transition-all duration-200 ${
                  currentTheme.name === theme.name 
                    ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg scale-105' 
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {index + 1}
              </button>
            ))}
            <button className="w-8 h-8 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200">
              <span className="text-xs">⚙️</span>
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Range Modal */}
      {showDatePicker && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 ${showBackground ? 'backdrop-blur-md' : ''}`}
             style={{
               background: showBackground 
                 ? 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, rgba(15,23,42,0.95) 100%)'
                 : 'transparent'
             }}>
           
          <div className="relative max-w-lg w-full mx-4 overflow-hidden"
               style={{
                 background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.98))',
                 borderRadius: '24px',
                 border: '1px solid rgba(148,163,184,0.3)',
                 boxShadow: '0 32px 64px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(148,163,184,0.1), inset 0 1px 0 rgba(255,255,255,0.1)'
               }}>
             
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-full h-full"
                   style={{
                     background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
                   }}></div>
            </div>
             
            <div className="relative z-10 p-8">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="relative p-3 rounded-xl"
                       style={{
                         background: 'linear-gradient(135deg, #f59e0b, #ef4444, #8b5cf6)',
                         boxShadow: '0 8px 16px rgba(139,92,246,0.3)'
                       }}>
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Custom Range</h3>
                    <p className="text-sm text-slate-400 font-medium">Select your date period</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="p-3 text-slate-400 hover:text-white transition-all duration-200 hover:bg-white/10 rounded-xl border border-slate-600/30 hover:border-slate-500/50"
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Chart */}
        <div className={`${
          currentTheme.name === 'Neon'
            ? 'dark-neon-card neon-glow'
            : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
        } rounded-lg p-6 shadow-sm`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <BarChart3 className={`w-5 h-5 ${currentTheme.colors.textSecondary} mr-2`} />
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Profit Chart</h3>
            </div>
            <div className="text-right">
              <div className={`text-sm ${currentTheme.colors.textSecondary}`}>Total Growth</div>
              <div className="text-lg font-bold text-green-600">+${totalProfit.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Profit Over Time</p>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 ${currentTheme.colors.primary} rounded-full mr-2`}></div>
                  <span className={`text-xs ${currentTheme.colors.textSecondary}`}>Daily Profit</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-300 rounded-full mr-2"></div>
                  <span className={`text-xs ${currentTheme.colors.textSecondary}`}>Baseline</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Chart Representation */}
          <div className="relative h-64 bg-gradient-to-br from-blue-50 via-white to-green-50 rounded-lg p-4 border border-gray-100 shadow-inner">
            {/* Grid lines */}
            <div className="absolute inset-4 flex flex-col justify-between">
              {[800, 600, 400, 200, 0].map((value, index) => (
                <div key={value} className="flex items-center">
                  <span className="text-xs text-gray-500 w-10 font-medium">${value}</span>
                  <div className="flex-1 h-px bg-gray-200 ml-2 opacity-50"></div>
                </div>
              ))}
            </div>
            
            {/* Chart bars with enhanced styling */}
            <div className="absolute bottom-4 left-14 right-4 flex items-end justify-between h-48">
              {dailyProfitData.map((bar, index) => {
                const barHeight = Math.max((bar.value / 800) * 100, 8); // Minimum 8% height for visibility
                const barColor = bar.value > 500 ? 'bg-green-500' : bar.value > 300 ? 'bg-blue-500' : 'bg-purple-500';
                
                return (
                  <div key={index} className="group relative flex flex-col items-center">
                    {/* Bar with gradient and shadow */}
                    <div className="relative">
                      <div 
                        className={`w-10 ${barColor} rounded-t-lg shadow-lg transition-all duration-300 hover:scale-110 cursor-pointer relative overflow-hidden`}
                        style={{ height: `${barHeight}%` }}
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 transform -skew-x-12 animate-pulse"></div>
                        
                        {/* Value label on top of bar */}
                        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          ${bar.value}
                        </div>
                      </div>
                      
                      {/* Enhanced hover tooltip */}
                      <div className="absolute -top-24 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs py-3 px-4 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-20 shadow-xl">
                        <div className="font-bold text-green-400">${bar.value} profit</div>
                        <div className="text-gray-200 font-medium">{bar.items}</div>
                        <div className="text-gray-400 text-xs mt-1">
                          Sale: ${bar.salePrice} | Cost: ${bar.purchasePrice}
                        </div>
                        <div className="text-gray-400 text-xs">
                          ROI: {Math.round(((bar.salePrice - bar.purchasePrice) / bar.purchasePrice) * 100)}%
                        </div>
                        {/* Tooltip arrow */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                    
                    <span className="text-xs text-gray-600 mt-3 font-medium">{bar.date.split(' ')[1]}</span>
                  </div>
                );
              })}
            </div>

            {/* Enhanced trend line with dynamic path */}
            <div className="absolute bottom-4 left-14 right-4 h-48 pointer-events-none">
              <svg className="w-full h-full">
                <defs>
                  <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8"/>
                    <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.6"/>
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.8"/>
                  </linearGradient>
                </defs>
                <path
                  d={`M ${20} ${192 - (dailyProfitData[0].value / 800) * 192} 
                      L ${80} ${192 - (dailyProfitData[1].value / 800) * 192} 
                      L ${140} ${192 - (dailyProfitData[2].value / 800) * 192} 
                      L ${200} ${192 - (dailyProfitData[3].value / 800) * 192} 
                      L ${260} ${192 - (dailyProfitData[4].value / 800) * 192} 
                      L ${320} ${192 - (dailyProfitData[5].value / 800) * 192} 
                      L ${380} ${192 - (dailyProfitData[6].value / 800) * 192}`}
                  stroke="url(#trendGradient)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-sm"
                />
                {/* Data points */}
                {dailyProfitData.map((point, index) => (
                  <circle
                    key={index}
                    cx={20 + index * 60}
                    cy={192 - (point.value / 800) * 192}
                    r="4"
                    fill="white"
                    stroke="url(#trendGradient)"
                    strokeWidth="2"
                    className="drop-shadow-sm"
                  />
                ))}
              </svg>
            </div>

            {/* Performance indicator */}
            <div className="absolute top-4 right-4 flex items-center space-x-2">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></div>
                <span className="text-xs text-green-600 font-semibold">Trending Up</span>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Peak Day</div>
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>${peakDay}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{peakDayItem}</div>
            </div>
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Daily Average</div>
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>${avgProfitPerDay}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>7-day period</div>
            </div>
            <div className="text-center">
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Best Flip</div>
              <div className="text-sm font-semibold text-green-600">{bestFlipPercent}%</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{bestFlipData.items}</div>
            </div>
          </div>
        </div>

        {/* Top 5 Most Profitable Flips */}
        <div className={`${
          currentTheme.name === 'Neon'
            ? 'dark-neon-card neon-glow'
            : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
        } rounded-lg p-6 shadow-sm`}>
          <div className="flex items-center mb-6">
            <TrendingUp className={`w-5 h-5 ${currentTheme.colors.textSecondary} mr-2`} />
            <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Top 5 Most Profitable Flips</h3>
          </div>

          <div className="space-y-4">
            {topFlips.map((flip) => (
              <div key={flip.id} className={`border-b ${currentTheme.colors.border} pb-4 last:border-b-0 last:pb-0`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{flip.product}</h4>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Sale #{flip.id} • {flip.platform}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">${flip.profit.toFixed(2)}</div>
                    <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                      {Math.round(((flip.orderPrice - flip.purchasePrice) / flip.purchasePrice) * 100)}% ROI
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={`${currentTheme.colors.textSecondary}`}>
                    Sale ${flip.orderPrice.toFixed(2)} → Cost ${flip.purchasePrice.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Market Alerts Section */}
      <div className="mt-8">
        <MarketAlerts />
      </div>
    </div>
  );
};

export default Dashboard; 