'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Edit, MoreHorizontal, Camera, RefreshCw, Mail, Trash2, Settings } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import ScanPackageModal from './ScanPackageModal';
import GmailConnector from './GmailConnector';
import EmailParsingSettings from './EmailParsingSettings';
import QuickTrackingFix from './QuickTrackingFix';

const Purchases = () => {
  const { currentTheme } = useTheme();
  const isPremium = currentTheme.name === 'Premium';
  const isLight = currentTheme.name === 'Light';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme
  
  const [sortBy, setSortBy] = useState('Purchase Date');
  const [showScanModal, setShowScanModal] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalValue, setTotalValue] = useState('$0.00');
  const [totalCount, setTotalCount] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{totalFound: number, afterConsolidation: number} | null>(null);
  
  // Column width state
  const [columnWidths, setColumnWidths] = useState({
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

  useEffect(() => {
    if (gmailConnected) {
      fetchPurchases();
    } else {
      loadMockData();
    }

    // Listen for email config updates and refresh purchases
    const handleConfigUpdate = () => {
      if (gmailConnected) {
        fetchPurchases();
      }
    };

    window.addEventListener('emailConfigUpdated', handleConfigUpdate);
    
    return () => {
      window.removeEventListener('emailConfigUpdated', handleConfigUpdate);
    };
  }, [gmailConnected]);

  const fetchPurchases = async (limit?: number) => {
    setLoading(true);
    try {
      // Get email parsing configuration from localStorage
      const emailConfig = localStorage.getItem('emailParsingConfig');
      
      // Build URL with limit parameter if provided
      const url = limit ? `/api/gmail/purchases?limit=${limit}` : '/api/gmail/purchases';
      
      console.log(`🔄 Fetching purchases from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(emailConfig ? { 'email-config': emailConfig } : {})
        },
        credentials: 'include' // Ensure cookies are included
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Successfully fetched ${data.purchases?.length || 0} purchases`);
        setPurchases(data.purchases || []);
        calculateTotals(data.purchases || []);
        
        // Store consolidation info for UI display
        if (data.totalFound && data.afterConsolidation) {
          setLastSyncInfo({
            totalFound: data.totalFound,
            afterConsolidation: data.afterConsolidation
          });
          console.log(`Gmail Sync: Found ${data.totalFound} emails, consolidated to ${data.afterConsolidation} unique purchases`);
        }
      } else if (response.status === 401) {
        console.error('❌ Authentication failed - Gmail connection may have expired');
        const errorData = await response.json();
        if (errorData.needsReauth) {
          console.log('🔄 Need to reauthenticate - setting Gmail as disconnected');
          setGmailConnected(false);
          alert('Gmail authentication expired. Please reconnect your Gmail account.');
        }
        loadMockData();
      } else {
        console.error(`❌ Failed to fetch purchases: ${response.status}`);
        loadMockData();
      }
    } catch (error) {
      console.error('❌ Error fetching purchases:', error);
      loadMockData();
    } finally {
      setLoading(false);
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

  const refreshPurchases = () => {
    if (gmailConnected) {
      fetchPurchases();
    }
  };

  const fetchLimitedPurchases = (limit: number) => {
    console.log(`🧪 Test button clicked: limit=${limit}, gmailConnected=${gmailConnected}, loading=${loading}`);
    if (gmailConnected) {
      console.log(`🔄 Calling fetchPurchases with limit=${limit}`);
      fetchPurchases(limit);
    } else {
      console.log(`❌ Cannot fetch - Gmail not connected`);
      alert('Gmail is not connected. Please connect your Gmail account first.');
    }
  };

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setPurchases([]);
    setTotalValue('$0');
    setTotalCount(0);
    setShowResetConfirm(false);
  };

  const cancelReset = () => {
    setShowResetConfirm(false);
  };

  const getStatusBadge = (status: string, color: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap";
    const colorClasses = {
      green: "bg-green-100 text-green-800",
      orange: "bg-orange-100 text-orange-800",
      blue: "bg-blue-100 text-blue-800"
    };
    return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
  };

  const getVerifiedIndicator = (verified: string, color: string) => {
    const colorClasses = {
      green: "bg-green-500",
      orange: "bg-orange-500",
      red: "bg-red-500"
    };
    return `w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`;
  };

  const handleScanComplete = (trackingNumber: string) => {
    console.log('Scanned tracking number:', trackingNumber);
  };

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
      {/* Quick Fix Component - Remove after fixing */}
      <QuickTrackingFix />
      
      {/* Gmail Connection Status */}
      <div className="mb-6">
        <GmailConnector onConnectionChange={setGmailConnected} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className={`text-2xl font-bold ${
              isPremium 
                ? 'text-premium-gradient' 
                : isLight
                  ? 'text-gray-900'
                  : 'text-white'
            }`}>
              Purchases
            </h1>
            <p className={`mt-1 ${
              isPremium 
                ? 'text-slate-400' 
                : isLight
                  ? 'text-gray-600'
                  : 'text-gray-400'
            }`}>
              {gmailConnected ? 
                `Showing ${totalCount} purchases from Gmail` : 
                `Showing ${totalCount} purchases (Demo data)`
              }
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {gmailConnected && (
              <>
                <button
                  onClick={refreshPurchases}
                  disabled={loading}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Sync Gmail</span>
                </button>
                
                {/* Testing Controls */}
                <div className={`flex items-center space-x-1 rounded-lg p-1 ${
                  isPremium
                    ? 'bg-slate-800'
                    : isLight
                      ? 'bg-gray-100'
                      : 'bg-gray-800'
                }`}>
                  <span className={`text-sm px-2 ${
                    isPremium
                      ? 'text-slate-400'
                      : isLight
                        ? 'text-gray-600'
                        : 'text-gray-400'
                  }`}>
                    Test:
                  </span>
                  <button
                    onClick={() => fetchLimitedPurchases(1)}
                    disabled={loading}
                    className={`px-2 py-1 text-sm disabled:opacity-50 rounded font-medium transition-colors ${
                      isPremium
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : isLight
                          ? 'bg-white hover:bg-gray-50 text-gray-700'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    1
                  </button>
                  <button
                    onClick={() => fetchLimitedPurchases(10)}
                    disabled={loading}
                    className={`px-2 py-1 text-sm disabled:opacity-50 rounded font-medium transition-colors ${
                      isPremium
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : isLight
                          ? 'bg-white hover:bg-gray-50 text-gray-700'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    10
                  </button>
                  <button
                    onClick={() => fetchLimitedPurchases(50)}
                    disabled={loading}
                    className={`px-2 py-1 text-sm disabled:opacity-50 rounded font-medium transition-colors ${
                      isPremium
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : isLight
                          ? 'bg-white hover:bg-gray-50 text-gray-700'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    50
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => setShowScanModal(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Camera className="w-5 h-5" />
              <span>Scan Package</span>
            </button>
            {totalCount > 0 && (
              <button
                onClick={handleResetClick}
                className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                <span>Reset</span>
              </button>
            )}
            <button
              onClick={() => setShowEmailSettings(true)}
              className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className={`${
            isPremium 
              ? 'text-slate-400' 
              : isLight
                ? 'text-gray-600'
                : 'text-gray-400'
          }`}>
            Total value:
          </p>
          <p className={`text-xl font-bold ${
            isPremium 
              ? 'text-white' 
              : isLight
                ? 'text-gray-900'
                : 'text-white'
          }`}>
            {totalValue}
          </p>
          {gmailConnected && (
            <p className="text-xs text-green-600 flex items-center justify-end mt-1">
              <Mail className="w-3 h-3 mr-1" />
              Live from Gmail
            </p>
          )}
        </div>
      </div>

      {/* Sync Information */}
      {gmailConnected && lastSyncInfo && (
        <div className={`mb-4 rounded-lg p-3 border ${
          isPremium
            ? 'bg-slate-800 border-slate-700'
            : isLight
              ? 'bg-blue-50 border-blue-200'
              : 'bg-gray-800 border-gray-700'
        }`}>
          <div className={`flex items-center text-sm ${
            isPremium
              ? 'text-slate-300'
              : isLight
                ? 'text-blue-800'
                : 'text-gray-300'
          }`}>
            <Mail className="w-4 h-4 mr-2" />
            <span>
              Last sync: Found <strong>{lastSyncInfo.totalFound}</strong> emails, 
              consolidated to <strong>{lastSyncInfo.afterConsolidation}</strong> unique purchases
              {lastSyncInfo.totalFound > lastSyncInfo.afterConsolidation && (
                <span className={`ml-2 ${
                  isPremium
                    ? 'text-purple-400'
                    : isLight
                      ? 'text-blue-600'
                      : 'text-blue-400'
                }`}>
                  ({lastSyncInfo.totalFound - lastSyncInfo.afterConsolidation} duplicates merged using priority system)
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className={`${
            isPremium 
              ? 'text-slate-400' 
              : isLight
                ? 'text-gray-600'
                : 'text-gray-400'
          }`}>
            Fetching purchases from Gmail...
          </span>
        </div>
      )}

      {/* Table */}
      <div className={`rounded-lg shadow-sm border overflow-hidden ${
        isPremium
          ? 'dark-premium-card'
          : isLight
            ? 'bg-white border-gray-200'
            : 'bg-gray-800 border-gray-700'
      }`}>
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead className={`border-b ${
              isPremium
                ? 'bg-slate-800 border-slate-700'
                : isLight
                  ? 'bg-gray-50 border-gray-200'
                  : 'bg-gray-700 border-gray-600'
            }`}>
              <tr className="h-10">
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium uppercase tracking-wider ${
                  isPremium
                    ? 'text-slate-400'
                    : isLight
                      ? 'text-gray-500'
                      : 'text-gray-400'
                }`} style={{ width: `${columnWidths.product}px` }}>
                  Product
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'product')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium uppercase tracking-wider ${
                  isPremium
                    ? 'text-slate-400'
                    : isLight
                      ? 'text-gray-500'
                      : 'text-gray-400'
                }`} style={{ width: `${columnWidths.orderNumber}px` }}>
                  Order #
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'orderNumber')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.status}px` }}>
                  Status / Delivery
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'status')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.tracking}px` }}>
                  Tracking
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'tracking')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.market}px` }}>
                  Market
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'market')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.price}px` }}>
                  Price
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'price')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" style={{ width: `${columnWidths.purchaseDate}px` }}>
                  <div className="flex items-center h-10">
                    Purchase Date
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </div>
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'purchaseDate')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.dateAdded}px` }}>
                  Date Added
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'dateAdded')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.verified}px` }}>
                  Verified
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'verified')}
                  />
                </th>
                <th className="relative px-6 py-0 h-10 align-middle text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.edit}px` }}>
                  Edit
                  <div 
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, 'edit')}
                  />
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} divide-y divide-gray-100`}>
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-2">
                    <div className="flex items-start gap-3 min-h-12">
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden ${purchase.product.bgColor} flex items-center justify-center shadow-sm mt-1`}>
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
                            parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">${purchase.product.brand.split(' ')[0]}</div>`;
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 leading-tight" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {purchase.product.name}
                        </div>
                        <div className="text-xs text-gray-500" style={{ wordBreak: 'break-word' }}>
                          {purchase.product.brand} • {purchase.product.size}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <a 
                      href={`https://mail.google.com/mail/u/0/#search/"${encodeURIComponent(purchase.orderNumber)}"`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${currentTheme.colors.accent} ${currentTheme.colors.primaryHover.replace('hover:bg-', 'hover:')} text-sm font-medium hover:underline whitespace-nowrap`}
                    >
                      {purchase.orderNumber}
                    </a>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={getStatusBadge(purchase.status, purchase.statusColor)}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <a href="#" className={`${currentTheme.colors.accent} ${currentTheme.colors.primaryHover.replace('hover:bg-', 'hover:')} text-sm hover:underline`}>
                      {purchase.tracking}
                    </a>
                  </td>
                  <td className="px-6 py-2 align-middle text-sm text-gray-900 font-medium">
                    {purchase.market}
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className="text-sm font-semibold text-gray-900">{purchase.price}</div>
                    <div className="text-xs text-gray-500">({purchase.originalPrice})</div>
                  </td>
                  <td className="px-6 py-2 align-middle text-sm text-gray-900 font-medium">
                    {purchase.purchaseDate}
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className="text-sm text-gray-900 whitespace-nowrap">
                      {purchase.dateAdded.replace('\n', ' ')}
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={getVerifiedIndicator(purchase.verified, purchase.verifiedColor)}></div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className="flex items-center space-x-1">
                      <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
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

      {/* Scan Package Modal */}
      <ScanPackageModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScanComplete={handleScanComplete}
      />

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <Trash2 className="w-6 h-6 text-red-600 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Reset All Purchases</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to clear all purchases? This action cannot be undone.
              {gmailConnected && " You can always sync with Gmail again to restore your data."}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelReset}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
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
    </div>
  );
};

export default Purchases; 