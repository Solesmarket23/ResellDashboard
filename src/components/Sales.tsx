'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Calendar, TrendingUp, ArrowUp, ExternalLink, Plus, Sparkles, Trash2, X, ChevronDown, ChevronLeft, ChevronRight, Loader2, Wifi, WifiOff, AlertCircle, RefreshCw, Package, DollarSign } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { saveUserSale } from '../lib/firebase/userDataUtils';
import { useSales } from '../lib/hooks/useSales';
import { useStockXSales } from '../lib/hooks/useStockXSales';
import { formatOrderNumberForDisplay } from '../lib/utils/orderNumberUtils';
import confetti from 'canvas-confetti';
import NeonNotification from './NeonNotification';

const Sales = () => {
  const [activeFilter, setActiveFilter] = useState('All Time');
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  
  // Use the enhanced useSales hook for real-time data
  const { 
    sales: salesData, 
    metrics, 
    loading: isLoading, 
    error: salesError,
    isDeleting,
    connectionState,
    deleteSale,
    clearAllSales,
    forceRefresh 
  } = useSales();
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
    purchasedFrom: '',
    salePrice: '',
    purchasePrice: '',
    fees: '',
    date: new Date().toISOString().split('T')[0]
  });
  
  // Custom date range state
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  
  // Track if we've already refreshed for the current sync to prevent loops
  const lastSyncRefreshRef = useRef<string | null>(null);
  
  // Column width state for resizable columns with localStorage persistence
  const getStoredColumnWidths = () => {
    try {
      const stored = localStorage.getItem('sales-column-widths');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load column widths from localStorage:', error);
    }
    // Default widths
    return {
      product: 300,
      brand: 120,
      size: 80,
      soldOn: 120,
      purchasedFrom: 140,
      salePrice: 100,
      purchasePrice: 120,
      fees: 80,
      profit: 100,
      date: 120,
      actions: 100
    };
  };

  const [columnWidths, setColumnWidths] = useState(getStoredColumnWidths());

  // Save column widths to localStorage whenever they change
  const updateColumnWidths = (newWidths: typeof columnWidths) => {
    setColumnWidths(newWidths);
    try {
      localStorage.setItem('sales-column-widths', JSON.stringify(newWidths));
    } catch (error) {
      console.warn('Failed to save column widths to localStorage:', error);
    }
  };
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [justClickedResize, setJustClickedResize] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Sorting state
  const [sortBy, setSortBy] = useState('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Notification state
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: 'success' | 'error' | 'warning';
  }>({ isVisible: false, message: '', type: 'success' });
  
  // Refs for dropdowns
  const marketplaceDropdownRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [isAddingTestSale, setIsAddingTestSale] = useState(false);

  // StockX sales integration
  const {
    sales: stockxSales,
    loading: stockxLoading,
    error: stockxError,
    syncStatus,
    syncSales: syncStockXSales,
    convertToMainSale,
    lastSyncTime,
    syncProgress,
    clearStockXSales,
    fixUserIdMismatch,
    refreshPayoutsInBackground
  } = useStockXSales();
  const [showStockXModal, setShowStockXModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sales data is now handled by the useSales hook automatically
  
  // Temporarily disabled automatic refresh to prevent flickering
  // Users can manually refresh using the button in debug section
  // useEffect(() => {
  //   // Track when StockX sales data changes (indicating a successful sync)
  //   if (stockxSales.length > 0 && lastSyncRefreshRef.current !== stockxSales.length.toString()) {
  //     console.log('🔄 StockX sales data changed, refreshing unified sales data...');
  //     lastSyncRefreshRef.current = stockxSales.length.toString();
  //     
  //     // Small delay to ensure all data is processed
  //     setTimeout(() => {
  //       forceRefresh();
  //     }, 500);
  //   }
  // }, [stockxSales.length]); // Watch for changes in StockX sales count
  
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
  
  // Date filtering utility functions
  const getDateRange = (filter: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filter) {
      case 'Today':
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) // End of today
        };
      case 'This Week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999); // End of Saturday
        return { start: weekStart, end: weekEnd };
      case 'This Month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        return { start: monthStart, end: monthEnd };
      case 'This Year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        yearEnd.setHours(23, 59, 59, 999);
        return { start: yearStart, end: yearEnd };
      case 'Custom Range':
        if (customDateRange.startDate && customDateRange.endDate) {
          const start = new Date(customDateRange.startDate);
          const end = new Date(customDateRange.endDate);
          end.setHours(23, 59, 59, 999);
          return { start, end };
        }
        return null;
      default: // 'All Time'
        return null;
    }
  };
  
  // Filter sales data based on active filter
  const getFilteredSales = () => {
    if (activeFilter === 'All Time') {
      return salesData;
    }
    
    const dateRange = getDateRange(activeFilter);
    if (!dateRange) {
      return salesData;
    }
    
    return salesData.filter(sale => {
      // Get sale date from various possible fields
      const saleDate = new Date(sale.date || sale.createdAt || sale.updatedAt);
      return saleDate >= dateRange.start && saleDate <= dateRange.end;
    });
  };
  
  // Get filtered sales data
  const filteredSales = getFilteredSales();
  
  // Sorting functionality
  const handleSort = (column: string) => {
    // Don't sort if we're currently resizing or just clicked a resize handle
    if (isResizing || justClickedResize) return;
    
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };
  
  // Wrapper for onClick events to prevent sorting during resize
  const handleHeaderClick = (e: React.MouseEvent, column: string) => {
    if (justClickedResize || isResizing) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handleSort(column);
  };

  // Auto-resize column to fit content
  const calculateOptimalWidth = (columnKey: string, headerText: string): number => {
    // Create a temporary canvas to measure text width
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return columnWidths[columnKey as keyof typeof columnWidths];

    // Set font to match table font (match actual table styling)
    context.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    let maxWidth = context.measureText(headerText).width + 80; // Header + padding + sort icon + extra space
    let longestContent = headerText;

    // Use ALL sales data, not just filtered/sorted to ensure we check everything
    const allSales = salesData || [];
    
    // Check each row's content for this column
    allSales.forEach(sale => {
      let cellContent = '';
      
      switch (columnKey) {
        case 'product':
          cellContent = sale.product || '';
          break;
        case 'brand':
          cellContent = sale.brand || '';
          break;
        case 'size':
          cellContent = sale.size || '';
          break;
        case 'soldOn':
          cellContent = sale.soldOn || sale.market || '';
          break;
        case 'purchasedFrom':
          cellContent = sale.purchasedFrom || '';
          break;
        case 'salePrice':
          cellContent = sale.salePrice ? `$${parseFloat(sale.salePrice).toFixed(2)}` : '';
          break;
        case 'purchasePrice':
          cellContent = sale.purchasePrice ? `$${parseFloat(sale.purchasePrice).toFixed(2)}` : '';
          break;
        case 'fees':
          cellContent = sale.fees ? `$${parseFloat(sale.fees).toFixed(2)}` : '';
          break;
        case 'profit':
          const profit = (parseFloat(sale.salePrice || '0') - parseFloat(sale.purchasePrice || '0') - parseFloat(sale.fees || '0'));
          cellContent = `$${profit.toFixed(2)}`;
          break;
        case 'date':
          cellContent = sale.date ? new Date(sale.date).toLocaleDateString() : '';
          break;
        default:
          cellContent = '';
      }

      const textWidth = context.measureText(cellContent).width + 40; // Content + padding
      if (textWidth > maxWidth) {
        maxWidth = textWidth;
        longestContent = cellContent;
      }
    });

    // Add extra padding and set reasonable min/max bounds (increased max for long product names)
    const finalWidth = Math.min(Math.max(maxWidth + 30, 100), 600);
    
    console.log(`Auto-resize ${columnKey}:`, {
      headerText,
      longestContent,
      measuredWidth: maxWidth,
      finalWidth,
      totalSales: allSales.length
    });

    return finalWidth;
  };

  const handleDoubleClickResize = (columnKey: string, headerText: string) => {
    const optimalWidth = calculateOptimalWidth(columnKey, headerText);
    updateColumnWidths({
      ...columnWidths,
      [columnKey]: optimalWidth
    });
  };
  
  // Sort filtered sales
  const sortedSales = [...filteredSales].sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    switch (sortBy) {
      case 'product':
        aValue = a.product?.toLowerCase() || '';
        bValue = b.product?.toLowerCase() || '';
        break;
      case 'brand':
        aValue = a.brand?.toLowerCase() || '';
        bValue = b.brand?.toLowerCase() || '';
        break;
      case 'size':
        aValue = a.size?.toLowerCase() || '';
        bValue = b.size?.toLowerCase() || '';
        break;
      case 'soldOn':
        aValue = a.platform?.toLowerCase() || a.market?.toLowerCase() || '';
        bValue = b.platform?.toLowerCase() || b.market?.toLowerCase() || '';
        break;
      case 'purchasedFrom':
        aValue = a.purchasedFrom?.toLowerCase() || '';
        bValue = b.purchasedFrom?.toLowerCase() || '';
        break;
      case 'salePrice':
        aValue = parseFloat(a.salePrice) || 0;
        bValue = parseFloat(b.salePrice) || 0;
        break;
      case 'purchasePrice':
        aValue = parseFloat(a.purchasePrice) || 0;
        bValue = parseFloat(b.purchasePrice) || 0;
        break;
      case 'fees':
        aValue = parseFloat(a.fees) || 0;
        bValue = parseFloat(b.fees) || 0;
        break;
      case 'profit':
        aValue = parseFloat(a.profit) || 0;
        bValue = parseFloat(b.profit) || 0;
        break;
      case 'date':
        aValue = new Date(a.date || a.createdAt).getTime();
        bValue = new Date(b.date || b.createdAt).getTime();
        break;
      default:
        return 0;
    }
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    } else {
      return sortDirection === 'asc' 
        ? aValue - bValue
        : bValue - aValue;
    }
  });
  
  // Column resizing functionality
  const handleMouseDown = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    
    // Set flag to prevent sorting for a short time
    setJustClickedResize(true);
    setTimeout(() => setJustClickedResize(false), 200);
    
    setIsResizing(true);
    setResizingColumn(columnKey);
    
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths];
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + diff);
      
      updateColumnWidths({
        ...columnWidths,
        [columnKey]: newWidth
      });
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Extend the resize block to prevent sort on mouse release
      setJustClickedResize(true);
      setTimeout(() => setJustClickedResize(false), 100);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) {
      return (
        <div className="flex flex-col ml-1 opacity-30">
          <div className="w-0 h-0 border-l-2 border-r-2 border-b-2 border-transparent border-b-current transform -translate-y-px"></div>
          <div className="w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-current transform translate-y-px"></div>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col ml-1">
        <div className={`w-0 h-0 border-l-2 border-r-2 border-b-2 border-transparent ${sortDirection === 'asc' ? 'border-b-current' : 'border-b-current opacity-30'} transform -translate-y-px`}></div>
        <div className={`w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent ${sortDirection === 'desc' ? 'border-t-current' : 'border-t-current opacity-30'} transform translate-y-px`}></div>
      </div>
    );
  };
  
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
      
    const newSale = {
      // Remove internal ID generation - Firebase will provide the document ID
      product: randomSneaker.name,
      brand: randomSneaker.brand,
      orderNumber: `TEST-${Date.now()}${Math.floor(Math.random() * 1000)}`,
      size: ['8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12'][Math.floor(Math.random() * 9)],
      market: ['StockX', 'GOAT', 'eBay'][Math.floor(Math.random() * 3)],
      salePrice: randomSneaker.price,
      purchasePrice: randomSneaker.cost,
      fees: -fees,
      payout: payout,
      profit: profit,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isTest: true,
      type: 'manual'
    };

    try {
      console.log('🧪 Adding test sale:', newSale);
      
      // Save to Firebase first
      const docRef = await saveUserSale(user.uid, newSale);
      
      console.log('✅ Test sale saved to Firebase with doc ID:', docRef?.id);
      
      // Wait a moment for Firebase to fully process the document
      console.log('⏳ Waiting for Firebase to process test sale...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force refresh to immediately show the new sale
      console.log('🔄 Refreshing sales data after test sale...');
      await forceRefresh();
      
      console.log('✅ Test sale added and refreshed successfully');
      
    } catch (error) {
      console.error('❌ Error saving test sale:', error);
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
  const confirmDelete = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent any default form submission behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!deleteModal.sale || !user) {
      console.error('❌ Missing sale or user for deletion');
      showNotification('Error: Missing sale or user information', 'error');
      return;
    }

    try {
      console.log('🗑️ Attempting to delete sale:', deleteModal.sale);
      console.log('🗑️ Sale ID value:', deleteModal.sale.id, 'Type:', typeof deleteModal.sale.id);
      
      if (!deleteModal.sale.id) {
        console.error('❌ Sale missing Firebase document ID:', deleteModal.sale);
        showNotification('Error: Sale is missing a document ID and cannot be deleted.', 'error');
        return;
      }

      // Ensure we're passing a string ID
      const saleId = String(deleteModal.sale.id);
      console.log('🔥 Calling deleteSale with converted ID:', saleId, 'Type:', typeof saleId);
      
      // Use the enhanced delete function from useSales hook
      const deleteSuccess = await deleteSale(saleId);
      
      if (deleteSuccess) {
        console.log('✅ Sale deleted successfully');
        closeDeleteModal();
        showNotification('Sale deleted successfully! 🗑️', 'success');
      } else {
        console.error('❌ Delete operation failed');
        showNotification('Failed to delete sale. Please try again.', 'error');
      }
      
    } catch (error) {
      console.error('❌ Error in confirmDelete:', error);
      console.error('Sale data:', deleteModal.sale);
      showNotification(`Error deleting sale: ${error.message}. Please try again.`, 'error');
    }
  };

  // Function to clear all sales
  const handleClearAllSales = () => {
    if (salesData.length === 0) return;
    setClearAllModal(true);
  };

  // Function to confirm clear all sales
  const confirmClearAllSales = async () => {
    if (!user) {
      console.error('❌ No user found when trying to clear sales');
      setNotification({
        isVisible: true,
        message: 'Please sign in to clear sales.',
        type: 'error'
      });
      return;
    }

    try {
      console.log('🔄 Starting clear all sales process for user:', user.uid);
      console.log('📊 Current sales data length:', salesData.length);
      
      // Use the enhanced clear function from useSales hook
      await clearAllSales();
      
      setClearAllModal(false);
      
      setNotification({
        isVisible: true,
        message: '✅ All sales cleared successfully!',
        type: 'success'
      });
      
      console.log('✅ All sales cleared successfully - data refreshed');
      
    } catch (error) {
      console.error('❌ Error clearing all sales:', error);
      console.error('Error details:', error);
      console.error('User ID:', user?.uid);
      console.error('Sales data length:', salesData.length);
      setNotification({
        isVisible: true,
        message: `Error clearing sales: ${error.message}. Please try again.`,
        type: 'error'
      });
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
      purchasedFrom: '',
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

  // Helper function to show notifications
  const showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ isVisible: true, message, type });
  };

  // Function to submit new sale
  const submitNewSale = async () => {
    if (!user) {
      showNotification('Please sign in to save sales', 'error');
      return;
    }

    // Basic validation
    if (!newSale.product || !newSale.brand || !newSale.size || !newSale.salePrice || !newSale.purchasePrice) {
      showNotification('Please fill in all required fields', 'warning');
      return;
    }

    const salePrice = parseFloat(newSale.salePrice);
    const purchasePrice = parseFloat(newSale.purchasePrice);
    
    if (isNaN(salePrice) || isNaN(purchasePrice)) {
      showNotification('Please enter valid numbers for sale price and purchase price', 'warning');
      return;
    }

    const fees = newSale.fees ? parseFloat(newSale.fees) : calculateFees(salePrice);
    const payout = salePrice - fees;
    const profit = payout - purchasePrice;

    // Generate safe saleId
    const saleId = salesData.length > 0 
      ? Math.max(...salesData.map(s => s.id || 0)) + 1 
      : 1;

    console.log('📝 Submitting new sale:', {
      saleId,
      product: newSale.product,
      brand: newSale.brand,
      size: newSale.size,
      salePrice,
      purchasePrice,
      fees,
      payout,
      profit
    });

    const saleData = {
      // Remove internal ID generation - Firebase will provide the document ID
      product: newSale.product,
      brand: newSale.brand,
      orderNumber: `MANUAL-${Date.now()}`,
      size: newSale.size,
      market: newSale.market,
      purchasedFrom: newSale.purchasedFrom,
      salePrice: salePrice,
      purchasePrice: purchasePrice,
      fees: -fees,
      payout: payout,
      profit: profit,
      date: new Date(newSale.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isTest: false,
      type: 'manual'
    };

    try {
      console.log('💾 Saving sale to Firebase...');
      
      // Save to Firebase
      const docRef = await saveUserSale(user.uid, saleData);
      
      console.log('✅ Sale saved successfully to Firebase with doc ID:', docRef?.id);
      
      // Close modal first for better UX
      closeRecordSaleModal();
      
      // Show success message immediately
      showNotification('Sale recorded successfully! 💰', 'success');
      
      // Wait a shorter time for Firebase to fully process the document
      console.log('⏳ Waiting for Firebase to process (500ms)...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force refresh to show the new sale
      console.log('🔄 Refreshing sales data...');
      await forceRefresh();
      
      console.log('✅ Sales data refreshed - new sale should now be visible');
      
      // Double-check that the sale appears in the UI
      setTimeout(() => {
        if (salesData.length === 0) {
          console.warn('⚠️ No sales showing in UI after refresh - this indicates a problem');
        } else {
          console.log('✅ Sales UI updated - currently showing', salesData.length, 'sales');
        }
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error saving sale:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        saleData,
        userId: user.uid
      });
      showNotification(`Error saving sale: ${error.message}. Please try again.`, 'error');
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

  // Calculate updated metrics based on filtered sales data
  const totalSales = sortedSales.length;
  const totalRevenue = sortedSales.reduce((sum, sale) => sum + (Number(sale.salePrice) || Number(sale.amount) || 0), 0);
  const totalProfit = sortedSales.reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0);
  const avgProfit = totalSales > 0 ? Math.round(totalProfit / totalSales) : 0;

  const metricsDisplay = [
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
            onClick={() => setShowStockXModal(true)}
            disabled={isLoading || stockxLoading}
            className={`flex items-center px-4 py-2 ${
              isNeon 
                ? 'bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/25' 
                : 'bg-green-500'
            } text-white rounded-lg hover:bg-green-600 transition-colors ${
              (isLoading || stockxLoading) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            StockX Sales
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

      {/* Debug Info Section - Remove in production */}
      <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold">Sales Debug Info</span>
          <div className="flex items-center space-x-4">
            <span>Sales: {filteredSales.length}/{salesData.length}</span>
            <span>Connection: {connectionState.status}</span>
            {connectionState.lastSync && (
              <span>Last sync: {connectionState.lastSync.toLocaleTimeString()}</span>
            )}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                {connectionState.status === 'connected' && <Wifi className="w-4 h-4 text-green-500" />}
                {connectionState.status === 'connecting' && <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />}
                {connectionState.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                {connectionState.status === 'disconnected' && <WifiOff className="w-4 h-4 text-gray-500" />}
              </div>
              <button
                onClick={() => {
                  console.log('🔄 Manual refresh triggered');
                  forceRefresh();
                }}
                className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4 text-xs text-gray-600">
          <span>From cache: {connectionState.fromCache ? 'Yes' : 'No'}</span>
          <span>Pending writes: {connectionState.hasPendingWrites ? 'Yes' : 'No'}</span>
          <span>Deleting: {isDeleting ? 'Yes' : 'No'}</span>
          <span className="text-red-600 font-bold">StockX Hook: {stockxSales.length}</span>
          <span className="text-blue-600 font-bold">Unified Hook: {salesData.length}</span>
          {salesError && <span className="text-red-500">Error: {salesError}</span>}
          <button
            onClick={forceRefresh}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            Force Refresh
          </button>
          <button
            onClick={async () => {
              try {
                const response = await fetch('/api/stockx/debug-sales-raw');
                const data = await response.json();
                
                if (data.success && data.firstOrder) {
                  console.log('🔍 StockX Order Structure:', data.firstOrder);
                  console.log('📏 Size Locations Found:', data.sizeLocations);
                  
                  // Create a detailed alert showing where size might be
                  let sizeInfo = `
StockX Order Debug Info:

Size Locations Checked:
- variant.variantValue: ${data.sizeLocations.variantValue || 'Not found'} ← SIZE SHOULD BE HERE!
- variant.variantName: ${data.sizeLocations.variantName || 'Not found'}
- variant.size: ${data.sizeLocations.inVariant || 'Not found'}
- root size: ${data.sizeLocations.inRoot || 'Not found'}
- product.size: ${data.sizeLocations.inProduct || 'Not found'}
- item.size: ${data.sizeLocations.inItem || 'Not found'}
- Has variant object: ${data.sizeLocations.hasVariant ? 'Yes' : 'No'}
- Variant keys: ${data.sizeLocations.variantKeys?.join(', ') || 'None'}

All Size Fields Found:
${Object.entries(data.sizeLocations.allSizeFields || {}).map(([key, value]) => `- ${key}: ${value}`).join('\n') || 'No size fields found'}`;

                  // Add details API info if available
                  if (data.sizeLocations.detailsApiInfo) {
                    const detailsInfo = data.sizeLocations.detailsApiInfo;
                    if (detailsInfo.hasDetails) {
                      sizeInfo += `\n\nOrder Details API Results:`;
                      if (detailsInfo.sizeFieldsInDetails && Object.keys(detailsInfo.sizeFieldsInDetails).length > 0) {
                        sizeInfo += `\nSize Fields in Details:`;
                        Object.entries(detailsInfo.sizeFieldsInDetails).forEach(([key, value]) => {
                          sizeInfo += `\n- ${key}: ${value}`;
                        });
                      } else {
                        sizeInfo += `\nNo size fields found in details either.`;
                      }
                    } else {
                      sizeInfo += `\n\nCould not fetch order details: ${detailsInfo.error}`;
                    }
                  }

                  sizeInfo += `\n\nCheck browser console for full order structure.`;
                  sizeInfo = sizeInfo.trim();
                  
                  alert(sizeInfo);
                } else if (data.error === 'Missing authentication') {
                  alert('Please authenticate with StockX first');
                } else {
                  alert('No orders found to debug. Make sure you have sales on StockX.');
                }
              } catch (error) {
                console.error('Debug error:', error);
                alert('Failed to debug. Check console for details.');
              }
            }}
            className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
          >
            Debug StockX Size
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
                  onClick={() => {
                    setActiveFilter(filter);
                    if (filter === 'Custom Range') {
                      setShowCustomDatePicker(true);
                    } else {
                      setShowCustomDatePicker(false);
                    }
                  }}
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
            
            {/* Custom Date Range Picker */}
            {showCustomDatePicker && (
              <div className={`mt-4 p-4 rounded-lg border ${
                isNeon 
                  ? 'bg-gray-800/50 border-cyan-500/30' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center space-x-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${
                      isNeon ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customDateRange.startDate}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                      className={`px-3 py-2 rounded border text-sm ${
                        isNeon 
                          ? 'bg-gray-700/50 border-gray-600 text-white focus:border-cyan-400' 
                          : 'bg-white border-gray-300 focus:border-blue-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${
                      isNeon ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customDateRange.endDate}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                      className={`px-3 py-2 rounded border text-sm ${
                        isNeon 
                          ? 'bg-gray-700/50 border-gray-600 text-white focus:border-cyan-400' 
                          : 'bg-white border-gray-300 focus:border-blue-500'
                      }`}
                    />
                  </div>
                  <div className="flex items-end space-x-2">
                    <button
                      onClick={() => {
                        // Reset custom date range
                        setCustomDateRange({ startDate: '', endDate: '' });
                        setActiveFilter('All Time');
                        setShowCustomDatePicker(false);
                      }}
                      className={`px-3 py-2 rounded text-sm ${
                        isNeon 
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {customDateRange.startDate && customDateRange.endDate && (
                  <div className={`mt-2 text-sm ${
                    isNeon ? 'text-cyan-400' : 'text-blue-600'
                  }`}>
                    Showing sales from {new Date(customDateRange.startDate).toLocaleDateString()} to {new Date(customDateRange.endDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {metricsDisplay.map((metric, index) => {
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
            <div className="overflow-x-auto max-h-[70vh]">
              <table ref={tableRef} className="w-full" style={{ tableLayout: 'fixed' }}>
                <thead className={`${
                  isNeon 
                    ? 'bg-gray-900 border-b border-white/10' 
                    : 'bg-gray-50 border-b border-gray-200'
                } sticky top-0 z-10`}>
                  <tr className="h-10">
                    {/* Product Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.product}px` }}
                      onClick={(e) => handleHeaderClick(e, 'product')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Product
                          <SortIcon column="product" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'product');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('product', 'Product');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Brand Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.brand}px` }}
                      onClick={(e) => handleHeaderClick(e, 'brand')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Brand
                          <SortIcon column="brand" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'brand');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('brand', 'Brand');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Size Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.size}px` }}
                      onClick={(e) => handleHeaderClick(e, 'size')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Size
                          <SortIcon column="size" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'size');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('size', 'Size');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Sold On Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.soldOn}px` }}
                      onClick={(e) => handleHeaderClick(e, 'soldOn')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Sold On
                          <SortIcon column="soldOn" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'soldOn');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('soldOn', 'Sold On');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Purchased From Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.purchasedFrom}px` }}
                      onClick={(e) => handleHeaderClick(e, 'purchasedFrom')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Purchased From
                          <SortIcon column="purchasedFrom" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'purchasedFrom');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('purchasedFrom', 'Purchased From');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Sale Price Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.salePrice}px` }}
                      onClick={(e) => handleHeaderClick(e, 'salePrice')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Sale Price
                          <SortIcon column="salePrice" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'salePrice');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('salePrice', 'Sale Price');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Purchase Price Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.purchasePrice}px` }}
                      onClick={(e) => handleHeaderClick(e, 'purchasePrice')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Purchase Price
                          <SortIcon column="purchasePrice" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'purchasePrice');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('purchasePrice', 'Purchase Price');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Fees Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.fees}px` }}
                      onClick={(e) => handleHeaderClick(e, 'fees')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Fees
                          <SortIcon column="fees" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'fees');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('fees', 'Fees');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Profit Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.profit}px` }}
                      onClick={(e) => handleHeaderClick(e, 'profit')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Profit
                          <SortIcon column="profit" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'profit');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('profit', 'Profit');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Date Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider cursor-pointer select-none ${
                        isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                      } transition-colors`} 
                      style={{ width: `${columnWidths.date}px` }}
                      onClick={(e) => handleHeaderClick(e, 'date')}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Sale Date
                          <SortIcon column="date" />
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'date');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClickResize('date', 'Sale Date');
                        }}
                        title="Drag to resize column, double-click to auto-fit"
                      />
                    </th>
                    
                    {/* Actions Column */}
                    <th 
                      className={`relative px-3 py-0 h-10 align-middle text-left text-xs font-medium ${
                        isNeon ? 'text-gray-300' : 'text-gray-500'
                      } uppercase tracking-wider`} 
                      style={{ width: `${columnWidths.actions}px` }}
                    >
                      <div className="flex items-center justify-between h-full">
                        <div className="flex items-center">
                          Actions
                        </div>
                      </div>
                      <div 
                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                          isNeon ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                        } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, 'actions');
                        }}
                        title="Drag to resize column"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className={`${
                  isNeon 
                    ? 'divide-y divide-gray-700/50' 
                    : 'bg-white divide-y divide-gray-200'
                }`}>
                  {sortedSales.map((sale) => (
                    <tr key={sale.id} className={
                      isNeon 
                        ? 'hover:bg-white/5 transition-colors' 
                        : 'hover:bg-gray-50'
                    }>
                      {/* Product */}
                      <td className="px-3 py-4 whitespace-nowrap" style={{ width: `${columnWidths.product}px` }}>
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
                        </div>
                      </td>
                      
                      {/* Brand */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.brand}px` }}>
                        {sale.brand}
                      </td>
                      
                      {/* Size */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.size}px` }}>
                        {sale.size}
                      </td>
                      
                      {/* Sold On */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.soldOn}px` }}>
                        {sale.platform === 'stockx' ? 'StockX' : (sale.market || 'Manual')}
                      </td>
                      
                      {/* Purchased From */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.purchasedFrom}px` }}>
                        {sale.purchasedFrom || '-'}
                      </td>
                      
                      {/* Sale Price */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.salePrice}px` }}>
                        ${(Number(sale.salePrice) || Number(sale.amount) || 0).toFixed(2)}
                      </td>
                      
                      {/* Purchase Price */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.purchasePrice}px` }}>
                        ${(Number(sale.purchasePrice) || 0).toFixed(2)}
                      </td>
                      
                      {/* Fees */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-red-400' : 'text-red-600'
                      }`} style={{ width: `${columnWidths.fees}px` }}>
                        (${Math.abs(Number(sale.fees) || 0).toFixed(2)})
                      </td>
                      
                      {/* Profit */}
                      <td className="px-3 py-4 whitespace-nowrap" style={{ width: `${columnWidths.profit}px` }}>
                        <span className={`text-sm font-medium ${
                          (Number(sale.profit) || 0) >= 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : isNeon ? 'text-red-400' : 'text-red-600'
                        }`}>
                          ${(Number(sale.profit) || 0).toFixed(2)}
                        </span>
                      </td>
                      
                      {/* Date */}
                      <td className={`px-3 py-4 whitespace-nowrap text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-900'
                      }`} style={{ width: `${columnWidths.date}px` }}>
                        {new Date(sale.date || sale.createdAt || sale.updatedAt).toLocaleDateString()}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-4 whitespace-nowrap" style={{ width: `${columnWidths.actions}px` }}>
                        <div className="flex items-center space-x-2">
                          {sale.orderNumber && (
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
                          )}
                          <button 
                            onClick={() => openDeleteModal(sale)}
                            disabled={isDeleting}
                            className={`${
                              isNeon 
                                ? 'text-gray-400 hover:text-red-400' 
                                : 'text-gray-400 hover:text-red-600'
                            } transition-colors ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              
              {/* Empty State for Filtered Sales */}
              {sortedSales.length === 0 && salesData.length > 0 && (
                <div className="text-center py-12">
                  <div className={`text-lg font-medium mb-2 ${
                    isNeon ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    No sales found for "{activeFilter}"
                  </div>
                  <div className={`text-sm ${
                    isNeon ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Try selecting a different date range or "All Time" to see your sales.
                  </div>
                </div>
              )}
              
              {/* Empty State for No Sales */}
              {salesData.length === 0 && (
                <div className="text-center py-12">
                  <div className={`text-lg font-medium mb-2 ${
                    isNeon ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    No sales recorded yet
                  </div>
                  <div className={`text-sm ${
                    isNeon ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Record your first sale using the "Record Sale" button above.
                  </div>
                </div>
              )}
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
                          }`}>{formatOrderNumberForDisplay(deleteModal.sale.orderNumber)}</span>
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
                    type="button"
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
                    type="button"
                    onClick={(event) => confirmDelete(event)}
                    disabled={isDeleting}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/25' 
                        : 'bg-red-600 hover:bg-red-700'
                    } text-white ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isDeleting ? (
                      <div className="flex items-center justify-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </div>
                    ) : (
                      'Delete Sale'
                    )}
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
                    type="button"
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
                    type="button"
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

                  {/* Purchased From */}
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isNeon ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Purchased From
                    </label>
                    <input
                      type="text"
                      value={newSale.purchasedFrom}
                      onChange={(e) => handleInputChange('purchasedFrom', e.target.value)}
                      placeholder="e.g., Nike SNKRS, Footlocker, StockX, GOAT"
                      className={`w-full px-4 py-3 rounded-lg transition-all duration-200 ${
                        isNeon 
                          ? 'input-premium focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-400/20' 
                          : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                    />
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
                            (${newSale.fees ? parseFloat(newSale.fees).toFixed(2) : calculateFees(parseFloat(newSale.salePrice)).toFixed(2)})
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

          {/* StockX Sales Modal */}
          {showStockXModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className={`${
                isNeon 
                  ? 'bg-black/90 backdrop-blur-xl border border-cyan-500/30' 
                  : 'bg-white'
              } rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-xl`}>
                {/* Modal Header */}
                <div className={`flex items-center justify-between p-6 border-b ${
                  isNeon ? 'border-cyan-500/20' : 'border-gray-200'
                }`}>
                  <h2 className={`text-2xl font-bold ${
                    isNeon ? 'text-white' : 'text-gray-900'
                  }`}>StockX Sales Integration</h2>
                  <button
                    onClick={() => setShowStockXModal(false)}
                    className={`p-2 rounded-lg transition-colors ${
                      isNeon 
                        ? 'hover:bg-white/10 text-gray-400' 
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                  {/* Sync Status */}
                  <div className={`mb-6 p-4 rounded-lg ${
                    isNeon 
                      ? 'bg-gray-800/50 border border-gray-700/50' 
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <h3 className={`font-semibold mb-3 ${
                      isNeon ? 'text-white' : 'text-gray-900'
                    }`}>Sync Status</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>Authentication:</span>
                        <span className={`ml-2 font-medium ${
                          syncStatus.isAuthenticated 
                            ? isNeon ? 'text-green-400' : 'text-green-600'
                            : isNeon ? 'text-red-400' : 'text-red-600'
                        }`}>
                          {syncStatus.isAuthenticated ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>
                      <div>
                        <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>Last Sync:</span>
                        <span className={`ml-2 font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}
                        </span>
                      </div>
                      <div>
                        <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>Total Sales:</span>
                        <span className={`ml-2 font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          {syncStatus.totalSales}
                        </span>
                      </div>
                      <div>
                        <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>Total Revenue:</span>
                        <span className={`ml-2 font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          ${syncStatus.totalRevenue.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>Pending Payouts:</span>
                        <span className={`ml-2 font-medium ${isNeon ? 'text-yellow-400' : 'text-yellow-600'}`}>
                          {syncStatus.pendingPayouts}
                        </span>
                      </div>
                      <div>
                        <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>Auth Rate:</span>
                        <span className={`ml-2 font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          {syncStatus.authenticationRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Error Message */}
                  {stockxError && (
                    <div className={`mb-4 p-3 rounded-lg ${
                      isNeon 
                        ? 'bg-red-500/20 border border-red-500/30 text-red-400' 
                        : 'bg-red-50 border border-red-200 text-red-600'
                    }`}>
                      <AlertCircle className="w-4 h-4 inline mr-2" />
                      {stockxError}
                    </div>
                  )}

                  {/* Recent StockX Sales */}
                  {stockxSales.length > 0 && (
                    <div className="mb-6">
                      <h3 className={`font-semibold mb-3 ${
                        isNeon ? 'text-white' : 'text-gray-900'
                      }`}>Recent StockX Sales</h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {stockxSales.slice(0, 5).map((sale) => (
                          <div 
                            key={sale.id}
                            className={`p-3 rounded-lg flex items-center justify-between ${
                              isNeon 
                                ? 'bg-gray-800/50 border border-gray-700/50' 
                                : 'bg-gray-50 border border-gray-200'
                            }`}
                          >
                            <div className="flex-1">
                              <p className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                                {sale.product.productName}
                              </p>
                              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                                Size {sale.variant.size} • {sale.orderType} • {sale.status}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                                ${(Number(sale.pricing?.totalPayout) || 0).toFixed(2)}
                              </p>
                              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                                {new Date(sale.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-3">
                    {!syncStatus.isAuthenticated && (
                      <button
                        onClick={() => window.location.href = '/api/stockx/auth?returnTo=/dashboard?section=sales'}
                        className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                          isNeon 
                            ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25' 
                            : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                      >
                        Connect StockX Account
                      </button>
                    )}
                    
                    {syncStatus.isAuthenticated && (
                      <>
                        <button
                          onClick={async () => {
                            setIsSyncing(true);
                            await syncStockXSales(false, false);
                            setIsSyncing(false);
                          }}
                          disabled={isSyncing || stockxLoading}
                          className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                            (isSyncing || stockxLoading)
                              ? isNeon 
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : isNeon 
                                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                          }`}
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                          {isSyncing ? 'Syncing...' : lastSyncTime ? 'Sync New Sales' : 'Initial Sync (Last 30 Days)'}
                        </button>
                        
                        {/* Clear Sync History button */}
                        <button
                          onClick={async () => {
                            if (window.confirm('This will clear your sync history and treat the next sync as an initial sync. Continue?')) {
                              const cleared = await clearStockXSales();
                              if (cleared) {
                                alert('Sync history cleared! You can now do a fresh initial sync.');
                                await forceRefresh();
                              } else {
                                alert('Failed to clear sync history');
                              }
                            }
                          }}
                          className={`w-full px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                            isNeon 
                              ? 'bg-red-600 hover:bg-red-700 text-white border border-red-500' 
                              : 'bg-red-100 hover:bg-red-200 text-red-700'
                          }`}
                        >
                          Clear Sync History & Start Fresh
                        </button>
                        
                        {lastSyncTime && (
                          <button
                            onClick={async () => {
                              if (window.confirm('This will sync up to 90 days of sales history. This may take a while. Continue?')) {
                                setIsSyncing(true);
                                await syncStockXSales(false, true);
                                setIsSyncing(false);
                              }
                            }}
                            disabled={isSyncing || stockxLoading}
                            className={`w-full px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center text-sm ${
                              (isSyncing || stockxLoading)
                                ? isNeon 
                                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : isNeon 
                                  ? 'bg-gray-600 hover:bg-gray-700 text-gray-300 border border-gray-600' 
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            Full Sync (Last 90 Days)
                          </button>
                        )}
                        
                        {/* Refresh Payouts Button */}
                        {stockxSales.length > 0 && (
                          <button
                            onClick={() => refreshPayoutsInBackground()}
                            disabled={isSyncing || stockxLoading}
                            className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                              (isSyncing || stockxLoading)
                                ? isNeon 
                                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : isNeon 
                                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25' 
                                  : 'bg-green-500 hover:bg-green-600 text-white'
                            }`}
                          >
                            <DollarSign className="w-4 h-4 mr-2" />
                            Refresh Accurate Payouts
                          </button>
                        )}
                      </>
                    )}

                    {syncProgress && (
                      <div className="space-y-2">
                        <div className={`text-sm text-center ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`}>
                          {syncProgress.status}
                        </div>
                        {syncProgress && syncProgress.total > 0 && (
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                isNeon ? 'bg-cyan-500' : 'bg-blue-600'
                              }`}
                              style={{ width: `${syncProgress ? (syncProgress.current / syncProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {lastSyncTime && (
                      <p className={`text-sm text-center ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                        Last synced: {new Date(lastSyncTime).toLocaleString()}
                      </p>
                    )}
                    
                    <p className={`text-sm text-center ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                      {lastSyncTime 
                        ? 'Incremental sync will fetch new sales since last sync.'
                        : 'Initial sync will fetch sales from the last 30 days.'}
                    </p>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className={`flex items-center justify-between p-6 border-t ${
                  isNeon ? 'border-cyan-500/20' : 'border-gray-200'
                }`}>
                  <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                    {stockxSales.length} sales loaded from StockX
                  </p>
                  <button
                    onClick={() => setShowStockXModal(false)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isNeon 
                        ? 'text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600' 
                        : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Neon Notification */}
      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(prev => ({ ...prev, isVisible: false }))}
        />
      )}
    </div>
  );
};

export default Sales; 