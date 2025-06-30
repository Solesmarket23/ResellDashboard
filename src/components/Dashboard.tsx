'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Calculator, Calendar, X, Palette, Crown, Zap, Sparkles } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import DatePicker from './DatePicker';

const Dashboard = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const isPremium = currentTheme.name === 'Premium';
  const isLight = currentTheme.name === 'Light';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme
  
  const [activeTimePeriod, setActiveTimePeriod] = useState('This Month');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customRangeLabel, setCustomRangeLabel] = useState('Custom Range');
  const [showBackground, setShowBackground] = useState(true);
  
  const timePeriods = ['Today', 'Yesterday', 'This Month', 'This Year', 'Custom Range'];
  
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
      iconColor: isPremium ? 'text-green-400' : 'text-green-600',
      bgGradient: 'from-green-500/20 to-emerald-500/20',
      isPremium: true
    },
    {
      title: 'This Month',
      value: `$${totalProfit.toLocaleString()}`,
      subtitle: 'Monthly profit',
      icon: TrendingUp,
      iconColor: isPremium ? 'text-blue-400' : 'text-blue-600',
      bgGradient: 'from-blue-500/20 to-cyan-500/20'
    },
    {
      title: 'Unsold Inventory',
      value: '468',
      subtitle: 'Items in stock',
      icon: Package,
      iconColor: isPremium ? 'text-purple-400' : 'text-purple-600',
      bgGradient: 'from-purple-500/20 to-violet-500/20'
    },
    {
      title: 'Inventory Value',
      value: '$89,492.63',
      subtitle: 'Estimated value',
      icon: ShoppingCart,
      iconColor: isPremium ? 'text-orange-400' : 'text-orange-600',
      bgGradient: 'from-orange-500/20 to-amber-500/20'
    },
    {
      title: 'Avg Profit/Sale',
      value: `$${avgProfitPerDay}`,
      subtitle: 'Per transaction',
      icon: BarChart3,
      iconColor: isPremium ? 'text-green-400' : 'text-green-600',
      bgGradient: 'from-green-500/20 to-teal-500/20'
    },
    {
      title: 'Total Spend',
      value: '$89,492.63',
      subtitle: 'Purchase costs',
      icon: Calculator,
      iconColor: isPremium ? 'text-red-400' : 'text-red-600',
      bgGradient: 'from-red-500/20 to-pink-500/20'
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
      profit: 720.00,
      isPremium: true
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
    <div className={`flex-1 p-8 ${
      isRevolutionary
        ? 'ml-80 bg-slate-900'
        : isPremium 
          ? 'ml-80 bg-slate-900' 
          : isLight 
            ? 'ml-80 bg-gray-50' 
            : 'ml-80 bg-gray-900'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <h1 className={`text-3xl font-bold mr-8 ${
            isRevolutionary
              ? 'heading-revolutionary'
              : isPremium 
                ? 'text-premium-gradient'
                : isLight
                  ? 'text-blue-600'
                  : 'text-blue-400'
          }`}>
            Dashboard
          </h1>
          <div className="relative flex items-center space-x-2">
            {timePeriods.map((period) => (
              <button
                key={period}
                onClick={() => handleTimePeriodChange(period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
                  activeTimePeriod === (period === 'Custom Range' ? customRangeLabel : period)
                    ? isPremium
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white glow-purple'
                      : isLight
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-600 text-white'
                    : isPremium
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                      : isLight
                        ? 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                }`}
              >
                {period === 'Custom Range' ? (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    {customRangeLabel}
                  </>
                ) : (
                  period
                )}
              </button>
            ))}
          </div>
        </div>
        
        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => setShowThemeSelector(!showThemeSelector)}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isPremium
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                : isLight
                  ? 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
            }`}
            title="Change Theme"
          >
            <Palette className="w-5 h-5" />
          </button>
          
          {showThemeSelector && (
            <div className={`absolute right-0 top-12 p-2 rounded-lg shadow-lg border z-50 ${
              isPremium 
                ? 'bg-slate-800 border-slate-700' 
                : isLight
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-800 border-gray-700'
            }`}>
              {Object.values(themes).map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => {
                    setTheme(theme.name);
                    setShowThemeSelector(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    currentTheme.name === theme.name
                      ? isPremium
                        ? 'bg-purple-600 text-white'
                        : isLight
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-600 text-white'
                      : isPremium
                        ? 'text-slate-300 hover:bg-slate-700'
                        : isLight
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {theme.name}
                </button>
              ))}
            </div>
          )}
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
           
          <div className="relative max-w-lg w-full mx-4 overflow-hidden dark-premium-card">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-full h-full"
                   style={{
                     background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
                   }}></div>
            </div>
             
            <div className="relative z-10 p-8">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="relative p-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 glow-purple">
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
                    className={`btn-premium px-8 py-3 ${
                      !startDate || !endDate
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:scale-105 transform'
                    }`}
                  >
                    Apply Range
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {metricCards.map((card, index) => (
          <div
            key={index}
            className={`relative overflow-hidden rounded-xl p-6 border transition-all duration-300 hover:scale-105 ${
              isRevolutionary
                ? 'revolutionary-card glow-revolutionary-hover'
                : isPremium
                  ? 'dark-premium-card'
                  : isLight
                    ? 'bg-white border-gray-200 hover:shadow-lg'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
            }`}
          >
            {card.isPremium && (isPremium || isRevolutionary) && (
              <div className="absolute top-3 right-3">
                {isRevolutionary ? (
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Crown className="w-5 h-5 text-yellow-400" />
                )}
              </div>
            )}
            
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg bg-gradient-to-r ${card.bgGradient}`}>
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
            </div>
            
            <div className="space-y-1">
              <h3 className={`text-sm font-medium ${
                isRevolutionary
                  ? 'text-white/70'
                  : isPremium 
                    ? 'text-slate-400' 
                    : isLight
                      ? 'text-gray-600'
                      : 'text-gray-400'
              }`}>
                {card.title}
              </h3>
              <p className={`text-2xl font-bold ${
                isRevolutionary
                  ? 'text-revolutionary-glow'
                  : isPremium 
                    ? 'text-white' 
                    : isLight
                      ? 'text-gray-900'
                      : 'text-white'
              }`}>
                {card.value}
              </p>
              <p className={`text-xs ${
                isRevolutionary
                  ? 'text-white/50'
                  : isPremium 
                    ? 'text-slate-500' 
                    : isLight
                      ? 'text-gray-500'
                      : 'text-gray-500'
              }`}>
                {card.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Chart */}
        <div className="dark-premium-card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <BarChart3 className="w-5 h-5 text-slate-400 mr-2" />
              <h3 className="text-lg font-semibold text-white">Profit Chart</h3>
              <div className="badge-premium ml-3">Premium Analytics</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-400">Total Growth</div>
              <div className="text-lg font-bold text-green-400">+${totalProfit.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">Profit Over Time</p>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full mr-2"></div>
                  <span className="text-xs text-slate-400">Daily Profit</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-slate-600 rounded-full mr-2"></div>
                  <span className="text-xs text-slate-400">Baseline</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Dark Chart Representation */}
          <div className="relative h-64 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700 shadow-inner">
            {/* Grid lines */}
            <div className="absolute inset-4 flex flex-col justify-between">
              {[800, 600, 400, 200, 0].map((value, index) => (
                <div key={value} className="flex items-center">
                  <span className="text-xs text-slate-500 w-10 font-medium">${value}</span>
                  <div className="flex-1 h-px bg-slate-700 ml-2 opacity-50"></div>
                </div>
              ))}
            </div>
            
            {/* Chart bars with enhanced dark styling */}
            <div className="absolute bottom-4 left-14 right-4 flex items-end justify-between h-48">
              {dailyProfitData.map((bar, index) => {
                const barHeight = Math.max((bar.value / 800) * 100, 8);
                const barColor = bar.value > 500 ? 'from-green-500 to-emerald-500' : 
                                bar.value > 300 ? 'from-blue-500 to-cyan-500' : 
                                'from-purple-500 to-violet-500';
                
                return (
                  <div key={index} className="group relative flex flex-col items-center">
                    <div className="relative">
                      <div 
                        className={`w-10 bg-gradient-to-t ${barColor} rounded-t-lg shadow-lg transition-all duration-300 hover:scale-110 cursor-pointer relative overflow-hidden glow-purple`}
                        style={{ height: `${barHeight}%` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-10 transform -skew-x-12 animate-pulse"></div>
                        
                        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          ${bar.value}
                        </div>
                      </div>
                      
                      {/* Enhanced dark hover tooltip */}
                      <div className="absolute -top-24 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-slate-600 text-white text-xs py-3 px-4 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-20 shadow-xl glow-purple">
                        <div className="font-bold text-green-400">${bar.value} profit</div>
                        <div className="text-slate-200 font-medium">{bar.items}</div>
                        <div className="text-slate-400 text-xs mt-1">
                          Sale: ${bar.salePrice} | Cost: ${bar.purchasePrice}
                        </div>
                        <div className="text-slate-400 text-xs">
                          ROI: {Math.round(((bar.salePrice - bar.purchasePrice) / bar.purchasePrice) * 100)}%
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </div>
                    
                    <span className="text-xs text-slate-500 mt-3 font-medium">{bar.date.split(' ')[1]}</span>
                  </div>
                );
              })}
            </div>

            {/* Enhanced trend line with premium gradient */}
            <div className="absolute bottom-4 left-14 right-4 h-48 pointer-events-none">
              <svg className="w-full h-full">
                <defs>
                  <linearGradient id="premiumTrendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8"/>
                    <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.6"/>
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
                  stroke="url(#premiumTrendGradient)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-sm glow-purple"
                />
                {dailyProfitData.map((point, index) => (
                  <circle
                    key={index}
                    cx={20 + index * 60}
                    cy={192 - (point.value / 800) * 192}
                    r="4"
                    fill="white"
                    stroke="url(#premiumTrendGradient)"
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
                <span className="text-xs text-green-400 font-semibold">Trending Up</span>
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-700">
            <div className="text-center">
              <div className="text-xs text-slate-400">Peak Day</div>
              <div className="text-sm font-semibold text-white">${peakDay}</div>
              <div className="text-xs text-slate-500">{peakDayItem}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400">Daily Average</div>
              <div className="text-sm font-semibold text-white">${avgProfitPerDay}</div>
              <div className="text-xs text-slate-500">7-day period</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400">Best Flip</div>
              <div className="text-sm font-semibold text-green-400">{bestFlipPercent}%</div>
              <div className="text-xs text-slate-500">{bestFlipData.items}</div>
            </div>
          </div>
        </div>

        {/* Top 5 Most Profitable Flips */}
        <div className="dark-premium-card">
          <div className="flex items-center mb-6">
            <TrendingUp className="w-5 h-5 text-slate-400 mr-2" />
            <h3 className="text-lg font-semibold text-white">Top 5 Most Profitable Flips</h3>
            <Zap className="w-4 h-4 text-yellow-400 ml-2" />
          </div>

          <div className="space-y-4">
            {topFlips.map((flip, index) => (
              <div key={flip.id} className="border-b border-slate-700 pb-4 last:border-b-0 last:pb-0 group hover:bg-slate-800/50 rounded-lg p-3 transition-all duration-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <div className="mr-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white' :
                        index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-600 text-white' :
                        index === 2 ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        #{index + 1}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center">
                        <h4 className="text-sm font-semibold text-white">{flip.product}</h4>
                        {flip.isPremium && (
                          <Crown className="w-3 h-3 text-yellow-400 ml-1" />
                        )}
                      </div>
                      <p className="text-sm text-slate-400">Sale #{flip.id} • {flip.platform}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-400">${flip.profit.toFixed(2)}</div>
                    <div className="text-xs text-slate-400">
                      {Math.round(((flip.orderPrice - flip.purchasePrice) / flip.purchasePrice) * 100)}% ROI
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Sale ${flip.orderPrice.toFixed(2)} → Cost ${flip.purchasePrice.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 