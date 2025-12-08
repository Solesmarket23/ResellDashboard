'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Edit, MoreHorizontal, Camera, RefreshCw, Mail, Trash2, Settings, Plus, Shield, Wrench, Download, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../lib/firebase/firebaseUtils';
import { generateGmailSearchUrl, generateGmailShippedEmailUrl, formatOrderNumberForDisplay } from '../lib/utils/orderNumberUtils';
import { exportToCSV, exportToExcel, exportToJSON, getExportStats, ExportablePurchase } from '../lib/utils/exportUtils';
import { consolidatePurchasesByOrderNumber, getStatusPriority } from '../lib/utils/statusPriority';
import NativeBarcodeScannerModal from './NativeBarcodeScannerModal';
import ZXingScannerModal from './ZXingScannerModal';
import RemoteScanModal from './RemoteScanModal';
import PackageScannerModal from './PackageScannerModal';
import GmailConnector from './GmailConnector';
import EmailParsingSettings from './EmailParsingSettings';
import ImagePreviewModal from './ImagePreviewModal';
import AutoEmailSync from './AutoEmailSync';
import SimpleAutoSync from './SimpleAutoSync';
import GmailBatchedSync from './GmailBatchedSync';
import StreamingHistoricalSync from './StreamingHistoricalSync';
import StatusUpdater from './StatusUpdater';
import FixItemProducts from './FixItemProducts';
import NeonNotification, { NotificationType } from './NeonNotification';
import ProductSearch from './ProductSearch';

