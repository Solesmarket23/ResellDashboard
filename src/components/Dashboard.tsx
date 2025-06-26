'use client';

import { useState } from 'react';
import { DollarSign, TrendingUp, Package, ShoppingCart, BarChart3, Calculator } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const Dashboard = () => {
  const { currentTheme } = useTheme();
  const [activeTimePeriod, setActiveTimePeriod] = useState('This Month');
  
  const timePeriods = ['This Month', 'Last Month', 'This Year'];
  
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

  // Updated top flips with realistic data
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
      <div className="flex items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mr-8">Dashboard</h1>
        <div className="flex items-center space-x-2">
          {timePeriods.map((period) => (
            <button
              key={period}
              onClick={() => setActiveTimePeriod(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTimePeriod === period
                  ? `${currentTheme.colors.primary} text-white`
                  : `${currentTheme.colors.cardBackground} text-gray-700 hover:bg-gray-100 border border-gray-200`
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {metricCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-600">{card.title}</h3>
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-500">{card.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Chart */}
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <BarChart3 className="w-5 h-5 text-gray-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Profit Chart</h3>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Total Growth</div>
              <div className="text-lg font-bold text-green-600">+${totalProfit.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">Profit Over Time</p>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 ${currentTheme.colors.primary} rounded-full mr-2`}></div>
                  <span className="text-xs text-gray-600">Daily Profit</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-300 rounded-full mr-2"></div>
                  <span className="text-xs text-gray-600">Baseline</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Chart Representation */}
          <div className="relative h-52 bg-gradient-to-t from-gray-50 to-white rounded-lg p-4 border border-gray-100">
            {/* Grid lines */}
            <div className="absolute inset-4 flex flex-col justify-between">
              {[1000, 750, 500, 250, 0].map((value, index) => (
                <div key={value} className="flex items-center">
                  <span className="text-xs text-gray-400 w-10">${value}</span>
                  <div className="flex-1 h-px bg-gray-200 ml-2"></div>
                </div>
              ))}
            </div>
            
            {/* Chart bars */}
            <div className="absolute bottom-4 left-14 right-4 flex items-end justify-between h-40">
              {dailyProfitData.map((bar, index) => (
                <div key={index} className="group relative flex flex-col items-center">
                  <div 
                    className={`w-8 ${currentTheme.colors.primary} rounded-t-sm transition-all duration-300 hover:opacity-80 cursor-pointer`}
                    style={{ height: `${(bar.value / 1000) * 100}%` }}
                  >
                    {/* Hover tooltip */}
                    <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-2 px-3 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      <div className="font-semibold">${bar.value} profit</div>
                      <div className="text-gray-300">{bar.items}</div>
                      <div className="text-gray-400 text-xs">
                        Sale: ${bar.salePrice} | Cost: ${bar.purchasePrice}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-left">{bar.date}</span>
                </div>
              ))}
            </div>

            {/* Trend line overlay */}
            <div className="absolute bottom-4 left-14 right-4 h-40 pointer-events-none">
              <svg className="w-full h-full">
                <path
                  d="M 16 152 Q 80 140 144 156 Q 208 120 272 100 Q 336 120 400 80"
                  stroke={currentTheme.colors.primary.replace('bg-', '#')}
                  strokeWidth="2"
                  fill="none"
                  className="opacity-60"
                />
              </svg>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className="text-xs text-gray-500">Peak Day</div>
              <div className="text-sm font-semibold text-gray-900">${peakDay}</div>
              <div className="text-xs text-gray-400">{peakDayItem}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Daily Average</div>
              <div className="text-sm font-semibold text-gray-900">${avgProfitPerDay}</div>
              <div className="text-xs text-gray-400">7-day period</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Best Flip</div>
              <div className="text-sm font-semibold text-green-600">{bestFlipPercent}%</div>
              <div className="text-xs text-gray-400">{bestFlipData.items}</div>
            </div>
          </div>
        </div>

        {/* Top 5 Most Profitable Flips */}
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
          <div className="flex items-center mb-6">
            <TrendingUp className="w-5 h-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Top 5 Most Profitable Flips</h3>
          </div>

          <div className="space-y-4">
            {topFlips.map((flip) => (
              <div key={flip.id} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{flip.product}</h4>
                    <p className="text-sm text-gray-600">Sale #{flip.id} • {flip.platform}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">${flip.profit.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">
                      {Math.round(((flip.orderPrice - flip.purchasePrice) / flip.purchasePrice) * 100)}% ROI
                    </p>
                  </div>
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <span>Sale ${flip.orderPrice.toFixed(2)}</span>
                  <span className="mx-2">→</span>
                  <span>Cost ${flip.purchasePrice.toFixed(2)}</span>
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