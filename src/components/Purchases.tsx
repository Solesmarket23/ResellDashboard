'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Edit, MoreHorizontal, Camera, RefreshCw, Mail, Trash2, Settings, Plus, Shield, Wrench, Download, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../lib/firebase/firebaseUtils';
import { generateGmailSearchUrl, formatOrderNumberForDisplay } from '../lib/utils/orderNumberUtils';
import { exportToCSV, exportToExcel, exportToJSON, getExportStats, ExportablePurchase } from '../lib/utils/exportUtils';
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
import StatusUpdater from './StatusUpdater';
import FixItemProducts from './FixItemProducts';
import NeonNotification, { NotificationType } from './NeonNotification';
import ProductSearch from './ProductSearch';
import GmailResetButton from './GmailResetButton';

const Purchases = () => {
  const [sortBy, setSortBy] = useState('Purchase Date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
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
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  const [isAutoStatusEnabled, setIsAutoStatusEnabled] = useState(false);
  const [lastAutoStatusUpdate, setLastAutoStatusUpdate] = useState<Date | null>(null);
  const [showFixItemProducts, setShowFixItemProducts] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });
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
  
  // Column width state with localStorage persistence
  const getStoredColumnWidths = () => {
    try {
      const stored = localStorage.getItem('purchases-column-widths');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load column widths from localStorage:', error);
    }
    // Default widths
    return {
      checkbox: 50,
      product: 300,
      orderNumber: 150,
      status: 120,
      tracking: 150,
      market: 100,
      price: 130,
      purchaseDate: 120,
      dateAdded: 120,
      verified: 80,
      edit: 80
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
          aValue = a.product.name.toLowerCase();
          bValue = b.product.name.toLowerCase();
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
          aValue = new Date(a.purchaseDate + ', 2024').getTime();
          bValue = new Date(b.purchaseDate + ', 2024').getTime();
          break;
        case 'dateAdded':
          aValue = new Date(a.dateAdded.replace('\n', ' ') + ', 2024').getTime();
          bValue = new Date(b.dateAdded.replace('\n', ' ') + ', 2024').getTime();
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
        case 'tracking':
          cellContent = purchase.tracking || (purchase.status?.toLowerCase() === 'ordered' ? 'Not Shipped Yet' : '');
          break;
        case 'market':
          cellContent = purchase.marketplace || purchase.market || '';
          break;
        case 'price':
          cellContent = purchase.orderTotal ? `$${parseFloat(purchase.orderTotal).toFixed(2)}` : '';
          break;
        case 'purchaseDate':
          cellContent = purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : '';
          break;
        case 'dateAdded':
          cellContent = purchase.dateAdded ? new Date(purchase.dateAdded).toLocaleDateString() : '';
          break;
        case 'verified':
          cellContent = purchase.verified ? 'Yes' : 'No';
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
  
  // Get sorted purchases
  const getSortedPurchases = () => {
    const allPurchases = [...purchases, ...manualPurchases];
    
    // Deduplicate by order number before sorting
    const uniqueMap = new Map();
    allPurchases.forEach(purchase => {
      const existing = uniqueMap.get(purchase.orderNumber);
      if (!existing || 
          (purchase.status === 'Delivered' && existing.status !== 'Delivered') ||
          (purchase.status === 'Shipped' && existing.status === 'Ordered') ||
          (purchase.tracking && !existing.tracking)) {
        // Keep the purchase with better status or tracking info
        uniqueMap.set(purchase.orderNumber, purchase);
      }
    });
    
    const uniquePurchases = Array.from(uniqueMap.values());
    return sortPurchases(uniquePurchases, sortBy, sortDirection);
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

  // Load data on component mount
  useEffect(() => {
    // Debug Firebase status
    console.log('🔍 Firebase Debug Info:');
    console.log('  - Firebase API Key set:', !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
    console.log('  - Firebase Project ID set:', !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    console.log('  - Firebase Auth Domain set:', !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
    
    // Always load purchases from Firebase when user is available (Firebase or site password)
    const siteUserId = localStorage.getItem('siteUserId');
    if (user || siteUserId) {
      console.log('🔄 Loading all purchases from Firebase on mount...');
      loadManualPurchasesFromFirebase();
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

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportDropdown) {
        const target = event.target as Element;
        if (!target.closest('.export-dropdown')) {
          setShowExportDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportDropdown]);

  // Periodic Gmail connection check
  useEffect(() => {
    const interval = setInterval(() => {
      checkGmailConnectionStatus();
    }, 30000); // Check every 30 seconds

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
    console.log(`🔍 DEBUG - Firebase user available:`, !!user, `user.uid:`, user?.uid);
    console.log(`🔍 DEBUG - Site password user available:`, !!siteUserId, `siteUserId:`, siteUserId);
    
    // Transform the data to match expected component format
    const transformPurchaseData = (purchase: any) => {
      return {
        ...purchase,
        product: {
          name: purchase.productName || purchase.product?.name || 'Unknown Product',
          brand: purchase.brand || purchase.product?.brand || 'Unknown Brand',
          size: purchase.size || purchase.product?.size || 'Unknown Size',
          image: purchase.productImageUrl || purchase.product?.image || `https://picsum.photos/200/200?random=${purchase.id?.substring(0, 4) || '1'}`,
          bgColor: purchase.product?.bgColor || 'bg-gray-500',
          color: purchase.product?.color || 'gray'
        },
        // Map other fields to expected format
        orderNumber: purchase.orderNumber,
        status: purchase.shippingStatus || purchase.status || 'Ordered',
        tracking: purchase.tracking || '',
        market: purchase.merchant || purchase.market || 'StockX',
        price: purchase.totalAmount ? `$${purchase.totalAmount.toFixed(2)}` : (purchase.price || '$0.00'),
        originalPrice: purchase.totalAmount ? `$${purchase.totalAmount.toFixed(2)} + $0.00` : (purchase.price || '$0.00'),
        purchaseDate: purchase.purchaseDate || purchase.createdAt || new Date().toISOString(),
        dateAdded: purchase.createdAt || new Date().toISOString(),
        verified: purchase.verified || 'pending',
        verifiedColor: purchase.verifiedColor || 'orange'
      };
    };
    
    const transformedPurchases = allPurchases.map(transformPurchaseData);
    console.log(`🔍 Sample batched transformed data:`, {
      original: allPurchases[0],
      transformed: transformedPurchases[0],
      hasProductSize: !!transformedPurchases[0].product?.size,
      productSize: transformedPurchases[0].product?.size
    });
    
    setPurchases(transformedPurchases);
    
    // Save to Firebase immediately when purchases are updated
    if ((user || siteUserId) && allPurchases.length > 0) {
      console.log(`🔄 Attempting to save ${allPurchases.length} purchases to Firebase...`);
      try {
        await saveGmailPurchasesToFirebase(allPurchases);
        console.log(`💾 Gmail purchases auto-saved to Firebase`);
      } catch (error) {
        console.error(`❌ Failed to save Gmail purchases to Firebase:`, error);
      }
    } else {
      console.warn(`⚠️ Cannot save to Firebase - Firebase user: ${!!user}, Site user: ${!!siteUserId}, purchases: ${allPurchases.length}`);
    }
    
    // Combine with manual purchases for totals
    const combinedPurchases = [...allPurchases, ...manualPurchases];
    calculateTotals(combinedPurchases);
  };

  // Handle batched sync completion
  const handleBatchedSyncComplete = async (totalPurchases: number) => {
    console.log(`✅ Batched Gmail sync complete: Found ${totalPurchases} purchases`);
    
    // Save Gmail purchases to Firebase - use the latest purchases from state
    const siteUserId = localStorage.getItem('siteUserId');
    if ((user || siteUserId) && purchases.length > 0) {
      try {
        await saveGmailPurchasesToFirebase(purchases);
        console.log(`💾 Gmail purchases persisted to Firebase for future refreshes`);
      } catch (error) {
        console.warn(`⚠️ Could not save to Firebase (permission issue): ${error}`);
        console.log(`📧 Gmail purchases are still available in memory for this session`);
      }
    } else if (!user && !siteUserId) {
      console.log(`📧 No user authentication - Gmail purchases available in memory only`);
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
      
      // First, deduplicate purchases by order number to prevent duplicates
      const uniquePurchases = new Map();
      gmailPurchases.forEach(purchase => {
        const existing = uniquePurchases.get(purchase.orderNumber);
        if (!existing || 
            (purchase.status === 'Delivered' && existing.status !== 'Delivered') ||
            (purchase.status === 'Shipped' && existing.status === 'Ordered') ||
            (purchase.tracking && !existing.tracking)) {
          // Keep the purchase with better status or tracking info
          if (existing && purchase.tracking && !existing.tracking) {
            console.log(`📦 TRACKING PRESERVATION: Keeping purchase ${purchase.orderNumber} with tracking "${purchase.tracking}" over existing without tracking`);
          }
          uniquePurchases.set(purchase.orderNumber, purchase);
        }
      });
      
      const dedupedPurchases = Array.from(uniquePurchases.values());
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
        
        console.log(`🗑️ Cleared ${existingGmailPurchases.length} old Gmail purchases`);
        
        // Save all current Gmail purchases (deduplicated)
        let savedCount = 0;
        
        for (const purchaseData of purchaseDataList) {
          console.log(`💾 Saving purchase: ${purchaseData.orderNumber} (${purchaseData.product?.name})`);
          await addDocument('purchases', purchaseData);
          savedCount++;
          console.log(`✅ Saved purchase ${savedCount}/${purchaseDataList.length}: ${purchaseData.orderNumber}`);
        }
        
        console.log(`✅ Gmail purchases saved to Firebase: ${savedCount} unique purchases`);
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

  const calculateTotals = (purchaseList: any[]) => {
    const total = purchaseList.reduce((sum, purchase) => {
      const price = parseFloat(purchase.price.replace('$', '').replace(',', ''));
      return sum + price;
    }, 0);
    setTotalValue(`$${total.toLocaleString()}`);
    setTotalCount(purchaseList.length);
  };

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

    try {
      setLoading(true);
      
      let allPurchases: any[] = [];
      
      if (isSitePasswordUser) {
        // For site password users, try localStorage first, then Firebase as fallback
        console.log('🔍 Loading purchases for site password user...');
        
        // Try localStorage first
        const localPurchases = localStorage.getItem(`purchases_${userId}`);
        if (localPurchases) {
          allPurchases = JSON.parse(localPurchases);
          console.log(`📄 Loaded ${allPurchases.length} purchases from localStorage`);
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
        allPurchases = await getDocuments('purchases');
        console.log(`📄 Firebase returned ${allPurchases.length} total purchases`);
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
        return {
          ...purchase,
          product: {
            name: purchase.productName || purchase.product?.name || 'Unknown Product',
            brand: purchase.brand || purchase.product?.brand || 'Unknown Brand',
            size: purchase.size || purchase.product?.size || 'Unknown Size',
            image: purchase.productImageUrl || purchase.product?.image || `https://picsum.photos/200/200?random=${purchase.id?.substring(0, 4) || '1'}`,
            bgColor: purchase.product?.bgColor || 'bg-gray-500',
            color: purchase.product?.color || 'gray'
          },
          // Map other fields to expected format
          orderNumber: purchase.orderNumber,
          status: purchase.shippingStatus || purchase.status || 'Ordered',
          tracking: purchase.tracking || '',
          market: purchase.merchant || purchase.market || 'StockX',
          price: purchase.totalAmount ? `$${purchase.totalAmount.toFixed(2)}` : (purchase.price || '$0.00'),
          originalPrice: purchase.totalAmount ? `$${purchase.totalAmount.toFixed(2)} + $0.00` : (purchase.price || '$0.00'),
          purchaseDate: purchase.purchaseDate || purchase.createdAt || new Date().toISOString(),
          dateAdded: purchase.createdAt || new Date().toISOString(),
          verified: purchase.verified || 'pending',
          verifiedColor: purchase.verifiedColor || 'orange'
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
      
      // Transform manual purchases
      const transformedManualPurchases = manualPurchases.map(transformPurchaseData);
      setManualPurchases(transformedManualPurchases);

      // Transform Gmail purchases
      const transformedGmailPurchases = gmailPurchases.map(transformPurchaseData);
      
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
      
      // Combine all purchases for display and deduplicate
      const allUserPurchases = [...transformedGmailPurchases, ...transformedManualPurchases];
      
      // Deduplicate by order number
      const uniquePurchaseMap = new Map();
      allUserPurchases.forEach(purchase => {
        const existing = uniquePurchaseMap.get(purchase.orderNumber);
        if (!existing || 
            (purchase.status === 'Delivered' && existing.status !== 'Delivered') ||
            (purchase.status === 'Shipped' && existing.status === 'Ordered') ||
            (purchase.tracking && !existing.tracking)) {
          // Keep the purchase with better status or tracking info
          if (existing && purchase.tracking && !existing.tracking) {
            console.log(`📦 DISPLAY TRACKING PRESERVATION: Keeping purchase ${purchase.orderNumber} with tracking "${purchase.tracking}" over existing without tracking`);
          }
          uniquePurchaseMap.set(purchase.orderNumber, purchase);
        }
      });
      
      const combinedPurchases = Array.from(uniquePurchaseMap.values());
      console.log(`🔄 Display deduplication: ${allUserPurchases.length} → ${combinedPurchases.length} unique`);
      
      calculateTotals(combinedPurchases);
      
      console.log('✅ Loaded purchases:', {
        manual: manualPurchases.length,
        gmail: gmailPurchases.length,
        total: combinedPurchases.length,
        userId: userId,
        source: isSitePasswordUser ? 'localStorage' : 'Firebase'
      });
      
    } catch (error) {
      console.error('❌ Error loading purchases:', error);
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
        // Trigger the batched sync instead of the old fetchPurchases
        setShowBatchedSync(true);
      } else {
        // Show user they need to wait
        const remainingTime = Math.ceil((FETCH_COOLDOWN - (now - lastFetchTime)) / 1000);
        alert(`Please wait ${remainingTime} seconds before refreshing again to prevent rate limiting.`);
      }
    }
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
      imageUrl: purchase.product.image,
      productName: purchase.product.name,
      productBrand: purchase.product.brand,
      productSize: purchase.product.size
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
      
      alert(`📦 Package found!\n\n${packageType} Package: ${trackingNumber}\nProduct: ${matchedPurchase.product.name}\nOrder: ${matchedPurchase.orderNumber}\nStatus: ${matchedPurchase.status}`);
    } else {
      // Show option to add as note or create new purchase
      const shouldAddNote = confirm(`Package not found in your orders.\n\n${packageType} Package: ${trackingNumber}\n\nWould you like to add this as a note to an existing purchase?`);
      
      if (shouldAddNote) {
        alert('Note: This feature will allow you to add tracking numbers to existing purchases. Coming soon!');
      }
    }
    
    setHasBeenReset(false);
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>Purchases</h1>
            <p className={`${currentTheme.colors.textSecondary} mt-1`}>
              {gmailConnected ? 
                `Showing ${totalCount} purchases from Gmail` : 
                `Showing ${totalCount} purchases (Demo data)`
              }
            </p>
          </div>
          <div className="flex items-center space-x-2 flex-wrap gap-2">
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
            {gmailConnected && (
              <button
                onClick={refreshPurchases}
                disabled={loading}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg hover:shadow-emerald-500/25' 
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-purple-500/25'
                } disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync Gmail</span>
              </button>
            )}
            {gmailConnected && purchases.length > 0 && (
              <button
                onClick={manualStatusUpdate}
                disabled={loading || isUpdatingStatus}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 shadow-lg hover:shadow-yellow-500/25' 
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg hover:shadow-amber-500/25'
                } disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <RefreshCw className={`w-5 h-5 ${isUpdatingStatus ? 'animate-spin' : ''}`} />
                <span>{isUpdatingStatus ? 'Updating...' : 'Update Status'}</span>
              </button>
            )}
            {/* Refresh Firebase Data Button */}
            <button
              onClick={refreshAllPurchases}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg hover:shadow-blue-500/25' 
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg hover:shadow-blue-500/25'
              } disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <RefreshCw className="w-5 h-5" />
              <span>Refresh Data</span>
            </button>
            {/* Export Dropdown - Always visible */}
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
                    checked={selectedPurchases.size > 0 && selectedPurchases.size === getSortedPurchases().length}
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
                  style={{ width: `${columnWidths.status}px` }}
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Status / Delivery
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
                  style={{ width: `${columnWidths.market}px` }}
                  onClick={() => handleSort('market')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Market
                      <SortIcon column="market" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'market');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('market', 'Market');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.price}px` }}
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Price
                      <SortIcon column="price" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'price');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('price', 'Price');
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
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.dateAdded}px` }}
                  onClick={() => handleSort('dateAdded')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Date Added
                      <SortIcon column="dateAdded" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'dateAdded');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('dateAdded', 'Date Added');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer select-none ${
                    currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                  } transition-colors`} 
                  style={{ width: `${columnWidths.verified}px` }}
                  onClick={() => handleSort('verified')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Verified
                      <SortIcon column="verified" />
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'verified');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('verified', 'Verified');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
                <th 
                  className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} 
                  style={{ width: `${columnWidths.edit}px` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      Edit
                    </div>
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-2 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50 bg-white/5' : 'hover:bg-blue-300 bg-gray-200'
                    } opacity-30 hover:opacity-100 transition-opacity border-l border-r`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, 'edit');
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleDoubleClickResize('edit', 'Edit');
                    }}
                    title="Drag to resize column, double-click to auto-fit"
                  />
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} ${
              currentTheme.name === 'Neon' ? 'divide-y divide-white/10' : 'divide-y divide-gray-100'
            }`}>
              {getSortedPurchases().map((purchase) => (
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
                        className={`w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden ${purchase.product.bgColor} flex items-center justify-center shadow-sm mt-1 cursor-pointer hover:ring-2 hover:ring-offset-1 ${
                          currentTheme.name === 'Neon' ? 'hover:ring-cyan-400' : 'hover:ring-blue-400'
                        } transition-all duration-200`}
                        onClick={() => handleImageClick(purchase)}
                        title="Click to preview image"
                      >
                        <img 
                          src={purchase.product.image} 
                          alt={purchase.product.name}
                          className="w-full h-full object-cover rounded-lg"
                          onLoad={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.parentElement!.classList.remove(purchase.product.bgColor);
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement!;
                            parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">${purchase.product.brand.split(' ')[0]}</div>`
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} leading-tight`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {purchase.product.name}
                        </div>
                        <div className={`text-xs ${currentTheme.colors.textSecondary}`} style={{ wordBreak: 'break-word' }}>
                          {purchase.product.brand} • {purchase.product.size}
                        </div>
                      </div>
                    </div>
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
                    <span className={getStatusBadge(purchase.status, purchase.statusColor)}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <button 
                      onClick={() => alert(`Tracking: ${purchase.tracking}\n\nTracking integration coming soon!`)}
                      className={`${currentTheme.colors.accent} text-sm hover:underline transition-colors cursor-pointer`}>
                      {purchase.status?.toLowerCase() === 'ordered' ? 'Not Shipped Yet' : purchase.tracking}
                    </button>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary} font-medium`}>
                      {purchase.market}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{purchase.price}</div>
                    <div className={`text-xs ${currentTheme.colors.textSecondary}`}>({purchase.originalPrice})</div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary} font-medium`}>
                      {purchase.purchaseDate}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={`text-sm ${currentTheme.colors.textPrimary} whitespace-nowrap`}>
                      {purchase.dateAdded.replace('\n', ' ')}
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={getVerifiedIndicator(purchase.verified, purchase.verifiedColor)}></div>
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
              ))}
            </tbody>
          </table>
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
              Are you sure you want to clear all purchases? This action cannot be undone.
              {gmailConnected && " You can always sync with Gmail again to restore your data."}
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

      {/* Batched Gmail Sync Modal */}
      {showBatchedSync && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="max-w-md w-full mx-4">
            <GmailBatchedSync
              onPurchasesUpdate={handleBatchedPurchasesUpdate}
              onSyncComplete={(totalPurchases) => {
                handleBatchedSyncComplete(totalPurchases);
                setShowBatchedSync(false);
              }}
              className="relative"
            />
            
            {/* Close button */}
            <button
              onClick={() => setShowBatchedSync(false)}
              className={`absolute top-4 right-4 p-2 rounded-full ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} transition-colors`}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* Gmail Reset Button - Temporary for debugging */}
      <GmailResetButton />
      
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