const Purchases = () => {
  // Temporary feature flag to disable Historical Sync UI (revert)
  const ENABLE_HISTORICAL_SYNC = false;
  const [sortBy, setSortBy] = useState('Purchase Date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showZXingScanModal, setShowZXingScanModal] = useState(false);
  const [showRemoteScanModal, setShowRemoteScanModal] = useState(false);
  const [showPackageScanModal, setShowPackageScanModal] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [manualPurchases, setManualPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ found: 0, stage: 'Connecting...' });
  const [loadingTimeouts, setLoadingTimeouts] = useState<NodeJS.Timeout[]>([]);
  const [totalValue, setTotalValue] = useState('$0.00');
  const [totalCount, setTotalCount] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [hasBeenReset, setHasBeenReset] = useState(false);
  const [showBatchedSync, setShowBatchedSync] = useState(false);
  const [showStreamingHistoricalSync, setShowStreamingHistoricalSync] = useState(false);
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  const [isAutoStatusEnabled, setIsAutoStatusEnabled] = useState(false);
  const [lastAutoStatusUpdate, setLastAutoStatusUpdate] = useState<Date | null>(null);
  const [showFixItemProducts, setShowFixItemProducts] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showMoreActionsDropdown, setShowMoreActionsDropdown] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [extractingTracking, setExtractingTracking] = useState<Set<string>>(new Set()); // Track which orders are being processed
  const [editingTracking, setEditingTracking] = useState<string | null>(null); // Track which purchase is being edited (by id or orderNumber)
  const [editingTrackingValue, setEditingTrackingValue] = useState<string>(''); // Current value being edited
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });
  const [backgroundPurchases, setBackgroundPurchases] = useState<any[]>([]);
  const [imagePreview, setImagePreview] = useState<{
    isOpen: boolean;
    imageUrl: string;
    productName: string;
    productBrand: string;
    productSize: string;
  }>({
    isOpen: false,
    imageUrl: '',
    productName: '',
    productBrand: '',
    productSize: ''
  });
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  // Handle live purchase updates from background sync
  const handleBackgroundPurchasesUpdate = (newPurchases: any[]) => {
    // Check if purchases were cleared - if so, ignore background updates
    const siteUserId = localStorage.getItem('siteUserId');
    const userId = user?.uid || siteUserId;
    if (userId) {
      const clearedFlag = localStorage.getItem(`purchases_cleared_${userId}`);
      if (clearedFlag === 'true') {
        console.log('⚠️ Purchases were cleared - ignoring background sync updates. Use "Sync Gmail" to restore.');
        return;
      }
    }
    
    setBackgroundPurchases(newPurchases);
    // Merge with existing purchases, avoiding duplicates
    setPurchases(prevPurchases => {
      const existingIds = new Set(prevPurchases.map(p => p.id));
      const uniqueNewPurchases = newPurchases.filter(p => !existingIds.has(p.id));
      const updatedPurchases = [...prevPurchases, ...uniqueNewPurchases];
      
      // Update totals after adding new purchases
      calculateTotals(updatedPurchases);
      
      return updatedPurchases;
    });
  };
  
  // Column width state with localStorage persistence
  const getStoredColumnWidths = () => {
    try {
      const stored = localStorage.getItem('purchases-column-widths');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure purchaseDate has a minimum width (might be missing or 0)
        if (!parsed.purchaseDate || parsed.purchaseDate < 100) {
          parsed.purchaseDate = 120;
        }
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to load column widths from localStorage:', error);
    }
    // Default widths
    return {
      checkbox: 50,
      product: 300,
      status: 120,
      orderNumber: 150,
      size: 100,
      styleId: 120,
      total: 130,
      purchaseDate: 120, // Minimum width for Purchase Date column
      tracking: 150,
      carrier: 100,
      actions: 80
    };
  };

  const [columnWidths, setColumnWidths] = useState(getStoredColumnWidths());

  // Save column widths to localStorage whenever they change
  const updateColumnWidths = (newWidths: typeof columnWidths) => {
    setColumnWidths(newWidths);
    try {
      localStorage.setItem('purchases-column-widths', JSON.stringify(newWidths));
    } catch (error) {
      console.warn('Failed to save column widths to localStorage:', error);
    }
  };
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [justClickedResize, setJustClickedResize] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Helper function to sort purchases
  const sortPurchases = (purchases: any[], sortKey: string, direction: 'asc' | 'desc') => {
    return [...purchases].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortKey) {
        case 'product':
          aValue = a.product?.name?.toLowerCase() || '';
          bValue = b.product?.name?.toLowerCase() || '';
          break;
        case 'orderNumber':
          aValue = a.orderNumber.toLowerCase();
          bValue = b.orderNumber.toLowerCase();
          break;
        case 'status':
          aValue = a.status.toLowerCase();
          bValue = b.status.toLowerCase();
          break;
        case 'tracking':
          aValue = a.tracking ? a.tracking.toLowerCase() : '';
          bValue = b.tracking ? b.tracking.toLowerCase() : '';
          break;
        case 'market':
          aValue = a.market.toLowerCase();
          bValue = b.market.toLowerCase();
          break;
        case 'price':
          aValue = parseFloat(a.price.replace('$', '').replace(',', ''));
          bValue = parseFloat(b.price.replace('$', '').replace(',', ''));
          break;
        case 'purchaseDate':
          // Handle various date formats and edge cases
          const aDate = a.purchaseDate;
          const bDate = b.purchaseDate;
          
          // Handle special cases (TBD, Unknown, N/A, Invalid Date)
          const specialCases = ['TBD', 'Unknown', 'N/A', 'Invalid Date', ''];
          const aIsSpecial = !aDate || specialCases.includes(aDate);
          const bIsSpecial = !bDate || specialCases.includes(bDate);
          
          // Parse actual dates
          const aParsed = aIsSpecial ? null : new Date(aDate).getTime();
          const bParsed = bIsSpecial ? null : new Date(bDate).getTime();
          
          // Check if parsing failed
          const aInvalid = aParsed === null || isNaN(aParsed);
          const bInvalid = bParsed === null || isNaN(bParsed);
          
          // Put invalid/special dates at the end
          if (aInvalid && bInvalid) {
            aValue = 0;
            bValue = 0;
          } else if (aInvalid) {
            // a is invalid, should go to end
            return direction === 'asc' ? 1 : -1;
          } else if (bInvalid) {
            // b is invalid, should go to end
            return direction === 'asc' ? -1 : 1;
          } else {
            aValue = aParsed;
            bValue = bParsed;
          }
          break;
        case 'dateAdded':
          // Handle date added with proper parsing
          const aDateAdded = a.dateAdded ? a.dateAdded.replace('\n', ' ') : '';
          const bDateAdded = b.dateAdded ? b.dateAdded.replace('\n', ' ') : '';
          
          const aAddedParsed = aDateAdded ? new Date(aDateAdded).getTime() : null;
          const bAddedParsed = bDateAdded ? new Date(bDateAdded).getTime() : null;
          
          const aAddedInvalid = aAddedParsed === null || isNaN(aAddedParsed);
          const bAddedInvalid = bAddedParsed === null || isNaN(bAddedParsed);
          
          if (aAddedInvalid && bAddedInvalid) {
            aValue = 0;
            bValue = 0;
          } else if (aAddedInvalid) {
            return direction === 'asc' ? 1 : -1;
          } else if (bAddedInvalid) {
            return direction === 'asc' ? -1 : 1;
          } else {
            aValue = aAddedParsed;
            bValue = bAddedParsed;
          }
          break;
        case 'verified':
          aValue = a.verified.toLowerCase();
          bValue = b.verified.toLowerCase();
          break;
        default:
          aValue = a[sortKey];
          bValue = b[sortKey];
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      const comparison = String(aValue).localeCompare(String(bValue));
      return direction === 'asc' ? comparison : -comparison;
    });
  };
  
  // Handle column header click for sorting
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

    // Set font to match table font
    context.font = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

    let maxWidth = context.measureText(headerText).width + 60; // Header + padding + sort icon

    // Get sorted purchases to check content
    const sortedPurchases = getSortedPurchases();

    // Check each row's content for this column
    sortedPurchases.forEach(purchase => {
      let cellContent = '';
      
      switch (columnKey) {
        case 'product':
          cellContent = purchase.product?.name || '';
          break;
        case 'orderNumber':
          cellContent = formatOrderNumberForDisplay(purchase.orderNumber) || '';
          break;
        case 'status':
          cellContent = purchase.deliveryStatus || purchase.status || '';
          break;
        case 'size':
          cellContent = purchase.product?.size || purchase.size || '';
          break;
        case 'styleId':
          cellContent = purchase.styleId || purchase.style_id || '';
          break;
        case 'total':
        case 'price':
          cellContent = purchase.totalAmount ? `$${typeof purchase.totalAmount === 'number' ? purchase.totalAmount.toFixed(2) : purchase.totalAmount}` : (purchase.price || '');
          break;
        case 'purchaseDate':
          // Use the same date formatting logic as gmail-test page
          // Priority: purchaseDate > purchase_date
          if (purchase.purchaseDate) {
            cellContent = formatPurchaseDate(purchase.purchaseDate);
          } else {
            // Fallback to purchase_date or email_date if purchaseDate is missing
            const fallbackDateStr = purchase.purchase_date || purchase.email_date;
            cellContent = formatPurchaseDate(fallbackDateStr);
          }
          break;
        case 'tracking':
          cellContent = purchase.tracking || (purchase.status?.toLowerCase() === 'ordered' ? 'Not Shipped Yet' : '');
          break;
        case 'carrier':
          // Show "-" if no tracking number, otherwise show carrier or "-" if not detected or invalid
          if (!purchase.tracking || purchase.tracking.trim() === '') {
            cellContent = '-';
          } else {
            const carrier = purchase.carrier;
            // Filter out invalid carriers using helper function
            if (!isValidCarrier(carrier)) {
              cellContent = '-';
            } else {
              cellContent = carrier;
            }
          }
          break;
        default:
          cellContent = '';
      }

      const textWidth = context.measureText(cellContent).width + 32; // Content + padding
      maxWidth = Math.max(maxWidth, textWidth);
    });

    // Add some extra padding and set reasonable min/max bounds
    return Math.min(Math.max(maxWidth + 20, 80), 400);
  };

  const handleDoubleClickResize = (columnKey: string, headerText: string) => {
    const optimalWidth = calculateOptimalWidth(columnKey, headerText);
    updateColumnWidths({
      ...columnWidths,
      [columnKey]: optimalWidth
    });
  };
  
  // Memoized sorted purchases - only recalculates when purchases, manualPurchases, sortBy, sortDirection, or searchQuery change
  const sortedPurchases = useMemo(() => {
    const allPurchases = [...purchases, ...manualPurchases];
    
    // Filter out invalid purchases first
    const validPurchases = allPurchases.filter(purchase => 
      purchase && 
      typeof purchase === 'object' && 
      purchase.orderNumber
    );
    
    // Deduplicate by order number before sorting using status priority system
    const uniqueMap = new Map();
    validPurchases.forEach(purchase => {
      const existing = uniqueMap.get(purchase.orderNumber);
      if (!existing) {
        // No existing purchase, add this one
        uniqueMap.set(purchase.orderNumber, purchase);
      } else {
        // Compare priorities: Refunded (10) > Partially Refunded (9) > Delivered (8) > Shipped (6) > Ordered (4)
        const existingPriority = getStatusPriority(existing.status || 'Ordered');
        const newPriority = getStatusPriority(purchase.status || 'Ordered');
        
        if (newPriority > existingPriority) {
          // New purchase has higher priority status, replace existing
          uniqueMap.set(purchase.orderNumber, purchase);
        } else if (newPriority === existingPriority && purchase.tracking && !existing.tracking) {
          // Same priority but new one has tracking info, replace existing
          uniqueMap.set(purchase.orderNumber, purchase);
        }
        // Otherwise keep existing
      }
    });
    
    let uniquePurchases = Array.from(uniqueMap.values());
    
    // Apply search filter if search query exists
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      uniquePurchases = uniquePurchases.filter(purchase => {
        // Search across multiple fields
        const productName = (purchase.product?.name || purchase.productName || '').toLowerCase();
        const orderNumber = (purchase.orderNumber || '').toLowerCase();
        const tracking = (purchase.tracking || '').toLowerCase();
        const size = (purchase.product?.size || purchase.size || '').toLowerCase();
        const brand = (purchase.product?.brand || purchase.brand || '').toLowerCase();
        const status = (purchase.status || '').toLowerCase();
        const styleId = (purchase.styleId || purchase.style_id || '').toLowerCase();
        
        return productName.includes(query) ||
               orderNumber.includes(query) ||
               tracking.includes(query) ||
               size.includes(query) ||
               brand.includes(query) ||
               status.includes(query) ||
               styleId.includes(query);
      });
    }
    
    // Debug logging
    console.log(`📊 Purchase counts: Total=${allPurchases.length}, Valid=${validPurchases.length}, Unique=${uniquePurchases.length}, Filtered=${uniquePurchases.length}`);
    
    return sortPurchases(uniquePurchases, sortBy, sortDirection);
  }, [purchases, manualPurchases, sortBy, sortDirection, searchQuery]);

  // Paginate the sorted purchases
  const paginatedPurchases = useMemo(() => {
    if (itemsPerPage === -1) {
      // Show all items
      return sortedPurchases;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedPurchases.slice(startIndex, endIndex);
  }, [sortedPurchases, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(sortedPurchases.length / itemsPerPage);
  }, [sortedPurchases.length, itemsPerPage]);

  // Reset to page 1 when search query or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  // Keep getSortedPurchases for backward compatibility with existing code
  const getSortedPurchases = useCallback(() => sortedPurchases, [sortedPurchases]);
  
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
  
  // Handle mouse down on resize handle
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

  // Add debouncing to prevent rapid API calls
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const FETCH_COOLDOWN = 5000; // 5 seconds cooldown between fetches

  // Reset any stale sync state on mount (e.g., after page refresh)
  useEffect(() => {
    // Close any lingering sync modal from previous session
    setShowBatchedSync(false);
    // Reset cooldown timer to allow immediate sync
    setLastFetchTime(0);
    console.log('🔄 Reset sync state on component mount');
  }, []); // Run once on mount

  // Load data on component mount
  useEffect(() => {
    // Debug Firebase status
    console.log('🔍 Firebase Debug Info:');
    console.log('  - Firebase API Key set:', !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
    console.log('  - Firebase Project ID set:', !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    console.log('  - Firebase Auth Domain set:', !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
    
    // Only load purchases if user is available AND component is visible
    // This prevents loading on initial dashboard render
    const siteUserId = localStorage.getItem('siteUserId');
    const userId = user?.uid || siteUserId;
    
    // Check if purchases were cleared - if so, don't auto-load
    if (userId) {
      const clearedFlag = localStorage.getItem(`purchases_cleared_${userId}`);
      if (clearedFlag === 'true') {
        console.log('⚠️ Purchases were cleared - skipping auto-load on mount. Use "Sync Gmail" to restore.');
        setPurchases([]);
        setManualPurchases([]);
        setTotalValue('$0.00');
        setTotalCount(0);
        setLoading(false);
      } else {
        // Lazy load: Only load if we're on the purchases section
        const isPurchasesSection = window.location.search.includes('section=purchases');
        if (isPurchasesSection) {
          console.log('🔄 Loading purchases (on purchases page)...');
          loadManualPurchasesFromFirebase();
        } else {
          console.log('⏭️ Skipping purchases load (not on purchases page yet)');
          setLoading(false);
        }
      }
    }
    
    // Check Gmail connection status on mount
    checkGmailConnectionStatus();
  }, [user]);

  // Check Gmail connection status
  const checkGmailConnectionStatus = async () => {
    try {
      console.log('🔍 Checking Gmail connection status...');
      
      // First check client-side cookies as a quick indicator
      const hasClientCookie = document.cookie.includes('gmail_connected=true');
      console.log('🍪 Client-side cookie check:', hasClientCookie);
      
      const response = await fetch('/api/gmail/status');
      const data = await response.json();
      console.log('📧 Gmail status:', data);
      setGmailConnected(data.connected);
      
      // If Gmail is connected, load purchases from Gmail
      if (data.connected) {
        console.log('✅ Gmail connected, loading purchases...');
        // The loadManualPurchasesFromFirebase will handle loading Gmail purchases
      } else if (hasClientCookie && !data.connected) {
        console.log('⚠️ Client cookie exists but server says not connected - possible cookie sync issue');
      }
    } catch (error) {
      console.error('❌ Error checking Gmail status:', error);
      setGmailConnected(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showExportDropdown) {
        if (!target.closest('.export-dropdown')) {
          setShowExportDropdown(false);
        }
      }
      if (showMoreActionsDropdown) {
        if (!target.closest('.more-actions-dropdown')) {
          setShowMoreActionsDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportDropdown, showMoreActionsDropdown]);

  // Periodic Gmail connection check
  useEffect(() => {
    const interval = setInterval(() => {
      checkGmailConnectionStatus();
    }, 60000); // Check every 60 seconds (reduced frequency for better performance)

    return () => clearInterval(interval);
  }, []);

  // Separate useEffect for config updates with debouncing - REMOVED lastFetchTime dependency
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleConfigUpdate = () => {
      // Clear any existing timeout
      clearTimeout(timeoutId);
      
      // Debounce the config update - but don't auto-fetch
      timeoutId = setTimeout(() => {
        console.log('Email config updated - manual refresh required');
      }, 1000);
    };

    window.addEventListener('emailConfigUpdated', handleConfigUpdate);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('emailConfigUpdated', handleConfigUpdate);
    };
  }, [gmailConnected]);

  // Show notification helper
  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ isVisible: true, message, type });
  };

  // Export functions
  const convertToExportablePurchases = (purchases: any[]): ExportablePurchase[] => {
    return purchases.map(purchase => ({
      id: purchase.id?.toString() || '',
      productName: purchase.product?.name || '',
      brand: purchase.product?.brand || '',
      size: purchase.product?.size || '',
      orderNumber: purchase.orderNumber || '',
      status: purchase.status || '',
      tracking: purchase.tracking || '',
      market: purchase.market || purchase.marketplace || '',
      price: purchase.price || '',
      originalPrice: purchase.originalPrice || '',
      purchaseDate: purchase.purchaseDate || '',
      dateAdded: purchase.dateAdded || '',
      verified: purchase.verified || '',
      type: purchase.type || 'Unknown'
    }));
  };

  const handleExportCSV = () => {
    const allPurchases = getSortedPurchases();
    const exportablePurchases = convertToExportablePurchases(allPurchases);
    exportToCSV(exportablePurchases, 'purchases');
    setShowExportDropdown(false);
    showNotification('CSV export started!', 'success');
  };

  const handleExportExcel = () => {
    const allPurchases = getSortedPurchases();
    const exportablePurchases = convertToExportablePurchases(allPurchases);
    exportToExcel(exportablePurchases, 'purchases');
    setShowExportDropdown(false);
    showNotification('Excel export started!', 'success');
  };

  const handleExportJSON = () => {
    const allPurchases = getSortedPurchases();
    const exportablePurchases = convertToExportablePurchases(allPurchases);
    exportToJSON(exportablePurchases, 'purchases');
    setShowExportDropdown(false);
    showNotification('JSON export started!', 'success');
  };

  const handleExportSelected = () => {
    if (selectedPurchases.size === 0) {
      showNotification('Please select purchases to export', 'error');
      return;
    }

    const allPurchases = getSortedPurchases();
    const selectedPurchasesList = allPurchases.filter(purchase => 
      selectedPurchases.has(purchase.id?.toString() || '')
    );
    const exportablePurchases = convertToExportablePurchases(selectedPurchasesList);
    
    exportToExcel(exportablePurchases, 'selected-purchases');
    setShowExportDropdown(false);
    showNotification(`Exported ${selectedPurchases.size} selected purchases!`, 'success');
  };

  // Handle batched Gmail sync updates
  const handleBatchedPurchasesUpdate = async (allPurchases: any[]) => {
    console.log(`📧 Batched sync update: ${allPurchases.length} total purchases`);
    const siteUserId = localStorage.getItem('siteUserId');
    const userId = user?.uid || siteUserId;
    console.log(`🔍 DEBUG - Firebase user available:`, !!user, `user.uid:`, user?.uid);
    console.log(`🔍 DEBUG - Site password user available:`, !!siteUserId, `siteUserId:`, siteUserId);
    
    // REMOVED: Don't load from Firebase during batch updates - this was causing slow performance
    // Tracking numbers will be preserved when we save to Firebase later in handleBatchedSyncComplete
    // This avoids expensive Firebase reads on every batch update
    const existingPurchasesMap = new Map();
    console.log(`📦 Skipping existing purchases load during batch update (will preserve tracking on save)`);
    
    // Transform the data to match expected component format
    const transformPurchaseData = (purchase: any) => {
      // Check if we have an existing purchase with tracking number
      const existingPurchase = existingPurchasesMap.get(purchase.orderNumber);
      
      // Preserve tracking number from existing purchase if it exists, otherwise use new data
      const tracking = existingPurchase?.tracking || purchase.tracking || '';
      
      // Only set carrier if there's a tracking number
      let carrier = null;
      if (tracking && tracking.trim() !== '') {
        // If we have an existing purchase with a valid carrier, use it
        if (existingPurchase?.carrier && isValidCarrier(existingPurchase.carrier)) {
          carrier = existingPurchase.carrier;
        } else {
          // Re-detect carrier from tracking number
          carrier = detectCarrierFromTrackingNumber(tracking);
        }
      }
      // If no tracking number, carrier stays null (will show "-")
      
      return {
        ...purchase, // Spread all purchase fields first to preserve email_subject, email_date, etc. needed for consolidation
        product: {
          name: purchase.productName || purchase.product?.name || 'Unknown Product',
          brand: purchase.brand || purchase.product?.brand || 'Unknown Brand',
          size: purchase.size || purchase.product?.size || 'Unknown Size',
          image: purchase.productImageUrl || purchase.product?.image || `https://picsum.photos/200/200?random=${purchase.id?.substring(0, 4) || '1'}`,
          bgColor: purchase.product?.bgColor || 'bg-gray-500',
          color: purchase.product?.color || 'gray'
        },
        // Map other fields to expected format
        orderNumber: purchase.orderNumber || purchase.order_number,
        status: purchase.shippingStatus || purchase.status || 'Ordered',
        shipping_status: purchase.shipping_status || purchase.shippingStatus || purchase.status || 'Ordered', // Preserve for consolidation
        tracking: tracking,
        carrier: carrier, // Use re-detected carrier
        market: purchase.merchant || purchase.market || 'StockX',
        price: purchase.totalAmount ? `$${purchase.totalAmount.toFixed(2)}` : (purchase.price || '$0.00'),
        originalPrice: purchase.totalAmount ? `$${purchase.totalAmount.toFixed(2)} + $0.00` : (purchase.price || '$0.00'),
        // Preserve purchase date from consolidation (which should have used order confirmation email date)
        // Consolidation happens BEFORE transformation, so purchaseDate should already be correct
        purchaseDate: purchase.purchaseDate, // Use consolidated purchaseDate directly - don't override
        purchase_date: purchase.purchase_date || purchase.purchaseDate, // Preserve for consolidation
        email_date: purchase.email_date, // Preserve for consolidation
        email_subject: purchase.email_subject || purchase.subject, // Preserve for consolidation
        subject: purchase.subject || purchase.email_subject, // Preserve for consolidation
        dateAdded: purchase.createdAt || purchase.dateAdded || new Date().toISOString(),
        verified: purchase.verified || 'pending',
        verifiedColor: purchase.verifiedColor || 'orange',
        // Preserve the Firebase ID if it exists
        id: existingPurchase?.id || purchase.id
      };
    };
    
    // IMPORTANT: Consolidate FIRST before transforming, so order confirmation emails can be found
    // This ensures order confirmation emails are found even if they're in different batches
    // than delivery/shipped emails. Consolidation will set the correct purchase date.
    console.log(`🔄 Frontend consolidation: Starting with ${allPurchases.length} purchases`);
    
    // Group purchases by order number to see if we have duplicates
    const ordersMap = new Map<string, any[]>();
    allPurchases.forEach(p => {
      const orderNum = p.orderNumber || p.order_number;
      if (orderNum) {
        if (!ordersMap.has(orderNum)) ordersMap.set(orderNum, []);
        ordersMap.get(orderNum)!.push(p);
      }
    });
    
    // Log orders that have multiple emails (should be consolidated)
    const ordersWithMultipleEmails = Array.from(ordersMap.entries()).filter(([_, purchases]) => purchases.length > 1);
    console.log(`🔍 Found ${ordersWithMultipleEmails.length} orders with multiple emails (should consolidate):`);
    ordersWithMultipleEmails.slice(0, 5).forEach(([orderNum, purchases]) => {
      console.log(`   Order ${orderNum} (${purchases.length} emails):`, purchases.map(p => ({
        status: p.status || p.shipping_status,
        email_subject: (p.email_subject || p.subject || '').substring(0, 50),
        email_date: p.email_date,
        purchaseDate: p.purchaseDate
      })));
    });
    
    // Log sample purchases to verify they have email_subject and email_date
    if (allPurchases.length > 0) {
      // Find a delivery email to check
      const deliveryEmail = allPurchases.find(p => 
        (p.status || p.shipping_status || '').toLowerCase() === 'delivered' ||
        (p.email_subject || p.subject || '').toLowerCase().includes('delivered')
      );
      if (deliveryEmail) {
        console.log(`🔍 Sample DELIVERY email before consolidation:`, {
          orderNumber: deliveryEmail.orderNumber,
          status: deliveryEmail.status || deliveryEmail.shipping_status,
          email_subject: deliveryEmail.email_subject || deliveryEmail.subject,
          email_date: deliveryEmail.email_date,
          purchaseDate: deliveryEmail.purchaseDate
        });
        
        // Check if there's an order confirmation email for the same order
        const sameOrderEmails = allPurchases.filter(p => 
          (p.orderNumber || p.order_number) === (deliveryEmail.orderNumber || deliveryEmail.order_number)
        );
        console.log(`🔍 All emails for order ${deliveryEmail.orderNumber} (${sameOrderEmails.length} total):`, 
          sameOrderEmails.map(p => ({
            status: p.status || p.shipping_status,
            email_subject: (p.email_subject || p.subject || '').substring(0, 60),
            email_date: p.email_date
          }))
        );
      }
    }
    
    const consolidatedPurchases = consolidatePurchasesByOrderNumber(allPurchases);
    
    // After consolidation, convert any remaining "TBD" to "Unknown"
    // This means we never found an order confirmation email for this purchase
    consolidatedPurchases.forEach(purchase => {
      if (purchase.purchaseDate === 'TBD') {
        console.log(`⚠️ No order confirmation found for ${purchase.orderNumber} - setting purchaseDate to "Unknown"`);
        purchase.purchaseDate = 'Unknown';
      }
    });
    
    // Log consolidation results - check if purchase dates were corrected
    console.log(`🔄 Frontend consolidation: ${allPurchases.length} → ${consolidatedPurchases.length} consolidated purchases`);
    
    // Check specific orders that had delivery dates
    if (ordersWithMultipleEmails.length > 0) {
      const testOrder = ordersWithMultipleEmails[0][0];
      const consolidated = consolidatedPurchases.find(p => (p.orderNumber || p.order_number) === testOrder);
      if (consolidated) {
        console.log(`🔍 Order ${testOrder} AFTER consolidation:`, {
          purchaseDate: consolidated.purchaseDate,
          purchase_date: consolidated.purchase_date,
          email_date: consolidated.email_date,
          status: consolidated.status || consolidated.shipping_status,
          email_subject: consolidated.email_subject || consolidated.subject
        });
      }
    }
    
    // Transform AFTER consolidation so consolidated purchase dates are preserved
    const transformedPurchases = consolidatedPurchases.map(transformPurchaseData);
    
    console.log(`🔍 Sample batched transformed data:`, {
      original: allPurchases[0],
      transformed: transformedPurchases[0],
      hasProductSize: !!transformedPurchases[0].product?.size,
      productSize: transformedPurchases[0].product?.size,
      hasTracking: !!transformedPurchases[0].tracking,
      tracking: transformedPurchases[0].tracking,
      purchaseDate: transformedPurchases[0].purchaseDate
    });
    
    // MERGE new purchases with existing ones (don't replace)
    // Create a map of existing purchases by order number
    const existingOrderNumbers = new Set(purchases.map(p => p.orderNumber));
    
    // Filter out any new purchases that already exist (by order number)
    const newPurchasesOnly = consolidatedPurchases.filter(p => !existingOrderNumbers.has(p.orderNumber));
    
    // Merge: keep existing + add only new ones
    const mergedPurchases = [...purchases, ...newPurchasesOnly];
    
    console.log(`🔄 Merging purchases: ${purchases.length} existing + ${newPurchasesOnly.length} new = ${mergedPurchases.length} total`);
    
    setPurchases(mergedPurchases);
    
    // Combine with manual purchases for totals
    const combinedPurchases = [...transformedPurchases, ...manualPurchases];
    calculateTotals(combinedPurchases);
  };

  // Handle batched sync completion
  const handleBatchedSyncComplete = async (totalPurchases: number) => {
    console.log(`✅ Batched Gmail sync complete: Found ${totalPurchases} purchases`);
    
    // Clear the "purchases cleared" flag when user manually syncs
    const siteUserId = localStorage.getItem('siteUserId');
    const userId = user?.uid || siteUserId;
    if (userId) {
      localStorage.removeItem(`purchases_cleared_${userId}`);
      console.log('🔄 Cleared purchases_cleared flag - user manually synced');
    }
    
    // CRITICAL: Use the purchases state which was set by handleBatchedPurchasesUpdate
    // The purchases state is already consolidated and transformed
    console.log(`📦 Sync complete - purchases state has ${purchases.length} purchases`);
    
    // Log a few examples to verify purchase dates were set correctly
    const deliveryPurchases = purchases.filter(p => 
      (p.status || p.shipping_status || '').toLowerCase() === 'delivered'
    );
    if (deliveryPurchases.length > 0) {
      console.log(`🔍 Sample delivery purchases (checking purchase dates):`);
      deliveryPurchases.slice(0, 3).forEach(p => {
        console.log(`   Order ${p.orderNumber}: purchaseDate="${p.purchaseDate}", email_date="${p.email_date}", status="${p.status || p.shipping_status}"`);
      });
    }
    
    // Save Gmail purchases to Firebase - purchases were already set by handleBatchedPurchasesUpdate
    if ((user || siteUserId) && purchases.length > 0) {
      try {
        await saveGmailPurchasesToFirebase(purchases);
        console.log(`💾 Gmail purchases persisted to Firebase/localStorage for future refreshes`);
      } catch (error) {
        console.warn(`⚠️ Could not save to Firebase (permission issue): ${error}`);
        console.log(`📧 Gmail purchases are still available in memory for this session`);
      }
    } else if (!user && !siteUserId) {
      console.log(`📧 No user authentication - Gmail purchases available in memory only`);
    } else if (purchases.length === 0) {
      console.warn(`⚠️ No purchases to save - purchases state is empty!`);
    }
  };

  // 🔄 Function to refresh all purchases from Firebase
  const refreshAllPurchases = async () => {
    console.log('🔄 Refreshing all purchases from Firebase...');
    const siteUserId = localStorage.getItem('siteUserId');
    if (user || siteUserId) {
      await loadManualPurchasesFromFirebase();
    }
  };

  // 🔥 NEW: Function to save Gmail purchases to Firebase
  const saveGmailPurchasesToFirebase = async (gmailPurchases: any[]) => {
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    let isSitePasswordUser = false;
    
    if (user) {
      // Firebase user
      userId = user.uid;
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
        isSitePasswordUser = true;
      } else {
        console.warn('User not authenticated - cannot save Gmail purchases');
        return;
      }
    }

    try {
      console.log(`📧 Saving ${gmailPurchases.length} Gmail purchases for user ${userId}...`);
      
      // Use the shared consolidation utility with priority system
      const dedupedPurchases = consolidatePurchasesByOrderNumber(gmailPurchases);
      console.log(`🔄 Deduplication: ${gmailPurchases.length} purchases → ${dedupedPurchases.length} unique`);
      
      // Prepare purchase data with user ID
      const purchaseDataList = dedupedPurchases.map(purchase => ({
        ...purchase,
        userId: userId,
        createdAt: new Date().toISOString(),
        type: 'gmail', // Mark as Gmail import
        syncedAt: new Date().toISOString()
      }));
      
      if (isSitePasswordUser) {
        // For site password users, save to localStorage
        console.log('💾 Saving purchases to localStorage for site password user...');
        
        // Get existing purchases from localStorage
        const existingPurchases = JSON.parse(localStorage.getItem(`purchases_${userId}`) || '[]');
        
        // Remove old Gmail purchases for this user
        const filteredPurchases = existingPurchases.filter(
          (purchase: any) => !(purchase.userId === userId && purchase.type === 'gmail')
        );
        
        // Add new Gmail purchases
        const updatedPurchases = [...filteredPurchases, ...purchaseDataList];
        
        // Save to localStorage
        localStorage.setItem(`purchases_${userId}`, JSON.stringify(updatedPurchases));
        
        console.log(`✅ Gmail purchases saved to localStorage: ${purchaseDataList.length} unique purchases`);
        
        // Also try to save to Firebase as backup (might fail due to permissions)
        try {
          console.log('💾 Also attempting to save to Firebase as backup...');
          for (const purchaseData of purchaseDataList) {
            await addDocument('purchases', purchaseData);
          }
          console.log('✅ Also saved to Firebase as backup');
        } catch (firebaseError) {
          console.warn('⚠️ Firebase backup save failed (expected for site password users):', firebaseError);
        }
        
      } else {
        // For Firebase users, save to Firebase
        console.log('💾 Saving purchases to Firebase for Firebase user...');
        
        // Clear existing Gmail purchases for this user first
        console.log('🔍 Loading existing purchases to clear old ones...');
        const existingPurchases = await getDocuments('purchases');
        console.log(`📄 Found ${existingPurchases.length} existing purchases in Firebase`);
        
        const existingGmailPurchases = existingPurchases.filter(
          (purchase: any) => purchase.userId === userId && purchase.type === 'gmail'
        );
        
        console.log(`🗑️ Found ${existingGmailPurchases.length} existing Gmail purchases for user ${userId}`);
        
        // Delete old Gmail purchases
        for (const oldPurchase of existingGmailPurchases) {
          try {
            // Only attempt to delete if the purchase belongs to the current user
            if (oldPurchase.userId === userId || !oldPurchase.userId) {
              await deleteDocument('purchases', oldPurchase.id);
              console.log(`✅ Deleted old purchase ${oldPurchase.id}`);
            } else {
              console.warn(`⚠️ Skipping deletion of purchase ${oldPurchase.id} - belongs to different user (${oldPurchase.userId})`);
            }
          } catch (error) {
            console.warn(`⚠️ Could not delete old purchase ${oldPurchase.id}:`, error);
            // Continue with other deletions even if one fails
          }
        }
        
        // Create a map of existing purchases by order number for quick lookup
        const existingPurchasesMap = new Map();
        existingGmailPurchases.forEach((p: any) => {
          if (p.orderNumber) {
            existingPurchasesMap.set(p.orderNumber, p);
          }
        });
        
        console.log(`📋 Found ${existingPurchasesMap.size} existing purchases to check for updates`);
        
        // Save or update purchases (preserve manual edits)
        let savedCount = 0;
        let updatedCount = 0;
        let createdCount = 0;
        
        for (const purchaseData of purchaseDataList) {
          const orderNumber = purchaseData.orderNumber;
          const existingPurchase = existingPurchasesMap.get(orderNumber);
          
          if (existingPurchase) {
            // Purchase exists - update it, preserving manual edits
            console.log(`🔄 Updating existing purchase: ${orderNumber}`);
            
            // Merge new data with existing data, preserving manual edits
            // IMPORTANT: Prioritize purchaseDate from consolidated purchaseData (from order confirmation email)
            const updatedPurchase = {
              ...existingPurchase,
              // Update with new Gmail data
              product: purchaseData.product || existingPurchase.product,
              productName: purchaseData.productName || existingPurchase.productName,
              status: purchaseData.status || existingPurchase.status,
              price: purchaseData.price || existingPurchase.price,
              market: purchaseData.market || existingPurchase.market,
              // CRITICAL: Use purchaseDate from consolidated purchaseData (order confirmation date) if available
              // This overwrites the old delivery date with the correct purchase date
              purchaseDate: purchaseData.purchaseDate || existingPurchase.purchaseDate,
              purchase_date: purchaseData.purchase_date || purchaseData.purchaseDate || existingPurchase.purchase_date || existingPurchase.purchaseDate, // Preserve for consolidation
              emailSubject: purchaseData.emailSubject || purchaseData.email_subject || existingPurchase.emailSubject,
              email_subject: purchaseData.email_subject || purchaseData.emailSubject || existingPurchase.email_subject || existingPurchase.emailSubject, // Preserve for consolidation
              emailId: purchaseData.emailId || existingPurchase.emailId,
              emailDate: purchaseData.emailDate || purchaseData.email_date || existingPurchase.emailDate,
              email_date: purchaseData.email_date || purchaseData.emailDate || existingPurchase.email_date || existingPurchase.emailDate, // Preserve for consolidation
              shipping_status: purchaseData.shipping_status || purchaseData.status || existingPurchase.shipping_status || existingPurchase.status, // Preserve for consolidation
              // Preserve manual edits (tracking, notes, etc.)
              tracking: existingPurchase.tracking || purchaseData.tracking,
              // Only set carrier if there's a tracking number
              carrier: (() => {
                const tracking = existingPurchase.tracking || purchaseData.tracking;
                if (!tracking || tracking.trim() === '') return null;
                
                const existingCarrier = existingPurchase.carrier || purchaseData.carrier;
                // If carrier is invalid, re-detect
                if (existingCarrier && !isValidCarrier(existingCarrier)) {
                  return detectCarrierFromTrackingNumber(tracking);
                }
                // Use existing carrier if valid, otherwise detect from tracking
                return isValidCarrier(existingCarrier) ? existingCarrier : detectCarrierFromTrackingNumber(tracking);
              })(),
              notes: existingPurchase.notes,
              manualEdits: existingPurchase.manualEdits,
              // Update sync timestamp
              syncedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            await updateDocument('purchases', existingPurchase.id, updatedPurchase);
            updatedCount++;
            console.log(`✅ Updated purchase ${updatedCount}/${purchaseDataList.length}: ${orderNumber}`);
          } else {
            // New purchase - create it
            console.log(`💾 Creating new purchase: ${orderNumber} (${purchaseData.product?.name})`);
            await addDocument('purchases', purchaseData);
            createdCount++;
            console.log(`✅ Created purchase ${createdCount}/${purchaseDataList.length}: ${orderNumber}`);
          }
          savedCount++;
        }
        
        // Delete purchases that are no longer in Gmail (optional cleanup)
        const syncedOrderNumbers = new Set(purchaseDataList.map((p: any) => p.orderNumber));
        const purchasesToDelete = existingGmailPurchases.filter(
          (p: any) => p.orderNumber && !syncedOrderNumbers.has(p.orderNumber)
        );
        
        if (purchasesToDelete.length > 0) {
          console.log(`🗑️ Found ${purchasesToDelete.length} purchases no longer in Gmail - deleting...`);
          for (const oldPurchase of purchasesToDelete) {
            try {
              if (oldPurchase.userId === userId || !oldPurchase.userId) {
                await deleteDocument('purchases', oldPurchase.id);
                console.log(`🗑️ Deleted purchase no longer in Gmail: ${oldPurchase.orderNumber}`);
              }
            } catch (error) {
              console.warn(`⚠️ Could not delete purchase ${oldPurchase.id}:`, error);
            }
          }
        }
        
        console.log(`✅ Gmail sync complete: ${createdCount} created, ${updatedCount} updated, ${purchasesToDelete.length} deleted`);
      }
      
    } catch (error) {
      console.error('❌ Error saving Gmail purchases:', error);
    }
  };

  const loadMockData = () => {
    const mockPurchases = [
      {
        id: 1,
        product: {
          name: "Travis Scott Cactus Jack x Spider Days Before Rode...",
          brand: "Travis Scott",
          size: "Size US XL",
          image: "https://picsum.photos/200/200?random=1",
          bgColor: "bg-amber-900",
          color: "brown"
        },
        orderNumber: "81-CE1Y398K3Z",
        status: "Delivered",
        statusColor: "green",
        tracking: "888637538408",
        market: "StockX",
        price: "$118.90",
        originalPrice: "$118.90 + $0.00",
        purchaseDate: "Jun 23",
        dateAdded: "Jun 23\n4:15 PM",
        verified: "verified",
        verifiedColor: "green"
      },
      {
        id: 2,
        product: {
          name: "Denim Tears Cotton Wreath Hoodie Black Monochro...",
          brand: "Denim Tears",
          size: "Size US S",
          image: "https://picsum.photos/200/200?random=3",
          bgColor: "bg-gray-900",
          color: "black"
        },
        orderNumber: "81-DHFSC2NK16",
        status: "Shipped",
        statusColor: "blue",
        tracking: "882268115454",
        market: "StockX",
        price: "$197.83",
        originalPrice: "$197.83 + $0.00",
        purchaseDate: "Jun 23",
        dateAdded: "Jun 23\n4:15 PM",
        verified: "pending",
        verifiedColor: "orange"
      },
      {
        id: 3,
        product: {
          name: "Denim Tears The Cotton Wreath Sweatshirt Black",
          brand: "Denim Tears",
          size: "Size US M",
          image: "https://picsum.photos/200/200?random=5",
          bgColor: "bg-gray-900",
          color: "black"
        },
        orderNumber: "81-LG34U384ZP",
        status: "Delivered",
        statusColor: "green",
        tracking: "430386817447",
        market: "StockX",
        price: "$238.13",
        originalPrice: "$238.13 + $0.00",
        purchaseDate: "Jun 23",
        dateAdded: "Jun 23\n4:15 PM",
        verified: "pending",
        verifiedColor: "orange"
      }
    ];
    setPurchases(mockPurchases);
    calculateTotals(mockPurchases);
  };

  // Memoized calculateTotals to avoid recalculating on every render
  const calculateTotals = useCallback((purchaseList: any[]) => {
    const normalizePrice = (p: any): number => {
      if (!p) return 0;
      // Prefer numeric fields if present
      if (typeof p.price === 'number' && !isNaN(p.price)) return p.price;
      if (typeof p.totalPayment === 'number' && !isNaN(p.totalPayment)) return p.totalPayment;
      if (typeof p.purchasePrice === 'number' && !isNaN(p.purchasePrice)) return p.purchasePrice;

      // Parse common string formats like "$1,234.56" or "1,234.56 + $0.00"
      const tryStrings: (string | undefined)[] = [p.price, p.originalPrice];
      for (const s of tryStrings) {
        if (typeof s === 'string') {
          const num = parseFloat(s.replace(/[^0-9.\-]+/g, ''));
          if (!isNaN(num)) return num;
        }
      }
      return 0;
    };

    const total = purchaseList.reduce((sum, purchase) => sum + normalizePrice(purchase), 0);
    setTotalValue(`$${total.toLocaleString()}`);
    setTotalCount(purchaseList.length);
  }, []);

  // Automatically recalculate totals when sorted purchases change
  useEffect(() => {
    calculateTotals(sortedPurchases);
  }, [sortedPurchases, calculateTotals]);

  // Firebase functions for manual purchases
  const saveManualPurchaseToFirebase = async (purchase: any) => {
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    let isSitePasswordUser = false;
    
    if (user) {
      // Firebase user
      userId = user.uid;
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
        isSitePasswordUser = true;
      } else {
        console.warn('User not authenticated - cannot save purchase');
        return;
      }
    }

    try {
      const purchaseData = {
        ...purchase,
        userId: userId,
        createdAt: new Date().toISOString(),
        type: 'manual' // Distinguish from Gmail imports
      };
      
      if (isSitePasswordUser) {
        // For site password users, save to localStorage
        const existingPurchases = JSON.parse(localStorage.getItem(`purchases_${userId}`) || '[]');
        const updatedPurchases = [...existingPurchases, purchaseData];
        localStorage.setItem(`purchases_${userId}`, JSON.stringify(updatedPurchases));
        console.log('✅ Purchase saved to localStorage');
      } else {
        // For Firebase users, save to Firebase
        await addDocument('purchases', purchaseData);
        console.log('✅ Purchase saved to Firebase');
      }
    } catch (error) {
      console.error('❌ Error saving purchase:', error);
    }
  };

  const loadManualPurchasesFromFirebase = async () => {
    const startTime = Date.now();
    console.log('⏱️ loadManualPurchasesFromFirebase START');
    
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    let isSitePasswordUser = false;
    
    if (user) {
      // Firebase user
      userId = user.uid;
      console.log('🔐 Using Firebase user ID:', userId);
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
        isSitePasswordUser = true;
        console.log('🔐 Using site password user ID:', userId);
      } else {
        console.log('❌ No user authentication found (neither Firebase nor site password)');
        return;
      }
    }
    
    // Check if purchases were cleared - if so, don't auto-load until user manually syncs
    const clearedFlag = localStorage.getItem(`purchases_cleared_${userId}`);
    if (clearedFlag === 'true') {
      console.log('⚠️ Purchases were cleared - skipping auto-load. Use "Sync Gmail" to restore.');
      setPurchases([]);
      setManualPurchases([]);
      setTotalValue('$0.00');
      setTotalCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log(`⏱️ After initial checks: ${Date.now() - startTime}ms`);
      
      let allPurchases: any[] = [];
      
      if (isSitePasswordUser) {
        // For site password users, try localStorage first, then Firebase as fallback
        console.log('🔍 Loading purchases for site password user...');
        console.log(`⏱️ Before localStorage read: ${Date.now() - startTime}ms`);
        
        // Try localStorage first
        const localPurchases = localStorage.getItem(`purchases_${userId}`);
        if (localPurchases) {
          allPurchases = JSON.parse(localPurchases);
          console.log(`📄 Loaded ${allPurchases.length} purchases from localStorage`);
          console.log(`⏱️ After localStorage parse: ${Date.now() - startTime}ms`);
        } else {
          console.log('📄 No purchases found in localStorage, trying Firebase...');
          
          // Fallback to Firebase (might fail due to permissions)
          try {
            allPurchases = await getDocuments('purchases');
            console.log(`📄 Firebase returned ${allPurchases.length} total purchases`);
          } catch (firebaseError) {
            console.warn('⚠️ Firebase access failed for site password user:', firebaseError);
            allPurchases = [];
          }
        }
      } else {
        // For Firebase users, use Firebase directly
        console.log('🔍 Attempting to load purchases from Firebase...');
        console.log(`⏱️ Before Firebase read: ${Date.now() - startTime}ms`);
        allPurchases = await getDocuments('purchases');
        console.log(`📄 Firebase returned ${allPurchases.length} total purchases`);
        console.log(`⏱️ After Firebase read: ${Date.now() - startTime}ms`);
      }
      
      // Filter to only show purchases for this user
      const userPurchases = allPurchases.filter(
        (purchase: any) => purchase.userId === userId
      );
      
      console.log(`📄 Found ${userPurchases.length} purchases for user ${userId}`);
      console.log('🔍 User purchases details:', userPurchases.map(p => ({
        orderNumber: p.orderNumber,
        type: p.type,
        userId: p.userId,
        status: p.status
      })));
      
      // Debug: Log purchase types breakdown
      const typeBreakdown = userPurchases.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('📊 Purchase types breakdown:', typeBreakdown);
      
      // Transform Firebase data to expected component format
      const transformPurchaseData = (purchase: any) => {
        // Log purchase data for debugging
        console.log(`🔍 Transforming purchase: ${purchase.orderNumber}`, {
          tracking: purchase.tracking,
          carrier: purchase.carrier,
          hasTracking: !!(purchase.tracking && purchase.tracking.trim() !== '')
        });
        
        // Clean up invalid carrier values
        const cleanedPurchase = cleanupCarrier(purchase);
        
        console.log(`✅ After cleanup:`, {
          orderNumber: purchase.orderNumber,
          originalCarrier: purchase.carrier,
          cleanedCarrier: cleanedPurchase.carrier,
          wasChanged: purchase.carrier !== cleanedPurchase.carrier
        });
        
        // REMOVED: Don't update Firebase on every page load - this was causing 30+ second delays
        // Instead, carrier cleanup will happen when user manually edits tracking
        // if (cleanedPurchase.carrier !== purchase.carrier && purchase.id) {
        //   console.log(`💾 Updating carrier in Firebase for ${purchase.orderNumber}: ${purchase.carrier} → ${cleanedPurchase.carrier}`);
        //   updateDocument('purchases', purchase.id, { carrier: cleanedPurchase.carrier }, true).catch(err => {
        //     console.warn('Could not update carrier in Firebase:', err);
        //   });
        // }
        
        const tracking = cleanedPurchase.tracking || '';
        const carrier = cleanedPurchase.carrier;
        
        return {
          ...cleanedPurchase,
          product: {
            name: cleanedPurchase.productName || cleanedPurchase.product?.name || 'Unknown Product',
            brand: cleanedPurchase.brand || cleanedPurchase.product?.brand || 'Unknown Brand',
            size: cleanedPurchase.size || cleanedPurchase.product?.size || 'Unknown Size',
            image: cleanedPurchase.productImageUrl || cleanedPurchase.product?.image || `https://picsum.photos/200/200?random=${cleanedPurchase.id?.substring(0, 4) || '1'}`,
            bgColor: cleanedPurchase.product?.bgColor || 'bg-gray-500',
            color: cleanedPurchase.product?.color || 'gray'
          },
          // Map other fields to expected format
          orderNumber: cleanedPurchase.orderNumber,
          status: cleanedPurchase.shippingStatus || cleanedPurchase.status || 'Ordered',
          tracking: tracking,
          carrier: carrier, // Will be null if no tracking or invalid, will show "-"
          market: cleanedPurchase.merchant || cleanedPurchase.market || 'StockX',
          price: cleanedPurchase.totalAmount ? `$${cleanedPurchase.totalAmount.toFixed(2)}` : (cleanedPurchase.price || '$0.00'),
          originalPrice: cleanedPurchase.totalAmount ? `$${cleanedPurchase.totalAmount.toFixed(2)} + $0.00` : (cleanedPurchase.price || '$0.00'),
          // Use purchaseDate from consolidation if available, otherwise fall back to createdAt
          // Consolidation should have set purchaseDate from order confirmation email
          purchaseDate: cleanedPurchase.purchaseDate || cleanedPurchase.purchase_date || cleanedPurchase.createdAt || new Date().toISOString(),
          // Preserve consolidation fields
          purchase_date: cleanedPurchase.purchase_date || cleanedPurchase.purchaseDate,
          email_subject: cleanedPurchase.email_subject || cleanedPurchase.emailSubject,
          email_date: cleanedPurchase.email_date || cleanedPurchase.emailDate,
          shipping_status: cleanedPurchase.shipping_status || cleanedPurchase.status,
          dateAdded: cleanedPurchase.createdAt || new Date().toISOString(),
          verified: cleanedPurchase.verified || 'pending',
          verifiedColor: cleanedPurchase.verifiedColor || 'orange'
        };
      };

      // Separate manual and Gmail purchases
      const manualPurchases = userPurchases.filter(p => p.type === 'manual');
      const gmailPurchases = userPurchases.filter(p => p.type === 'gmail' || p.type === 'imported');
      
      console.log('🔍 Purchase type filtering:', {
        total: userPurchases.length,
        manual: manualPurchases.length,
        gmail: gmailPurchases.length,
        types: [...new Set(userPurchases.map(p => p.type))]
      });
      
      // IMPORTANT: Consolidate Gmail purchases BEFORE transforming
      // This ensures order confirmation emails are found and purchase dates are set correctly
      console.log(`🔄 Consolidating ${gmailPurchases.length} Gmail purchases before transformation...`);
      
      // Log sample purchases to verify they have consolidation fields
      if (gmailPurchases.length > 0) {
        console.log(`🔍 Sample purchase before consolidation:`, {
          orderNumber: gmailPurchases[0].orderNumber,
          status: gmailPurchases[0].status || gmailPurchases[0].shipping_status,
          email_subject: gmailPurchases[0].email_subject || gmailPurchases[0].emailSubject,
          email_date: gmailPurchases[0].email_date || gmailPurchases[0].emailDate,
          purchaseDate: gmailPurchases[0].purchaseDate,
          purchase_date: gmailPurchases[0].purchase_date
        });
      }
      
      const consolidatedGmailPurchases = consolidatePurchasesByOrderNumber(gmailPurchases);
      console.log(`✅ Consolidation: ${gmailPurchases.length} → ${consolidatedGmailPurchases.length} unique purchases`);
      
      // Log sample after consolidation to verify purchase date was set correctly
      if (consolidatedGmailPurchases.length > 0) {
        console.log(`🔍 Sample purchase AFTER consolidation:`, {
          orderNumber: consolidatedGmailPurchases[0].orderNumber,
          status: consolidatedGmailPurchases[0].status || consolidatedGmailPurchases[0].shipping_status,
          purchaseDate: consolidatedGmailPurchases[0].purchaseDate,
          purchase_date: consolidatedGmailPurchases[0].purchase_date,
          email_date: consolidatedGmailPurchases[0].email_date
        });
      }
      
      // Transform manual purchases
      const transformedManualPurchases = manualPurchases.map(transformPurchaseData);
      setManualPurchases(transformedManualPurchases);

      // Transform Gmail purchases AFTER consolidation (so purchase dates are correct)
      const transformedGmailPurchases = consolidatedGmailPurchases.map(transformPurchaseData);
      
      // Debug: Log sample transformed data to verify structure
      if (transformedGmailPurchases.length > 0) {
        console.log('🔍 Sample transformed purchase data:', {
          original: gmailPurchases[0],
          transformed: transformedGmailPurchases[0],
          hasProductSize: !!transformedGmailPurchases[0].product?.size,
          productSize: transformedGmailPurchases[0].product?.size
        });
      }
      
      // 🔥 Load Gmail purchases from Firebase if they exist
      if (transformedGmailPurchases.length > 0) {
        setPurchases(transformedGmailPurchases);
        console.log(`✅ Loaded ${transformedGmailPurchases.length} Gmail purchases from Firebase`);
      } else {
        console.log('⚠️ No Gmail purchases found in Firebase for this user');
        // Don't clear existing purchases - they might be in component state
        // setPurchases([]);
      }
      
      // Combine all purchases for display and deduplicate using priority system
      const allUserPurchases = [...transformedGmailPurchases, ...transformedManualPurchases];
      const combinedPurchases = consolidatePurchasesByOrderNumber(allUserPurchases);
      console.log(`🔄 Display deduplication: ${allUserPurchases.length} → ${combinedPurchases.length} unique`);
      
      // Totals will be recalculated automatically via useEffect when purchases change
      
      console.log('✅ Loaded purchases:', {
        manual: manualPurchases.length,
        gmail: gmailPurchases.length,
        total: combinedPurchases.length,
        userId: userId,
        source: isSitePasswordUser ? 'localStorage' : 'Firebase'
      });
      
      const totalTime = Date.now() - startTime;
      console.log(`⏱️ TOTAL loadManualPurchasesFromFirebase time: ${totalTime}ms`);
      
    } catch (error) {
      console.error('❌ Error loading purchases:', error);
      console.log(`⏱️ Error after: ${Date.now() - startTime}ms`);
    } finally {
      setLoading(false);
    }
  };

  const deleteManualPurchaseFromFirebase = async (purchaseId: string) => {
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    let isSitePasswordUser = false;
    
    if (user) {
      // Firebase user
      userId = user.uid;
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
        isSitePasswordUser = true;
      } else {
        console.warn('User not authenticated - cannot delete purchase');
        return;
      }
    }

    try {
      if (isSitePasswordUser) {
        // For site password users, delete from localStorage
        const existingPurchases = JSON.parse(localStorage.getItem(`purchases_${userId}`) || '[]');
        const updatedPurchases = existingPurchases.filter((p: any) => p.id !== purchaseId);
        localStorage.setItem(`purchases_${userId}`, JSON.stringify(updatedPurchases));
        console.log('✅ Purchase deleted from localStorage');
      } else {
        // For Firebase users, delete from Firebase
        await deleteDocument('purchases', purchaseId);
        console.log('✅ Purchase deleted from Firebase');
      }
      
      await loadManualPurchasesFromFirebase(); // Refresh the list
    } catch (error) {
      console.error('❌ Error deleting purchase:', error);
    }
  };

  const refreshPurchases = () => {
    if (gmailConnected) {
      const now = Date.now();
      // Respect cooldown period
      if (now - lastFetchTime >= FETCH_COOLDOWN) {
        setLastFetchTime(now);
        
        // Clear the "purchases cleared" flag when user manually syncs
        const siteUserId = localStorage.getItem('siteUserId');
        const userId = user?.uid || siteUserId;
        if (userId) {
          localStorage.removeItem(`purchases_cleared_${userId}`);
          console.log('🔄 Cleared purchases_cleared flag - user is manually syncing');
        }
        
        // Trigger the batched sync instead of the old fetchPurchases
        setShowBatchedSync(true);
      } else {
        // Show user they need to wait
        const remainingTime = Math.ceil((FETCH_COOLDOWN - (now - lastFetchTime)) / 1000);
        alert(`Please wait ${remainingTime} seconds before refreshing again to prevent rate limiting.`);
      }
    }
  };

  const performHistoricalSync = () => {
    if (!gmailConnected) {
      alert('Please connect Gmail first');
      return;
    }

    if (loading) {
      alert('Sync already in progress, please wait...');
      return;
    }

    const confirmed = window.confirm(
      'Historical Sync will search through ALL your emails to find purchases. This may take several minutes and will process up to 5000 emails. You will see live updates as purchases are found. Continue?'
    );

    if (!confirmed) return;

    setShowStreamingHistoricalSync(true);
  };

  // Handle streaming historical sync updates
  const handleStreamingPurchasesUpdate = async (newPurchases: any[]) => {
    console.log('📡 Received streaming update with', newPurchases.length, 'purchases');
    
    // Update local state immediately for live updates
    setPurchases(newPurchases);
    
    // Save to Firebase in the background
    try {
      await saveGmailPurchasesToFirebase(newPurchases);
      console.log('💾 Streaming purchases saved to Firebase');
    } catch (error) {
      console.warn('⚠️ Could not save streaming purchases to Firebase:', error);
    }
  };

  // Handle streaming historical sync completion
  const handleStreamingSyncComplete = async (totalPurchases: number) => {
    console.log('✅ Streaming historical sync complete:', totalPurchases, 'purchases');
    
    // Reload all purchases to get the complete picture
    await loadManualPurchasesFromFirebase();
    
    showNotification(
      `Historical sync complete! Found ${totalPurchases} purchases. Check the results below.`,
      'success'
    );
  };

  const manualStatusUpdate = async () => {
    console.log('🔄 MANUAL STATUS UPDATE: Button clicked!');
    console.log('🔄 MANUAL STATUS UPDATE: Gmail connected:', gmailConnected);
    console.log('🔄 MANUAL STATUS UPDATE: Purchases count:', purchases.length);
    console.log('🔄 MANUAL STATUS UPDATE: Loading state:', loading);
    console.log('🔄 MANUAL STATUS UPDATE: Is updating status:', isUpdatingStatus);
    
    if (isUpdatingStatus) {
      console.log('❌ MANUAL STATUS UPDATE: Already updating status');
      return;
    }
    
    if (!gmailConnected) {
      console.log('❌ MANUAL STATUS UPDATE: Gmail not connected');
      setNotification({
        isVisible: true,
        message: 'Gmail not connected',
        type: 'error'
      });
      return;
    }
    
    if (purchases.length === 0) {
      console.log('❌ MANUAL STATUS UPDATE: No purchases found');
      setNotification({
        isVisible: true,
        message: 'No purchases found',
        type: 'error'
      });
      return;
    }
    
    setIsUpdatingStatus(true);
    console.log('🔄 MANUAL STATUS UPDATE: Triggering status update for all orders...');
    
    try {
      const orderNumbers = purchases.map(p => p.orderNumber).filter(Boolean);
      console.log('🔄 MANUAL STATUS UPDATE: Order numbers to check:', orderNumbers);
      
      const response = await fetch('/api/gmail/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumbers })
      });

      console.log('🔄 MANUAL STATUS UPDATE: Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🔄 MANUAL STATUS UPDATE: Response data:', data);
        
        if (data.success && data.updatedOrders.length > 0) {
          console.log(`✅ MANUAL STATUS UPDATE: Updated ${data.updatedOrders.length} order statuses`);
          handleStatusUpdate(data.updatedOrders);
          setNotification({
            isVisible: true,
            message: `Updated ${data.updatedOrders.length} order statuses`,
            type: 'success'
          });
        } else {
          console.log(`ℹ️ MANUAL STATUS UPDATE: No status updates needed`);
          setNotification({
            isVisible: true,
            message: 'No status updates needed',
            type: 'info'
          });
        }
      } else {
        const errorData = await response.json();
        console.error('❌ MANUAL STATUS UPDATE: Status update failed with status:', response.status);
        console.error('❌ MANUAL STATUS UPDATE: Error data:', errorData);
        setNotification({
          isVisible: true,
          message: `Status update failed: ${errorData.error || 'Unknown error'}`,
          type: 'error'
        });
      }
    } catch (error) {
      console.error('❌ MANUAL STATUS UPDATE: Status update error:', error);
      setNotification({
        isVisible: true,
        message: `Status update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    setPurchases([]);
    setManualPurchases([]);
    setTotalValue('$0.00');
    setTotalCount(0);
    setShowResetConfirm(false);
    setHasBeenReset(true); // Mark that user has reset - prevents mock data from loading
    
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    let isSitePasswordUser = false;
    
    if (user) {
      // Firebase user
      userId = user.uid;
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
        isSitePasswordUser = true;
      }
    }
    
    // Clear data for this user
    if (userId) {
      try {
        if (isSitePasswordUser) {
          // For site password users, clear localStorage
          localStorage.removeItem(`purchases_${userId}`);
          console.log('✅ All purchases cleared from localStorage');
        } else {
          // For Firebase users, clear Firebase
          const allPurchases = await getDocuments('purchases');
          const userPurchases = allPurchases.filter(
            (purchase: any) => purchase.userId === userId
          );
          
          // Delete all purchases for this user (both manual and Gmail)
          let deletedCount = 0;
          for (const purchase of userPurchases) {
            if (purchase.id) {
              await deleteDocument('purchases', purchase.id);
              deletedCount++;
            }
          }
          
          console.log(`✅ All purchases cleared from Firebase: ${deletedCount} deleted`);
        }
        
        // Set a permanent flag in localStorage to prevent auto-reload until user manually syncs
        // This flag will be checked in loadManualPurchasesFromFirebase
        // The flag will be cleared when user clicks "Sync Gmail" button
        localStorage.setItem(`purchases_cleared_${userId}`, 'true');
        
      } catch (error) {
        console.error('❌ Error clearing purchases:', error);
      }
    }
    
    // Don't load mock data after reset - keep it truly empty
    // User can manually add purchases or sync with Gmail if needed
  };

  const cancelReset = () => {
    setShowResetConfirm(false);
  };

  const handleImageClick = (purchase: any) => {
    setImagePreview({
      isOpen: true,
      imageUrl: purchase.product?.image || '',
      productName: purchase.product?.name || 'Unknown Product',
      productBrand: purchase.product?.brand || 'Unknown Brand',
      productSize: purchase.product?.size || 'Unknown Size'
    });
  };

  const closeImagePreview = () => {
    setImagePreview(prev => ({ ...prev, isOpen: false }));
  };

  // Handle checkbox selection
  const handleSelectPurchase = (purchaseId: string) => {
    setSelectedPurchases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(purchaseId)) {
        newSet.delete(purchaseId);
      } else {
        newSet.add(purchaseId);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    const allPurchases = getSortedPurchases();
    if (selectedPurchases.size === allPurchases.length) {
      setSelectedPurchases(new Set());
    } else {
      const allIds = allPurchases.map(p => p.id.toString());
      setSelectedPurchases(new Set(allIds));
    }
  };

  // Handle delete selected purchases
  const handleDeleteSelected = async () => {
    if (selectedPurchases.size === 0) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete ${selectedPurchases.size} selected purchase${selectedPurchases.size > 1 ? 's' : ''}?`);
    if (!confirmDelete) return;

    try {
      const allPurchases = [...purchases, ...manualPurchases];
      let deletedCount = 0;
      
      for (const purchaseId of selectedPurchases) {
        const purchase = allPurchases.find(p => {
          // Handle both string and number IDs
          return p.id?.toString() === purchaseId;
        });
        
        if (purchase?.id) {
          // Only delete from Firebase if it has a Firebase document ID (not mock data)
          if (typeof purchase.id === 'string' && purchase.id.length > 10) {
            await deleteDocument('purchases', purchase.id);
            deletedCount++;
          }
        }
      }
      
      console.log(`✅ Deleted ${deletedCount} purchases from Firebase`);
      setSelectedPurchases(new Set());
      
      // Reload purchases
      const siteUserId = localStorage.getItem('siteUserId');
      if (user || siteUserId) {
        await loadManualPurchasesFromFirebase();
      } else {
        // If not logged in, just filter out the selected items from mock data
        const remainingPurchases = purchases.filter(p => !selectedPurchases.has(p.id?.toString()));
        setPurchases(remainingPurchases);
        calculateTotals([...remainingPurchases, ...manualPurchases]);
      }
    } catch (error) {
      console.error('❌ Error deleting selected purchases:', error);
      alert('Error deleting selected purchases. Please try again.');
    }
  };

  const getStatusBadge = (status: string, color: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap";
    if (currentTheme.name === 'Neon') {
      const colorClasses = {
        green: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
        orange: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
        yellow: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
        blue: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
        red: "bg-red-500/20 text-red-400 border border-red-500/30"
      };
      return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
    } else {
      const colorClasses = {
        green: "bg-green-100 text-green-800",
        orange: "bg-orange-100 text-orange-800",
        yellow: "bg-yellow-100 text-yellow-800",
        blue: "bg-blue-100 text-blue-800",
        red: "bg-red-100 text-red-800"
      };
      return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
    }
  };

  const getVerifiedIndicator = (verified: string, color: string) => {
    if (currentTheme.name === 'Neon') {
      const colorClasses = {
        green: "bg-emerald-500",
        orange: "bg-orange-500",
        red: "bg-red-500"
      };
      return `w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`;
    } else {
      const colorClasses = {
        green: "bg-green-500",
        orange: "bg-orange-500",
        red: "bg-red-500"
      };
      return `w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`;
    }
  };

  // Derive a color when statusColor is missing to keep badges color-coded
  // Format purchase date with proper handling of TBD, Unknown, and invalid dates
  const formatPurchaseDate = (dateString: string | undefined): string => {
    if (!dateString || dateString === 'N/A') return 'N/A';
    
    // Pass through TBD and Unknown without trying to parse as dates
    if (dateString === 'TBD' || dateString === 'Unknown') return dateString;
    
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) return 'Invalid Date';
      
      // Check if date is reasonable (between 2015 and now + 1 day)
      const now = new Date();
      const minDate = new Date('2015-01-01');
      const maxDate = new Date(now.getTime() + 86400000); // Now + 1 day
      
      if (date < minDate || date > maxDate) {
        console.warn(`⚠️ Date out of range: ${dateString} -> ${date.toISOString()}`);
        return 'Invalid Date';
      }
      
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (error) {
      console.error(`❌ Error parsing date: ${dateString}`, error);
      return 'Invalid Date';
    }
  };

  const deriveStatusColor = (status: string, explicitColor?: string) => {
    if (explicitColor) return explicitColor;
    const normalized = (status || '').toLowerCase();
    if (normalized.includes('deliver')) return 'green';
    if (normalized.includes('ship')) return 'blue';
    if (normalized.includes('refund')) return 'red'; // Full refund or partial refund
    if (normalized.includes('cancel')) return 'red';
    if (normalized.includes('pend')) return 'yellow';
    // Default for new orders or unknowns
    return 'orange';
  };

  // Helper function to check if a carrier value is valid
  const isValidCarrier = (carrier: string | null | undefined): boolean => {
    if (!carrier) return false;
    const carrierLower = carrier.toLowerCase().trim();
    
    // Filter out invalid carriers (stockx, StockX Logistics, etc.)
    // Log for debugging
    if (carrierLower.includes('stockx')) {
      console.log(`❌ Invalid carrier detected: "${carrier}"`);
      return false;
    }
    
    // Valid carriers (case-insensitive)
    const validCarriers = ['ups', 'fedex', 'usps', 'dhl', 'amazon', 'ontrac', 'lasership'];
    const isValid = validCarriers.includes(carrierLower);
    
    if (!isValid) {
      console.log(`⚠️ Unknown carrier: "${carrier}"`);
    }
    
    return isValid;
  };

  // Helper function to clean up invalid carrier values in a purchase
  const cleanupCarrier = (purchase: any): any => {
    const tracking = purchase.tracking || '';
    const carrier = purchase.carrier;
    
    console.log(`🧹 cleanupCarrier for ${purchase.orderNumber}:`, { tracking, carrier });
    
    // If no tracking number, carrier should be null
    if (!tracking || tracking.trim() === '') {
      console.log(`  → No tracking, setting carrier to null`);
      return { ...purchase, carrier: null };
    }
    
    // If carrier is invalid, try to detect from tracking number
    if (carrier && !isValidCarrier(carrier)) {
      console.log(`  → Invalid carrier "${carrier}", detecting from tracking...`);
      const detectedCarrier = detectCarrierFromTrackingNumber(tracking);
      console.log(`  → Detected carrier: ${detectedCarrier}`);
      return { ...purchase, carrier: detectedCarrier };
    }
    
    // If no carrier but we have tracking, try to detect
    if (!carrier) {
      console.log(`  → No carrier, detecting from tracking...`);
      const detectedCarrier = detectCarrierFromTrackingNumber(tracking);
      console.log(`  → Detected carrier: ${detectedCarrier}`);
      return { ...purchase, carrier: detectedCarrier };
    }
    
    console.log(`  → Carrier is valid, keeping: ${carrier}`);
    return purchase;
  };

  // Helper function to detect carrier from tracking number
  const detectCarrierFromTrackingNumber = (trackingNumber: string): string | null => {
    if (!trackingNumber || trackingNumber.trim() === '') {
      return null;
    }
    
    const cleanTracking = trackingNumber.replace(/[\s\-_]/g, '').toUpperCase();
    
    // UPS: Starts with 1Z and is 15-18 characters after 1Z (total 17-20)
    if (/^1Z[0-9A-Z]{15,18}$/.test(cleanTracking)) return 'UPS';
    
    // FedEx: 12-15 digits (most common), or 20+ digits (some formats)
    if (/^[0-9]{12,15}$/.test(cleanTracking)) return 'FedEx';
    if (/^[0-9]{20,}$/.test(cleanTracking)) return 'FedEx';
    
    // USPS: 20-22 digits starting with 9, or 13 digits starting with 9
    if (/^9[0-9]{19,21}$/.test(cleanTracking)) return 'USPS';
    if (/^9[0-9]{12}$/.test(cleanTracking)) return 'USPS';
    
    // DHL: 10 digits, or starts with DHL
    if (/^[0-9]{10}$/.test(cleanTracking)) return 'DHL';
    if (/^DHL[0-9A-Z]+$/.test(cleanTracking)) return 'DHL';
    
    // Amazon: Various formats
    if (/^TBA[0-9A-Z]+$/.test(cleanTracking)) return 'Amazon';
    if (/^AMZN[0-9A-Z]+$/.test(cleanTracking)) return 'Amazon';
    
    return null; // Return null if can't detect (will show as "-")
  };

  // Check if tracking number looks suspicious (might be incorrect)
  const isTrackingSuspicious = (tracking: string, carrier?: string): boolean => {
    if (!tracking || tracking.trim() === '') return false;
    
    const trimmed = tracking.trim();
    
    // UPS tracking should be 1Z + 16 alphanumeric (18 total)
    if (trimmed.startsWith('1Z') && trimmed.length === 18) {
      // If marked as UPS, it's valid
      if (carrier === 'UPS' || !carrier) return false;
      // If marked as something else, suspicious
      return true;
    }
    
    // FedEx tracking should be 10-22 digits, but typically 12 digits
    // NEVER starts with 9 (that's USPS format)
    // Any 12-digit number starting with 9 is suspicious (not valid FedEx format)
    if (/^\d{12}$/.test(trimmed) && trimmed.startsWith('9')) {
      console.log(`⚠️ Suspicious tracking detected: ${trimmed} (carrier: ${carrier}) - 12 digits starting with 9 is not valid FedEx format`);
      // Always suspicious - 12 digits starting with 9 is NOT valid FedEx
      return true;
    }
    
    // Valid FedEx format (12 digits, not starting with 9)
    if (/^\d{12}$/.test(trimmed) && !trimmed.startsWith('9')) {
      // If marked as FedEx, valid
      if (carrier === 'FedEx' || !carrier) return false;
      // If marked as something else, might be suspicious
      return carrier !== undefined;
    }
    
    // USPS tracking should be 20-22 digits starting with 9
    if (/^9\d{19,21}$/.test(trimmed)) {
      // If marked as USPS, valid
      if (carrier === 'USPS' || !carrier) return false;
      // If marked as something else, suspicious
      return true;
    }
    
    // If it's a number but doesn't match known formats, might be suspicious
    if (/^\d+$/.test(trimmed) && (trimmed.length < 10 || trimmed.length > 22)) {
      return true; // Wrong length for known carriers
    }
    
    // If it contains non-alphanumeric characters (except dashes in UPS), suspicious
    if (!/^[0-9A-Z-]+$/i.test(trimmed)) {
      return true;
    }
    
    return false;
  };

  const handleScanComplete = (trackingNumber: string) => {
    console.log('Scanned tracking number:', trackingNumber);
    setHasBeenReset(false); // Reset flag when user adds data
  };

  const handlePackageScanComplete = (trackingNumber: string, packageType: 'UPS' | 'FedEx' | 'Other') => {
    console.log('📦 Package scanned:', { trackingNumber, packageType });
    
    // Find matching purchase
    const allPurchases = [...purchases, ...manualPurchases];
    const matchedPurchase = allPurchases.find(purchase => {
      if (!purchase.tracking) return false;
      const cleanScanned = trackingNumber.replace(/\s+/g, '').toLowerCase();
      const cleanPurchase = purchase.tracking.replace(/\s+/g, '').toLowerCase();
      return cleanPurchase === cleanScanned;
    });

    if (matchedPurchase) {
      // Highlight the matched purchase in the table
      const tableElement = tableRef.current;
      if (tableElement) {
        const purchaseRow = tableElement.querySelector(`[data-purchase-id="${matchedPurchase.id}"]`);
        if (purchaseRow) {
          purchaseRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          purchaseRow.classList.add('bg-yellow-100', 'animate-pulse');
          setTimeout(() => {
            purchaseRow.classList.remove('bg-yellow-100', 'animate-pulse');
          }, 3000);
        }
      }
      
      alert(`📦 Package found!\n\n${packageType} Package: ${trackingNumber}\nProduct: ${matchedPurchase.product?.name || 'Unknown Product'}\nOrder: ${matchedPurchase.orderNumber}\nStatus: ${matchedPurchase.status}`);
    } else {
      // Show option to add as note or create new purchase
      const shouldAddNote = confirm(`Package not found in your orders.\n\n${packageType} Package: ${trackingNumber}\n\nWould you like to add this as a note to an existing purchase?`);
      
      if (shouldAddNote) {
        alert('Note: This feature will allow you to add tracking numbers to existing purchases. Coming soon!');
      }
    }
    
    setHasBeenReset(false);
  };

  const handleExtractTracking = async (purchase: any) => {
    if (!purchase.orderNumber) {
      setNotification({
        isVisible: true,
        message: 'Order number is required to extract tracking',
        type: 'error'
      });
      return;
    }

    // Mark as extracting
    setExtractingTracking(prev => new Set(prev).add(purchase.id || purchase.orderNumber));

    try {
      console.log(`🤖 Extracting tracking for order: ${purchase.orderNumber}`);
      
      // Use Gmail → StockX → FedEx flow for more accurate tracking extraction
      const response = await fetch('/api/gmail/extract-tracking-via-gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber: purchase.orderNumber
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Provide more helpful error messages
        let errorMessage = data.error || 'Failed to extract tracking number';
        
        if (data.requiresLogin) {
          errorMessage = 'StockX requires login. Please log in to StockX in your browser, then try again.';
        } else if (response.status === 404) {
          errorMessage = `Order not found or tracking not available. ${data.error || ''}`;
        } else if (data.suggestion) {
          // Include suggestion in error message
          errorMessage = `${errorMessage}. ${data.suggestion}`;
        }
        
        // Include debug info in development
        if (data.debug && process.env.NODE_ENV === 'development') {
          console.log('Debug info:', data.debug);
        }
        
        throw new Error(errorMessage);
      }

      if (data.success && data.trackingNumber) {
        console.log(`✅ Extracted tracking: ${data.trackingNumber} (${data.carrier})`);
        
        // Update the purchase with tracking number
        const updatedPurchase = {
          ...purchase,
          tracking: data.trackingNumber,
          carrier: data.carrier
        };

        // Update in state
        const allPurchases = [...purchases, ...manualPurchases];
        const purchaseIndex = allPurchases.findIndex(p => 
          (p.id && p.id === purchase.id) || 
          (p.orderNumber === purchase.orderNumber)
        );

        if (purchaseIndex !== -1) {
          if (purchaseIndex < purchases.length) {
            // Update in purchases
            const updatedPurchases = [...purchases];
            updatedPurchases[purchaseIndex] = updatedPurchase;
            setPurchases(updatedPurchases);
          } else {
            // Update in manualPurchases
            const updatedManualPurchases = [...manualPurchases];
            updatedManualPurchases[purchaseIndex - purchases.length] = updatedPurchase;
            setManualPurchases(updatedManualPurchases);
          }

          // Save to Firebase
          const siteUserId = localStorage.getItem('siteUserId');
          const userId = user?.uid || siteUserId;
          if (userId && updatedPurchase.id) {
            try {
              // Use 'purchases' collection to match where we load from
              await updateDocument('purchases', updatedPurchase.id, {
                tracking: data.trackingNumber,
                carrier: data.carrier
              }, true); // Use merge: true to only update these fields
              console.log(`✅ Saved tracking to Firebase: ${data.trackingNumber}`);
            } catch (error) {
              console.error('Error saving tracking to Firebase:', error);
            }
          }
        }

        const hadExistingTracking = purchase.tracking && purchase.tracking.trim() !== '';
        setNotification({
          isVisible: true,
          message: hadExistingTracking 
            ? `Tracking number updated: ${purchase.tracking} → ${data.trackingNumber} (${data.carrier})`
            : `Tracking number extracted: ${data.trackingNumber} (${data.carrier})`,
          type: 'success'
        });
      } else {
        throw new Error('No tracking number found');
      }
    } catch (error: any) {
      console.error('Error extracting tracking:', error);
      setNotification({
        isVisible: true,
        message: `Failed to extract tracking: ${error.message}`,
        type: 'error'
      });
    } finally {
      // Remove from extracting set
      setExtractingTracking(prev => {
        const next = new Set(prev);
        next.delete(purchase.id || purchase.orderNumber);
        return next;
      });
    }
  };

  const handleStartEditTracking = (purchase: any) => {
    setEditingTracking(purchase.id || purchase.orderNumber);
    setEditingTrackingValue(purchase.tracking || '');
  };

  const handleSaveTracking = async (purchase: any) => {
    const trackingNumber = editingTrackingValue.trim();
    const purchaseId = purchase.id || purchase.orderNumber;

    // Validate tracking number format (optional - allow any input)
    if (trackingNumber === '') {
      // Allow clearing tracking number - also clear carrier
      const updatedPurchase = {
        ...purchase,
        tracking: '',
        carrier: null
      };
      
      // Update in state
      const allPurchases = [...purchases, ...manualPurchases];
      const purchaseIndex = allPurchases.findIndex(p => 
        (p.id && p.id === purchase.id) || 
        (p.orderNumber === purchase.orderNumber)
      );

      if (purchaseIndex !== -1) {
        let updatedPurchases = [...purchases];
        let updatedManualPurchases = [...manualPurchases];
        
        if (purchaseIndex < purchases.length) {
          updatedPurchases[purchaseIndex] = updatedPurchase;
          setPurchases(updatedPurchases);
        } else {
          updatedManualPurchases[purchaseIndex - purchases.length] = updatedPurchase;
          setManualPurchases(updatedManualPurchases);
        }

        // Save to Firebase OR localStorage depending on auth type
        const siteUserId = localStorage.getItem('siteUserId');
        const userId = user?.uid || siteUserId;
        
        if (user && updatedPurchase.id) {
          // Firebase authenticated user - save to Firebase
          try {
            await updateDocument('purchases', updatedPurchase.id, {
              tracking: '',
              carrier: null
            }, true);
            console.log(`✅ Cleared tracking in Firebase`);
          } catch (error) {
            console.error('Error saving to Firebase:', error);
            setNotification({
              isVisible: true,
              message: `Tracking cleared locally but failed to save to Firebase: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error'
            });
          }
        } else if (siteUserId) {
          // Site password user - save to localStorage
          try {
            const allPurchasesForStorage = [...updatedPurchases, ...updatedManualPurchases];
            const storageKey = `purchases_${siteUserId}`;
            localStorage.setItem(storageKey, JSON.stringify(allPurchasesForStorage));
            console.log(`✅ Cleared tracking in localStorage`);
            console.log(`📦 Total purchases in storage: ${allPurchasesForStorage.length}`);
          } catch (error) {
            console.error('Error saving to localStorage:', error);
            setNotification({
              isVisible: true,
              message: `Failed to save to localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error'
            });
          }
        } else {
          console.warn('⚠️ Cannot save: missing userId', { userId, purchaseId: updatedPurchase.id });
        }
      }
      
      setEditingTracking(null);
      setEditingTrackingValue('');
      return;
    }

    try {
      // Auto-detect carrier from tracking number (only if tracking number exists)
      const detectedCarrier = trackingNumber ? detectCarrierFromTrackingNumber(trackingNumber) : null;
      
      // Update the purchase with tracking number and detected carrier (null if can't detect)
      const updatedPurchase = {
        ...purchase,
        tracking: trackingNumber,
        carrier: detectedCarrier // Will be null if can't detect, which will show "-"
      };

      // Update in state
      const allPurchases = [...purchases, ...manualPurchases];
      const purchaseIndex = allPurchases.findIndex(p => 
        (p.id && p.id === purchase.id) || 
        (p.orderNumber === purchase.orderNumber)
      );

      if (purchaseIndex !== -1) {
        let updatedPurchases = [...purchases];
        let updatedManualPurchases = [...manualPurchases];
        
        if (purchaseIndex < purchases.length) {
          // Update in purchases
          updatedPurchases[purchaseIndex] = updatedPurchase;
          setPurchases(updatedPurchases);
        } else {
          // Update in manualPurchases
          updatedManualPurchases[purchaseIndex - purchases.length] = updatedPurchase;
          setManualPurchases(updatedManualPurchases);
        }

        // Save to Firebase OR localStorage depending on auth type
        const siteUserId = localStorage.getItem('siteUserId');
        const userId = user?.uid || siteUserId;
        
        if (user && updatedPurchase.id) {
          // Firebase authenticated user - save to Firebase
          try {
            await updateDocument('purchases', updatedPurchase.id, {
              tracking: trackingNumber,
              carrier: updatedPurchase.carrier
            }, true);
            console.log(`✅ Saved tracking to Firebase: ${trackingNumber} (carrier: ${updatedPurchase.carrier || 'null'})`);
          } catch (error) {
            console.error('Error saving tracking to Firebase:', error);
            setNotification({
              isVisible: true,
              message: `Tracking saved locally but failed to save to Firebase: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error'
            });
          }
        } else if (siteUserId) {
          // Site password user - save to localStorage
          try {
            const allPurchasesForStorage = [...updatedPurchases, ...updatedManualPurchases];
            const storageKey = `purchases_${siteUserId}`;
            localStorage.setItem(storageKey, JSON.stringify(allPurchasesForStorage));
            console.log(`✅ Saved tracking to localStorage: ${trackingNumber} (carrier: ${updatedPurchase.carrier || 'null'})`);
            console.log(`📦 Total purchases in storage: ${allPurchasesForStorage.length}`);
          } catch (error) {
            console.error('Error saving to localStorage:', error);
            setNotification({
              isVisible: true,
              message: `Failed to save to localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error'
            });
          }
        } else {
          console.warn('⚠️ Cannot save: missing userId', { userId, purchaseId: updatedPurchase.id });
        }
      }

      setNotification({
        isVisible: true,
        message: `Tracking number saved: ${trackingNumber}`,
        type: 'success'
      });

      // Exit edit mode
      setEditingTracking(null);
      setEditingTrackingValue('');
    } catch (error: any) {
      console.error('Error saving tracking:', error);
      setNotification({
        isVisible: true,
        message: `Failed to save tracking: ${error.message}`,
        type: 'error'
      });
    }
  };

  const handleCancelEditTracking = () => {
    setEditingTracking(null);
    setEditingTrackingValue('');
  };

  // Handler for status updates from StatusUpdater component
  const handleStatusUpdate = async (statusUpdates: any[]) => {
    console.log('🔄 Applying status updates:', statusUpdates);
    
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    
    if (user) {
      // Firebase user
      userId = user.uid;
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
      } else {
        console.warn('User not authenticated - cannot update status');
        return;
      }
    }

    try {
      // Update purchases in state - force update even if status appears the same
      const updatedPurchases = purchases.map(purchase => {
        const statusUpdate = statusUpdates.find(update => update.orderNumber === purchase.orderNumber);
        if (statusUpdate) {
          console.log(`🔄 FORCE UPDATING status for ${purchase.orderNumber}: ${purchase.status} → ${statusUpdate.status}`);
          if (statusUpdate.tracking) {
            console.log(`📦 FORCE UPDATING tracking for ${purchase.orderNumber}: ${statusUpdate.tracking}`);
          }
          return {
            ...purchase,
            status: statusUpdate.status,
            statusColor: statusUpdate.statusColor,
            tracking: statusUpdate.tracking || purchase.tracking,
            lastUpdated: new Date().toISOString() // Add timestamp to force re-render
          };
        }
        return purchase;
      });

      const updatedManualPurchases = manualPurchases.map(purchase => {
        const statusUpdate = statusUpdates.find(update => update.orderNumber === purchase.orderNumber);
        if (statusUpdate) {
          console.log(`🔄 FORCE UPDATING status for ${purchase.orderNumber}: ${purchase.status} → ${statusUpdate.status}`);
          if (statusUpdate.tracking) {
            console.log(`📦 FORCE UPDATING tracking for ${purchase.orderNumber}: ${statusUpdate.tracking}`);
          }
          return {
            ...purchase,
            status: statusUpdate.status,
            statusColor: statusUpdate.statusColor,
            tracking: statusUpdate.tracking || purchase.tracking,
            lastUpdated: new Date().toISOString() // Add timestamp to force re-render
          };
        }
        return purchase;
      });

      // Update state immediately for UI responsiveness
      setPurchases(updatedPurchases);
      setManualPurchases(updatedManualPurchases);

      // Update Firebase for purchases that were modified
      const allUpdated = [...updatedPurchases, ...updatedManualPurchases];
      const modifiedPurchases = allUpdated.filter(purchase => 
        statusUpdates.find(update => update.orderNumber === purchase.orderNumber)
      );

      // Update each modified purchase in Firebase
      for (const purchase of modifiedPurchases) {
        // Only update if the purchase has a valid Firebase document ID
        // Firebase IDs are auto-generated strings, not order numbers
        // Skip if: no ID, looks like order number (75-XXXXX), or is just numbers/dashes
        if (!purchase.id || 
            purchase.id.startsWith('75-') || 
            purchase.id.match(/^[\d-]+$/) ||
            purchase.id.length < 15) { // Firebase IDs are typically 20+ characters
          console.log(`⏭️ Skipping Firebase update for ${purchase.orderNumber} - no valid Firebase document ID (id: ${purchase.id})`);
          continue;
        }
        
        try {
          await updateDocument('purchases', purchase.id, {
            status: purchase.status,
            statusColor: purchase.statusColor,
            tracking: purchase.tracking,
            userId: userId
          });
          console.log(`💾 Firebase updated for ${purchase.orderNumber}`);
        } catch (error) {
          console.error(`❌ Firebase update failed for ${purchase.orderNumber}:`, error);
        }
      }

      console.log(`✅ Status update complete: ${modifiedPurchases.length} purchases updated`);
      
      // Force recalculate totals to trigger UI refresh
      calculateTotals([...updatedPurchases, ...updatedManualPurchases]);
      
    } catch (error) {
      console.error('❌ Error applying status updates:', error);
    }
  };

  // One-time cleanup function to remove duplicates from Firebase
  const cleanupDuplicatesInFirebase = async () => {
    // Get user ID from either Firebase auth or site password auth
    let userId: string | null = null;
    
    if (user) {
      // Firebase user
      userId = user.uid;
    } else {
      // Check for site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (siteUserId) {
        userId = siteUserId;
      } else {
        console.warn('User not authenticated - cannot cleanup duplicates');
        return;
      }
    }
    
    try {
      console.log('🧹 Starting Firebase duplicate cleanup...');
      const allPurchases = await getDocuments('purchases');
      const userPurchases = allPurchases.filter((p: any) => p.userId === userId);
      
      // Group by order number
      const orderGroups = new Map();
      userPurchases.forEach((purchase: any) => {
        const group = orderGroups.get(purchase.orderNumber) || [];
        group.push(purchase);
        orderGroups.set(purchase.orderNumber, group);
      });
      
      let deletedCount = 0;
      
      // For each order with duplicates, keep the best one
      for (const [orderNumber, duplicates] of orderGroups.entries()) {
        if (duplicates.length > 1) {
          console.log(`🔍 Found ${duplicates.length} duplicates for order ${orderNumber}`);
          
          // Sort by priority: Delivered > Shipped > Ordered, then by tracking presence
          duplicates.sort((a: any, b: any) => {
            const statusPriority: Record<string, number> = { 'Delivered': 3, 'Shipped': 2, 'Ordered': 1 };
            const aPriority = statusPriority[a.status] || 0;
            const bPriority = statusPriority[b.status] || 0;
            
            if (aPriority !== bPriority) return bPriority - aPriority;
            if (a.tracking && !b.tracking) return -1;
            if (!a.tracking && b.tracking) return 1;
            return 0;
          });
          
          // Keep the first (best) one, delete the rest
          const toDelete = duplicates.slice(1);
          for (const duplicate of toDelete) {
            if (duplicate.id) {
              await deleteDocument('purchases', duplicate.id);
              deletedCount++;
              console.log(`🗑️ Deleted duplicate: ${orderNumber} (${duplicate.status})`);
            }
          }
        }
      }
      
      console.log(`✅ Cleanup complete: Deleted ${deletedCount} duplicates`);
      
      // Reload data
      await loadManualPurchasesFromFirebase();
      
    } catch (error) {
      console.error('❌ Error cleaning up duplicates:', error);
    }
  };

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      {/* Gmail Connection Status */}
      <div className="mb-6 space-y-4">
        <GmailConnector 
          key={currentTheme.name} 
          onConnectionChange={(connected) => {
            setGmailConnected(connected);
            if (connected) {
              setHasBeenReset(false); // Reset flag when Gmail connects
            }
          }} 
        />
        
      </div>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>Purchases</h1>
            <p className={`${currentTheme.colors.textSecondary} mt-1`}>
              {gmailConnected ? 
                `Showing ${totalCount} purchases from Gmail` : 
                `Showing ${totalCount} purchases (Demo data)`
              }
            </p>
          </div>
          
          <div className="text-right">
            <p className={`${currentTheme.colors.textSecondary}`}>Total value:</p>
            <p className={`text-xl font-bold ${currentTheme.colors.textPrimary}`}>{totalValue}</p>
            {gmailConnected && (
              <p className={`text-xs ${currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-600'} flex items-center justify-end mt-1`}>
                <Mail className="w-3 h-3 mr-1" />
                Live from Gmail
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 flex-wrap gap-2 mb-4">
            {selectedPurchases.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete Selected ({selectedPurchases.size})</span>
              </button>
            )}
            {gmailConnected && ENABLE_HISTORICAL_SYNC && (
              <button
                onClick={performHistoricalSync}
                disabled={loading}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-lg hover:shadow-violet-500/25' 
                    : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-indigo-500/25'
                } disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                <span>Historical Sync</span>
              </button>
            )}
            {/* Export Dropdown - Only show when there are purchases */}
            {totalCount > 0 && (
              <div className="relative export-dropdown">
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className={`flex items-center space-x-2 ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg hover:shadow-cyan-500/25' 
                      : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-indigo-500/25'
                  } text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
                >
                  <Download className="w-5 h-5" />
                  <span>Export</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              
              {showExportDropdown && (
                <div className={`absolute left-1/2 transform -translate-x-1/2 mt-2 w-56 ${currentTheme.name === 'Neon' ? 'bg-gray-900' : 'bg-white'} ${currentTheme.colors.border} border rounded-lg shadow-xl z-50`}>
                  <div className="py-2">
                    <button
                      onClick={handleExportExcel}
                      className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                        currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Export as Excel</span>
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                        currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>Export as CSV</span>
                    </button>
                    {selectedPurchases.size > 0 && (
                      <>
                        <div className={`border-t ${currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'} my-1`} />
                        <button
                          onClick={handleExportSelected}
                          className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                            currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                          }`}
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Export Selected ({selectedPurchases.size})</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              </div>
            )}
            
            <button
              onClick={refreshPurchases}
              disabled={loading || !gmailConnected || showBatchedSync}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-indigo-500/25' 
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-indigo-500/25'
              } disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              title={
                showBatchedSync 
                  ? 'Sync already in progress' 
                  : !gmailConnected 
                  ? 'Please connect Gmail first' 
                  : 'Sync your Gmail purchases'
              }
            >
              <RefreshCw className={`w-5 h-5 ${loading || showBatchedSync ? 'animate-spin' : ''}`} />
              <span>Sync Gmail</span>
            </button>
            
            <button
              onClick={() => setShowAddPurchaseModal(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 shadow-lg hover:shadow-blue-500/25' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg hover:shadow-green-500/25'
              } text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <Plus className="w-5 h-5" />
              <span>Add Purchase</span>
            </button>
            
            {/* More Actions Dropdown */}
            <div className="relative more-actions-dropdown">
              <button
                onClick={() => setShowMoreActionsDropdown(!showMoreActionsDropdown)}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span>More Actions</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showMoreActionsDropdown && (
                <div className={`absolute right-0 mt-2 w-56 ${currentTheme.name === 'Neon' ? 'bg-gray-900' : 'bg-white'} ${currentTheme.colors.border} border rounded-lg shadow-xl z-50`}>
                  <div className="py-2">
                    {gmailConnected && purchases.length > 0 && (
                      <button
                        onClick={() => {
                          manualStatusUpdate();
                          setShowMoreActionsDropdown(false);
                        }}
                        disabled={loading || isUpdatingStatus}
                        className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed ${
                          currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                        }`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isUpdatingStatus ? 'animate-spin' : ''}`} />
                        <span>{isUpdatingStatus ? 'Updating...' : 'Update Status'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleResetClick();
                        setShowMoreActionsDropdown(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                        currentTheme.name === 'Neon' ? 'hover:bg-red-500/20 text-red-400' : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clear All</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setShowEmailSettings(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
            
            {gmailConnected && totalCount > 0 && (
              <StatusUpdater 
                purchases={[...purchases, ...manualPurchases]}
                onStatusUpdate={handleStatusUpdate}
                isAutoEnabled={isAutoStatusEnabled}
                lastAutoUpdate={lastAutoStatusUpdate}
              />
            )}
        </div>
      </div>

      {/* Search Bar - Only show when there are purchases */}
      {totalCount > 0 && (
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product, order number, tracking, size, brand, style ID, or status..."
              className={`w-full px-4 py-3 pl-12 rounded-lg ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-900 border border-white/20 text-gray-300 placeholder-gray-500 focus:border-cyan-500'
                  : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500'
              } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                currentTheme.name === 'Neon' ? 'focus:ring-cyan-500' : 'focus:ring-indigo-500'
              } transition-all`}
            />
          <svg
            className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${
              currentTheme.name === 'Neon' ? 'text-gray-500' : 'text-gray-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${
                currentTheme.name === 'Neon' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
              } transition-colors`}
              title="Clear search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
          {searchQuery && (
            <p className={`mt-2 text-sm ${currentTheme.name === 'Neon' ? 'text-gray-400' : 'text-gray-600'}`}>
              Showing {sortedPurchases.length} result{sortedPurchases.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className={`w-6 h-6 animate-spin ${currentTheme.colors.accent} mr-2`} />
          <span className={`${currentTheme.colors.textSecondary}`}>Fetching purchases from Gmail...</span>
        </div>
      )}

      {/* Table */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg shadow-sm ${currentTheme.colors.border} border overflow-hidden`}>
        <div className="overflow-x-auto max-h-[70vh]">
          <table ref={tableRef} className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead className={`${
              currentTheme.name === 'Neon' 
                ? 'bg-gray-900 border-b border-white/10' 
                : 'bg-gray-50 border-b border-gray-200'
            } sticky top-0 z-10`}>
              <tr className="h-10">
                <th 
                  className={`relative px-3 py-0 h-10 align-middle text-center`} 
                  style={{ width: `${columnWidths.checkbox}px` }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPurchases.size > 0 && selectedPurchases.size === sortedPurchases.length}
                    onChange={handleSelectAll}
                    className={`rounded ${currentTheme.name === 'Neon' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} cursor-pointer`}
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.product}px` }}
                  onClick={() => handleSort('product')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Product
                      <SortIcon column="product" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
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
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.status}px` }}
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Status
                      <SortIcon column="status" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'status');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('status', 'Status');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.orderNumber}px` }}
                  onClick={() => handleSort('orderNumber')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Order #
                      <SortIcon column="orderNumber" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'orderNumber');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('orderNumber', 'Order Number');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.size}px` }}
                  onClick={() => handleSort('size')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Size
                      <SortIcon column="size" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
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
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.styleId}px` }}
                  onClick={() => handleSort('styleId')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Style ID
                      <SortIcon column="styleId" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'styleId');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('styleId', 'Style ID');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.tracking}px` }}
                  onClick={() => handleSort('tracking')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Tracking
                      <SortIcon column="tracking" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'tracking');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('tracking', 'Tracking');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.carrier}px` }}
                  onClick={() => handleSort('carrier')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Carrier
                      <SortIcon column="carrier" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'carrier');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('carrier', 'Carrier');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.total}px` }}
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Total
                      <SortIcon column="price" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'total');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('total', 'Total');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.purchaseDate}px` }}
                  onClick={() => handleSort('purchaseDate')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Purchase Date
                      <SortIcon column="purchaseDate" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'purchaseDate');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('purchaseDate', 'Purchase Date');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} 
                  style={{ width: `${columnWidths.actions}px` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Actions
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'actions');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('actions', 'Actions');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} ${
              currentTheme.name === 'Neon' ? 'divide-y divide-white/10' : 'divide-y divide-gray-100'
            }`}>
              {paginatedPurchases.map((purchase) => {
                // Safety check to ensure purchase exists and has required structure
                if (!purchase) return null;
                
                return (
                <tr 
                  key={purchase.id?.toString() || Math.random()} 
                  data-purchase-id={purchase.id}
                  className={`${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                  } transition-colors`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedPurchases.has(purchase.id?.toString() || '')}
                      onChange={() => handleSelectPurchase(purchase.id?.toString() || '')}
                      className={`rounded ${currentTheme.name === 'Neon' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} cursor-pointer`}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <div className="flex items-start gap-3 min-h-12">
                      <div 
                        className={`w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden ${purchase.product?.bgColor || 'bg-gray-100'} flex items-center justify-center shadow-sm mt-1 cursor-pointer hover:ring-2 hover:ring-offset-1 ${
                          currentTheme.name === 'Neon' ? 'hover:ring-cyan-400' : 'hover:ring-blue-400'
                        } transition-all duration-200`}
                        onClick={() => handleImageClick(purchase)}
                        title="Click to preview image"
                      >
                        <img 
                          src={purchase.product?.image || ''} 
                          alt={purchase.product?.name || 'Product'}
                          className="w-full h-full object-cover rounded-lg"
                          onLoad={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.parentElement!.classList.remove(purchase.product?.bgColor || 'bg-gray-100');
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            // Swap to a safe placeholder instead of removing the image element
                            if (target.getAttribute('data-fallback') !== '1') {
                              target.setAttribute('data-fallback', '1');
                              target.src = '/placeholder-shoe.png';
                              target.style.display = 'block';
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} leading-tight`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {purchase.product?.name || 'Unknown Product'}
                        </div>
                        <div className={`text-xs ${currentTheme.colors.textSecondary}`} style={{ wordBreak: 'break-word' }}>
                          {purchase.product?.brand || 'Unknown Brand'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={getStatusBadge(purchase.status, deriveStatusColor(purchase.status, purchase.statusColor))}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <a 
                      href={generateGmailSearchUrl(purchase.orderNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${currentTheme.colors.accent} text-sm font-medium hover:underline whitespace-nowrap transition-colors`}
                    >
                      {formatOrderNumberForDisplay(purchase.orderNumber)}
                    </a>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {purchase.product?.size || purchase.size || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm font-mono ${currentTheme.colors.textPrimary}`}>
                      {purchase.styleId || purchase.style_id || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    {editingTracking === (purchase.id || purchase.orderNumber) ? (
                      // Inline editing mode
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingTrackingValue}
                          onChange={(e) => setEditingTrackingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveTracking(purchase);
                            } else if (e.key === 'Escape') {
                              handleCancelEditTracking();
                            }
                          }}
                          autoFocus
                          className={`text-sm px-2 py-1 border rounded ${
                            currentTheme.name === 'Neon' 
                              ? 'bg-black/50 border-cyan-500 text-white' 
                              : 'bg-white border-gray-300 text-gray-900'
                          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                          placeholder="Enter tracking number"
                          style={{ minWidth: '150px' }}
                        />
                        <button
                          onClick={() => handleSaveTracking(purchase)}
                          className={`px-2 py-1 text-xs rounded ${
                            currentTheme.name === 'Neon'
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : 'bg-green-500 hover:bg-green-600 text-white'
                          } transition-colors`}
                          title="Save (Enter)">
                          ✓
                        </button>
                        <button
                          onClick={handleCancelEditTracking}
                          className={`px-2 py-1 text-xs rounded ${
                            currentTheme.name === 'Neon'
                              ? 'bg-red-500 hover:bg-red-600 text-white'
                              : 'bg-red-500 hover:bg-red-600 text-white'
                          } transition-colors`}
                          title="Cancel (Esc)">
                          ✕
                        </button>
                      </div>
                    ) : purchase.tracking && purchase.tracking.trim() !== '' ? (
                      // Display mode with tracking
                      isTrackingSuspicious(purchase.tracking, purchase.carrier) ? (
                        // Suspicious tracking - show edit button and Gmail link
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleStartEditTracking(purchase)}
                            className={`${currentTheme.colors.accent} text-sm hover:underline transition-colors cursor-pointer`}
                            title="Click to edit tracking number">
                            {purchase.tracking}
                          </button>
                          <a
                            href={generateGmailShippedEmailUrl(purchase.orderNumber)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${currentTheme.colors.accent} text-xs hover:underline transition-colors cursor-pointer flex items-center gap-1`}
                            title="Tracking number may be incorrect. Click to open shipped email in Gmail">
                            <Mail className="w-3 h-3" />
                            View Email
                          </a>
                        </div>
                      ) : (
                        // Valid tracking - show normally with edit option
                        <button 
                          onClick={() => handleStartEditTracking(purchase)}
                          className={`${currentTheme.colors.accent} text-sm hover:underline transition-colors cursor-pointer`}
                          title="Click to edit">
                          {purchase.tracking}
                        </button>
                      )
                    ) : purchase.status?.toLowerCase() === 'ordered' ? (
                      // Ordered status - no tracking yet
                      <button
                        onClick={() => handleStartEditTracking(purchase)}
                        className={`text-sm ${currentTheme.colors.textSecondary} hover:underline cursor-pointer`}
                        title="Click to add tracking number">
                        Not Shipped Yet
                      </button>
                    ) : (purchase.status?.toLowerCase() === 'shipped' || purchase.status?.toLowerCase() === 'delivered') ? (
                      // Shipped/Delivered but no tracking - show "Add Tracking" button and "View Shipped Email" link
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEditTracking(purchase)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            currentTheme.name === 'Neon' ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-blue-500 hover:bg-blue-600'
                          } text-white hover:shadow-md`}
                          title="Click to add tracking number">
                          Add Tracking
                        </button>
                        <a
                          href={generateGmailShippedEmailUrl(purchase.orderNumber)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${currentTheme.colors.accent} text-xs hover:underline transition-colors cursor-pointer flex items-center gap-1`}
                          title="Click to open shipped email in Gmail and manually add tracking number"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Mail className="w-3 h-3" />
                          View Email
                        </a>
                      </div>
                    ) : (
                      // No tracking - show add button
                      <button
                        onClick={() => handleStartEditTracking(purchase)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          currentTheme.name === 'Neon' ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-blue-500 hover:bg-blue-600'
                        } text-white hover:shadow-md`}
                        title="Click to add tracking number">
                        Add Tracking
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {(() => {
                        // Show "-" if no tracking number
                        const tracking = purchase.tracking;
                        const carrier = purchase.carrier;
                        
                        // Debug log what we're about to render
                        if (carrier && carrier.toLowerCase().includes('stockx')) {
                          console.error(`🚨 RENDERING STOCKX CARRIER:`, {
                            orderNumber: purchase.orderNumber,
                            tracking,
                            carrier,
                            purchaseObject: purchase
                          });
                        }
                        
                        if (!tracking || tracking.trim() === '') {
                          return '-';
                        }
                        // Filter out invalid carriers and show "-" if invalid
                        // Double-check: if carrier contains "stockx" in any form, show "-"
                        if (!carrier || 
                            !isValidCarrier(carrier) ||
                            (typeof carrier === 'string' && carrier.toLowerCase().includes('stockx'))) {
                          return '-';
                        }
                        // Show valid carrier
                        return carrier;
                      })()}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                      {purchase.price || purchase.totalAmount ? (
                        typeof purchase.totalAmount === 'number' 
                          ? `$${purchase.totalAmount.toFixed(2)}`
                          : purchase.price
                      ) : '—'}
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary} font-medium`}>
                      {(() => {
                        // Prioritize consolidated purchaseDate (from order confirmation email)
                        if (purchase.purchaseDate) {
                          // Check if it's already formatted (e.g., "Dec 1")
                          const shortFormatPattern = /^[A-Za-z]{3}\s+\d{1,2}$/;
                          if (shortFormatPattern.test(purchase.purchaseDate)) {
                            return purchase.purchaseDate; // Use formatted string directly
                          }
                          // Try to parse as Date
                          const parsedDate = new Date(purchase.purchaseDate);
                          if (!isNaN(parsedDate.getTime())) {
                            return parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }
                        }
                        // Fallback to purchase_date (ISO string from consolidation)
                        if (purchase.purchase_date) {
                          const fallbackDate = new Date(purchase.purchase_date);
                          if (!isNaN(fallbackDate.getTime())) {
                            return fallbackDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }
                        }
                        // DO NOT use email_date - it's the delivery/shipped date, not the purchase date!
                        // If we don't have a purchase date, show "Unknown"
                        return <span className={`text-xs ${currentTheme.colors.textSecondary}`}>Unknown</span>;
                      })()}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className="flex items-center space-x-1">
                      <button className={`p-1 ${currentTheme.colors.textSecondary} ${
                        currentTheme.name === 'Neon' ? 'hover:text-cyan-400 hover:bg-white/10' : 'hover:text-gray-600 hover:bg-gray-100'
                      } rounded transition-colors`}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className={`p-1 ${currentTheme.colors.textSecondary} ${
                        currentTheme.name === 'Neon' ? 'hover:text-cyan-400 hover:bg-white/10' : 'hover:text-gray-600 hover:bg-gray-100'
                      } rounded transition-colors`}>
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${currentTheme.colors.border}`}>
          <div className="flex items-center gap-4">
            <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
              {sortedPurchases.length === 0 
                ? 'No purchases to display' 
                : `Showing ${(currentPage - 1) * (itemsPerPage === -1 ? sortedPurchases.length : itemsPerPage) + 1} to ${Math.min(currentPage * (itemsPerPage === -1 ? sortedPurchases.length : itemsPerPage), sortedPurchases.length)} of ${sortedPurchases.length} purchase${sortedPurchases.length === 1 ? '' : 's'}`
              }
            </span>
            
            <div className="flex items-center gap-2">
              <span className={`text-sm ${currentTheme.colors.textSecondary}`}>Results per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gray-900 border border-white/20 text-gray-300'
                    : 'bg-white border border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 ${
                  currentTheme.name === 'Neon' ? 'focus:ring-cyan-500' : 'focus:ring-indigo-500'
                }`}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>All</option>
              </select>
            </div>
          </div>
          
          {itemsPerPage !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === 1
                    ? 'opacity-50 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                First
              </button>
              
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === 1
                    ? 'opacity-50 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Previous
              </button>
              
              <span className={`px-4 py-1.5 text-sm ${currentTheme.colors.textPrimary}`}>
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === totalPages
                    ? 'opacity-50 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Next
              </button>
              
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === totalPages
                    ? 'opacity-50 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Last
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Native Barcode Scanner Modal */}
      <NativeBarcodeScannerModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScanComplete={handleScanComplete}
      />

      {/* ZXing Scanner Modal */}
      <ZXingScannerModal
        isOpen={showZXingScanModal}
        onClose={() => setShowZXingScanModal(false)}
        onScanComplete={handleScanComplete}
      />

      {/* Remote Scan Modal */}
      <RemoteScanModal
        isOpen={showRemoteScanModal}
        onClose={() => setShowRemoteScanModal(false)}
        onScanComplete={handleScanComplete}
      />

      {/* 📦 NEW: Package Scanner Modal */}
      <PackageScannerModal
        isOpen={showPackageScanModal}
        onClose={() => setShowPackageScanModal(false)}
        onScanComplete={handlePackageScanComplete}
        purchases={[...purchases, ...manualPurchases]}
      />

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border rounded-lg p-6 max-w-md w-full mx-4`}>
            <div className="flex items-center mb-4">
              <Trash2 className={`w-6 h-6 ${
                currentTheme.name === 'Neon' ? 'text-red-400' : 'text-red-600'
              } mr-3`} />
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Reset All Purchases</h3>
            </div>
            <p className={`${currentTheme.colors.textSecondary} mb-6`}>
              Are you sure you want to clear all purchases from the database? This action cannot be undone.
              <br /><br />
              <strong className={currentTheme.colors.textPrimary}>This will:</strong>
              <ul className={`list-disc list-inside mt-2 space-y-1 ${currentTheme.colors.textSecondary}`}>
                <li>Delete all purchases from Firebase/localStorage</li>
                <li>Keep your Gmail connection active</li>
                <li>Allow you to sync again to restore purchases</li>
              </ul>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelReset}
                className={`px-4 py-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                    : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                } rounded-lg font-medium transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className={`px-4 py-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } rounded-lg font-medium transition-colors`}
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Parsing Settings Modal */}
      <EmailParsingSettings
        isOpen={showEmailSettings}
        onClose={() => setShowEmailSettings(false)}
      />

      {/* Fix Item Products Modal */}
      <FixItemProducts
        isOpen={showFixItemProducts}
        onClose={() => setShowFixItemProducts(false)}
        onComplete={() => {
          setShowFixItemProducts(false);
          loadPurchases(); // Refresh purchases after fixing
        }}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={imagePreview.isOpen}
        onClose={closeImagePreview}
        imageUrl={imagePreview.imageUrl}
        productName={imagePreview.productName}
        productBrand={imagePreview.productBrand}
        productSize={imagePreview.productSize}
      />

      {/* Add Purchase Modal */}
      {showAddPurchaseModal && (
        <AddPurchaseModal 
          onClose={() => setShowAddPurchaseModal(false)}
          onSuccess={showNotification}
        />
      )}

      {/* Batched Gmail Sync - Draggable Notification */}
      {showBatchedSync && (
        <div className="fixed bottom-6 right-6 z-50 w-96">
          <div className="relative">
            <GmailBatchedSync
              onPurchasesUpdate={handleBatchedPurchasesUpdate}
              onSyncComplete={(totalPurchases) => {
                handleBatchedSyncComplete(totalPurchases);
                setShowBatchedSync(false);
              }}
              className=""
              autoStart={true}
              consolidatedCount={totalCount}
            />
            
            {/* Close button - positioned outside the card */}
            <button
              onClick={() => setShowBatchedSync(false)}
              className={`absolute -top-2 -right-2 p-1.5 rounded-full ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-white/20' 
                  : 'bg-white hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-300 shadow-lg'
              } transition-colors z-10`}
              title="Close sync panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

            {/* Streaming Historical Sync Modal (disabled via flag) */}
            {ENABLE_HISTORICAL_SYNC && (
              <StreamingHistoricalSync
                isOpen={showStreamingHistoricalSync}
                onClose={() => setShowStreamingHistoricalSync(false)}
                onPurchasesUpdate={handleStreamingPurchasesUpdate}
                onSyncComplete={handleStreamingSyncComplete}
              />
            )}
      
      {/* Neon Notification */}
      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, isVisible: false })}
        />
      )}
    </div>
  );
};

