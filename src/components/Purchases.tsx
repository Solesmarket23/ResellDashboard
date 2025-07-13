'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Edit, MoreHorizontal, Camera, RefreshCw, Mail, Trash2, Settings, Plus, Shield, Wrench } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument, deleteDocument } from '../lib/firebase/firebaseUtils';
import { generateGmailSearchUrl, formatOrderNumberForDisplay } from '../lib/utils/orderNumberUtils';
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
  
  // Column width state
  const [columnWidths, setColumnWidths] = useState({
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
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
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
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };
  
  // Get sorted purchases
  const getSortedPurchases = () => {
    const allPurchases = [...purchases, ...manualPurchases];
    return sortPurchases(allPurchases, sortBy, sortDirection);
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
    setIsResizing(true);
    setResizingColumn(columnKey);
    
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths];
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + diff);
      
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth
      }));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Add debouncing to prevent rapid API calls
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const FETCH_COOLDOWN = 5000; // 5 seconds cooldown between fetches

  // Load data on component mount
  useEffect(() => {
    // Always load purchases from Firebase when user is available
    if (user) {
      loadManualPurchasesFromFirebase();
    }
  }, [user]);

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

  // Handle batched Gmail sync updates
  const handleBatchedPurchasesUpdate = async (allPurchases: any[]) => {
    console.log(`📧 Batched sync update: ${allPurchases.length} total purchases`);
    console.log(`🔍 DEBUG - user available:`, !!user, `user.uid:`, user?.uid);
    setPurchases(allPurchases);
    
    // Save to Firebase immediately when purchases are updated
    if (user && allPurchases.length > 0) {
      console.log(`🔄 Attempting to save ${allPurchases.length} purchases to Firebase...`);
      try {
        await saveGmailPurchasesToFirebase(allPurchases);
        console.log(`💾 Gmail purchases auto-saved to Firebase`);
      } catch (error) {
        console.error(`❌ Failed to save Gmail purchases to Firebase:`, error);
      }
    } else {
      console.warn(`⚠️ Cannot save to Firebase - user: ${!!user}, purchases: ${allPurchases.length}`);
    }
    
    // Combine with manual purchases for totals
    const combinedPurchases = [...allPurchases, ...manualPurchases];
    calculateTotals(combinedPurchases);
  };

  // Handle batched sync completion
  const handleBatchedSyncComplete = async (totalPurchases: number) => {
    console.log(`✅ Batched Gmail sync complete: Found ${totalPurchases} purchases`);
    
    // Save Gmail purchases to Firebase - use the latest purchases from state
    if (user && purchases.length > 0) {
      await saveGmailPurchasesToFirebase(purchases);
      console.log(`💾 Gmail purchases persisted to Firebase for future refreshes`);
    }
  };

  // 🔥 NEW: Function to save Gmail purchases to Firebase
  const saveGmailPurchasesToFirebase = async (gmailPurchases: any[]) => {
    if (!user) {
      console.warn('User not authenticated - cannot save Gmail purchases to Firebase');
      return;
    }

    try {
      console.log(`📧 Saving ${gmailPurchases.length} Gmail purchases to Firebase...`);
      
      // Clear existing Gmail purchases for this user first
      const existingPurchases = await getDocuments('purchases');
      const existingGmailPurchases = existingPurchases.filter(
        (purchase: any) => purchase.userId === user.uid && purchase.type === 'gmail'
      );
      
      // Delete old Gmail purchases
      for (const oldPurchase of existingGmailPurchases) {
        try {
          await deleteDocument('purchases', oldPurchase.id);
        } catch (error) {
          console.warn(`⚠️ Could not delete old purchase ${oldPurchase.id}:`, error);
        }
      }
      
      console.log(`🗑️ Cleared ${existingGmailPurchases.length} old Gmail purchases`);
      
      // Save all current Gmail purchases
      let savedCount = 0;
      
      for (const purchase of gmailPurchases) {
        const purchaseData = {
          ...purchase,
          userId: user.uid,
          createdAt: new Date().toISOString(),
          type: 'gmail', // Mark as Gmail import
          syncedAt: new Date().toISOString()
        };
        
        await addDocument('purchases', purchaseData);
        savedCount++;
      }
      
      console.log(`✅ Gmail purchases saved to Firebase: ${savedCount} purchases`);
      
    } catch (error) {
      console.error('❌ Error saving Gmail purchases to Firebase:', error);
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
    if (!user) {
      console.warn('User not authenticated - cannot save to Firebase');
      return;
    }

    try {
      const purchaseData = {
        ...purchase,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        type: 'manual' // Distinguish from Gmail imports
      };
      
      await addDocument('purchases', purchaseData);
      console.log('✅ Purchase saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving purchase to Firebase:', error);
    }
  };

  const loadManualPurchasesFromFirebase = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const allPurchases = await getDocuments('purchases');
      
      // Filter to only show purchases for this user
      const userPurchases = allPurchases.filter(
        (purchase: any) => purchase.userId === user.uid
      );
      
      // Separate manual and Gmail purchases
      const manualPurchases = userPurchases.filter(p => p.type === 'manual');
      const gmailPurchases = userPurchases.filter(p => p.type === 'gmail');
      
      setManualPurchases(manualPurchases);
      
      // 🔥 Load Gmail purchases from Firebase if they exist
      if (gmailPurchases.length > 0) {
        setPurchases(gmailPurchases);
        console.log(`✅ Loaded ${gmailPurchases.length} Gmail purchases from Firebase`);
      }
      
      // Combine all purchases for display
      const combinedPurchases = [...gmailPurchases, ...manualPurchases];
      calculateTotals(combinedPurchases);
      
      console.log('✅ Loaded purchases from Firebase:', {
        manual: manualPurchases.length,
        gmail: gmailPurchases.length,
        total: combinedPurchases.length
      });
      
    } catch (error) {
      console.error('❌ Error loading purchases from Firebase:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteManualPurchaseFromFirebase = async (purchaseId: string) => {
    if (!user) return;

    try {
      await deleteDocument('purchases', purchaseId);
      await loadManualPurchasesFromFirebase(); // Refresh the list
      console.log('✅ Purchase deleted from Firebase');
    } catch (error) {
      console.error('❌ Error deleting purchase from Firebase:', error);
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
    
    // Clear Firebase data for this user
    if (user) {
      try {
        const allPurchases = await getDocuments('purchases');
        const userPurchases = allPurchases.filter(
          (purchase: any) => purchase.userId === user.uid
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
        
      } catch (error) {
        console.error('❌ Error clearing purchases from Firebase:', error);
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
      if (user) {
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
    
    if (!user) return;

    try {
      // Update purchases in state - force update even if status appears the same
      const updatedPurchases = purchases.map(purchase => {
        const statusUpdate = statusUpdates.find(update => update.orderNumber === purchase.orderNumber);
        if (statusUpdate) {
          console.log(`🔄 FORCE UPDATING status for ${purchase.orderNumber}: ${purchase.status} → ${statusUpdate.status}`);
          return {
            ...purchase,
            status: statusUpdate.status,
            statusColor: statusUpdate.statusColor,
            lastUpdated: new Date().toISOString() // Add timestamp to force re-render
          };
        }
        return purchase;
      });

      const updatedManualPurchases = manualPurchases.map(purchase => {
        const statusUpdate = statusUpdates.find(update => update.orderNumber === purchase.orderNumber);
        if (statusUpdate) {
          console.log(`🔄 FORCE UPDATING status for ${purchase.orderNumber}: ${purchase.status} → ${statusUpdate.status}`);
          return {
            ...purchase,
            status: statusUpdate.status,
            statusColor: statusUpdate.statusColor,
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
            userId: user.uid
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
          <div className="flex items-center space-x-2">
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
            {gmailConnected && totalCount > 0 && (
              <StatusUpdater 
                purchases={[...purchases, ...manualPurchases]}
                onStatusUpdate={handleStatusUpdate}
                isAutoEnabled={isAutoStatusEnabled}
                lastAutoUpdate={lastAutoStatusUpdate}
              />
            )}
            {totalCount > 0 && (
              <button
                onClick={handleResetClick}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <Trash2 className="w-5 h-5" />
                <span>Reset</span>
              </button>
            )}
            
            {/* 🔥 NEW: Debug button to verify Firebase data */}
            {user && (
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/debug/firebase-purchases?userId=${user.uid}`);
                    const data = await response.json();
                    console.log('🔍 Firebase Debug Data:', data);
                    alert(`Firebase Data:\nTotal: ${data.data.total}\nManual: ${data.data.manual}\nGmail: ${data.data.gmail}\n\nCheck console for full details.`);
                  } catch (error) {
                    console.error('Debug fetch error:', error);
                    alert('Error fetching debug data');
                  }
                }}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <span>🔍</span>
                <span>Debug Firebase</span>
              </button>
            )}
            
            {/* 🔥 NEW: Data strategy analysis button */}
            {user && (
              <button
                onClick={async () => {
                  try {
                    const response = await fetch('/api/debug/data-strategy');
                    const data = await response.json();
                    console.log('📊 Data Strategy Analysis:', data);
                    
                    const summary = data.report.summary;
                    const needsWork = data.currentStatus.needsImprovement.length;
                    const wellDone = data.currentStatus.wellImplemented.length;
                    
                    alert(`Data Strategy Analysis:\n\n✅ Well Implemented: ${wellDone}\n⚠️ Needs Improvement: ${needsWork}\n\nFirebase: ${summary.firebaseItems} items\nLocal Storage: ${summary.localStorageItems} items\nMemory Only: ${summary.memoryItems} items\n\nEstimated cost: ${data.report.costEstimate.estimatedMonthlyCost}\n\nCheck console for detailed breakdown.`);
                  } catch (error) {
                    console.error('Strategy analysis error:', error);
                    alert('Error fetching strategy analysis');
                  }
                }}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30' 
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <span>📊</span>
                <span>Data Strategy</span>
              </button>
            )}

            {/* 🔐 NEW: Authentication Data Audit */}
            {user && (
              <button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/debug/auth-data-audit?userId=${user.uid}`);
                    const data = await response.json();
                    console.log('🔐 Authentication Data Audit:', data);
                    
                    const audit = data.audit;
                    alert(`Authentication Data Audit:\n\n` +
                      `🔒 Firebase Auth: Secure (passwords, tokens)\n` +
                      `🏠 Firestore: ${audit.summary.collectionsWithUserData.length} collections\n` +
                      `📊 Purchases: ${audit.firestoreData.businessData.purchases.count} total\n` +
                      `👤 Profile: ${audit.firestoreData.userProfile.exists ? 'Configured' : 'Not configured'}\n\n` +
                      `Check console for full details.`);
                  } catch (error) {
                    console.error('Auth data audit error:', error);
                    alert('Error running auth data audit');
                  }
                }}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30' 
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                                 <Shield className="w-5 h-5" />
                 <span>Auth Audit</span>
              </button>
            )}
            {/* 📦 NEW: Scan Package Button - Prominent placement */}
            <button
              onClick={() => setShowPackageScanModal(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg hover:shadow-green-500/25' 
                  : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-orange-500/25'
              } text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 text-lg`}
            >
              <Camera className="w-6 h-6" />
              <span>Scan Package</span>
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
            <button
              onClick={() => setShowFixItemProducts(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30' 
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <Wrench className="w-5 h-5" />
              <span>Fix Items</span>
            </button>
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

      {/* Advanced Scanner Options */}
      <details className="mb-6">
        <summary className={`cursor-pointer ${currentTheme.colors.textSecondary} text-sm font-medium mb-3 hover:${currentTheme.colors.textPrimary} transition-colors`}>
          Advanced Scanner Options
        </summary>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowScanModal(true)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
              currentTheme.name === 'Neon' 
                ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Camera className="w-3 h-3" />
            QuaggaJS
          </button>
          <button
            onClick={() => setShowZXingScanModal(true)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
              currentTheme.name === 'Neon' 
                ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Camera className="w-3 h-3" />
            ZXing
          </button>
          <button
            onClick={() => setShowRemoteScanModal(true)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1 ${
              currentTheme.name === 'Neon' 
                ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Remote
          </button>
        </div>
      </details>

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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                    title="Drag to resize column"
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
                      {purchase.tracking}
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
      {showAddPurchaseModal && <AddPurchaseModal />}

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
    </div>
  );
};

// Add Purchase Modal Component
const AddPurchaseModal = () => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(true);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert('Please sign in to add purchases');
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
      alert('✅ Purchase added successfully!');
      setShowAddPurchaseModal(false);
      
      // Refresh the page to show new purchase
      window.location.reload();
    } catch (error) {
      console.error('Error adding purchase:', error);
      alert('❌ Error adding purchase. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
      <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Add Purchase</h3>
          <button
            onClick={() => setShowAddPurchaseModal(false)}
            className={`${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary}`}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
              Product Name *
            </label>
            <input
              type="text"
              required
              value={formData.productName}
              onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.textPrimary} ${
                currentTheme.name === 'Neon' 
                  ? 'bg-black/20 border-white/20 focus:border-cyan-500' 
                  : 'bg-white border-gray-300 focus:border-blue-500'
              } focus:outline-none`}
              placeholder="e.g., Nike Air Jordan 1 High OG"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
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
              onClick={() => setShowAddPurchaseModal(false)}
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