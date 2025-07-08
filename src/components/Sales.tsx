'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Calendar, TrendingUp, ArrowUp, ExternalLink, Plus, Sparkles, Trash2, X, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { saveUserSale, getUserSales, deleteUserSale, clearAllUserSales } from '../lib/firebase/userDataUtils';
import confetti from 'canvas-confetti';

const Sales = () => {
  const [activeFilter, setActiveFilter] = useState('All Time');
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; sale: any }>({
    isOpen: false,
    sale: null
  });
  const [clearAllModal, setClearAllModal] = useState(false);
  const [recordSaleModal, setRecordSaleModal] = useState(false);
  const [marketplaceDropdownOpen, setMarketplaceDropdownOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [newSale, setNewSale] = useState({
    product: '',
    brand: '',
    size: '',
    market: 'StockX',
    salePrice: '',
    purchasePrice: '',
    fees: '',
    date: new Date().toISOString().split('T')[0]
  });
  
  // Refs for dropdowns
  const marketplaceDropdownRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // State for managing sales data
  const [salesData, setSalesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTestSale, setIsAddingTestSale] = useState(false);

  // Load sales data from Firebase on component mount
  useEffect(() => {
    const loadSalesData = async () => {
      if (!user) {
        setSalesData([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const userSales = await getUserSales(user.uid);
        setSalesData(userSales);
      } catch (error) {
        console.error('Error loading sales:', error);
        alert('Error loading your sales. Please try refreshing the page.');
      } finally {
        setIsLoading(false);
      }
    };

    loadSalesData();
  }, [user]);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (marketplaceDropdownRef.current && !marketplaceDropdownRef.current.contains(event.target as Node)) {
        setMarketplaceDropdownOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setDatePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Date picker helper functions
  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startDay; i++) {
      const prevDate = new Date(year, month, 1 - (startDay - i));
      days.push({ date: prevDate, isCurrentMonth: false });
    }
    
    // Add days of the current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ date: new Date(year, month, day), isCurrentMonth: true });
    }
    
    // Add days from next month to fill the grid
    const remainingCells = 42 - days.length; // 6 rows × 7 days
    for (let day = 1; day <= remainingCells; day++) {
      const nextDate = new Date(year, month + 1, day);
      days.push({ date: nextDate, isCurrentMonth: false });
    }
    
    return days;
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.toDateString() === date2.toDateString();
  };

  const isToday = (date: Date) => {
    return isSameDay(date, new Date());
  };
  
  // Theme-dependent styling
  const isNeon = currentTheme.name === 'Neon';
  
  const filterOptions = ['All Time', 'Today', 'This Week', 'This Month', 'This Year', 'Custom Range'];
  
  const marketplaceOptions = [
    'StockX',
    'GOAT', 
    'eBay',
    'Grailed',
    'Facebook Marketplace',
    'Depop',
    'Mercari',
    'Other'
  ];

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
  const addTestSale = async () => {
    if (!user) {
      alert('Please sign in to save test sales');
      return;
    }

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
    
    const saleId = Math.max(...salesData.map(s => s.id), 0) + 1;
    const newSale = {
      id: saleId,
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

    try {
      // Save to Firebase first
      await saveUserSale(user.uid, newSale);
      
      // Then update local state
      setSalesData([newSale, ...salesData]);
      
      // Notify other components that sales data has changed
      window.dispatchEvent(new CustomEvent('salesDataChanged'));
    } catch (error) {
      console.error('Error saving test sale:', error);
      alert('Error saving test sale. Please try again.');
    }
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
  const confirmDelete = async () => {
    if (deleteModal.sale && user) {
      try {
        // Delete from Firebase using the document ID
        await deleteUserSale(user.uid, deleteModal.sale.id);
        
        // Update local state
        setSalesData(salesData.filter(sale => sale.id !== deleteModal.sale.id));
        closeDeleteModal();
        
        // Notify other components that sales data has changed
        window.dispatchEvent(new CustomEvent('salesDataChanged'));
        
        console.log('✅ Sale deleted successfully');
      } catch (error) {
        console.error('Error deleting sale:', error);
        alert('Error deleting sale. Please try again.');
      }
    }
  };

  // Function to clear all sales
  const handleClearAllSales = () => {
    if (salesData.length === 0) return;
    setClearAllModal(true);
  };

  // Function to confirm clear all sales
  const confirmClearAllSales = async () => {
    if (user) {
      try {
        await clearAllUserSales(user.uid);
        setSalesData([]);
        setClearAllModal(false);
        
        // Notify other components that sales data has changed
        window.dispatchEvent(new CustomEvent('salesDataChanged'));
      } catch (error) {
        console.error('Error clearing all sales:', error);
        alert('Error clearing sales. Please try again.');
      }
    }
  };

  // Function to open record sale modal
  const openRecordSaleModal = () => {
    const currentDate = newSale.date ? new Date(newSale.date) : new Date();
    setSelectedDate(currentDate);
    setCalendarMonth(currentDate);
    setRecordSaleModal(true);
  };

  // Function to close record sale modal and reset form
  const closeRecordSaleModal = () => {
    setRecordSaleModal(false);
    setMarketplaceDropdownOpen(false);
    setDatePickerOpen(false);
    setSelectedDate(new Date());
    setCalendarMonth(new Date());
    setNewSale({
      product: '',
      brand: '',
      size: '',
      market: 'StockX',
      salePrice: '',
      purchasePrice: '',
      fees: '',
      date: new Date().toISOString().split('T')[0]
    });
  };

  // Function to handle marketplace selection
  const selectMarketplace = (marketplace: string) => {
    handleInputChange('market', marketplace);
    setMarketplaceDropdownOpen(false);
  };

  // Date picker functions
  const selectDate = (date: Date) => {
    setSelectedDate(date);
    handleInputChange('date', formatDate(date));
    setDatePickerOpen(false);
  };

  const goToPrevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  };

  const selectToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setCalendarMonth(today);
    handleInputChange('date', formatDate(today));
    setDatePickerOpen(false);
  };

  const clearDate = () => {
    setSelectedDate(new Date());
    handleInputChange('date', '');
    setDatePickerOpen(false);
  };

  // Function to handle form input changes
  const handleInputChange = (field: string, value: string) => {
    setNewSale(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Function to calculate fees automatically (10% of sale price)
  const calculateFees = (salePrice: number) => {
    return Math.round(salePrice * 0.1 * 100) / 100; // 10% fee, rounded to 2 decimals
  };

  // Function to submit new sale
  const submitNewSale = async () => {
    if (!user) {
      alert('Please sign in to save sales');
      return;
    }

    const salePrice = parseFloat(newSale.salePrice);
    const purchasePrice = parseFloat(newSale.purchasePrice);
    const fees = newSale.fees ? parseFloat(newSale.fees) : calculateFees(salePrice);
    const payout = salePrice - fees;
    const profit = payout - purchasePrice;

    const saleId = Math.max(...salesData.map(s => s.id), 0) + 1;
    
    const sale = {
      id: saleId,
      product: newSale.product,
      brand: newSale.brand,
      orderNumber: `MANUAL-${Date.now()}`,
      size: newSale.size,
      market: newSale.market,
      salePrice: salePrice,
      fees: -fees,
      payout: payout,
      profit: profit,
      date: new Date(newSale.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isTest: false
    };

    try {
      // Save to Firebase
      await saveUserSale(user.uid, {
        id: saleId,
        product: newSale.product,
        brand: newSale.brand,
        orderNumber: `MANUAL-${Date.now()}`,
        size: newSale.size,
        market: newSale.market,
        salePrice: salePrice,
        fees: -fees,
        payout: payout,
        profit: profit,
        date: new Date(newSale.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isTest: false
      });

      // Update local state
      setSalesData([sale, ...salesData]);
      closeRecordSaleModal();
      
      // Notify other components that sales data has changed
      window.dispatchEvent(new CustomEvent('salesDataChanged'));
    } catch (error) {
      console.error('Error saving sale:', error);
      alert('Error saving sale. Please try again.');
    }
  };

  // Function to handle test sale + confetti
  const handleTestSaleConfetti = async () => {
    try {
      setIsAddingTestSale(true);
      await addTestSale();
      triggerConfetti();
    } finally {
      setIsAddingTestSale(false);
    }
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
      iconColor: isNeon ? 'text-cyan-400' : 'text-blue-600'
    },
    {
      title: 'Total Revenue',
      value: `$${totalRevenue.toLocaleString()}`,
      icon: TrendingUp,
      iconColor: isNeon ? 'text-cyan-400' : 'text-blue-600'
    },
    {
      title: 'Total Profit',
      value: `$${totalProfit.toLocaleString()}`,
      icon: TrendingUp,
      iconColor: isNeon ? 'text-emerald-400' : 'text-green-600',
      valueColor: isNeon ? 'text-emerald-400' : 'text-green-600'
    },
    {
      title: 'Avg Profit',
      value: `$${avgProfit}`,
      icon: Calendar,
      iconColor: isNeon ? 'text-cyan-400' : 'text-blue-600'
    }
  ];

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>Sales Tracking</h1>
          <p className={`${
            isNeon ? 'text-gray-300' : 'text-gray-600'
          } mt-1`}>Record and track all your sales across marketplaces</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleTestSaleConfetti}
            disabled={isLoading || isAddingTestSale}
            className={`flex items-center px-4 py-2 ${
              isNeon 
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/25' 
                : 'bg-orange-500'
            } text-white rounded-lg hover:bg-orange-600 transition-colors ${
              (isLoading || isAddingTestSale) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isAddingTestSale ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {isAddingTestSale ? 'Adding...' : 'Test Sale + Confetti'}
          </button>
          <button 
            onClick={handleClearAllSales}
            disabled={isLoading}
            className={`flex items-center px-4 py-2 ${
              isNeon 
                ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-lg shadow-red-500/25' 
                : 'bg-red-500'
            } text-white rounded-lg hover:bg-red-600 transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All Sales
          </button>
          <button 
            onClick={openRecordSaleModal}
            disabled={isLoading}
            className={`flex items-center px-4 py-2 ${
              isNeon 
                ? 'btn-neon shadow-lg shadow-cyan-500/25' 
                : `${currentTheme.colors.primary} ${currentTheme.colors.primaryHover}`
            } text-white rounded-lg transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Plus className="w-4 h-4 mr-2" />
            Record Sale
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className={`p-4 rounded-full ${
            isNeon 
              ? 'bg-black/20 backdrop-blur-lg border border-cyan-500/30' 
              : 'bg-gray-100'
          }`}>
            <Loader2 className={`w-8 h-8 animate-spin ${
              isNeon ? 'text-cyan-400' : 'text-blue-500'
            }`} />
          </div>
          <p className={`mt-4 text-sm ${
            isNeon ? 'text-gray-300' : 'text-gray-600'
          }`}>Loading your sales data...</p>
        </div>
      ) : (
        <>
          {/* Filter Section */}
          <div className="mb-6">
            <div className="flex items-center mb-4">
              <Calendar className={`w-4 h-4 mr-2 ${
                isNeon ? 'text-gray-300' : 'text-gray-600'
              }`} />
              <span className={`text-sm font-medium ${
                isNeon ? 'text-gray-300' : 'text-gray-700'
              }`}>Filter by Date</span>
            </div>
            <div className="flex items-center space-x-2">
              {filterOptions.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeFilter === filter
                      ? isNeon
                        ? 'btn-neon text-white shadow-lg shadow-cyan-500/25'
                        : `${currentTheme.colors.primary} text-white`
                      : isNeon
                        ? 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/50'
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
                <div key={index} className={`${
                  isNeon 
                    ? 'dark-neon-card' 
                    : `${currentTheme.colors.cardBackground} border border-gray-200`
                } rounded-lg p-6 shadow-sm transition-all duration-200 hover:shadow-lg ${
                  isNeon ? 'hover:shadow-cyan-500/20' : ''
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-sm font-medium ${
                      isNeon ? 'text-gray-300' : 'text-gray-600'
                    }`}>{metric.title}</h3>
                    <Icon className={`w-5 h-5 ${metric.iconColor}`} />
                  </div>
                  <div className="space-y-1">
                    <p className={`text-2xl font-bold ${
                      metric.valueColor || (isNeon ? 'text-white' : 'text-gray-900')
                    }`}>{metric.value}</p>
                    <p className={`text-sm ${
                      isNeon ? 'text-gray-400' : 'text-gray-500'
                    }`}>Updated live</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                isNeon ? 'text-gray-400' : 'text-gray-400'
              }`} />
              <input
                type="text"
                placeholder="Search sales..."
                className={`w-full pl-10 pr-4 py-2 rounded-lg transition-all duration-200 ${
                  isNeon 
                    ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                    : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                }`}
              />
            </div>
          </div>

          {/* Sales Summary */}
          <div className="flex items-center justify-between mb-6">
            <p className={isNeon ? 'text-gray-300' : 'text-gray-600'}>
              Showing {totalSales} of {totalSales} sales
            </p>
            <p className={isNeon ? 'text-gray-300' : 'text-gray-600'}>
              Total revenue: <span className={`font-semibold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </p>
          </div>

          {/* Sales Table */}
          <div className={`${
            isNeon 
              ? 'dark-neon-card' 
              : `${currentTheme.colors.cardBackground} border border-gray-200`
          } rounded-lg shadow-sm overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={isNeon ? 'bg-gray-800/50' : 'bg-gray-50'}>
                  <tr>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Product</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Order #</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Size</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Market</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Sale Price</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Fees</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Payout</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Profit</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Date</th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>Actions</th>
                  </tr>
                </thead>
                <tbody className={`${
                  isNeon 
                    ? 'divide-y divide-gray-700/50' 
                    : 'bg-white divide-y divide-gray-200'
                }`}>
                  {salesData.map((sale) => (
                    <tr key={sale.id} className={
                      isNeon 
                        ? 'hover:bg-white/5 transition-colors' 
                        : 'hover:bg-gray-50'
                    }>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className={`text-sm font-medium ${
                            isNeon ? 'text-white' : 'text-gray-900'
                          }`}>
                            {sale.product}
                            {sale.isTest && (
                              <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isNeon 
                                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' 
                                  : 'bg-orange-100 text-orange-800'
                              }`}>
                                TEST
                              </span>
                            )}
                          </div>
                          <div className={`text-sm ${
                            isNeon ? 'text-gray-400' : 'text-gray-500'
                          }`}>{sale.brand} • Size {sale.size}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button 
                          onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/"${sale.orderNumber}"`, '_blank')}
                          className={`text-sm ${
                            isNeon ? 'text-cyan-400 hover:text-cyan-300' : 'text-blue-600 hover:text-blue-700'
                          } hover:underline cursor-pointer transition-colors`}
                        >
                          {sale.orderNumber}
                        </button>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`}>{sale.size}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`}>{sale.market}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`}>${sale.salePrice.toFixed(2)}</td>
                                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                  isNeon ? 'text-red-400' : 'text-red-600'
                }`}>($${Math.abs(sale.fees).toFixed(2)})</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`}>${sale.payout.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          sale.profit >= 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : isNeon ? 'text-red-400' : 'text-red-600'
                        }`}>
                          ${sale.profit.toFixed(2)}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`}>{sale.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/"${sale.orderNumber}"`, '_blank')}
                            className={`${
                              isNeon 
                                ? 'text-gray-400 hover:text-cyan-400' 
                                : 'text-gray-400 hover:text-blue-600'
                            } transition-colors`}
                            title="View in Gmail"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => openDeleteModal(sale)}
                            className={`${
                              isNeon 
                                ? 'text-gray-400 hover:text-red-400' 
                                : 'text-gray-400 hover:text-red-600'
                            } transition-colors`}
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
            <div className={`fixed inset-0 ${
              isNeon ? 'bg-black/80' : 'bg-black bg-opacity-50'
            } flex items-center justify-center z-50`}>
              <div className={`${
                isNeon 
                  ? 'modal-premium border border-cyan-500/30 shadow-2xl shadow-cyan-500/20' 
                  : `${currentTheme.colors.cardBackground} shadow-2xl border border-gray-200`
              } rounded-2xl p-6 max-w-md w-full mx-4`}>
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                      isNeon 
                        ? 'bg-red-500/20 border border-red-500/30' 
                        : 'bg-red-100'
                    }`}>
                      <Trash2 className={`w-5 h-5 ${
                        isNeon ? 'text-red-400' : 'text-red-600'
                      }`} />
                    </div>
                    <h3 className={`text-lg font-semibold ${
                      isNeon ? 'text-white' : 'text-gray-900'
                    }`}>Delete Sale</h3>
                  </div>
                  <button
                    onClick={closeDeleteModal}
                    className={`${
                      isNeon 
                        ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                        : 'text-gray-400 hover:text-gray-600'
                    } transition-colors rounded-lg p-1`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="mb-6">
                  <p className={`${
                    isNeon ? 'text-gray-300' : 'text-gray-600'
                  } mb-4`}>
                    Are you sure you want to delete this sale? This action cannot be undone.
                  </p>
                  
                  {deleteModal.sale && (
                    <div className={`${
                      isNeon 
                        ? 'bg-gray-800/50 border border-gray-700/50' 
                        : `${currentTheme.colors.primaryLight} border border-gray-200`
                    } rounded-lg p-4`}>
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <span className={`text-sm font-medium flex-shrink-0 ${
                            isNeon ? 'text-gray-300' : 'text-gray-700'
                          }`}>Product:</span>
                          <span className={`text-sm text-right flex-1 min-w-0 truncate ${
                            isNeon ? 'text-white' : 'text-gray-900'
                          }`}>{deleteModal.sale.product}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-sm font-medium ${
                            isNeon ? 'text-gray-300' : 'text-gray-700'
                          }`}>Order:</span>
                          <span className={`text-sm ${
                            isNeon ? 'text-white' : 'text-gray-900'
                          }`}>{deleteModal.sale.orderNumber}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-sm font-medium ${
                            isNeon ? 'text-gray-300' : 'text-gray-700'
                          }`}>Profit:</span>
                          <span className={`text-sm font-semibold ${
                            deleteModal.sale.profit >= 0 
                              ? isNeon ? 'text-emerald-400' : 'text-green-600'
                              : isNeon ? 'text-red-400' : 'text-red-600'
                          }`}>
                            ${deleteModal.sale.profit.toFixed(2)}
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
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600' 
                        : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/25' 
                        : 'bg-red-600 hover:bg-red-700'
                    } text-white`}
                  >
                    Delete Sale
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Clear All Sales Confirmation Modal */}
          {clearAllModal && (
            <div className={`fixed inset-0 ${
              isNeon ? 'bg-black/80' : 'bg-black bg-opacity-50'
            } flex items-center justify-center z-50`}>
              <div className={`${
                isNeon 
                  ? 'modal-premium border border-cyan-500/30 shadow-2xl shadow-cyan-500/20' 
                  : `${currentTheme.colors.cardBackground} shadow-2xl border border-gray-200`
              } rounded-2xl p-6 max-w-md w-full mx-4`}>
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-3 ${
                      isNeon 
                        ? 'bg-red-500/20 border border-red-500/30' 
                        : 'bg-red-100'
                    }`}>
                      <Trash2 className={`w-6 h-6 ${
                        isNeon ? 'text-red-400' : 'text-red-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className={`text-xl font-bold ${
                        isNeon ? 'text-white' : 'text-gray-900'
                      }`}>Clear All Sales</h3>
                      <p className={`text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-600'
                      }`}>localhost:3000 says</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setClearAllModal(false)}
                    className={`${
                      isNeon 
                        ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                        : 'text-gray-400 hover:text-gray-600'
                    } transition-colors rounded-lg p-1`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="mb-6">
                  <p className={`text-lg font-semibold mb-4 ${
                    isNeon ? 'text-white' : 'text-gray-900'
                  }`}>
                    Are you sure you want to clear all {salesData.length} sales?
                  </p>
                  
                  <div className={`${
                    isNeon 
                      ? 'bg-gray-800/50 border border-gray-700/50' 
                      : 'bg-gray-50 border border-gray-200'
                  } rounded-lg p-4 mb-4`}>
                    <p className={`font-medium mb-3 ${
                      isNeon ? 'text-white' : 'text-gray-900'
                    }`}>This will remove:</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>• {salesData.length} sales records</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>• ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in revenue</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>• ${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in profit</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${
                    isNeon 
                      ? 'bg-red-500/10 border border-red-500/20' 
                      : 'bg-red-50 border border-red-200'
                  } rounded-lg p-3`}>
                    <p className={`text-sm font-medium ${
                      isNeon ? 'text-red-400' : 'text-red-700'
                    }`}>
                      ⚠️ This action cannot be undone.
                    </p>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setClearAllModal(false)}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600' 
                        : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmClearAllSales}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/25' 
                        : 'bg-red-600 hover:bg-red-700'
                    } text-white`}
                  >
                    Clear All Sales
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Record Sale Modal */}
          {recordSaleModal && (
            <div className={`fixed inset-0 ${
              isNeon ? 'bg-black/80' : 'bg-black bg-opacity-50'
            } flex items-center justify-center z-50 p-4`}>
              <div className={`${
                isNeon 
                  ? 'modal-premium border border-cyan-500/30 shadow-2xl shadow-cyan-500/20' 
                  : `${currentTheme.colors.cardBackground} shadow-2xl border border-gray-200`
              } rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
                {/* Modal Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-3 ${
                      isNeon 
                        ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30' 
                        : 'bg-blue-100'
                    }`}>
                      <Plus className={`w-6 h-6 ${
                        isNeon ? 'text-cyan-400' : 'text-blue-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className={`text-xl font-bold ${
                        isNeon ? 'text-white' : 'text-gray-900'
                      }`}>Record New Sale</h3>
                      <p className={`text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-600'
                      }`}>Add a new sale to your records</p>
                    </div>
                  </div>
                  <button
                    onClick={closeRecordSaleModal}
                    className={`${
                      isNeon 
                        ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                        : 'text-gray-400 hover:text-gray-600'
                    } transition-colors rounded-lg p-1`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Form */}
                <div className="space-y-6">
                  {/* Product Name */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isNeon ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Product Name *
                    </label>
                    <input
                      type="text"
                      value={newSale.product}
                      onChange={(e) => handleInputChange('product', e.target.value)}
                      placeholder="e.g., Jordan 1 Retro High OG Chicago"
                      className={`w-full px-4 py-3 rounded-lg transition-all duration-200 ${
                        isNeon 
                          ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                          : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    />
                  </div>

                  {/* Brand and Size Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isNeon ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Brand *
                      </label>
                      <input
                        type="text"
                        value={newSale.brand}
                        onChange={(e) => handleInputChange('brand', e.target.value)}
                        placeholder="e.g., Nike, Adidas, Jordan"
                        className={`w-full px-4 py-3 rounded-lg transition-all duration-200 ${
                          isNeon 
                            ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                            : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isNeon ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Size *
                      </label>
                      <input
                        type="text"
                        value={newSale.size}
                        onChange={(e) => handleInputChange('size', e.target.value)}
                        placeholder="e.g., 10.5, L, XL"
                        className={`w-full px-4 py-3 rounded-lg transition-all duration-200 ${
                          isNeon 
                            ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                            : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Market */}
                  <div className="relative" ref={marketplaceDropdownRef}>
                    <label className={`block text-sm font-medium mb-2 ${
                      isNeon ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Marketplace *
                    </label>
                    <button
                      type="button"
                      onClick={() => setMarketplaceDropdownOpen(!marketplaceDropdownOpen)}
                      className={`w-full px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between ${
                        isNeon 
                          ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                          : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    >
                      <span className={isNeon ? 'text-white' : 'text-gray-900'}>{newSale.market}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
                        marketplaceDropdownOpen ? 'rotate-180' : ''
                      } ${isNeon ? 'text-gray-400' : 'text-gray-500'}`} />
                    </button>
                    
                    {marketplaceDropdownOpen && (
                      <div className={`absolute top-full left-0 right-0 mt-1 ${
                        isNeon 
                          ? 'bg-gray-800/95 border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 backdrop-blur-sm' 
                          : 'bg-white border border-gray-200 shadow-lg'
                      } rounded-lg z-50 overflow-hidden`}>
                        {marketplaceOptions.map((marketplace) => (
                          <button
                            key={marketplace}
                            type="button"
                            onClick={() => selectMarketplace(marketplace)}
                            className={`w-full px-4 py-3 text-left transition-colors duration-150 ${
                              newSale.market === marketplace
                                ? isNeon
                                  ? 'bg-cyan-500/20 text-cyan-400 border-l-2 border-cyan-400'
                                  : 'bg-blue-50 text-blue-600'
                                : isNeon
                                  ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                                  : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {marketplace}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pricing Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isNeon ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Sale Price *
                      </label>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                          isNeon ? 'text-gray-400' : 'text-gray-500'
                        }`}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={newSale.salePrice}
                          onChange={(e) => handleInputChange('salePrice', e.target.value)}
                          placeholder="0.00"
                          className={`w-full pl-8 pr-4 py-3 rounded-lg transition-all duration-200 ${
                            isNeon 
                              ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                              : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isNeon ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Purchase Price *
                      </label>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                          isNeon ? 'text-gray-400' : 'text-gray-500'
                        }`}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={newSale.purchasePrice}
                          onChange={(e) => handleInputChange('purchasePrice', e.target.value)}
                          placeholder="0.00"
                          className={`w-full pl-8 pr-4 py-3 rounded-lg transition-all duration-200 ${
                            isNeon 
                              ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                              : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isNeon ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Fees (Optional)
                      </label>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                          isNeon ? 'text-gray-400' : 'text-gray-500'
                        }`}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={newSale.fees}
                          onChange={(e) => handleInputChange('fees', e.target.value)}
                          placeholder="Auto-calc 10%"
                          className={`w-full pl-8 pr-4 py-3 rounded-lg transition-all duration-200 ${
                            isNeon 
                              ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                              : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="relative" ref={datePickerRef}>
                    <label className={`block text-sm font-medium mb-2 ${
                      isNeon ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Sale Date *
                    </label>
                    <button
                      type="button"
                      onClick={() => setDatePickerOpen(!datePickerOpen)}
                      className={`w-full px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between ${
                        isNeon 
                          ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                          : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    >
                      <span className={isNeon ? 'text-white' : 'text-gray-900'}>
                        {newSale.date ? formatDisplayDate(new Date(newSale.date)) : 'Select date'}
                      </span>
                      <Calendar className={`w-4 h-4 ${isNeon ? 'text-gray-400' : 'text-gray-500'}`} />
                    </button>

                    {datePickerOpen && (
                      <div className={`absolute top-full left-0 mt-1 ${
                        isNeon 
                          ? 'bg-gray-800/95 border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 backdrop-blur-sm' 
                          : 'bg-white border border-gray-200 shadow-lg'
                      } rounded-lg z-50 p-4 w-80`}>
                        {/* Calendar Header */}
                        <div className="flex items-center justify-between mb-4">
                          <button
                            type="button"
                            onClick={goToPrevMonth}
                            className={`p-2 rounded-lg transition-colors ${
                              isNeon
                                ? 'hover:bg-white/10 text-gray-300 hover:text-white'
                                : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <h3 className={`font-semibold ${
                            isNeon ? 'text-white' : 'text-gray-900'
                          }`}>
                            {getMonthName(calendarMonth)}
                          </h3>
                          <button
                            type="button"
                            onClick={goToNextMonth}
                            className={`p-2 rounded-lg transition-colors ${
                              isNeon
                                ? 'hover:bg-white/10 text-gray-300 hover:text-white'
                                : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Weekday Headers */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                            <div
                              key={index}
                              className={`text-center text-xs font-medium py-2 ${
                                isNeon ? 'text-gray-400' : 'text-gray-500'
                              }`}
                            >
                              {day}
                            </div>
                          ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-1 mb-4">
                          {getDaysInMonth(calendarMonth).map((day, index) => {
                            const isSelected = newSale.date && isSameDay(day.date, new Date(newSale.date));
                            const isTodayDate = isToday(day.date);
                            
                            return (
                              <button
                                key={index}
                                type="button"
                                onClick={() => selectDate(day.date)}
                                className={`
                                  w-8 h-8 text-sm rounded-lg transition-all duration-150 flex items-center justify-center
                                  ${!day.isCurrentMonth
                                    ? isNeon 
                                      ? 'text-gray-600 hover:bg-white/5'
                                      : 'text-gray-300 hover:bg-gray-50'
                                    : isSelected
                                      ? isNeon
                                        ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
                                        : 'bg-blue-500 text-white'
                                      : isTodayDate
                                        ? isNeon
                                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                          : 'bg-blue-50 text-blue-600 border border-blue-200'
                                        : isNeon
                                          ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                                          : 'text-gray-700 hover:bg-gray-100'
                                  }
                                `}
                              >
                                {day.date.getDate()}
                              </button>
                            );
                          })}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={clearDate}
                            className={`text-sm font-medium transition-colors ${
                              isNeon
                                ? 'text-cyan-400 hover:text-cyan-300'
                                : 'text-blue-600 hover:text-blue-700'
                            }`}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={selectToday}
                            className={`text-sm font-medium transition-colors ${
                              isNeon
                                ? 'text-cyan-400 hover:text-cyan-300'
                                : 'text-blue-600 hover:text-blue-700'
                            }`}
                          >
                            Today
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profit Preview */}
                  {newSale.salePrice && newSale.purchasePrice && (
                    <div className={`${
                      isNeon 
                        ? 'bg-gray-800/50 border border-gray-700/50' 
                        : 'bg-gray-50 border border-gray-200'
                    } rounded-lg p-4`}>
                      <h4 className={`font-medium mb-2 ${
                        isNeon ? 'text-white' : 'text-gray-900'
                      }`}>Sale Preview</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className={isNeon ? 'text-gray-300' : 'text-gray-600'}>Sale Price:</span>
                          <span className={`ml-2 font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                            ${parseFloat(newSale.salePrice).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className={isNeon ? 'text-gray-300' : 'text-gray-600'}>Fees:</span>
                          <span className={`ml-2 font-medium ${isNeon ? 'text-red-400' : 'text-red-600'}`}>
                            ($${newSale.fees ? parseFloat(newSale.fees).toFixed(2) : calculateFees(parseFloat(newSale.salePrice)).toFixed(2)})
                          </span>
                        </div>
                        <div>
                          <span className={isNeon ? 'text-gray-300' : 'text-gray-600'}>Payout:</span>
                          <span className={`ml-2 font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                            ${(parseFloat(newSale.salePrice) - (newSale.fees ? parseFloat(newSale.fees) : calculateFees(parseFloat(newSale.salePrice)))).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className={isNeon ? 'text-gray-300' : 'text-gray-600'}>Profit:</span>
                          <span className={`ml-2 font-medium ${
                            (parseFloat(newSale.salePrice) - (newSale.fees ? parseFloat(newSale.fees) : calculateFees(parseFloat(newSale.salePrice))) - parseFloat(newSale.purchasePrice)) >= 0 
                              ? isNeon ? 'text-emerald-400' : 'text-green-600'
                              : isNeon ? 'text-red-400' : 'text-red-600'
                          }`}>
                            ${(parseFloat(newSale.salePrice) - (newSale.fees ? parseFloat(newSale.fees) : calculateFees(parseFloat(newSale.salePrice))) - parseFloat(newSale.purchasePrice)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Actions */}
                <div className="flex items-center space-x-3 mt-8">
                  <button
                    onClick={closeRecordSaleModal}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600' 
                        : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitNewSale}
                    disabled={!newSale.product || !newSale.brand || !newSale.size || !newSale.salePrice || !newSale.purchasePrice}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      !newSale.product || !newSale.brand || !newSale.size || !newSale.salePrice || !newSale.purchasePrice
                        ? isNeon 
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : isNeon 
                          ? 'btn-neon shadow-lg shadow-cyan-500/25' 
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4 mr-2 inline" />
                    Record Sale
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Sales; 