// Add Purchase Modal Component
const AddPurchaseModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: (message: string, type: NotificationType) => void }) => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    productName: '',
    brand: '',
    size: '',
    orderNumber: '',
    status: 'Pending',
    tracking: '',
    market: 'Manual',
    price: '',
    purchaseDate: '',
  });
  const [showProductSearch, setShowProductSearch] = useState(false);

  const handleProductSelect = (product: any) => {
    setFormData({
      ...formData,
      productName: product.name,
      brand: product.brand || '',
    });
    setShowProductSearch(false);
  };

  const handleProductNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, productName: value });
    setShowProductSearch(value.length >= 2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      onSuccess('Please sign in to add purchases', 'error');
      return;
    }

    // Create purchase object
    const newPurchase = {
      id: Date.now(), // Simple ID generation
      product: {
        name: formData.productName,
        brand: formData.brand,
        size: formData.size,
        image: "https://picsum.photos/200/200?random=" + Date.now(),
        bgColor: "bg-gray-900",
        color: "gray"
      },
      orderNumber: formData.orderNumber,
      status: formData.status,
      statusColor: formData.status === 'Delivered' ? 'green' : formData.status === 'Shipped' ? 'blue' : 'orange',
      tracking: formData.tracking,
      market: formData.market,
      price: `$${formData.price}`,
      originalPrice: `$${formData.price} + $0.00`,
      purchaseDate: new Date(formData.purchaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateAdded: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '\n' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      verified: 'pending',
      verifiedColor: 'orange'
    };

    try {
      const purchaseData = {
        ...newPurchase,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        type: 'manual'
      };
      
      await addDocument('purchases', purchaseData);
      onSuccess('Purchase added successfully!', 'success');
      onClose();
      
      // Refresh the page to show new purchase
      window.location.reload();
    } catch (error) {
      console.error('Error adding purchase:', error);
      onSuccess('Error adding purchase. Please try again.', 'error');
    }
  };

  return (
    <div className={`fixed inset-0 ${
      currentTheme.name === 'Neon' ? 'bg-black/80' : 'bg-black bg-opacity-50'
    } flex items-center justify-center z-50 p-4`}>
      <div className={`${
        currentTheme.name === 'Neon' 
          ? 'modal-premium border border-cyan-500/30 shadow-2xl shadow-cyan-500/20' 
          : `${currentTheme.colors.cardBackground} shadow-2xl border border-gray-200`
      } rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${
            currentTheme.name === 'Neon' ? 'text-white' : 'text-gray-900'
          }`}>Add Purchase</h3>
          <button
            onClick={onClose}
            className={`p-2 ${
              currentTheme.name === 'Neon' 
                ? 'text-gray-300 hover:text-white hover:bg-white/10' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            } rounded-xl transition-all duration-200`}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
              Product Name *
            </label>
            <input
              type="text"
              required
              value={formData.productName}
              onChange={handleProductNameChange}
              className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                currentTheme.name === 'Neon' 
                  ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                  : 'bg-white border-gray-300 focus:border-blue-500'
              } focus:outline-none`}
              placeholder="e.g., Nike Air Jordan 1 High OG"
            />
            <ProductSearch
              searchTerm={formData.productName}
              onProductSelect={handleProductSelect}
              isVisible={showProductSearch}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Brand *
              </label>
              <input
                type="text"
                required
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
                placeholder="e.g., Nike"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Size *
              </label>
              <input
                type="text"
                required
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
                placeholder="e.g., US 10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Price *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Purchase Date *
              </label>
              <input
                type="date"
                required
                value={formData.purchaseDate}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Order Number
              </label>
              <input
                type="text"
                value={formData.orderNumber}
                onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Tracking Number
              </label>
              <input
                type="text"
                value={formData.tracking}
                onChange={(e) => setFormData({ ...formData, tracking: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
              >
                <option value="Pending">Pending</option>
                <option value="Shipped">Shipped</option>
                <option value="Delivered">Delivered</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-gray-200' : 'text-gray-700'
            } mb-1`}>
                Market
              </label>
              <select
                value={formData.market}
                onChange={(e) => setFormData({ ...formData, market: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                    : 'bg-white border-gray-300 focus:border-blue-500'
                } focus:outline-none`}
              >
                <option value="Manual">Manual</option>
                <option value="StockX">StockX</option>
                <option value="GOAT">GOAT</option>
                <option value="eBay">eBay</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              } rounded-lg font-medium transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
              } text-white rounded-lg font-medium transition-all duration-200`}
            >
              Add Purchase
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Purchases; 