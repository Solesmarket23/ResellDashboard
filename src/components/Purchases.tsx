'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Edit, MoreHorizontal, Camera, RefreshCw, Mail, Trash2, Settings, Plus, Shield, Wrench, Download, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument, deleteDocument, subscribeToCollection } from '../lib/firebase/firebaseUtils';
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
  
  // ---- Money helpers (supports credits/discounts without overwriting the original total) ----
  const parseMoney = (val: unknown): number => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val !== 'string') return 0;
    const cleaned = val.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const getCreditsAmount = (purchase: any): number => {
    if (!purchase) return 0;
    // Support either `credits` or legacy `discounts` (strings or numbers)
    const raw = purchase.credits ?? purchase.discounts ?? 0;
    const n = parseMoney(raw);
    return n > 0 ? n : 0;
  };

  const getGrossAmount = (purchase: any): number => {
    if (!purchase) return 0;
    // Prefer numeric totals when they are meaningful (> 0). Avoid treating 0 as a real value,
    // because it can accidentally overwrite a purchase with "0" when only credits were edited.
    if (typeof purchase.totalAmount === 'number' && Number.isFinite(purchase.totalAmount) && purchase.totalAmount > 0) return purchase.totalAmount;
    if (typeof purchase.totalPayment === 'number' && Number.isFinite(purchase.totalPayment) && purchase.totalPayment > 0) return purchase.totalPayment;
    if (typeof purchase.purchasePrice === 'number' && Number.isFinite(purchase.purchasePrice) && purchase.purchasePrice > 0) return purchase.purchasePrice;
    // Fall back to strings (e.g. "$200.00", "200.00 + $0.00")
    const fromStrings = parseMoney(purchase.totalAmount ?? purchase.totalPayment ?? purchase.price ?? purchase.originalPrice ?? 0);
    return fromStrings > 0 ? fromStrings : 0;
  };

  const getNetAmount = (purchase: any): number => {
    // If we already stored netPaid, prefer it for display.
    if (typeof purchase?.netPaid === 'number' && Number.isFinite(purchase.netPaid)) return Math.max(0, purchase.netPaid);
    const gross = getGrossAmount(purchase);
    const credits = getCreditsAmount(purchase);
    return Math.max(0, gross - credits);
  };

  const formatUsd = (n: number): string => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
  // NOTE: sortBy should always store the internal column key (e.g. "purchaseDate"), not a label.
  const [sortBy, setSortBy] = useState('purchaseDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Smart Filters State
  const [activeFilters, setActiveFilters] = useState<{
    status: string[];
    carrier: string[];
    hasTracking: string | null; // 'with' | 'without' | null
    market: string[];
    size: string[];
  }>({
    status: [],
    carrier: [],
    hasTracking: null,
    market: [],
    size: []
  });
  const [showFilters, setShowFilters] = useState(false);
  const [sizeSearchQuery, setSizeSearchQuery] = useState('');
  const [showScanModal, setShowScanModal] = useState(false);
  const [showZXingScanModal, setShowZXingScanModal] = useState(false);
  const [showRemoteScanModal, setShowRemoteScanModal] = useState(false);
  const [showPackageScanModal, setShowPackageScanModal] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [manualPurchases, setManualPurchases] = useState<any[]>([]);
  // Raw count (unfiltered) so the UI doesn't disappear when search/filter yields zero results.
  const rawPurchaseCount = purchases.length + manualPurchases.length;
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
  const [showGmailBatchedSyncModal, setShowGmailBatchedSyncModal] = useState(false);
  
  // Debug: Track modal state changes
  useEffect(() => {
    console.log('🔄 Purchases: showGmailBatchedSyncModal changed to:', showGmailBatchedSyncModal);
  }, [showGmailBatchedSyncModal]);
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  const [isAutoStatusEnabled, setIsAutoStatusEnabled] = useState(false);
  const [lastAutoStatusUpdate, setLastAutoStatusUpdate] = useState<Date | null>(null);
  const [showFixItemProducts, setShowFixItemProducts] = useState(false);
  const [showMoreActionsDropdown, setShowMoreActionsDropdown] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [extractingTracking, setExtractingTracking] = useState<Set<string>>(new Set()); // Track which orders are being processed
  const [editingTracking, setEditingTracking] = useState<string | null>(null); // Track which purchase is being edited (by id or orderNumber)
  const [editingTrackingValue, setEditingTrackingValue] = useState<string>(''); // Current value being edited
  const [highlightedPurchase, setHighlightedPurchase] = useState<string | null>(null); // Track which purchase was clicked to view email

  // StockX cookie injection (for Puppeteer) - stored locally in the browser
  const [showStockxCookieModal, setShowStockxCookieModal] = useState(false);
  const [stockxCookieJson, setStockxCookieJson] = useState<string>(() => {
    try {
      return localStorage.getItem('stockxCookieJson') || '';
    } catch {
      return '';
    }
  });
  const [pendingExtractPurchase, setPendingExtractPurchase] = useState<any>(null);
  
  // Edit/Delete Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<any>(null);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [marketDropdownOpen, setMarketDropdownOpen] = useState(false);
  
  // Column Customization State
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('visibleColumns');
    return saved ? JSON.parse(saved) : {
      product: true,
      status: true,
      orderNumber: true,
      styleId: true,
      tracking: true,
      carrier: true,
      price: true,
      purchaseDate: true,
      actions: true
    };
  });


  // Apply column visibility via CSS
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'column-visibility-styles';
    
    const hiddenColumns = Object.entries(visibleColumns)
      .filter(([_, visible]) => !visible)
      .map(([column]) => column);
    
    const cssRules = hiddenColumns.map(column => {
      // Map column keys to their table positions
      // Current order: checkbox, product, status, orderNumber, brand, styleId, tracking, carrier, price, purchaseDate, actions
      const columnMap: Record<string, number> = {
        product: 2,
        status: 3,
        orderNumber: 4,
        brand: 5,
        styleId: 6,
        tracking: 7,
        carrier: 8,
        price: 9,
        purchaseDate: 10
      };
      
      const position = columnMap[column];
      if (!position) return '';
      
      return `
        table th:nth-child(${position}),
        table td:nth-child(${position}) {
          display: none !important;
        }
      `;
    }).join('\n');
    
    style.textContent = cssRules;
    
    // Remove old style if exists
    const oldStyle = document.getElementById('column-visibility-styles');
    if (oldStyle) oldStyle.remove();
    
    // Add new style
    if (cssRules) document.head.appendChild(style);
    
    return () => {
      const styleToRemove = document.getElementById('column-visibility-styles');
      if (styleToRemove) styleToRemove.remove();
    };
  }, [visibleColumns]);
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
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
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
          // Robust sorting across all pages: use a consistent derived timestamp.
          // We prefer true purchase date, but fall back to email_date / createdAt / syncedAt when needed.
          // This guarantees *every* row has a sortable date value.
          const getDateMs = (p: any): number | null => {
            const candidates: Array<string | undefined> = [
              p?.purchaseDate,
              p?.purchase_date,
              p?.email_date,
              p?.emailDate,
              p?.createdAt,
              p?.syncedAt,
              typeof p?.dateAdded === 'string' ? p.dateAdded.replace('\n', ' ') : undefined,
            ];
            for (const c of candidates) {
              if (!c) continue;
              if (c === 'TBD' || c === 'Unknown' || c === 'N/A' || c === 'Invalid Date') continue;
              const d = new Date(c);
              if (!isNaN(d.getTime())) return d.getTime();
            }
            return null;
          };

          const aParsed = getDateMs(a);
          const bParsed = getDateMs(b);

          const aInvalid = aParsed === null;
          const bInvalid = bParsed === null;

          // Put invalid dates at the end
          if (aInvalid && bInvalid) {
            aValue = 0;
            bValue = 0;
          } else if (aInvalid) {
            return direction === 'asc' ? 1 : -1;
          } else if (bInvalid) {
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

  // When the user changes sorting, reset to page 1 so the ordering feels consistent.
  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, sortDirection]);

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
          cellContent = formatUsd(getNetAmount(purchase));
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
  
  // Memoized sorted purchases - only recalculates when purchases, manualPurchases, sortBy, sortDirection, searchQuery, or activeFilters change
  const sortedPurchases = useMemo(() => {
    const allPurchases = [...purchases, ...manualPurchases];
    
    console.log(`🔍 SEARCH DEBUG:`, {
      searchQuery,
      purchasesCount: purchases.length,
      manualPurchasesCount: manualPurchases.length,
      allPurchasesCount: allPurchases.length
    });
    
    // Filter out invalid purchases first
    const validPurchases = allPurchases.filter(purchase => 
      purchase && 
      typeof purchase === 'object' && 
      purchase.orderNumber
    );
    
    console.log(`✅ Valid purchases: ${validPurchases.length}`);
    
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
    
    console.log(`🔢 After deduplication: ${uniquePurchases.length} unique purchases`);
    
    // Apply smart filters
    if (activeFilters.status.length > 0) {
      uniquePurchases = uniquePurchases.filter(purchase => {
        const status = (purchase.status || '').toLowerCase();
        return activeFilters.status.some(filterStatus => status.includes(filterStatus.toLowerCase()));
      });
    }
    
    if (activeFilters.carrier.length > 0) {
      uniquePurchases = uniquePurchases.filter(purchase => {
        const carrier = (purchase.carrier || '').toLowerCase();
        return activeFilters.carrier.some(filterCarrier => carrier === filterCarrier.toLowerCase());
      });
    }
    
    if (activeFilters.hasTracking === 'with') {
      uniquePurchases = uniquePurchases.filter(purchase => {
        const tracking = (purchase.tracking || '').trim();
        return tracking && tracking !== 'No tracking' && tracking !== '-';
      });
    } else if (activeFilters.hasTracking === 'without') {
      uniquePurchases = uniquePurchases.filter(purchase => {
        const tracking = (purchase.tracking || '').trim();
        return !tracking || tracking === 'No tracking' || tracking === '-';
      });
    }
    
    if (activeFilters.market.length > 0) {
      uniquePurchases = uniquePurchases.filter(purchase => {
        const market = (purchase.market || '').toLowerCase();
        const brand = (purchase.product?.brand || purchase.brand || '').toLowerCase();
        return activeFilters.market.some(filterMarket => 
          market.includes(filterMarket.toLowerCase()) || brand.includes(filterMarket.toLowerCase())
        );
      });
    }
    
    if (activeFilters.size.length > 0) {
      uniquePurchases = uniquePurchases.filter(purchase => {
        const size = (purchase.product?.size || purchase.size || '').toLowerCase();
        return activeFilters.size.some(filterSize => 
          size.includes(filterSize.toLowerCase())
        );
      });
    }
    
    console.log(`🎯 After filters: ${uniquePurchases.length} purchases`);
    
    // Apply search filter if search query exists
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      console.log(`🔎 Applying search filter: "${query}"`);
      
      const beforeSearch = uniquePurchases.length;
      uniquePurchases = uniquePurchases.filter(purchase => {
        // Search across multiple fields
        const productName = (purchase.product?.name || purchase.productName || '').toLowerCase();
        const orderNumber = (purchase.orderNumber || '').toLowerCase();
        const tracking = (purchase.tracking || '').toLowerCase();
        const size = (purchase.product?.size || purchase.size || '').toLowerCase();
        const brand = (purchase.product?.brand || purchase.brand || '').toLowerCase();
        const status = (purchase.status || '').toLowerCase();
        const styleId = (purchase.styleId || purchase.style_id || '').toLowerCase();
        
        const matches = productName.includes(query) ||
               orderNumber.includes(query) ||
               tracking.includes(query) ||
               size.includes(query) ||
               brand.includes(query) ||
               status.includes(query) ||
               styleId.includes(query);
        
        if (!matches) {
          console.log(`❌ No match for:`, {
            query,
            productName: productName.substring(0, 50),
            orderNumber,
            brand,
            size
          });
        }
        
        return matches;
      });
      console.log(`🔎 Search results: ${uniquePurchases.length} of ${beforeSearch} purchases match "${query}"`);
    }
    
    // Debug logging
    console.log(`📊 Purchase counts: Total=${allPurchases.length}, Valid=${validPurchases.length}, Unique=${uniquePurchases.length}, Filtered=${uniquePurchases.length}`);
    
    return sortPurchases(uniquePurchases, sortBy, sortDirection);
  }, [purchases, manualPurchases, sortBy, sortDirection, searchQuery, activeFilters]);

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

  // Reset to page 1 when search query, items per page, or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage, activeFilters]);

  // Keep getSortedPurchases for backward compatibility with existing code
  const getSortedPurchases = useCallback(() => sortedPurchases, [sortedPurchases]);
  
  // Get unique values for filters
  const getUniqueStatuses = useMemo(() => {
    const allPurchases = [...purchases, ...manualPurchases];
    const statuses = new Set<string>();
    allPurchases.forEach(purchase => {
      if (purchase.status) {
        statuses.add(purchase.status);
      }
    });
    return Array.from(statuses).sort();
  }, [purchases, manualPurchases]);

  const getUniqueCarriers = useMemo(() => {
    const allPurchases = [...purchases, ...manualPurchases];
    const carriers = new Set<string>();
    allPurchases.forEach(purchase => {
      if (purchase.carrier && purchase.carrier.toLowerCase() !== 'stockx') {
        carriers.add(purchase.carrier);
      }
    });
    return Array.from(carriers).sort();
  }, [purchases, manualPurchases]);

  const getUniqueMarkets = useMemo(() => {
    const allPurchases = [...purchases, ...manualPurchases];
    const markets = new Set<string>();
    allPurchases.forEach(purchase => {
      const market = purchase.market || purchase.product?.brand || purchase.brand;
      if (market) {
        markets.add(market);
      }
    });
    return Array.from(markets).sort();
  }, [purchases, manualPurchases]);

  const getUniqueSizes = useMemo(() => {
    const allPurchases = [...purchases, ...manualPurchases];
    const sizes = new Set<string>();
    allPurchases.forEach(purchase => {
      const size = purchase.product?.size || purchase.size;
      if (size && size !== 'Size not specified') {
        sizes.add(size);
      }
    });
    return Array.from(sizes).sort();
  }, [purchases, manualPurchases]);

  // Filter handlers
  const toggleStatusFilter = (status: string) => {
    setActiveFilters(prev => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status]
    }));
    setCurrentPage(1);
  };

  const toggleCarrierFilter = (carrier: string) => {
    setActiveFilters(prev => ({
      ...prev,
      carrier: prev.carrier.includes(carrier)
        ? prev.carrier.filter(c => c !== carrier)
        : [...prev.carrier, carrier]
    }));
    setCurrentPage(1);
  };

  const toggleTrackingFilter = (value: 'with' | 'without') => {
    setActiveFilters(prev => ({
      ...prev,
      hasTracking: prev.hasTracking === value ? null : value
    }));
    setCurrentPage(1);
  };

  const toggleMarketFilter = (market: string) => {
    setActiveFilters(prev => ({
      ...prev,
      market: prev.market.includes(market)
        ? prev.market.filter(m => m !== market)
        : [...prev.market, market]
    }));
    setCurrentPage(1);
  };

  const toggleSizeFilter = (size: string) => {
    setActiveFilters(prev => ({
      ...prev,
      size: prev.size.includes(size)
        ? prev.size.filter(s => s !== size)
        : [...prev.size, size]
    }));
    setCurrentPage(1);
  };

  const handleSizeSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && sizeSearchQuery.trim()) {
      const searchValue = sizeSearchQuery.trim();
      if (!activeFilters.size.includes(searchValue)) {
        setActiveFilters(prev => ({
          ...prev,
          size: [...prev.size, searchValue]
        }));
      }
      setSizeSearchQuery('');
      setCurrentPage(1);
    }
  };

  const clearAllFilters = () => {
    setActiveFilters({
      status: [],
      carrier: [],
      hasTracking: null,
      market: [],
      size: []
    });
    setCurrentPage(1);
  };

  const hasActiveFilters = activeFilters.status.length > 0 || 
                           activeFilters.carrier.length > 0 || 
                           activeFilters.hasTracking !== null || 
                           activeFilters.market.length > 0 ||
                           activeFilters.size.length > 0;
  
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
      if (showMoreActionsDropdown) {
        if (!target.closest('.more-actions-dropdown')) {
          setShowMoreActionsDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreActionsDropdown]);

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
        price: formatUsd(getNetAmount(purchase)),
        originalPrice: (() => {
          const gross = getGrossAmount(purchase);
          const credits = getCreditsAmount(purchase);
          if (credits > 0) return `${formatUsd(gross)} - ${formatUsd(credits)}`;
          return formatUsd(gross);
        })(),
        // Preserve purchase date from consolidation (which should have used order confirmation email date)
        // Consolidation happens BEFORE transformation, so purchaseDate should already be correct
        purchaseDate: derivePurchaseDateDisplay(purchase),
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
    
    // After consolidation, we try hard to have a real purchaseDate.
    // If it still ends up TBD, keep TBD (UI will render it as-is).
    consolidatedPurchases.forEach(purchase => {
      if (purchase.purchaseDate === 'TBD') {
        console.log(`⚠️ No purchase date found for ${purchase.orderNumber} - leaving purchaseDate as "TBD"`);
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
        // Site password user - use API endpoint to save
        console.log('💾 Saving purchases via API for site password user...');
        
        try {
          const response = await fetch('/api/purchases/save-gmail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              purchases: purchaseDataList
            })
          });
          
          if (!response.ok) {
            throw new Error('Failed to save purchases via API');
          }
          
          const result = await response.json();
          const created = typeof result?.created === 'number' ? result.created : null;
          const updated = typeof result?.updated === 'number' ? result.updated : null;
          const deletedDuplicates = typeof result?.deletedDuplicates === 'number' ? result.deletedDuplicates : null;
          const missingOrderNumberSaved =
            typeof result?.missingOrderNumberSaved === 'number' ? result.missingOrderNumberSaved : null;

          // Back-compat with older API response shape (saved/deleted)
          const savedLegacy = typeof result?.saved === 'number' ? result.saved : null;
          const deletedLegacy = typeof result?.deleted === 'number' ? result.deleted : null;

          if (created !== null || updated !== null) {
            console.log(
              `✅ Gmail purchases synced via API: created=${created ?? 0}, updated=${updated ?? 0}, deletedDuplicates=${
                deletedDuplicates ?? 0
              }, missingOrderNumberSaved=${missingOrderNumberSaved ?? 0}`
            );
          } else {
            console.log(`✅ Gmail purchases saved via API: ${savedLegacy ?? 0} saved, ${deletedLegacy ?? 0} deleted`);
          }
          
          // 🔥 CRITICAL: Reload purchases from API to get correct Firebase document IDs
          console.log('🔄 Reloading purchases to get Firebase document IDs...');
          const listResponse = await fetch(`/api/purchases/list?userId=${userId}`);
          if (listResponse.ok) {
            const listData = await listResponse.json();
            const reloadedPurchases = listData.purchases || [];
            console.log(`✅ Reloaded ${reloadedPurchases.length} purchases with correct IDs`);
            
            // Verify IDs are correct
            if (reloadedPurchases.length > 0) {
              const firstId = reloadedPurchases[0].id;
              const isOrderNumber = firstId?.startsWith('03-');
              console.log(`${isOrderNumber ? '❌ STILL WRONG' : '✅ CORRECT'}: First ID is "${firstId}"`);
            }
            
            // Return reloaded purchases with correct Firebase document IDs
            return reloadedPurchases;
          } else {
            console.warn('⚠️ Failed to reload purchases, using original data');
          }
        } catch (error) {
          console.error('❌ Error saving Gmail purchases via API:', error);
          throw error;
        }
      } else {
        // Firebase user - save directly using client SDK
        console.log('💾 Saving purchases to Firebase for Firebase user...');
        
        // Get existing Gmail purchases to merge (not delete)
        console.log('🔍 Loading existing purchases to merge...');
        const existingPurchases = await getDocuments('purchases');
        console.log(`📄 Found ${existingPurchases.length} existing purchases in Firebase`);
        
        // Create a map of existing Gmail purchases by order number
        const existingGmailMap = new Map();
        existingPurchases.forEach((purchase: any) => {
          if (purchase.userId === userId && purchase.type === 'gmail' && purchase.orderNumber) {
            existingGmailMap.set(purchase.orderNumber, purchase);
          }
        });
        
        const existingGmailPurchases = Array.from(existingGmailMap.values());
        
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
      } // End of Firebase user block
      
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
      // Use net total so credits/discounts reduce the displayed total without overwriting the original amount.
      return getNetAmount(p);
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
      
      // Load purchases based on auth type
      if (isSitePasswordUser) {
        // For site password users, use API endpoint (Firebase Admin SDK)
        console.log('🔍 Loading purchases via API for site password user...');
        console.log(`⏱️ Before API call: ${Date.now() - startTime}ms`);
        
        const response = await fetch(`/api/purchases/list?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          allPurchases = data.purchases || [];
          console.log(`📄 API returned ${allPurchases.length} purchases`);
          
          // 🔥 DEBUG: Verify IDs are correct
          if (allPurchases.length > 0) {
            const firstPurchase = allPurchases[0];
            const isOrderNumber = firstPurchase.id?.startsWith('03-');
            console.log(`🔍 ID Check: First purchase ID = "${firstPurchase.id}" ${isOrderNumber ? '❌ (ORDER NUMBER!)' : '✅ (Firebase ID)'}`);
            if (isOrderNumber) {
              console.error('❌❌❌ CRITICAL: API is returning order numbers as IDs! This will break tracking save!');
            }
          }
        } else {
          console.error('Failed to load purchases from API:', response.status);
          allPurchases = [];
        }
        console.log(`⏱️ After API call: ${Date.now() - startTime}ms`);
      } else {
        // For Firebase auth users, use Firebase directly
        console.log('🔍 Loading purchases from Firebase...');
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
        // Log purchase data for debugging - DISABLED FOR PERFORMANCE
        // console.log(`🔍 Transforming purchase: ${purchase.orderNumber}`, {
        //   tracking: purchase.tracking,
        //   carrier: purchase.carrier,
        //   hasTracking: !!(purchase.tracking && purchase.tracking.trim() !== '')
        // });
        
        // Clean up invalid carrier values
        const cleanedPurchase = cleanupCarrier(purchase);
        
        // console.log(`✅ After cleanup:`, {
        //   orderNumber: purchase.orderNumber,
        //   originalCarrier: purchase.carrier,
        //   cleanedCarrier: cleanedPurchase.carrier,
        //   wasChanged: purchase.carrier !== cleanedPurchase.carrier
        // });
        
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
          price: formatUsd(getNetAmount(cleanedPurchase)),
          originalPrice: (() => {
            const gross = getGrossAmount(cleanedPurchase);
            const credits = getCreditsAmount(cleanedPurchase);
            if (credits > 0) return `${formatUsd(gross)} - ${formatUsd(credits)}`;
            return formatUsd(gross);
          })(),
          // Ensure every row has a stable purchaseDate display value.
          purchaseDate: derivePurchaseDateDisplay(cleanedPurchase),
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
    const baseClasses = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200";
    if (currentTheme.name === 'Neon') {
      const colorClasses = {
        green: "bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10",
        orange: "bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-400 border border-orange-500/40 shadow-lg shadow-orange-500/10",
        yellow: "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border border-yellow-500/40 shadow-lg shadow-yellow-500/10",
        blue: "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/40 shadow-lg shadow-cyan-500/10",
        red: "bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/40 shadow-lg shadow-red-500/10"
      };
      return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
    } else {
      const colorClasses = {
        green: "bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200 shadow-sm",
        orange: "bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border border-orange-200 shadow-sm",
        yellow: "bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-200 shadow-sm",
        blue: "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 border border-blue-200 shadow-sm",
        red: "bg-gradient-to-r from-red-100 to-rose-100 text-red-800 border border-red-200 shadow-sm"
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

  // Ensure every purchase has a usable display date (and make it deterministic).
  // This fixes the last ~few rows that can end up without a purchaseDate when emails are missing fields.
  const derivePurchaseDateDisplay = (purchase: any): string => {
    // IMPORTANT:
    // Do NOT fall back to syncedAt/createdAt/dateAdded for display.
    // Those timestamps often reflect when *we imported/saved* the record (today),
    // which is misleading when the true order confirmation date is missing.
    // Prefer raw timestamps over pre-formatted display strings.
    // `purchaseDate` is sometimes formatted on the server (often UTC) which can show the "wrong" day
    // for US time zones. `purchase_date` / `email_date` should include timezone and will format
    // correctly in the browser's locale/timezone.
    const candidates: Array<string | undefined> = [
      purchase?.purchase_date,
      purchase?.email_date,
      purchase?.emailDate,
      purchase?.purchaseDate,
    ];
    for (const c of candidates) {
      const formatted = formatPurchaseDate(c);
      if (formatted !== 'Invalid Date' && formatted !== 'N/A' && formatted !== 'TBD' && formatted !== 'Unknown') {
        return formatted;
      }
    }
    // Last resort: return a stable placeholder instead of empty/unknown.
    return 'TBD';
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
    
    // DISABLED FOR PERFORMANCE - console.log(`🧹 cleanupCarrier for ${purchase.orderNumber}:`, { tracking, carrier });
    
    // If no tracking number, carrier should be null
    if (!tracking || tracking.trim() === '') {
      // DISABLED FOR PERFORMANCE - console.log(`  → No tracking, setting carrier to null`);
      return { ...purchase, carrier: null };
    }
    
    // If carrier is invalid, try to detect from tracking number
    if (carrier && !isValidCarrier(carrier)) {
      // DISABLED FOR PERFORMANCE - console.log(`  → Invalid carrier "${carrier}", detecting from tracking...`);
      const detectedCarrier = detectCarrierFromTrackingNumber(tracking);
      // DISABLED FOR PERFORMANCE - console.log(`  → Detected carrier: ${detectedCarrier}`);
      return { ...purchase, carrier: detectedCarrier };
    }
    
    // If no carrier but we have tracking, try to detect
    if (!carrier) {
      // DISABLED FOR PERFORMANCE - console.log(`  → No carrier, detecting from tracking...`);
      const detectedCarrier = detectCarrierFromTrackingNumber(tracking);
      // DISABLED FOR PERFORMANCE - console.log(`  → Detected carrier: ${detectedCarrier}`);
      return { ...purchase, carrier: detectedCarrier };
    }
    
    // DISABLED FOR PERFORMANCE - console.log(`  → Carrier is valid, keeping: ${carrier}`);
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
          // Static highlight - no pulse
          purchaseRow.classList.add('bg-yellow-100');
          setTimeout(() => {
            purchaseRow.classList.remove('bg-yellow-100');
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

      const sanitizeDebugForSharing = (input: any): any => {
        const redactUrl = (s: string) => {
          try {
            const u = new URL(s);
            u.search = '';
            u.hash = '';
            return u.toString();
          } catch {
            return s.length > 200 ? `${s.slice(0, 200)}…` : s;
          }
        };
        if (input === null || input === undefined) return input;
        if (typeof input === 'string') {
          // Redact anything that looks like a URL
          if (input.includes('http://') || input.includes('https://')) return redactUrl(input);
          return input;
        }
        if (Array.isArray(input)) return input.map(sanitizeDebugForSharing);
        if (typeof input === 'object') {
          const out: any = {};
          for (const [k, v] of Object.entries(input)) {
            if (typeof v === 'string' && (k.toLowerCase().includes('token') || k.toLowerCase().includes('cookie'))) {
              out[k] = '[redacted]';
              continue;
            }
            out[k] = sanitizeDebugForSharing(v);
          }
          return out;
        }
        return input;
      };

      // Load StockX cookies (optional) to let Puppeteer run authenticated
      let stockxCookies: any[] | null = null;
      try {
        const raw = localStorage.getItem('stockxCookieJson');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) stockxCookies = parsed;
        }
      } catch {
        // ignore
      }
      
      // Use Gmail shipped email → Track-your-order link → redirects (no Puppeteer)
      // This matches current StockX behavior (tracking usually only discoverable via the track URL).
      const response = await fetch('/api/gmail/extract-tracking-debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber: purchase.orderNumber,
          verbose: true,
          allowPuppeteer: true,
          stockxCookies
        }),
      });

      const data = await response.json();
      console.log('🧪 Tracking debug response:', data);

      if (!response.ok) {
        // Provide more helpful error messages
        let errorMessage = data.error || 'Failed to extract tracking number';
        
        // Always log debug info to console (helps diagnose StockX/Puppeteer edge cases)
        if (data?.debug) {
          const sanitized = sanitizeDebugForSharing(data.debug);
          console.log('🧪 Tracking debug (error) data.debug (sanitized):', sanitized);
          // Best-effort copy to clipboard so user can paste into support without leaking tokens
          try {
            await navigator.clipboard.writeText(JSON.stringify(sanitized, null, 2));
            setNotification({
              isVisible: true,
              message: 'Auto Extract failed. A sanitized debug trace was copied to your clipboard—paste it here so we can fix it.',
              type: 'info'
            });
          } catch {
            // Clipboard may be blocked; still show a hint
            setNotification({
              isVisible: true,
              message: 'Auto Extract failed. Open DevTools Console and copy the sanitized debug trace logged there (search for "sanitized").',
              type: 'info'
            });
          }
        }

        if (response.status === 401 && data?.requiresLogin) {
          // Prompt user to paste StockX cookies so Puppeteer can run authenticated
          setPendingExtractPurchase(purchase);
          setShowStockxCookieModal(true);
          throw new Error('StockX login required. Paste StockX cookies once, then retry Auto Extract.');
        }

        if (response.status === 404) {
          errorMessage = `Order not found or tracking not available. ${data.error || ''}`;
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
    
    // Debug: Log the purchase object to see what ID we have
    console.log('🔍 Purchase object for tracking save:', {
      id: purchase.id,
      orderNumber: purchase.orderNumber,
      hasId: !!purchase.id,
      idType: typeof purchase.id
    });
    
    // CRITICAL: Use only the Firebase document ID, never the order number
    const purchaseId = purchase.id;
    
    if (!purchaseId) {
      console.error('❌ Cannot save tracking: Purchase has no Firebase document ID');
      setNotification({
        isVisible: true,
        message: 'Cannot save: Purchase missing ID. Please refresh the page.',
        type: 'error'
      });
      setEditingTracking(null);
      setEditingTrackingValue('');
      return;
    }
    
    // Clear highlight when saving tracking
    setHighlightedPurchase(null);

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

        // Save to Firebase for all users (both Firebase auth and site password users)
        const siteUserId = localStorage.getItem('siteUserId');
        const userId = user?.uid || siteUserId;
        
        if (userId && purchaseId) {
          // Save to Firebase using API endpoint for site password users
          const isSitePasswordUser = !user && siteUserId;
          
          if (isSitePasswordUser) {
            // Site password user - use Admin SDK via API
            try {
              const response = await fetch('/api/purchases/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: userId,
                  purchaseId: purchaseId,
                  updates: {
                    tracking: '',
                    carrier: null
                  }
                })
              });
              
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to update purchase');
              }
              
              console.log(`✅ Cleared tracking in Firebase via API`);
            } catch (error) {
              console.error('Error clearing tracking in Firebase:', error);
              setNotification({
                isVisible: true,
                message: `Failed to clear tracking: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
              });
            }
          } else {
            // Firebase authenticated user - save directly
            try {
              await updateDocument('purchases', purchaseId, {
                tracking: '',
                carrier: null
              }, true);
              console.log(`✅ Cleared tracking in Firebase`);
            } catch (error) {
              console.error('Error clearing tracking in Firebase:', error);
              setNotification({
                isVisible: true,
                message: `Failed to clear tracking: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
              });
            }
          }
        } else {
          console.warn('⚠️ Cannot save: missing userId or purchaseId', { userId, purchaseId });
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

        // Save to Firebase for all users (both Firebase auth and site password users)
        const siteUserId = localStorage.getItem('siteUserId');
        const userId = user?.uid || siteUserId;
        
        if (userId && purchaseId) {
          // Save to Firebase using API endpoint for site password users
          const isSitePasswordUser = !user && siteUserId;
          
          if (isSitePasswordUser) {
            // Site password user - use Admin SDK via API
            try {
              const response = await fetch('/api/purchases/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: userId,
                  purchaseId: purchaseId,
                  updates: {
                    tracking: trackingNumber,
                    carrier: updatedPurchase.carrier
                  }
                })
              });
              
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to update purchase');
              }
              
              console.log(`✅ Saved tracking to Firebase via API: ${trackingNumber} (carrier: ${updatedPurchase.carrier || 'null'})`);
            } catch (error) {
              console.error('Error saving tracking to Firebase:', error);
              setNotification({
                isVisible: true,
                message: `Failed to save tracking: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
              });
            }
          } else {
            // Firebase authenticated user - save directly
            try {
              await updateDocument('purchases', purchaseId, {
                tracking: trackingNumber,
                carrier: updatedPurchase.carrier
              }, true);
              console.log(`✅ Saved tracking to Firebase: ${trackingNumber} (carrier: ${updatedPurchase.carrier || 'null'})`);
            } catch (error) {
              console.error('Error saving tracking to Firebase:', error);
              setNotification({
                isVisible: true,
                message: `Failed to save tracking: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
              });
            }
          }
        } else {
          console.warn('⚠️ Cannot save: missing userId or purchaseId', { userId, purchaseId });
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
    // Clear highlight when canceling
    setHighlightedPurchase(null);
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
        
        {/* Auto Email Sync */}
        <AutoEmailSync 
          isGmailConnected={gmailConnected}
          purchases={sortedPurchases}
          onNewPurchases={(count) => {
            console.log(`🎉 Auto sync found ${count} new purchases`);
            // Reload purchases from Firebase
            loadManualPurchasesFromFirebase();
          }}
        />
        
      </div>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>Purchases</h1>
            <p className={`${currentTheme.colors.textSecondary} mt-1`}>
              Showing {totalCount} purchase{totalCount === 1 ? '' : 's'}
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

            <button
              onClick={() => {
                console.log('🔄 Sync Gmail button clicked', { gmailConnected, showGmailBatchedSyncModal });
                
                // Clear the "purchases cleared" flag immediately when sync starts
                const siteUserId = localStorage.getItem('siteUserId');
                const userId = user?.uid || siteUserId;
                if (userId) {
                  const clearedFlag = localStorage.getItem(`purchases_cleared_${userId}`);
                  if (clearedFlag === 'true') {
                    localStorage.removeItem(`purchases_cleared_${userId}`);
                    // Also clear old purchases from localStorage so we start fresh
                    localStorage.removeItem(`purchases_${userId}`);
                    console.log('🔄 Cleared purchases_cleared flag and old purchases - starting fresh sync');
                  }
                }
                
                setShowGmailBatchedSyncModal(true);
              }}
              disabled={!gmailConnected}
              className={`flex items-center space-x-2 ${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg`}
              title={
                !gmailConnected 
                  ? 'Please connect Gmail first' 
                  : 'Import all historical Gmail purchases'
              }
            >
              <RefreshCw className="w-5 h-5" />
              <span>Sync Gmail</span>
            </button>
            
            <button
              onClick={() => setShowAddPurchaseModal(true)}
              className={`flex items-center space-x-2 ${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg`}
            >
              <Plus className="w-5 h-5" />
              <span>Add Purchase</span>
            </button>

            {/* Column Customization Button - Moved here */}
            {rawPurchaseCount > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowColumnCustomizer(!showColumnCustomizer)}
                  className={`flex items-center space-x-2 ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 shadow-lg' 
                      : 'bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-lg'
                  } ${currentTheme.colors.textPrimary} px-4 py-2 rounded-lg font-medium transition-all duration-200`}
                  title="Customize columns"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  <span>Columns</span>
                </button>

                {showColumnCustomizer && (
                  <div className={`absolute right-0 mt-2 w-72 rounded-xl shadow-2xl z-50 border-2 ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gray-900 border-cyan-500/30'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className={`px-4 py-3 border-b ${
                      currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
                    }`}>
                      <h3 className={`font-bold text-sm ${currentTheme.colors.textPrimary}`}>
                        Customize Columns
                      </h3>
                      <p className={`text-xs mt-1 ${currentTheme.colors.textSecondary}`}>
                        Toggle to show/hide columns
                      </p>
                    </div>
                    <div className="py-2 max-h-96 overflow-y-auto">
                      {Object.entries({
                        product: 'Product',
                        status: 'Status',
                        orderNumber: 'Order #',
                        brand: 'Brand',
                        styleId: 'Style ID',
                        tracking: 'Tracking',
                        carrier: 'Carrier',
                        price: 'Price',
                        purchaseDate: 'Purchase Date'
                      }).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => {
                            const newColumns = { ...visibleColumns, [key]: !visibleColumns[key] };
                            setVisibleColumns(newColumns);
                            localStorage.setItem('visibleColumns', JSON.stringify(newColumns));
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 transition-all duration-200 ${
                            currentTheme.name === 'Neon'
                              ? 'hover:bg-white/10'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                            {label}
                          </span>
                          <div className={`w-10 h-5 rounded-full transition-all duration-200 ${
                            visibleColumns[key]
                              ? currentTheme.name === 'Neon'
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : 'bg-gradient-to-r from-blue-500 to-blue-600'
                              : currentTheme.name === 'Neon'
                              ? 'bg-gray-700'
                              : 'bg-gray-300'
                          } relative`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-200 ${
                              visibleColumns[key] ? 'left-5' : 'left-0.5'
                            }`} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
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
                    {/* Export options - Only show when there are purchases */}
                    {rawPurchaseCount > 0 && (
                      <>
                        <button
                          onClick={() => {
                            handleExportExcel();
                            setShowMoreActionsDropdown(false);
                          }}
                          className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                            currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                          }`}
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Export as Excel</span>
                        </button>
                        <button
                          onClick={() => {
                            handleExportCSV();
                            setShowMoreActionsDropdown(false);
                          }}
                          className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                            currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          <span>Export as CSV</span>
                        </button>
                        {selectedPurchases.size > 0 && (
                          <button
                            onClick={() => {
                              handleExportSelected();
                              setShowMoreActionsDropdown(false);
                            }}
                            className={`w-full flex items-center space-x-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                              currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'text-gray-700'
                            }`}
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Export Selected ({selectedPurchases.size})</span>
                          </button>
                        )}
                        <div className={`border-t ${currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'} my-1`} />
                      </>
                    )}
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
            
            {/* Settings button - Disabled for now */}
            {/* <button
              onClick={() => setShowEmailSettings(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button> */}
            
            {gmailConnected && rawPurchaseCount > 0 && (
              <StatusUpdater 
                purchases={[...purchases, ...manualPurchases]}
                onStatusUpdate={handleStatusUpdate}
                isAutoEnabled={isAutoStatusEnabled}
                lastAutoUpdate={lastAutoStatusUpdate}
              />
            )}
        </div>
      </div>

      {/* Search Bar - Keep visible as long as there are any purchases OR a search is active */}
      {(rawPurchaseCount > 0 || searchQuery.trim().length > 0) && (
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

      {/* Smart Filters - Keep visible when the user has any purchases */}
      {rawPurchaseCount > 0 && (
        <div className="mb-6">
          {/* Compact Filter Bar */}
          <div className={`flex items-center gap-3 p-4 rounded-lg ${
            currentTheme.name === 'Neon'
              ? 'bg-gray-900/50 border border-white/10'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            {/* Filter Toggle Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                  : 'bg-white hover:bg-gray-100 text-gray-700 shadow-sm'
              } ${hasActiveFilters ? (currentTheme.name === 'Neon' ? 'ring-2 ring-cyan-500/50' : 'ring-2 ring-blue-500/50') : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-sm">Filters</span>
              {hasActiveFilters && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  currentTheme.name === 'Neon' ? 'bg-cyan-500 text-black' : 'bg-blue-500 text-white'
                }`}>
                  {activeFilters.status.length + activeFilters.market.length + (activeFilters.hasTracking ? 1 : 0)}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* Active Filter Pills */}
            {hasActiveFilters && (
              <>
                <div className={`h-6 w-px ${currentTheme.name === 'Neon' ? 'bg-white/10' : 'bg-gray-300'}`} />
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {activeFilters.status.map(status => (
                    <button
                      key={status}
                      onClick={() => toggleStatusFilter(status)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                        currentTheme.name === 'Neon'
                          ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/50'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      <span>{status}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}
                  {activeFilters.hasTracking && (
                    <button
                      onClick={() => toggleTrackingFilter(activeFilters.hasTracking as 'with' | 'without')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                        currentTheme.name === 'Neon'
                          ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/50'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                      }`}
                    >
                      <span>{activeFilters.hasTracking === 'with' ? 'With Tracking' : 'No Tracking'}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {activeFilters.market.map(market => (
                    <button
                      key={market}
                      onClick={() => toggleMarketFilter(market)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                        currentTheme.name === 'Neon'
                          ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/50'
                          : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
                      }`}
                    >
                      <span>{market}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}
                  {activeFilters.size.map(size => (
                    <button
                      key={size}
                      onClick={() => toggleSizeFilter(size)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                        currentTheme.name === 'Neon'
                          ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/50'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                      }`}
                    >
                      <span>{size}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ))}
                </div>
                <button
                  onClick={clearAllFilters}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                    currentTheme.name === 'Neon'
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50'
                      : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                  }`}
                >
                  Clear All
                </button>
              </>
            )}
          </div>

          {/* Expandable Filter Panel */}
          {showFilters && (
            <div className={`mt-3 p-6 rounded-lg border ${
              currentTheme.name === 'Neon'
                ? 'bg-black/40 border-white/10 backdrop-blur-sm'
                : 'bg-white border-gray-200 shadow-sm'
            }`}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Status Filter */}
                <div>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                    currentTheme.name === 'Neon' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Status
                  </h3>
                  <div className="space-y-2.5">
                    {getUniqueStatuses.map(status => (
                      <label key={status} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-all duration-200 ${
                        activeFilters.status.includes(status)
                          ? currentTheme.name === 'Neon'
                            ? 'bg-cyan-500/10 border border-cyan-500/30'
                            : 'bg-blue-50 border border-blue-200'
                          : currentTheme.name === 'Neon'
                            ? 'hover:bg-white/5 border border-transparent'
                            : 'hover:bg-gray-50 border border-transparent'
                      }`}>
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={activeFilters.status.includes(status)}
                            onChange={() => toggleStatusFilter(status)}
                            className={`w-4 h-4 rounded cursor-pointer transition-all duration-200 ${
                              currentTheme.name === 'Neon' 
                                ? 'bg-gray-800 border-2 border-gray-600 checked:bg-cyan-500 checked:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0' 
                                : 'bg-white border-2 border-gray-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-0'
                            }`}
                          />
                        </div>
                        <span className={`text-sm font-medium transition-all ${
                          activeFilters.status.includes(status)
                            ? currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-700'
                            : currentTheme.colors.textSecondary
                        }`}>
                          {status}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tracking Filter */}
                <div>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                    currentTheme.name === 'Neon' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Tracking
                  </h3>
                  <div className="space-y-2.5">
                    <label className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-all duration-200 ${
                      activeFilters.hasTracking === 'with'
                        ? currentTheme.name === 'Neon'
                          ? 'bg-cyan-500/10 border border-cyan-500/30'
                          : 'bg-blue-50 border border-blue-200'
                        : currentTheme.name === 'Neon'
                          ? 'hover:bg-white/5 border border-transparent'
                          : 'hover:bg-gray-50 border border-transparent'
                    }`}>
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={activeFilters.hasTracking === 'with'}
                          onChange={() => toggleTrackingFilter('with')}
                          className={`w-4 h-4 rounded cursor-pointer transition-all duration-200 ${
                            currentTheme.name === 'Neon' 
                              ? 'bg-gray-800 border-2 border-gray-600 checked:bg-cyan-500 checked:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0' 
                              : 'bg-white border-2 border-gray-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-0'
                          }`}
                        />
                      </div>
                      <span className={`text-sm font-medium transition-all ${
                        activeFilters.hasTracking === 'with'
                          ? currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-700'
                          : currentTheme.colors.textSecondary
                      }`}>
                        With Tracking
                      </span>
                    </label>
                    <label className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-all duration-200 ${
                      activeFilters.hasTracking === 'without'
                        ? currentTheme.name === 'Neon'
                          ? 'bg-cyan-500/10 border border-cyan-500/30'
                          : 'bg-blue-50 border border-blue-200'
                        : currentTheme.name === 'Neon'
                          ? 'hover:bg-white/5 border border-transparent'
                          : 'hover:bg-gray-50 border border-transparent'
                    }`}>
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={activeFilters.hasTracking === 'without'}
                          onChange={() => toggleTrackingFilter('without')}
                          className={`w-4 h-4 rounded cursor-pointer transition-all duration-200 ${
                            currentTheme.name === 'Neon' 
                              ? 'bg-gray-800 border-2 border-gray-600 checked:bg-cyan-500 checked:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0' 
                              : 'bg-white border-2 border-gray-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-0'
                          }`}
                        />
                      </div>
                      <span className={`text-sm font-medium transition-all ${
                        activeFilters.hasTracking === 'without'
                          ? currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-700'
                          : currentTheme.colors.textSecondary
                      }`}>
                        Without Tracking
                      </span>
                    </label>
                  </div>
                </div>

                {/* Market/Brand Filter */}
                <div>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                    currentTheme.name === 'Neon' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Market/Brand
                  </h3>
                  <div className={`space-y-2.5 max-h-40 overflow-y-auto pr-2 ${
                    currentTheme.name === 'Neon' 
                      ? 'scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900' 
                      : 'scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100'
                  }`}>
                    {getUniqueMarkets.map(market => (
                      <label key={market} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group transition-all duration-200 ${
                        activeFilters.market.includes(market)
                          ? currentTheme.name === 'Neon'
                            ? 'bg-cyan-500/10 border border-cyan-500/30'
                            : 'bg-blue-50 border border-blue-200'
                          : currentTheme.name === 'Neon'
                            ? 'hover:bg-white/5 border border-transparent'
                            : 'hover:bg-gray-50 border border-transparent'
                      }`}>
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={activeFilters.market.includes(market)}
                            onChange={() => toggleMarketFilter(market)}
                            className={`w-4 h-4 rounded cursor-pointer transition-all duration-200 ${
                              currentTheme.name === 'Neon' 
                                ? 'bg-gray-800 border-2 border-gray-600 checked:bg-cyan-500 checked:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0' 
                                : 'bg-white border-2 border-gray-300 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-0'
                            }`}
                          />
                        </div>
                        <span className={`text-sm font-medium transition-all ${
                          activeFilters.market.includes(market)
                            ? currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-700'
                            : currentTheme.colors.textSecondary
                        }`}>
                          {market}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Size Filter */}
                <div>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                    currentTheme.name === 'Neon' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Size
                  </h3>
                  <input
                    type="text"
                    value={sizeSearchQuery}
                    onChange={(e) => setSizeSearchQuery(e.target.value)}
                    onKeyDown={handleSizeSearch}
                    placeholder="Type size and press Enter..."
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                  <p className={`text-xs mt-2 ${
                    currentTheme.name === 'Neon' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    e.g., "US 10", "US M 12", "US L"
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State - Removed to make purchases populate more seamlessly */}

      {/* Table */}
      <div className={`rounded-xl overflow-hidden ${
        currentTheme.name === 'Neon'
          ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border border-white/10 shadow-2xl'
          : 'bg-white border border-gray-200 shadow-lg'
      }`}>
        <div className="overflow-x-auto max-h-[70vh]">
          <table ref={tableRef} className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead className={`${
              currentTheme.name === 'Neon' 
                ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm' 
                : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
            } sticky top-0 z-10`}>
              <tr className="h-12">
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.product}px` }}
                  onClick={() => handleSort('product')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Product
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.status}px` }}
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Status
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.orderNumber}px` }}
                  onClick={() => handleSort('orderNumber')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Order #
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.size}px` }}
                  onClick={() => handleSort('brand')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Brand
                      </span>
                      <SortIcon column="brand" />
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
                      handleDoubleClickResize('size', 'Brand');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.styleId}px` }}
                  onClick={() => handleSort('styleId')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l3 3-3 3M6 16l-3-3 3-3" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Style ID
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.tracking}px` }}
                  onClick={() => handleSort('tracking')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Tracking
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.carrier}px` }}
                  onClick={() => handleSort('carrier')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Carrier
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.total}px` }}
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Total
                      </span>
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
                  className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                  }`} 
                  style={{ width: `${columnWidths.purchaseDate}px` }}
                  onClick={() => handleSort('purchaseDate')}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                      } transition-colors`}>
                        Purchase Date
                      </span>
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
                  className={`relative px-6 py-0 h-12`} 
                  style={{ width: `${columnWidths.actions}px` }}
                >
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-gray-600'
                      }`}>
                        Actions
                      </span>
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
            <tbody className={`${
              currentTheme.name === 'Neon' ? 'divide-y divide-white/5' : 'divide-y divide-gray-200'
            }`}>
              {paginatedPurchases.map((purchase) => {
                // Safety check to ensure purchase exists and has required structure
                if (!purchase) return null;
                
                // Check if this is a new purchase from webhook
                // DISABLED: Too distracting with all purchases highlighted
                const isNewPurchase = false; // newPurchaseIds.has(purchase.id?.toString() || '');
                
                return (
                <tr 
                  key={purchase.id?.toString() || Math.random()} 
                  data-purchase-id={purchase.id}
                  style={highlightedPurchase === (purchase.id?.toString() || purchase.orderNumber) ? {
                    boxShadow: currentTheme.name === 'Neon' 
                      ? 'inset 0 0 0 3px #22d3ee, 0 20px 50px rgba(34, 211, 238, 0.3)'
                      : 'inset 0 0 0 3px #3b82f6, 0 20px 50px rgba(59, 130, 246, 0.3)'
                  } : isNewPurchase ? {
                    boxShadow: currentTheme.name === 'Neon'
                      ? 'inset 0 0 0 2px #10b981, 0 15px 40px rgba(16, 185, 129, 0.3)'
                      : 'inset 0 0 0 2px #10b981, 0 15px 40px rgba(16, 185, 129, 0.2)',
                    animation: 'pulse-glow 2s ease-in-out infinite'
                  } : undefined}
                  className={`group transition-all duration-300 ${
                    // Check if this is a NEW purchase (from webhook)
                    isNewPurchase
                      ? currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-green-500/30 via-emerald-500/20 to-green-500/30 animate-pulse-slow'
                        : 'bg-gradient-to-r from-green-100 via-emerald-50 to-green-100 animate-pulse-slow'
                    // Check if this purchase is highlighted (user clicked email button)
                    : highlightedPurchase === (purchase.id?.toString() || purchase.orderNumber)
                      ? currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-cyan-500/30 via-blue-500/20 to-cyan-500/30'
                        : 'bg-gradient-to-r from-blue-200 via-blue-100 to-blue-200'
                      : currentTheme.name === 'Neon' 
                        ? 'hover:bg-gradient-to-r hover:from-cyan-500/5 hover:via-transparent hover:to-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/5' 
                        : 'hover:bg-gradient-to-r hover:from-blue-50/50 hover:via-transparent hover:to-blue-50/50 hover:shadow-md'
                  }`}
                >
                  <td className="px-3 py-3 text-center relative">
                    {/* NEW Purchase Indicator */}
                    {isNewPurchase && (
                      <div className={`absolute -left-0 top-0 bottom-0 w-2 ${
                        currentTheme.name === 'Neon' 
                          ? 'bg-gradient-to-b from-green-400 via-emerald-500 to-green-400 shadow-lg shadow-green-500/50' 
                          : 'bg-gradient-to-b from-green-500 via-emerald-600 to-green-500 shadow-lg'
                      }`} 
                      style={{
                        animation: 'pulse-glow 2s ease-in-out infinite'
                      }}
                      />
                    )}
                    {/* Bold indicator when user is checking email for this purchase */}
                    {!isNewPurchase && highlightedPurchase === (purchase.id?.toString() || purchase.orderNumber) && (
                      <div className={`absolute -left-0 top-0 bottom-0 w-2 ${
                        currentTheme.name === 'Neon' 
                          ? 'bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400 shadow-lg shadow-cyan-500/50' 
                          : 'bg-gradient-to-b from-blue-500 via-blue-600 to-blue-500 shadow-lg'
                      }`} />
                    )}
                    <input
                      type="checkbox"
                      checked={selectedPurchases.has(purchase.id?.toString() || '')}
                      onChange={() => handleSelectPurchase(purchase.id?.toString() || '')}
                      className={`rounded ${currentTheme.name === 'Neon' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} cursor-pointer`}
                    />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3 min-h-14">
                      <div 
                        className={`relative w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden ${purchase.product?.bgColor || 'bg-gray-100'} flex items-center justify-center cursor-pointer transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl ${
                          currentTheme.name === 'Neon' 
                            ? 'ring-2 ring-white/10 hover:ring-cyan-400' 
                            : 'ring-2 ring-gray-200 hover:ring-blue-400 shadow-md'
                        }`}
                        onClick={() => handleImageClick(purchase)}
                        title="Click to preview image"
                      >
                        <img 
                          src={purchase.product?.image || ''} 
                          alt={purchase.product?.name || 'Product'}
                          className="w-full h-full object-cover rounded-xl"
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
                      <div className="flex-1 py-1">
                        <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} leading-tight mb-1`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {purchase.product?.name || 'Unknown Product'}
                        </div>
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                          currentTheme.name === 'Neon' 
                            ? 'bg-white/5 text-gray-300 border border-white/10' 
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {purchase.product?.size || purchase.size || 'Size not specified'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 align-middle">
                    <span className={getStatusBadge(purchase.status, deriveStatusColor(purchase.status, purchase.statusColor))}>
                      {/* Status icon */}
                      {(() => {
                        const statusLower = (purchase.status || '').toLowerCase();
                        if (statusLower.includes('deliver')) {
                          return (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          );
                        } else if (statusLower.includes('ship')) {
                          return (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                          );
                        } else if (statusLower.includes('refund')) {
                          return (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          );
                        } else {
                          return (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          );
                        }
                      })()}
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 align-middle">
                    <a 
                      href={generateGmailSearchUrl(purchase.orderNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap transition-all duration-200 group/link ${
                        currentTheme.name === 'Neon'
                          ? 'text-cyan-400 hover:text-cyan-300'
                          : 'text-blue-600 hover:text-blue-700'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Highlight this purchase so user knows which one they're checking
                        const purchaseId = purchase.id?.toString() || purchase.orderNumber;
                        setHighlightedPurchase(purchaseId);
                        // Highlight will be removed when user saves/cancels tracking
                      }}
                    >
                      {formatOrderNumberForDisplay(purchase.orderNumber)}
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover/link:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    {purchase.unitNumber ? (
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          currentTheme.name === 'Neon'
                            ? 'bg-white/5 text-gray-200 border border-white/10'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          Unit #{purchase.unitNumber}
                        </span>
                      </div>
                    ) : null}
                    {purchase.linkedSaleOrderNumber ? (
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            currentTheme.name === 'Neon'
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                          title={`Linked StockX sale: ${purchase.linkedSaleOrderNumber}`}
                        >
                          Linked sale: {purchase.linkedSaleOrderNumber}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 align-middle">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                      {purchase.product?.brand || purchase.extracted_brand || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3 align-middle">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono font-medium ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/5 text-gray-300 border border-white/10'
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                      {purchase.styleId || purchase.style_id || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    {editingTracking === (purchase.id || purchase.orderNumber) ? (
                      // Inline editing mode
                      <div className="flex items-center gap-1.5">
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
                          className={`text-sm px-3 py-1.5 border-2 rounded-lg font-medium transition-all duration-200 ${
                            currentTheme.name === 'Neon' 
                              ? 'bg-gray-900 border-cyan-500 text-white placeholder-gray-500 focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-500/20' 
                              : 'bg-white border-blue-400 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/20'
                          } focus:outline-none`}
                          placeholder="Enter tracking number"
                          style={{ minWidth: '180px' }}
                        />
                        <button
                          onClick={() => handleSaveTracking(purchase)}
                          className={`p-1.5 rounded-lg transition-all duration-200 ${
                            currentTheme.name === 'Neon'
                              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 hover:border-emerald-500'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 hover:border-emerald-300'
                          }`}
                          title="Save (Enter)">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancelEditTracking}
                          className={`p-1.5 rounded-lg transition-all duration-200 ${
                            currentTheme.name === 'Neon'
                              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 hover:border-red-500'
                              : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300'
                          }`}
                          title="Cancel (Esc)">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
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
                      // Shipped/Delivered but no tracking - show primary action button with secondary link
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExtractTracking(purchase);
                          }}
                          disabled={extractingTracking.has(purchase.id || purchase.orderNumber)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            extractingTracking.has(purchase.id || purchase.orderNumber)
                              ? currentTheme.name === 'Neon'
                                ? 'bg-white/10 text-gray-400 border border-white/10 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                              : currentTheme.name === 'Neon'
                                ? 'bg-white/5 hover:bg-white/10 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:border-blue-300'
                          }`}
                          title="Auto-extract tracking via Gmail shipped email → Track your order → FedEx"
                        >
                          {extractingTracking.has(purchase.id || purchase.orderNumber) ? 'Extracting…' : 'Auto Extract'}
                        </button>
                        <button
                          onClick={() => handleStartEditTracking(purchase)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            currentTheme.name === 'Neon' 
                              ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg hover:shadow-cyan-500/50' 
                              : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md hover:shadow-lg'
                          }`}
                          title="Click to add tracking number">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Tracking
                        </button>
                        <a
                          href={generateGmailShippedEmailUrl(purchase.orderNumber)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-1.5 rounded-lg transition-all duration-200 ${
                            currentTheme.name === 'Neon'
                              ? 'hover:bg-white/10 text-gray-400 hover:text-cyan-400'
                              : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'
                          }`}
                          title="View shipped email in Gmail"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Highlight this purchase so user knows which one they're checking
                            const purchaseId = purchase.id?.toString() || purchase.orderNumber;
                            setHighlightedPurchase(purchaseId);
                            
                            // Auto-click "Add Tracking" button after 1 second delay
                            setTimeout(() => {
                              handleStartEditTracking(purchase);
                            }, 1000);
                            // Highlight will be removed when user saves/cancels tracking
                          }}
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                      </div>
                    ) : (
                      // No tracking - show add button
                      <button
                        onClick={() => handleStartEditTracking(purchase)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          currentTheme.name === 'Neon' 
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg hover:shadow-cyan-500/50' 
                            : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md hover:shadow-lg'
                        }`}
                        title="Click to add tracking number">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
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
                  <td className="px-6 py-3 align-middle">
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-200'
                    }`}>
                      {formatUsd(getNetAmount(purchase))}
                    </div>
                    {getCreditsAmount(purchase) > 0 && (
                      <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                        Credit applied: -{formatUsd(getCreditsAmount(purchase))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 align-middle">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${currentTheme.colors.textPrimary}`}>
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
                  <td className="px-6 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      {/* Edit Purchase */}
                      <button
                        onClick={() => {
                          setEditingPurchase(purchase);
                          setEditModalOpen(true);
                        }}
                        className={`p-2 rounded-lg transition-all duration-200 ${
                          currentTheme.name === 'Neon'
                            ? 'hover:bg-white/10 text-gray-400 hover:text-cyan-400'
                            : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'
                        }`}
                        title="Edit purchase"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      
                      {/* Delete Purchase */}
                      <button
                        onClick={() => {
                          setPurchaseToDelete(purchase);
                          setDeleteConfirmOpen(true);
                        }}
                        className={`p-2 rounded-lg transition-all duration-200 ${
                          currentTheme.name === 'Neon'
                            ? 'hover:bg-red-500/20 text-gray-400 hover:text-red-400'
                            : 'hover:bg-red-50 text-gray-500 hover:text-red-600'
                        }`}
                        title="Delete purchase"
                      >
                        <Trash2 className="w-4 h-4" />
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
        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          currentTheme.name === 'Neon'
            ? 'border-white/10 bg-gradient-to-r from-gray-900/50 via-gray-800/50 to-gray-900/50'
            : 'border-gray-200 bg-gradient-to-r from-gray-50 via-white to-gray-50'
        }`}>
          <div className="flex items-center gap-6">
            {/* Pagination Info */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              currentTheme.name === 'Neon'
                ? 'bg-white/5 border border-white/10'
                : 'bg-gray-100 border border-gray-200'
            }`}>
              <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className={`text-sm font-semibold ${
                sortedPurchases.length === 0
                  ? currentTheme.colors.textSecondary
                  : currentTheme.colors.textPrimary
              }`}>
                {sortedPurchases.length === 0 
                  ? 'No purchases to display' 
                  : (
                    <>
                      Showing <span className={`${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`}>
                        {(currentPage - 1) * (itemsPerPage === -1 ? sortedPurchases.length : itemsPerPage) + 1}
                      </span> to <span className={`${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`}>
                        {Math.min(currentPage * (itemsPerPage === -1 ? sortedPurchases.length : itemsPerPage), sortedPurchases.length)}
                      </span> of <span className={`${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'} font-bold`}>
                        {sortedPurchases.length}
                      </span> purchase{sortedPurchases.length === 1 ? '' : 's'}
                    </>
                  )
                }
              </span>
            </div>
            
            {/* Results Per Page Selector */}
            <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-lg ${
              currentTheme.name === 'Neon'
                ? 'bg-white/5 border border-white/10'
                : 'bg-gray-100 border border-gray-200'
            }`}>
              <svg className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <label className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                Rows:
              </label>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className={`px-3 py-1 rounded-md text-sm font-semibold cursor-pointer transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gray-800 border border-white/20 text-cyan-400 hover:bg-gray-700 hover:border-cyan-500/50'
                    : 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-50 hover:border-blue-400 shadow-sm'
                } focus:outline-none focus:ring-2 ${
                  currentTheme.name === 'Neon' ? 'focus:ring-cyan-500/50' : 'focus:ring-blue-500/50'
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
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  currentPage === 1
                    ? 'opacity-40 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20 hover:border-white/40 hover:shadow-lg'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-gray-400 shadow-sm hover:shadow-md'
                }`}
              >
                First
              </button>
              
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  currentPage === 1
                    ? 'opacity-40 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20 hover:border-white/40 hover:shadow-lg'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-gray-400 shadow-sm hover:shadow-md'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              
              <span className={`px-5 py-2 rounded-lg text-sm font-bold ${
                currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200'
              }`}>
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  currentPage === totalPages
                    ? 'opacity-40 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20 hover:border-white/40 hover:shadow-lg'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-gray-400 shadow-sm hover:shadow-md'
                }`}
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  currentPage === totalPages
                    ? 'opacity-40 cursor-not-allowed'
                    : currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20 hover:border-white/40 hover:shadow-lg'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-gray-400 shadow-sm hover:shadow-md'
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

      {/* Edit Purchase Modal */}
      {editModalOpen && editingPurchase && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`relative w-full max-w-2xl rounded-2xl shadow-2xl ${
            currentTheme.name === 'Neon'
              ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-cyan-500/30'
              : 'bg-white border-2 border-gray-200'
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${
              currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  currentTheme.name === 'Neon' ? 'bg-cyan-500/20' : 'bg-blue-100'
                }`}>
                  <Edit className={`w-5 h-5 ${
                    currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'
                  }`} />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${currentTheme.colors.textPrimary}`}>
                    Edit Purchase
                  </h3>
                  <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                    {formatOrderNumberForDisplay(editingPurchase.orderNumber)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingPurchase(null);
                }}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'hover:bg-white/10 text-gray-400 hover:text-white'
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Product Image & Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={editingPurchase.product?.name || editingPurchase.productName || ''}
                    onChange={(e) => setEditingPurchase({
                      ...editingPurchase,
                      product: { ...(editingPurchase.product || {}), name: e.target.value },
                      productName: e.target.value
                    })}
                    placeholder="Enter product name"
                    className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Brand
                  </label>
                  <input
                    type="text"
                    value={editingPurchase.product?.brand || editingPurchase.brand || editingPurchase.market || ''}
                    onChange={(e) => setEditingPurchase({
                      ...editingPurchase,
                      product: { ...(editingPurchase.product || {}), brand: e.target.value },
                      brand: e.target.value,
                      market: e.target.value
                    })}
                    placeholder="e.g., Nike, Adidas"
                    className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                </div>
              </div>

              {/* Size & Style ID */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Size
                  </label>
                  <input
                    type="text"
                    value={editingPurchase.product?.size || editingPurchase.size || ''}
                    onChange={(e) => setEditingPurchase({
                      ...editingPurchase,
                      product: { ...(editingPurchase.product || {}), size: e.target.value },
                      size: e.target.value
                    })}
                    placeholder="e.g., US M 10.5"
                    className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Style ID
                  </label>
                  <input
                    type="text"
                    value={editingPurchase.styleId || editingPurchase.style_id || ''}
                    onChange={(e) => setEditingPurchase({
                      ...editingPurchase,
                      styleId: e.target.value,
                      style_id: e.target.value
                    })}
                    placeholder="e.g., DZ5485-612"
                    className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                </div>
              </div>

              {/* Unit Number (physical label) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Unit #
                    <span className={`ml-2 text-xs font-normal ${currentTheme.colors.textSecondary}`}>
                      (1–999)
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    value={editingPurchase.unitNumber ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = raw === '' ? null : (Number(raw) || null);
                      setEditingPurchase({
                        ...editingPurchase,
                        unitNumber: next
                      });
                    }}
                    placeholder="e.g., 127"
                    className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                </div>
                <div />
              </div>

              {/* Price & Credits/Discounts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Price Paid
                  </label>
                  <div className="relative">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold ${currentTheme.colors.textSecondary}`}>
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={editingPurchase.price || editingPurchase.totalAmount || ''}
                      onChange={(e) => setEditingPurchase({
                        ...editingPurchase,
                        price: e.target.value,
                        totalAmount: parseFloat(e.target.value) || 0
                      })}
                      placeholder="0.00"
                      className={`w-full pl-8 pr-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                        currentTheme.name === 'Neon'
                          ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                      } focus:outline-none`}
                    />
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Credits / Discounts
                    <span className={`ml-2 text-xs font-normal ${currentTheme.colors.textSecondary}`}>
                      (Optional)
                    </span>
                  </label>
                  <div className="relative">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold ${currentTheme.colors.textSecondary}`}>
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={editingPurchase.credits || editingPurchase.discounts || ''}
                      onChange={(e) => setEditingPurchase({
                        ...editingPurchase,
                        credits: e.target.value,
                        discounts: e.target.value
                      })}
                      placeholder="0.00"
                      className={`w-full pl-8 pr-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                        currentTheme.name === 'Neon'
                          ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                      } focus:outline-none`}
                    />
                  </div>
                </div>
              </div>

              {/* Net total preview (gross - credits) */}
              <div className={`-mt-2 text-sm ${currentTheme.colors.textSecondary}`}>
                {(() => {
                  const gross = getGrossAmount(editingPurchase);
                  const credits = parseMoney(editingPurchase.credits ?? editingPurchase.discounts ?? 0);
                  const net = Math.max(0, gross - Math.max(0, credits));
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-semibold">Net Paid:</span>
                      <span className={`${currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-700'} font-bold`}>
                        {formatUsd(net)}
                      </span>
                      {credits > 0 && (
                        <span className="text-xs">
                          ({formatUsd(gross)} - {formatUsd(credits)})
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Purchase Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                    Purchase Date
                  </label>
                  <input
                    type="text"
                    value={(() => {
                      if (!editingPurchase.purchaseDate) return '';
                      
                      // If it's in YYYY-MM-DD format, convert to MM/DD/YYYY
                      if (typeof editingPurchase.purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(editingPurchase.purchaseDate)) {
                        const [year, month, day] = editingPurchase.purchaseDate.split('-');
                        return `${month}/${day}/${year}`;
                      }
                      
                      // If it's already in MM/DD/YYYY format, return as-is
                      if (typeof editingPurchase.purchaseDate === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(editingPurchase.purchaseDate)) {
                        return editingPurchase.purchaseDate;
                      }
                      
                      // Try to parse as date and format to MM/DD/YYYY
                      try {
                        const date = new Date(editingPurchase.purchaseDate);
                        if (!isNaN(date.getTime())) {
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const year = date.getFullYear();
                          return `${month}/${day}/${year}`;
                        }
                      } catch (e) {
                        // Invalid date, return empty
                      }
                      
                      return '';
                    })()}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow user to type freely, will validate on save
                      setEditingPurchase({
                        ...editingPurchase,
                        purchaseDate: value
                      });
                    }}
                    placeholder="mm/dd/yyyy"
                    className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  />
                </div>
              </div>

              {/* Order Number */}
              <div>
                <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                  Order Number
                </label>
                <input
                  type="text"
                  value={editingPurchase.orderNumber || ''}
                  onChange={(e) => setEditingPurchase({...editingPurchase, orderNumber: e.target.value})}
                  placeholder="Enter order number"
                  className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                  } focus:outline-none`}
                />
              </div>

              {/* Tracking Number */}
              <div>
                <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={editingPurchase.tracking || ''}
                  onChange={(e) => setEditingPurchase({...editingPurchase, tracking: e.target.value})}
                  placeholder="Enter tracking number"
                  className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                  } focus:outline-none`}
                />
              </div>

              {/* Carrier - Custom Dropdown */}
              <div>
                <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                  Carrier
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCarrierDropdownOpen(!carrierDropdownOpen)}
                    className={`w-full px-4 py-3 rounded-lg border text-sm text-left transition-all duration-200 flex items-center justify-between ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  >
                    <span className={!editingPurchase.carrier ? currentTheme.colors.textSecondary : ''}>
                      {editingPurchase.carrier || 'Select carrier'}
                    </span>
                    <svg className={`w-4 h-4 transition-transform duration-200 ${carrierDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {carrierDropdownOpen && (
                    <div className={`absolute z-10 w-full mt-2 rounded-lg border shadow-xl ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20'
                        : 'bg-white border-gray-200'
                    }`}>
                      {['UPS', 'FedEx', 'USPS', 'DHL', 'Other'].map((carrier) => (
                        <button
                          key={carrier}
                          type="button"
                          onClick={() => {
                            setEditingPurchase({...editingPurchase, carrier});
                            setCarrierDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm transition-all duration-200 first:rounded-t-lg last:rounded-b-lg ${
                            editingPurchase.carrier === carrier
                              ? currentTheme.name === 'Neon'
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-blue-50 text-blue-700'
                              : currentTheme.name === 'Neon'
                              ? 'text-white hover:bg-white/10'
                              : 'text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          {carrier}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Status - Custom Dropdown */}
              <div>
                <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                  Status
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    className={`w-full px-4 py-3 rounded-lg border text-sm text-left transition-all duration-200 flex items-center justify-between ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                    } focus:outline-none`}
                  >
                    <span>{editingPurchase.status || 'Ordered'}</span>
                    <svg className={`w-4 h-4 transition-transform duration-200 ${statusDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {statusDropdownOpen && (
                    <div className={`absolute z-10 w-full mt-2 rounded-lg border shadow-xl ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-900 border-white/20'
                        : 'bg-white border-gray-200'
                    }`}>
                      {['Ordered', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => {
                            setEditingPurchase({...editingPurchase, status});
                            setStatusDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm transition-all duration-200 first:rounded-t-lg last:rounded-b-lg ${
                            editingPurchase.status === status
                              ? currentTheme.name === 'Neon'
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-blue-50 text-blue-700'
                              : currentTheme.name === 'Neon'
                              ? 'text-white hover:bg-white/10'
                              : 'text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={`block text-sm font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                  Notes
                  <span className={`ml-2 text-xs font-normal ${currentTheme.colors.textSecondary}`}>
                    (Optional)
                  </span>
                </label>
                <textarea
                  value={editingPurchase.notes || ''}
                  onChange={(e) => setEditingPurchase({...editingPurchase, notes: e.target.value})}
                  placeholder="Add any notes about this purchase..."
                  rows={3}
                  className={`w-full px-4 py-3 rounded-lg border text-sm transition-all duration-200 resize-none ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gray-900 border-white/20 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                  } focus:outline-none`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${
              currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
            }`}>
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingPurchase(null);
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Save the purchase
                  if (editingPurchase.id) {
                    const siteUserId = localStorage.getItem('siteUserId');
                    const resolvedUserId = user?.uid || siteUserId;
                    const isSitePasswordUser = !user && !!siteUserId;

                    const creditsAmount = (() => {
                      const raw = editingPurchase.credits ?? editingPurchase.discounts ?? '';
                      const n = parseMoney(raw);
                      return n > 0 ? n : 0;
                    })();

                    const grossForNet = getGrossAmount(editingPurchase);
                    const netPaid = Math.max(0, grossForNet - creditsAmount);

                    const updates: any = {
                      productName: editingPurchase.product?.name || editingPurchase.productName || '',
                      brand: editingPurchase.product?.brand || editingPurchase.brand || '',
                      market: editingPurchase.market || editingPurchase.product?.brand || '',
                      size: editingPurchase.product?.size || editingPurchase.size || '',
                      styleId: editingPurchase.styleId || '',
                      style_id: editingPurchase.style_id || '',
                      // Only set gross fields if provided; avoid overwriting existing totals with 0/empty when editing credits.
                      ...(editingPurchase.price ? { price: editingPurchase.price } : {}),
                      ...(typeof editingPurchase.totalAmount === 'number' && Number.isFinite(editingPurchase.totalAmount) && editingPurchase.totalAmount > 0
                        ? { totalAmount: editingPurchase.totalAmount }
                        : {}),
                      // Store credits as a number so it can be applied consistently in calculations.
                      // We keep both keys for backward compatibility.
                      credits: creditsAmount || 0,
                      discounts: creditsAmount || 0,
                      // Persist net paid (gross - credits) for fast downstream use (FIFO, profit, etc.)
                      netPaid,
                      purchaseDate: editingPurchase.purchaseDate || '',
                      orderNumber: editingPurchase.orderNumber || '',
                      tracking: editingPurchase.tracking || '',
                      carrier: editingPurchase.carrier || '',
                      status: editingPurchase.status || 'Ordered',
                      notes: editingPurchase.notes || '',
                      unitNumber: editingPurchase.unitNumber ?? null,
                      product: {
                        ...(editingPurchase.product || {}),
                        name: editingPurchase.product?.name || editingPurchase.productName || '',
                        brand: editingPurchase.product?.brand || editingPurchase.brand || '',
                        size: editingPurchase.product?.size || editingPurchase.size || ''
                      }
                    };

                    if (isSitePasswordUser && resolvedUserId) {
                      const resp = await fetch('/api/purchases/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          userId: resolvedUserId,
                          purchaseId: editingPurchase.id.toString(),
                          updates
                        })
                      });
                      if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        throw new Error(err.details || err.error || 'Failed to update purchase');
                      }

                      // Refresh via API for site-password users
                      const listResp = await fetch(`/api/purchases/list?userId=${encodeURIComponent(resolvedUserId)}`, { cache: 'no-store' });
                      if (listResp.ok) {
                        const data = await listResp.json();
                        setPurchases(data.purchases || []);
                      }
                    } else {
                      await updateDocument('purchases', editingPurchase.id.toString(), updates);
                      // Refresh purchases
                      const updatedPurchases = await getDocuments('purchases');
                      setPurchases(updatedPurchases);
                    }
                  }
                  setEditModalOpen(false);
                  setEditingPurchase(null);
                  setCarrierDropdownOpen(false);
                  setStatusDropdownOpen(false);
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg shadow-cyan-500/50'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg'
                }`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && purchaseToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
            currentTheme.name === 'Neon'
              ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-red-500/30'
              : 'bg-white border-2 border-red-200'
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${
              currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  currentTheme.name === 'Neon' ? 'bg-red-500/20' : 'bg-red-100'
                }`}>
                  <Trash2 className={`w-5 h-5 ${
                    currentTheme.name === 'Neon' ? 'text-red-400' : 'text-red-600'
                  }`} />
                </div>
                <h3 className={`text-xl font-bold ${currentTheme.colors.textPrimary}`}>
                  Delete Purchase
                </h3>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6">
              <p className={`text-sm ${currentTheme.colors.textSecondary} mb-4`}>
                Are you sure you want to delete this purchase? This action cannot be undone.
              </p>
              
              {/* Purchase Preview */}
              <div className={`flex items-start gap-4 p-4 rounded-xl ${
                currentTheme.name === 'Neon' ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'
              }`}>
                <img 
                  src={purchaseToDelete.product?.image || ''} 
                  alt={purchaseToDelete.product?.name || 'Product'}
                  className="w-12 h-12 rounded-lg object-cover ring-2 ring-white/20"
                />
                <div className="flex-1">
                  <div className={`font-semibold text-sm ${currentTheme.colors.textPrimary}`}>
                    {purchaseToDelete.product?.name || 'Unknown Product'}
                  </div>
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                    Order: {formatOrderNumberForDisplay(purchaseToDelete.orderNumber)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${
              currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
            }`}>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setPurchaseToDelete(null);
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Delete the purchase
                  if (purchaseToDelete.id) {
                    await handleDeletePurchase(purchaseToDelete.id);
                  }
                  setDeleteConfirmOpen(false);
                  setPurchaseToDelete(null);
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/50'
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg'
                }`}
              >
                Delete Purchase
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="relative w-full h-full">
            <GmailBatchedSync
              onPurchasesUpdate={handleBatchedPurchasesUpdate}
              onSyncComplete={(totalPurchases) => {
                handleBatchedSyncComplete(totalPurchases);
                setShowBatchedSync(false);
              }}
              onClose={() => setShowBatchedSync(false)}
              autoStart={true}
              consolidatedCount={totalCount}
            />
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
      
      {/* Batched Gmail Sync - Draggable Notification */}
      {showGmailBatchedSyncModal && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="relative w-full h-full">
            <GmailBatchedSync
              onPurchasesUpdate={async (purchases) => {
                console.log(`📧 Received ${purchases.length} purchases from sync`);
                
                // Save purchases as they come in
                await saveGmailPurchasesToFirebase(purchases);
                
                // 🔥 CRITICAL: Reload purchases to get correct Firebase document IDs
                console.log('🔄 Reloading purchases after save to get correct Firebase IDs...');
                await loadManualPurchasesFromFirebase();
                console.log('✅ Purchases reloaded with correct IDs');
              }}
              onSyncComplete={async (totalPurchases) => {
                console.log(`🎉 Sync complete! Total: ${totalPurchases} purchases`);
                // Final reload after sync completes
                console.log('🔄 Final reload after sync complete...');
                await loadManualPurchasesFromFirebase();
                console.log('✅ Final reload complete');
              }}
              onClose={() => setShowGmailBatchedSyncModal(false)}
              autoStart={true}
              consolidatedCount={sortedPurchases.length}
            />
          </div>
        </div>
      )}

      {/* Neon Notification */}
      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, isVisible: false })}
        />
      )}

      {/* StockX Cookie Modal (for Puppeteer authenticated extraction) */}
      {showStockxCookieModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl rounded-2xl p-6 ${
            currentTheme.name === 'Neon'
              ? 'bg-gray-950 border border-cyan-500/30 shadow-2xl shadow-cyan-500/20'
              : 'bg-white border border-gray-200 shadow-2xl'
          }`}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className={`text-lg font-bold ${currentTheme.colors.textPrimary}`}>
                  StockX login required
                </h3>
                <p className={`text-sm mt-1 ${currentTheme.colors.textSecondary}`}>
                  To let Auto Extract click through StockX and reach the FedEx tracking URL, paste your StockX cookies once.
                  This is stored only in your browser’s localStorage.
                </p>
              </div>
              <button
                onClick={() => setShowStockxCookieModal(false)}
                className={`p-2 rounded-lg ${
                  currentTheme.name === 'Neon' ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className={`text-xs mb-3 ${currentTheme.colors.textSecondary}`}>
              In Chrome: open StockX in a tab (logged in) → DevTools → Application → Cookies → `https://stockx.com` →
              select cookies → right click → “Copy” (or “Copy as JSON”).
            </div>

            <textarea
              value={stockxCookieJson}
              onChange={(e) => setStockxCookieJson(e.target.value)}
              rows={10}
              className={`w-full rounded-xl p-3 font-mono text-xs border ${
                currentTheme.name === 'Neon'
                  ? 'bg-black/40 border-white/10 text-gray-100 focus:border-cyan-500 outline-none'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 outline-none'
              }`}
              placeholder='Paste cookie JSON array here (e.g. [{"name":"...","value":"...","domain":".stockx.com",...}])'
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowStockxCookieModal(false);
                  setPendingExtractPurchase(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  currentTheme.name === 'Neon'
                    ? 'bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const raw = (stockxCookieJson || '').trim();
                    if (!raw) throw new Error('Paste cookies first.');

                    const parseTabularCookies = (input: string): any[] => {
                      // Supports copied rows from Chrome DevTools cookie table (tab-separated).
                      // Example header: Name\tValue\tDomain\tPath\tExpires/Max-Age\tSize\tHttpOnly\tSecure\tSameSite...
                      const lines = input
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter(Boolean);
                      if (lines.length === 0) return [];

                      const header = lines[0].split('\t').map((s) => s.trim().toLowerCase());
                      const hasHeader = header.includes('name') && header.includes('value');
                      const startIdx = hasHeader ? 1 : 0;

                      const idxName = hasHeader ? header.indexOf('name') : 0;
                      const idxValue = hasHeader ? header.indexOf('value') : 1;
                      // If no header row, Chrome's copy format still includes domain/path as cols[2]/cols[3]
                      const idxDomain = hasHeader ? header.indexOf('domain') : 2;
                      const idxPath = hasHeader ? header.indexOf('path') : 3;

                      const cookies: any[] = [];
                      for (const line of lines.slice(startIdx)) {
                        const cols = line.split('\t');
                        const name = (cols[idxName] || '').trim();
                        const value = (cols[idxValue] || '').trim();
                        if (!name) continue;
                        const domain = (cols[idxDomain] || '').trim() || '.stockx.com';
                        // Only keep StockX cookies; ignore third-party domains (e.g. sardine.ai)
                        if (!domain.includes('stockx.com')) continue;
                        cookies.push({
                          name,
                          value,
                          domain,
                          path: (cols[idxPath] || '/').trim() || '/',
                        });
                      }
                      return cookies;
                    };

                    let parsed: any = null;
                    try {
                      parsed = JSON.parse(raw);
                    } catch {
                      parsed = null;
                    }

                    let cookiesArray: any[] = [];
                    if (Array.isArray(parsed)) {
                      cookiesArray = parsed;
                    } else {
                      cookiesArray = parseTabularCookies(raw);
                    }

                    if (!Array.isArray(cookiesArray) || cookiesArray.length === 0) {
                      throw new Error('Could not parse cookies. Paste either the JSON array or copied cookie table rows.');
                    }

                    // Store normalized JSON (so future runs always use JSON format)
                    localStorage.setItem('stockxCookieJson', JSON.stringify(cookiesArray));
                    setShowStockxCookieModal(false);
                    const p = pendingExtractPurchase;
                    setPendingExtractPurchase(null);
                    if (p) {
                      await handleExtractTracking(p);
                    }
                  } catch (e: any) {
                    setNotification({
                      isVisible: true,
                      message: `Invalid cookie JSON: ${e?.message || String(e)}`,
                      type: 'error'
                    });
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  currentTheme.name === 'Neon'
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                Save & Retry Auto Extract
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add keyframe animations */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes progressBar {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            filter: brightness(1);
          }
          50% {
            opacity: 0.8;
            filter: brightness(1.3);
          }
        }

        .animate-pulse-slow {
          animation: pulse-glow 3s ease-in-out infinite;
        }
      `}</style>
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