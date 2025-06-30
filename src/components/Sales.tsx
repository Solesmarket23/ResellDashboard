'use client';

import { useState } from 'react';
import { Search, Calendar, TrendingUp, ArrowUp, ExternalLink, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import confetti from 'canvas-confetti';

const Sales = () => {
  const [activeFilter, setActiveFilter] = useState('All Time');
  const { currentTheme } = useTheme();
  const isPremium = currentTheme.name === 'Premium';
  const isLight = currentTheme.name === 'Light';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme
  
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; sale: any }>({
    isOpen: false,
    sale: null
  });
  
  const filterOptions = ['All Time', 'Today', 'This Week', 'This Month', 'This Year', 'Custom Range'];

  // State for managing sales data
  const [salesData, setSalesData] = useState([
    {
      id: 1,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175881684836",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 24",
      isTest: true
    },
    {
      id: 2,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175881679809",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 24",
      isTest: true
    },
    {
      id: 3,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175874243872",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 24",
      isTest: true
    },
    {
      id: 4,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175873396743",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 23",
      isTest: true
    },
    {
      id: 5,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175873958936",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 23",
      isTest: true
    },
    {
      id: 6,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175873858546",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 23",
      isTest: true
    },
    {
      id: 7,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175873844339",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 23",
      isTest: true
    },
    {
      id: 8,
      product: "Denim Tears Cotton Wreath...",
      brand: "Denim Tears",
      orderNumber: "TEST-175873844339",
      size: "L",
      market: "StockX",
      salePrice: 250.00,
      fees: -25.00,
      payout: 225.00,
      profit: 100.00,
      date: "Jun 23",
      isTest: true
    }
  ]);

  // Function to trigger confetti animation
  const triggerConfetti = () => {
    // Multiple confetti bursts for better effect
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999
    };

    function fire(particleRatio: number, opts: any) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio)
      });
    }

    // Fire confetti with different properties
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: ['#FFD700', '#FFA500', '#FF6347', '#32CD32', '#1E90FF']
    });
    fire(0.2, {
      spread: 60,
      colors: ['#FF1493', '#00CED1', '#FFD700', '#32CD32']
    });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#FF69B4', '#87CEEB', '#98FB98', '#F0E68C']
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: ['#FF4500', '#DA70D6', '#20B2AA']
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 45,
      colors: ['#FF6347', '#40E0D0', '#EE82EE', '#90EE90']
    });
  };

  // Function to add a test sale
  const addTestSale = () => {
    const testSneakers = [
      { name: "Jordan 1 Retro High OG Chicago", brand: "Jordan", price: 450, cost: 180 },
      { name: "Nike Dunk Low Panda", brand: "Nike", price: 320, cost: 120 },
      { name: "Yeezy Boost 350 V2 Zebra", brand: "Adidas", price: 380, cost: 220 },
      { name: "Travis Scott x Fragment Jordan 1", brand: "Jordan", price: 850, cost: 500 },
      { name: "Off-White x Nike Air Jordan 1", brand: "Nike", price: 1200, cost: 800 },
      { name: "New Balance 550 White Green", brand: "New Balance", price: 280, cost: 140 },
      { name: "Nike SB Dunk Low Supreme", brand: "Nike", price: 680, cost: 350 }
    ];

    const randomSneaker = testSneakers[Math.floor(Math.random() * testSneakers.length)];
    const fees = Math.round(randomSneaker.price * 0.1); // 10% fees
    const payout = randomSneaker.price - fees;
    const profit = payout - randomSneaker.cost;
    
    const newSale = {
      id: Math.max(...salesData.map(s => s.id), 0) + 1,
      product: randomSneaker.name,
      brand: randomSneaker.brand,
      orderNumber: `TEST-${Date.now()}${Math.floor(Math.random() * 1000)}`,
      size: ['8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12'][Math.floor(Math.random() * 9)],
      market: ['StockX', 'GOAT', 'eBay'][Math.floor(Math.random() * 3)],
      salePrice: randomSneaker.price,
      fees: -fees,
      payout: payout,
      profit: profit,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isTest: true
    };

    setSalesData([newSale, ...salesData]);
  };

  // Function to open delete confirmation modal
  const openDeleteModal = (sale: any) => {
    setDeleteModal({ isOpen: true, sale });
  };

  // Function to close delete modal
  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, sale: null });
  };

  // Function to confirm delete
  const confirmDelete = () => {
    if (deleteModal.sale) {
      setSalesData(salesData.filter(sale => sale.id !== deleteModal.sale.id));
      closeDeleteModal();
    }
  };

  // Function to clear all sales
  const handleClearAllSales = () => {
    if (salesData.length === 0) return;
    
    const confirmMessage = `Are you sure you want to clear all ${salesData.length} sales?\n\nThis will remove:\n- ${salesData.length} sales records\n- $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in revenue\n- $${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in profit\n\nThis action cannot be undone.`;
    
    if (window.confirm(confirmMessage)) {
      setSalesData([]);
    }
  };

  // Function to handle test sale + confetti
  const handleTestSaleConfetti = () => {
    addTestSale();
    triggerConfetti();
  };

  // Calculate updated metrics based on current sales data
  const totalSales = salesData.length;
  const totalRevenue = salesData.reduce((sum, sale) => sum + sale.salePrice, 0);
  const totalProfit = salesData.reduce((sum, sale) => sum + sale.profit, 0);
  const avgProfit = totalSales > 0 ? Math.round(totalProfit / totalSales) : 0;

  const metrics = [
    {
      title: 'Total Sales',
      value: totalSales.toString(),
      icon: ArrowUp,
      iconColor: 'text-blue-600'
    },
    {
      title: 'Total Revenue',
      value: `$${totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      iconColor: 'text-blue-600'
    },
    {
      title: 'Total Profit',
      value: `$${totalProfit.toLocaleString()}`,
      icon: TrendingUp,
      iconColor: 'text-green-600',
      valueColor: 'text-green-600'
    },
    {
      title: 'Avg Profit',
      value: `$${avgProfit}`,
      icon: Calendar,
      iconColor: 'text-blue-600'
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${
            isPremium 
              ? 'text-premium-gradient' 
              : isLight
                ? 'text-gray-900'
                : 'text-white'
          }`}>
            Sales Tracking
          </h1>
          <p className={`mt-1 ${
            isPremium 
              ? 'text-slate-400' 
              : isLight
                ? 'text-gray-600'
                : 'text-gray-400'
          }`}>
            Record and track all your sales across marketplaces
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleTestSaleConfetti}
            className="flex items-center px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Test Sale + Confetti
          </button>
          <button 
            onClick={handleClearAllSales}
            className="flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All Sales
          </button>
          <button className={`flex items-center px-4 py-2 ${currentTheme.colors.primary} text-white rounded-lg ${currentTheme.colors.primaryHover} transition-colors`}>
            <Plus className="w-4 h-4 mr-2" />
            Record Sale
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <Calendar className="w-4 h-4 mr-2 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Filter by Date</span>
        </div>
        <div className="flex items-center space-x-2">
          {filterOptions.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeFilter === filter
                  ? `${currentTheme.colors.primary} text-white`
                  : `${currentTheme.colors.cardBackground} text-gray-700 hover:bg-gray-100 border border-gray-200`
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={index} className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-600">{metric.title}</h3>
                <Icon className={`w-5 h-5 ${metric.iconColor}`} />
              </div>
              <div className="space-y-1">
                <p className={`text-2xl font-bold ${metric.valueColor || 'text-gray-900'}`}>{metric.value}</p>
                <p className="text-sm text-gray-500">Updated live</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search sales..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Sales Summary */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-600">Showing {totalSales} of {totalSales} sales</p>
        <p className="text-gray-600">Total revenue: <span className="font-semibold">${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
      </div>

      {/* Sales Table */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fees</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payout</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {salesData.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {sale.product}
                        {sale.isTest && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            TEST
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{sale.brand} • Size {sale.size}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                      onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/"${sale.orderNumber}"`, '_blank')}
                      className={`text-sm ${currentTheme.colors.primary.replace('bg-', 'text-')} hover:underline cursor-pointer`}
                    >
                      {sale.orderNumber}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.size}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.market}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${sale.salePrice.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">${sale.fees.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${sale.payout.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${sale.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${sale.profit >= 0 ? '+' : ''}${sale.profit.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/"${sale.orderNumber}"`, '_blank')}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="View in Gmail"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => openDeleteModal(sale)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete Sale"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${currentTheme.colors.cardBackground} rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-200`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Sale</h3>
              </div>
              <button
                onClick={closeDeleteModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this sale? This action cannot be undone.
              </p>
              
              {deleteModal.sale && (
                                                  <div className={`${currentTheme.colors.primaryLight} rounded-lg p-4 border border-gray-200`}>
                   <div className="space-y-3">
                     <div className="flex justify-between items-start gap-3">
                       <span className="text-sm font-medium text-gray-700 flex-shrink-0">Product:</span>
                       <span className="text-sm text-gray-900 text-right flex-1 min-w-0 truncate">{deleteModal.sale.product}</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-gray-700">Order:</span>
                       <span className="text-sm text-gray-900">{deleteModal.sale.orderNumber}</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-gray-700">Profit:</span>
                       <span className={`text-sm font-semibold ${deleteModal.sale.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                         ${deleteModal.sale.profit >= 0 ? '+' : ''}${deleteModal.sale.profit.toFixed(2)}
                       </span>
                     </div>
                   </div>
                 </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center space-x-3">
              <button
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales; 